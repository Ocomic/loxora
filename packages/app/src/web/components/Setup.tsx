import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  PROMPTS,
  type ProjectGoal,
  type PromptKey,
  SETUP_STEPS,
  TERMS,
  type Term,
} from "../../shared/conversation.js";
import { ApiError, api, post } from "../api.js";
import { useLabels, useLanguage } from "../i18n.js";
import type { Labels } from "../labels.js";
import type { AssistantReply, ProposedAction, SetupInfo } from "../types.js";
import { XoraPortrait } from "./XoraPortrait.js";

/**
 * The first-launch setup as a conversation with Xora in script mode (RFC-011 Amendment 1,
 * Milestone 14): the start screen, then name, ship, logbook, project, and bridge. Every
 * answer can be typed into the input bar; every answer but the name can also be tapped.
 * Typed answers are placed by the server's keyword list. Nothing is written before the person
 * answered, and the project only after its card is confirmed. Earlier messages keep the
 * language they were shown in. After a reload the conversation is rebuilt from the stored
 * answers; the transcript itself is not stored.
 */
interface Message {
  readonly id: number;
  readonly from: "xora" | "captain";
  readonly text: string;
  readonly detail?: ReactNode;
  readonly alert?: boolean;
}

interface Asking {
  readonly key: PromptKey;
  /** The answer buttons shown: a choice key and its label. */
  readonly buttons: readonly { readonly key: string; readonly label: string }[];
}

interface Draft {
  readonly goal: ProjectGoal;
  readonly purpose?: string;
}

type Answer = { readonly choice: string; readonly label: string } | { readonly text: string };

const MAX_LENGTH: Partial<Record<PromptKey, number>> = {
  name: 80,
  shortName: 80,
  reviewer: 80,
  ship: 80,
  rename: 80,
  folder: 1024,
  describe: 500,
  purpose: 500,
};

/** The start screen stays this long; no pause when reduced motion is preferred. */
function bootDelay(): number {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
}

/** The ship terms the conversation has used, and which of them are unfolded. */
interface Glossary {
  readonly terms: readonly Term[];
  readonly open: ReadonlySet<Term>;
}

export function Setup({ initial, onDone }: { initial: SetupInfo; onDone: () => Promise<void> }) {
  const t = useLabels();
  const { language } = useLanguage();
  const titleId = useId();
  const termsId = useId();
  const inputId = useId();
  const [info, setInfo] = useState(initial);
  const [booted, setBooted] = useState(false);
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [glossary, setGlossary] = useState<Glossary>({ terms: [], open: new Set() });
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const draft = useRef<Draft | null>(null);
  const action = useRef<ProposedAction | null>(null);
  const nextId = useRef(0);
  const started = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const push = (message: Omit<Message, "id">) => {
    const id = nextId.current++;
    setMessages((list) => [...list, { ...message, id }]);
  };
  const say = (line: string, detail?: ReactNode) => push({ from: "xora", text: line, detail });
  const reply = (line: string) => push({ from: "captain", text: line });
  /** New terms join the list; only the newest ones stay unfolded, the rest fold away. */
  const learn = (key: PromptKey) =>
    setGlossary((known) => {
      const fresh = PROMPTS[key].terms.filter((term) => !known.terms.includes(term));
      return fresh.length ? { terms: [...known.terms, ...fresh], open: new Set(fresh) } : known;
    });
  const toggleTerm = (term: Term) =>
    setGlossary((known) => {
      const open = new Set(known.open);
      if (open.has(term)) open.delete(term);
      else open.add(term);
      return { ...known, open };
    });
  const update = (next: SetupInfo): SetupInfo => {
    const merged = { ...info, ...next };
    setInfo(merged);
    return merged;
  };

  /** Asks a prompt: Xora's message, the terms it introduces, and its answer buttons. */
  const ask = (
    key: PromptKey,
    current: SetupInfo,
    options: { silent?: boolean; buttons?: readonly string[] } = {},
  ) => {
    const choices = options.buttons ?? PROMPTS[key].choices;
    const label = choiceLabel(t, key);
    if (!options.silent) {
      const [line, detail] = promptMessage(t, key, current, action.current);
      say(line, detail);
      learn(key);
    }
    setAsking({ key, buttons: choices.map((choice) => ({ key: choice, label: label(choice) })) });
  };

  const askShip = (current: SetupInfo) =>
    current.existing ? ask("existing", current) : ask("ship", current);

  /**
   * The logbook buttons follow the folder's checks (Milestone 13 section 6). With OneDrive set
   * up, "another folder" is offered as two answers: on this PC, or in OneDrive.
   */
  const askLogbook = (current: SetupInfo, silent = false) => {
    const logbook = current.logbook;
    const other = logbook?.places ? ["local", "oneDrive"] : ["other"];
    let buttons = ["fits", ...other];
    if (logbook?.inRepository) buttons = other;
    else if (logbook?.hasWorkspace) {
      const member = logbook.reviewers.includes(current.answers?.captain ?? "");
      buttons = member ? ["open", ...other] : other;
    }
    ask("logbook", current, { silent, buttons });
  };

  /**
   * Another logbook folder: in the folder window of the operating system when the server can
   * open it, else as a typed path. A folder chosen in the window is checked like a typed one.
   */
  const chooseFolder = async (place: "local" | "oneDrive" | "documents") => {
    if (!info.logbook?.picker) return ask("folder", info);
    say(t.setup.picking);
    let next: SetupInfo;
    try {
      next = update(
        await post<SetupInfo>("/api/setup/folder", { place, title: t.setup.pickTitle }),
      );
    } catch (error) {
      // A window still open (after a reload, say) is found in the taskbar; only a window
      // that cannot open at all falls back to a typed path.
      if (error instanceof ApiError && error.kind === "Picking") {
        say(t.setup.stillPicking);
        return askLogbook(info, true);
      }
      say(t.setup.pickFailed);
      return ask("folder", info);
    }
    if (next.picked) return askLogbook(next);
    say(t.setup.notPicked);
    return askLogbook(next, true);
  };

  /** Rebuilds the conversation from the stored answers (section 3, Resume). */
  const rebuild = (current: SetupInfo) => {
    const answers = current.answers;
    if (current.step === "name" || !answers?.name) return ask("name", current);
    say(t.setup.intro);
    learn("name");
    reply(answers.name);
    if (current.mode === "setup" && current.step === "ship") return askShip(current);
    if (answers.shipName) {
      say(t.setup.ship(answers.name));
      learn("ship");
      reply(answers.shipName);
    }
    if (current.mode === "setup") return askLogbook(current);
    say(
      t.setup.logbook(answers.shipName ?? "", current.logbook ? !current.logbook.oneDrive : false),
    );
    learn("logbook");
    if (answers.logbookPath) reply(answers.logbookPath);
    say(t.setup.logbookCreated(answers.shipName ?? ""));
    return ask(current.step === "bridge" ? "bridge" : "project", current);
  };

  // The start screen, then the conversation.
  useEffect(() => {
    if (started.current) return;
    const timer = window.setTimeout(() => {
      started.current = true;
      setBooted(true);
      rebuild(initial);
    }, bootDelay());
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    if (!messages.length) return;
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
    if (asking && !busy) input.current?.focus();
  }, [messages, asking, busy]);

  const reload = async () => update(await api<SetupInfo>("/api/setup"));

  const failed = (error: unknown) =>
    push({
      from: "xora",
      text: t.setup.failed(error instanceof Error ? error.message : String(error)),
      alert: true,
    });

  /** Xora's proposal for the new project, shown as a confirmation card. */
  const propose = async (next: Draft, projectName: string) => {
    draft.current = next;
    const result = await post<AssistantReply>("/api/assistant/message", {
      choice: "goal",
      goal: next.goal,
      projectName,
      ...(next.purpose ? { purpose: next.purpose } : {}),
      language,
    });
    action.current = result.action ?? null;
    ask("confirm", info);
  };

  /** Opens an existing logbook in place; the captain must be one of its reviewers. */
  const open = async (path: string, captain?: string) => {
    await post("/api/setup/workspace", { action: "open", path, ...(captain ? { captain } : {}) });
    const next = await reload();
    say(t.setup.shipOpened(next.answers?.shipName ?? ""));
    learn("logbook");
    ask("project", next);
  };

  /** Stores another logbook folder; Xora says so when it is not a full path. */
  const storeFolder = async (path: string): Promise<SetupInfo | null> => {
    try {
      return update(await post<SetupInfo>("/api/setup/answers", { logbookPath: path }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        say(t.setup.notFullPath);
        return null;
      }
      throw error;
    }
  };

  const storeName = async (name: string, captain?: string) => {
    try {
      const next = update(
        await post<SetupInfo>("/api/setup/answers", { name, ...(captain ? { captain } : {}) }),
      );
      return askShip(next);
    } catch (error) {
      if (!(error instanceof ApiError && error.kind === "CaptainNeeded")) throw error;
      const answers = { name, captain: null, shipName: null, logbookPath: null };
      return ask("shortName", update({ ...info, answers }));
    }
  };

  const handle = async (key: PromptKey, result: AssistantReply) => {
    const value = result.value ?? "";
    const choice = result.choice;
    switch (key) {
      case "name":
        return storeName(value);
      case "shortName":
        return storeName(info.answers?.name ?? value, value);
      case "existing": {
        const existing = info.existing;
        if (choice === "new" || !existing) return ask("ship", info);
        const captain = info.answers?.captain ?? "";
        if (existing.reviewers.includes(captain)) return open(existing.path, captain);
        if (existing.reviewers.length === 1) return open(existing.path);
        return ask("reviewer", info, { buttons: existing.reviewers });
      }
      case "reviewer": {
        const existing = info.existing;
        if (existing?.reviewers.includes(value)) return open(existing.path, value);
        say(t.setup.notReviewer);
        return ask("reviewer", info, { silent: true, buttons: existing?.reviewers ?? [] });
      }
      case "ship": {
        const shipName = choice ? choiceLabel(t, "ship")(choice) : value;
        return askLogbook(update(await post<SetupInfo>("/api/setup/answers", { shipName })));
      }
      case "logbook": {
        if (choice === "path") {
          const next = await storeFolder(value);
          return next ? askLogbook(next) : ask("folder", info, { silent: true });
        }
        const allowed = asking?.buttons.map((button) => button.key) ?? [];
        // Without OneDrive, "a folder on this PC" is just another folder.
        const place = choice === "local" || choice === "oneDrive";
        const chosen =
          place && !allowed.includes(choice) && allowed.includes("other") ? "other" : choice;
        if (!chosen || !allowed.includes(chosen)) {
          say(t.xora.replies.notUnderstood);
          return askLogbook(info, true);
        }
        if (chosen === "other") return chooseFolder("documents");
        if (chosen === "local" || chosen === "oneDrive") return chooseFolder(chosen);
        if (chosen === "open" && info.logbook) {
          return open(info.logbook.path, info.answers?.captain ?? undefined);
        }
        try {
          await post("/api/setup/workspace", { action: "create" });
        } catch (error) {
          failed(error);
          return askLogbook(info, true);
        }
        const next = await reload();
        say(t.setup.logbookCreated(next.answers?.shipName ?? ""));
        return ask("project", next);
      }
      case "folder": {
        const next = await storeFolder(value);
        return next ? askLogbook(next) : ask("folder", info, { silent: true });
      }
      case "project":
      case "existingProject":
        if (choice === "new") return ask("describe", info);
        if (choice === "existing") return ask("existingProject", info);
        return ask("bridge", { ...info, step: "project" });
      case "describe": {
        if (choice === "other") return ask("purpose", info);
        if (choice) {
          const goal = choice as ProjectGoal;
          return propose({ goal }, t.setup.projectNames[goal]);
        }
        const goal = result.goal ?? "other";
        return propose({ goal, purpose: value }, t.setup.projectNames[goal]);
      }
      case "purpose":
        return propose({ goal: "other", purpose: value }, t.setup.projectNames.other);
      case "confirm": {
        const proposed = action.current;
        action.current = null;
        if (!proposed) return ask("describe", info);
        if (choice === "rename") {
          await post("/api/assistant/confirm", { actionId: proposed.id, confirm: false });
          return ask("rename", info);
        }
        if (proposed.kind !== "createProject") return ask("describe", info);
        try {
          await post("/api/assistant/confirm", { actionId: proposed.id, confirm: true });
        } catch (error) {
          // The project may exist even when the answer was lost: the server decides.
          const next = await reload().catch(() => null);
          if (next?.step === "bridge") return ask("bridge", next);
          failed(error);
          return propose(
            draft.current ?? { goal: "other", purpose: proposed.purpose },
            proposed.name,
          );
        }
        say(t.setup.projectCreated(proposed.name));
        return ask("bridge", update({ ...info, step: "bridge" }));
      }
      case "rename":
        return propose(draft.current ?? { goal: "other", purpose: value }, value);
      case "bridge":
        await post("/api/setup/finish", {});
        return onDone();
    }
  };

  const answer = async (given: Answer) => {
    if (!asking || busy) return;
    const key = asking.key;
    reply("text" in given ? given.text : given.label);
    setAsking(null);
    setBusy(true);
    try {
      const result = await post<AssistantReply>("/api/assistant/message", {
        prompt: key,
        ...("text" in given ? { text: given.text } : { choice: given.choice }),
        language,
      });
      if (result.reply === "notUnderstood") {
        say(t.xora.replies.notUnderstood);
        setAsking(asking);
      } else {
        await handle(key, result);
      }
    } catch (error) {
      failed(error);
      setAsking(asking);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || !asking || busy) return;
    setText("");
    void answer({ text: value });
  };

  const step = asking ? PROMPTS[asking.key].step : (info.step ?? "name");
  const position = SETUP_STEPS.indexOf(step);

  return (
    <div className="console">
      <aside className="console-xora">
        <XoraPortrait dimmed={!booted} label="Xora" />
        <div className="nameplate">
          <strong>XORA</strong>
          <span>{t.setup.xoraRole}</span>
        </div>
        <p className="console-status">{booted ? t.setup.statusOnline : t.setup.statusConnecting}</p>
        {glossary.terms.length ? (
          <section className="ship-terms" aria-labelledby={termsId}>
            <h2 id={termsId}>{t.setup.termsTitle}</h2>
            <dl>
              {TERMS.filter((term) => glossary.terms.includes(term)).map((term) => {
                const open = glossary.open.has(term);
                return (
                  <div key={term} className={open ? "term open" : "term"}>
                    <dt>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`${termsId}-${term}`}
                        onClick={() => toggleTerm(term)}
                      >
                        <span className="chevron" aria-hidden="true" />
                        {t.setup.terms[term].name}
                      </button>
                    </dt>
                    <dd id={`${termsId}-${term}`} hidden={!open}>
                      {t.setup.terms[term].text}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ) : null}
      </aside>
      <section className="console-chat" aria-labelledby={titleId}>
        <h1 id={titleId} className="visually-hidden">
          {t.setup.title}
        </h1>
        <ol className="setup-progress" aria-label={t.setup.progress}>
          {SETUP_STEPS.map((name, index) => {
            const state = index < position ? "done" : index === position ? "current" : "open";
            return (
              <li
                key={name}
                className={`progress-step progress-${state}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                {t.setup.steps[name]}
                {state === "done" ? (
                  <span className="visually-hidden"> ({t.setup.stepDone})</span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <div className="chat-log" ref={log}>
          <Boot info={initial} />
          <div className="chat-messages" role="log" aria-live="polite" aria-label={t.setup.title}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message chat-${message.from}${message.alert ? " chat-alert" : ""}`}
              >
                <span className="chat-author">
                  {message.from === "xora" ? "Xora" : t.setup.captain}
                </span>
                <p>{message.text}</p>
                {message.detail}
              </div>
            ))}
          </div>
          {busy ? <p className="muted chat-working">{t.setup.working}</p> : null}
          {asking && !busy && asking.buttons.length ? (
            <div className="chat-choices">
              {asking.buttons.map((button) => {
                const later = asking.key === "project" && button.key === "existing";
                return (
                  <button
                    key={button.key}
                    type="button"
                    className={later ? "button button-later" : "button"}
                    onClick={() =>
                      void answer(
                        // The reviewer buttons are the reviewer ids; they are sent as text.
                        asking.key === "reviewer"
                          ? { text: button.key }
                          : { choice: button.key, label: button.label },
                      )
                    }
                  >
                    {button.label}
                    {later ? <small className="choice-later"> · {t.setup.later}</small> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <form className="chat-input" onSubmit={submit}>
          <label htmlFor={inputId} className="visually-hidden">
            {t.setup.answer}
          </label>
          <span className="xora-mark" aria-hidden="true">
            Xora
          </span>
          <input
            id={inputId}
            ref={input}
            value={text}
            maxLength={(asking && MAX_LENGTH[asking.key]) || 2000}
            placeholder={(asking && t.setup.placeholders[asking.key]) || t.setup.placeholder}
            // Closed while Xora works on an answer, so no answer is sent into a gap.
            disabled={!booted || busy || !asking}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="button" disabled={busy || !asking || !text.trim()}>
            {t.setup.send}
          </button>
        </form>
        <p className="muted script-note">{t.setup.scriptNote}</p>
      </section>
    </div>
  );
}

/** The start screen (section 2): one line per state the server reported. */
function Boot({ info }: { info: SetupInfo }) {
  const t = useLabels();
  const boot = info.boot;
  if (!boot) return null;
  const lines: readonly (readonly [string, string])[] = [
    [t.setup.boot.shipComputer, t.setup.boot.ready],
    [t.setup.boot.logbook, boot.logbook === "found" ? t.setup.boot.found : t.setup.boot.notCreated],
    [t.setup.boot.xora, t.setup.boot.scriptMode],
  ];
  return (
    <section className="boot" aria-label={t.setup.connecting}>
      <h2>{t.setup.connecting}</h2>
      <ul>
        {lines.map(([label, state]) => (
          <li key={label}>
            <span>{label}</span>
            <span className="boot-state">{state}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function choiceLabel(t: Labels, key: PromptKey): (choice: string) => string {
  const labels = (t.setup.choices as Partial<Record<PromptKey, Record<string, string>>>)[key];
  return (choice) => labels?.[choice] ?? choice;
}

/** Xora's message for a prompt, and what it shows below the text. */
function promptMessage(
  t: Labels,
  key: PromptKey,
  info: SetupInfo,
  proposed: ProposedAction | null,
): readonly [string, ReactNode?] {
  const name = info.answers?.name ?? "";
  const ship = info.answers?.shipName ?? "";
  switch (key) {
    case "name":
      return [t.setup.intro];
    case "shortName":
      return [t.setup.shortName];
    case "existing":
      return [t.setup.existing(info.existing?.name ?? "")];
    case "reviewer":
      return [t.setup.whoAreYou];
    case "ship":
      return [t.setup.ship(name)];
    case "logbook":
      return [
        t.setup.logbook(ship, !info.logbook?.oneDrive),
        <LogbookPlace key="place" t={t} info={info} />,
      ];
    case "folder":
      return [t.setup.folder];
    case "project":
      return [t.setup.project];
    case "existingProject":
      return [t.setup.existingProject];
    case "describe":
      return [t.setup.describe];
    case "purpose":
      return [t.setup.purpose];
    case "confirm":
      return [
        t.setup.proposal,
        proposed?.kind === "createProject" ? (
          <section key="card" className="confirm-card" aria-label={t.setup.confirmation}>
            <h2>{t.setup.confirmation}</h2>
            <p>{t.setup.createProject(proposed.name, proposed.purpose)}</p>
            <p>{t.setup.spaces(proposed.spaces, proposed.collection)}</p>
            <p className="muted">{t.setup.rule}</p>
          </section>
        ) : null,
      ];
    case "rename":
      return [t.setup.rename];
    case "bridge":
      return [info.step === "bridge" ? t.setup.bridgeWithProject : t.setup.bridgeWithoutProject];
  }
}

/** The proposed logbook folder: "Documents › Loxora", the full path under Details, checks. */
function LogbookPlace({ t, info }: { t: Labels; info: SetupInfo }) {
  const logbook = info.logbook;
  if (!logbook) return null;
  const member = logbook.reviewers.includes(info.answers?.captain ?? "");
  return (
    <div className="logbook-place">
      <p className="logbook-path">
        {logbook.documentsPath
          ? [t.setup.documents, ...logbook.documentsPath].join(" › ")
          : logbook.path}
      </p>
      <details>
        <summary>{t.setup.details}</summary>
        <code>{logbook.path}</code>
      </details>
      {logbook.inRepository ? <p className="setup-warning">{t.setup.inRepository}</p> : null}
      {logbook.oneDrive ? <p className="setup-warning">{t.setup.oneDrive}</p> : null}
      {logbook.hasWorkspace ? (
        <p className="setup-warning">
          {t.setup.hasWorkspace} {member ? null : t.setup.notOnShip}
        </p>
      ) : null}
    </div>
  );
}
