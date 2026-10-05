import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, post } from "../api.js";
import { useLabels, useLanguage } from "../i18n.js";
import type {
  AssistantReply,
  FirstSteps as FirstStepsState,
  Goal,
  ProposedAction,
  SetupInfo,
} from "../types.js";

/**
 * The first steps of the setup in script mode (RFC-011 parts D and E, Milestone 13): goal,
 * project, first Mission, project goal, and the bridge hints. Xora proposes each write as an
 * action; the server writes only after the person confirms the card that shows it.
 */
const GOALS: readonly Goal[] = ["game", "website", "writing", "other"];
const TOTAL = 6;

export function FirstSteps({ onFinished }: { onFinished: () => Promise<void> }) {
  const t = useLabels();
  const { language } = useLanguage();
  const titleId = useId();
  const [state, setState] = useState<FirstStepsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [naming, setNaming] = useState<"choose" | "own">("choose");
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
  const finish = (skipped: boolean) =>
    run(async () => {
      await post("/api/setup/finish", skipped ? { skipped } : {});
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
  if (state.stage === "goal" && action?.kind === "createProject") {
    step = 2;
    screen = (
      <ConfirmCard
        busy={busy}
        confirm={t.firstSteps.create}
        onConfirm={() => answer(true)}
        onChange={() => answer(false)}
      >
        <p>{t.firstSteps.createProject(action.name, action.purpose)}</p>
        <p>{t.firstSteps.spaces(action.spaces, action.collection)}</p>
        <p className="muted">{t.firstSteps.rule}</p>
      </ConfirmCard>
    );
  } else if (state.stage === "goal" && goal === "other" && purpose === null) {
    screen = (
      <TextStep
        question={t.firstSteps.purposeQuestion}
        label={t.firstSteps.purposeLabel}
        initial=""
        maxLength={500}
        busy={busy}
        onBack={() => setGoal(null)}
        onSubmit={(value) => setPurpose(value)}
      />
    );
  } else if (state.stage === "goal" && goal) {
    step = 2;
    const send = (projectName: string) =>
      propose({
        choice: "goal",
        goal,
        projectName,
        ...(goal === "other" ? { purpose } : {}),
      });
    const back = () => {
      setNaming("choose");
      if (goal === "other") setPurpose(null);
      else setGoal(null);
    };
    screen =
      naming === "own" ? (
        <TextStep
          question={t.firstSteps.projectQuestion}
          label={t.firstSteps.projectLabel}
          initial=""
          maxLength={80}
          busy={busy}
          onBack={() => setNaming("choose")}
          onSubmit={send}
        />
      ) : (
        <Step text={t.firstSteps.projectQuestion} onBack={back}>
          <p>{t.firstSteps.stations[goal]}</p>
          <p className="muted">{t.firstSteps.stationExplained}</p>
          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => send(t.firstSteps.projectSuggestions[goal])}
            >
              {t.firstSteps.projectSuggestions[goal]}
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => setNaming("own")}
            >
              {t.firstSteps.ownName}
            </button>
          </div>
        </Step>
      );
  } else if (state.stage === "goal") {
    screen = (
      <Step text={t.firstSteps.goalQuestion} onBack={null}>
        <div className="action-row">
          {GOALS.map((name) => (
            <button
              key={name}
              type="button"
              className={name === "other" ? "button button-quiet" : "button"}
              disabled={busy}
              onClick={() => {
                setGoal(name);
                setPurpose(null);
              }}
            >
              {t.firstSteps.goals[name]}
            </button>
          ))}
        </div>
      </Step>
    );
  } else if (state.stage === "mission") {
    step = 3;
    screen = (
      <Step text={t.firstSteps.missionIntro} onBack={null}>
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
    step = 4;
    screen = (
      <Step text={t.firstSteps.waiting} onBack={null}>
        <div className="action-row">
          <Link className="button" to={`/missions/${state.missionId ?? ""}`}>
            {t.firstSteps.openMission}
          </Link>
        </div>
      </Step>
    );
  } else if (state.stage === "record" && action?.kind === "recordGoal") {
    step = 5;
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
    step = 5;
    screen = (
      <TextStep
        question={t.firstSteps.recordQuestion}
        label={t.firstSteps.goalLabel}
        initial={goalText ?? t.firstSteps.template(state.purpose ?? "", state.answer ?? "")}
        maxLength={4000}
        multiline
        busy={busy}
        onBack={null}
        onSubmit={(text) => {
          setGoalText(text);
          void propose({ choice: "goalText", text });
        }}
      />
    );
  } else {
    step = 6;
    const last = hint >= t.firstSteps.hints.length;
    screen = (
      <Step text={last ? t.firstSteps.closing : (t.firstSteps.hints[hint] ?? "")} onBack={null}>
        <div className="action-row">
          {last ? (
            <button type="button" className="button" disabled={busy} onClick={() => finish(false)}>
              {t.firstSteps.finish}
            </button>
          ) : (
            <button type="button" className="button" onClick={() => setHint(hint + 1)}>
              {t.setup.next}
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
        <span className="muted">{t.setup.progress(step, TOTAL)}</span>
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
          {t.firstSteps.skip}
        </button>
      )}
    </section>
  );
}

function Step({
  text,
  onBack,
  children,
}: {
  text: string;
  onBack: (() => void) | null;
  children: ReactNode;
}) {
  const t = useLabels();
  return (
    <div className="setup-question">
      <p className="xora-line">{text}</p>
      {children}
      {onBack ? (
        <button type="button" className="button button-quiet setup-back" onClick={onBack}>
          {t.setup.back}
        </button>
      ) : null}
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
  onBack,
  onSubmit,
}: {
  question: string;
  label: string;
  initial: string;
  maxLength: number;
  multiline?: boolean;
  busy: boolean;
  onBack: (() => void) | null;
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
    <Step text={question} onBack={onBack}>
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
            {t.setup.next}
          </button>
        </div>
      </form>
    </Step>
  );
}
