import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, post } from "../api.js";
import { useLabels, useLanguage } from "../i18n.js";
import type {
  AssistantReply,
  FirstSteps as FirstStepsState,
  ProposedAction,
  SetupInfo,
} from "../types.js";

/**
 * The first Mission, offered on the bridge after the setup (RFC-011 part E, Milestone 13
 * scenes E1 to E4, moved to the bridge by Milestone 14 section 4): start the Mission, answer
 * it, accept the project goal, and the bridge hints. Xora proposes each write as an action;
 * the server writes only after the person confirms the card that shows it.
 */
const TOTAL = 4;

export function FirstSteps({ onFinished }: { onFinished: () => Promise<void> }) {
  const t = useLabels();
  const { language } = useLanguage();
  const titleId = useId();
  const [state, setState] = useState<FirstStepsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ProposedAction | null>(null);
  const [goalText, setGoalText] = useState<string | null>(null);
  const [hint, setHint] = useState(0);

  const load = useCallback(async () => {
    try {
      const info = await api<SetupInfo>("/api/setup");
      setState(info.firstSteps ?? null);
    } catch (value) {
      setError(t.setup.failed(value instanceof Error ? value.message : String(value)));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async <T,>(work: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (value) {
      setError(t.setup.failed(value instanceof Error ? value.message : String(value)));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const propose = (body: Record<string, unknown>) =>
    run(async () => {
      const reply = await post<AssistantReply>("/api/assistant/message", { ...body, language });
      setAction(reply.action ?? null);
    });
  const answer = (confirm: boolean) =>
    run(async () => {
      if (!action) return;
      const result = await post<{ firstSteps: FirstStepsState }>("/api/assistant/confirm", {
        actionId: action.id,
        confirm,
      });
      setAction(null);
      setState(result.firstSteps);
    });
  // The setup has already ended; the last hint only leads back. Skipping dismisses the offer.
  const finish = (skipped: boolean) =>
    run(async () => {
      if (skipped) await post("/api/setup/finish", { skipped });
      await onFinished();
    });

  // Scene E1 shows its card at once: proposing writes nothing.
  const stage = state?.stage;
  useEffect(() => {
    if (stage === "mission" && !action && !busy && !error) void propose({ choice: "firstMission" });
  });

  if (!state) {
    return (
      <section className="panel setup-main">
        {error ? (
          <p className="action-error">{error}</p>
        ) : (
          <p className="muted">{t.setup.working}</p>
        )}
      </section>
    );
  }

  let step = 1;
  let screen: ReactNode = null;
  if (state.stage === "goal") {
    // The project is created in the setup conversation; without it there is nothing to offer.
    screen = <Step text={t.firstSteps.banner.goal}>{null}</Step>;
  } else if (state.stage === "mission") {
    step = 1;
    screen = (
      <Step text={t.firstSteps.missionIntro}>
        {action?.kind === "startFirstMission" ? (
          <ConfirmCard
            busy={busy}
            confirm={t.firstSteps.start}
            onConfirm={() => answer(true)}
            onChange={null}
          >
            <p>{t.firstSteps.startMission(action.title)}</p>
            <p>{t.firstSteps.missionGoal(action.goal)}</p>
            <p>{t.firstSteps.missionQuestion(action.question)}</p>
            <p className="muted">{t.firstSteps.missionRationale(action.rationale)}</p>
            <ul className="plain options">
              {action.options.map((option) => (
                <li key={option.option}>
                  <strong>{option.option}</strong>{" "}
                  <span className="muted">{option.consequence}</span>
                </li>
              ))}
            </ul>
          </ConfirmCard>
        ) : null}
      </Step>
    );
  } else if (state.stage === "answer") {
    step = 2;
    screen = (
      <Step text={t.firstSteps.waiting}>
        <div className="action-row">
          <Link className="button" to={`/missions/${state.missionId ?? ""}`}>
            {t.firstSteps.openMission}
          </Link>
        </div>
      </Step>
    );
  } else if (state.stage === "record" && action?.kind === "recordGoal") {
    step = 3;
    screen = (
      <ConfirmCard
        busy={busy}
        confirm={t.firstSteps.accept}
        onConfirm={() => answer(true)}
        onChange={() => answer(false)}
      >
        <blockquote className="goal-text">{action.content}</blockquote>
        <p>{t.firstSteps.recordCard(action.title)}</p>
      </ConfirmCard>
    );
  } else if (state.stage === "record") {
    step = 3;
    screen = (
      <TextStep
        question={t.firstSteps.recordQuestion}
        label={t.firstSteps.goalLabel}
        initial={goalText ?? t.firstSteps.template(state.purpose ?? "", state.answer ?? "")}
        maxLength={4000}
        multiline
        busy={busy}
        onSubmit={(text) => {
          setGoalText(text);
          void propose({ choice: "goalText", text });
        }}
      />
    );
  } else {
    step = 4;
    const last = hint >= t.firstSteps.hints.length;
    screen = (
      <Step text={last ? t.firstSteps.closing : (t.firstSteps.hints[hint] ?? "")}>
        <div className="action-row">
          {last ? (
            <button type="button" className="button" disabled={busy} onClick={() => finish(false)}>
              {t.firstSteps.finish}
            </button>
          ) : (
            <button type="button" className="button" onClick={() => setHint(hint + 1)}>
              {t.firstSteps.next}
            </button>
          )}
        </div>
      </Step>
    );
  }

  return (
    <section className="panel setup-main first-steps" aria-labelledby={titleId}>
      <header className="setup-header">
        <h1 id={titleId}>{t.firstSteps.title}</h1>
        <span className="muted">{t.firstSteps.progress(step, TOTAL)}</span>
      </header>
      {screen}
      {busy ? <p className="muted">{t.setup.working}</p> : null}
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
      {state.stage === "hints" ? null : (
        <button
          type="button"
          className="button button-quiet setup-skip"
          disabled={busy}
          onClick={() => finish(true)}
        >
          {t.firstSteps.dismiss}
        </button>
      )}
    </section>
  );
}

function Step({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="setup-question">
      <p className="xora-line">{text}</p>
      {children}
    </div>
  );
}

/** A confirmation card: exactly what will be written, and the person's yes or no. */
function ConfirmCard({
  busy,
  confirm,
  onConfirm,
  onChange,
  children,
}: {
  busy: boolean;
  confirm: string;
  onConfirm: () => void;
  onChange: (() => void) | null;
  children: ReactNode;
}) {
  const t = useLabels();
  return (
    <section className="confirm-card" aria-label={t.firstSteps.confirmation}>
      <h2>{t.firstSteps.confirmation}</h2>
      {children}
      <div className="action-row">
        <button type="button" className="button" disabled={busy} onClick={onConfirm}>
          {confirm}
        </button>
        {onChange ? (
          <button type="button" className="button button-quiet" disabled={busy} onClick={onChange}>
            {t.firstSteps.change}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function TextStep({
  question,
  label,
  initial,
  maxLength,
  multiline = false,
  busy,
  onSubmit,
}: {
  question: string;
  label: string;
  initial: string;
  maxLength: number;
  multiline?: boolean;
  busy: boolean;
  onSubmit: (value: string) => void;
}) {
  const t = useLabels();
  const id = useId();
  const [value, setValue] = useState(initial);
  const handle = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <Step text={question}>
      <form className="setup-form" onSubmit={handle}>
        <label htmlFor={id}>{label}</label>
        {multiline ? (
          <textarea
            id={id}
            value={value}
            rows={5}
            maxLength={maxLength}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            id={id}
            value={value}
            maxLength={maxLength}
            onChange={(event) => setValue(event.target.value)}
            // biome-ignore lint/a11y/noAutofocus: one question per screen; the field is the screen.
            autoFocus
          />
        )}
        <div className="action-row">
          <button type="submit" className="button" disabled={busy || !value.trim()}>
            {t.firstSteps.next}
          </button>
        </div>
      </form>
    </Step>
  );
}
