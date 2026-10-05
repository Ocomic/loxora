import { type FormEvent, type ReactNode, useId, useState } from "react";
import { ApiError, post } from "../api.js";
import { useLabels } from "../i18n.js";
import type { SetupInfo } from "../types.js";

/**
 * First-launch setup in script mode (RFC-011, Milestone 13), scenes A4 to C3 of the dialog
 * script. Every text is fixed; Xora is not on board in this version. The server stores the
 * answers in the settings file and creates or opens the workspace.
 */
type Step =
  | "existing"
  | "name"
  | "shortName"
  | "ship"
  | "logbook"
  | "folder"
  | "orientation"
  | "script";

const TOTAL = 5;
const PROGRESS: Partial<Record<Step, number>> = {
  name: 1,
  shortName: 1,
  ship: 2,
  logbook: 3,
  folder: 3,
  orientation: 4,
  script: 5,
};
const SHIP_NAMES = ["Nova", "Aurora"] as const;

function firstStep(info: SetupInfo): Step {
  if (info.mode === "ready") return "orientation";
  if (info.existing && !info.answers?.name) return "existing";
  if (!info.answers?.name) return "name";
  if (!info.answers.shipName) return "ship";
  return "logbook";
}

export function Setup({ initial, onDone }: { initial: SetupInfo; onDone: () => void }) {
  const t = useLabels();
  const titleId = useId();
  const [info, setInfo] = useState(initial);
  const [step, setStep] = useState<Step>(() => firstStep(initial));
  const [orientation, setOrientation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logbookCreated, setLogbookCreated] = useState(initial.mode === "ready");
  /** The typed name, kept while the person gives a short name for it (scene B1). */
  const [pendingName, setPendingName] = useState("");

  /** Sends one setup request; returns false and shows the reason when it fails. */
  const send = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await post<SetupInfo>(path, body);
      if (next.mode === "setup") setInfo(next);
      return { ok: true as const, next };
    } catch (value) {
      const kind = value instanceof ApiError ? value.kind : null;
      if (kind !== "CaptainNeeded") {
        setError(t.setup.failed(value instanceof Error ? value.message : String(value)));
      }
      return { ok: false as const, kind };
    } finally {
      setBusy(false);
    }
  };
  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const toWorkspace = async (body: Record<string, unknown>) => {
    const result = await send("/api/setup/workspace", body);
    if (result.ok) {
      setLogbookCreated(true);
      go("orientation");
    }
    return result;
  };

  const answers = info.answers;
  const logbook = info.logbook;
  let screen: ReactNode;
  switch (step) {
    case "existing":
      screen = info.existing ? (
        <ExistingShip
          existing={info.existing}
          busy={busy}
          onOpen={async (captain) => {
            const result = await toWorkspace({
              action: "open",
              path: info.existing?.path,
              ...(captain ? { captain } : {}),
            });
            if (!result.ok && result.kind === "CaptainNeeded") setError(t.setup.whoAreYou);
          }}
          onNew={() => go("name")}
        />
      ) : null;
      break;
    case "name":
    case "shortName":
      screen = (
        <TextQuestion
          key={step}
          question={step === "name" ? t.setup.nameQuestion : t.setup.shortNameQuestion}
          label={step === "name" ? t.setup.nameLabel : t.setup.shortNameLabel}
          initial={step === "name" ? (answers?.name ?? "") : ""}
          empty={t.setup.nameEmpty}
          busy={busy}
          onBack={
            info.existing ? () => go("existing") : step === "shortName" ? () => go("name") : null
          }
          onSubmit={async (value) => {
            if (step === "name") setPendingName(value);
            const body =
              step === "name" ? { name: value } : { name: pendingName || value, captain: value };
            const result = await send("/api/setup/answers", body);
            if (result.ok) go("ship");
            else if (result.kind === "CaptainNeeded") go("shortName");
          }}
        />
      );
      break;
    case "ship":
      screen = (
        <ShipQuestion
          name={answers?.name ?? ""}
          initial={answers?.shipName ?? null}
          busy={busy}
          onBack={() => go("name")}
          onSubmit={async (shipName) => {
            if ((await send("/api/setup/answers", { shipName })).ok) go("logbook");
          }}
        />
      );
      break;
    case "logbook":
      screen = logbook ? (
        <Question text={t.setup.logbookQuestion(answers?.shipName ?? "")} onBack={() => go("ship")}>
          <div className="folder-card">
            <strong>
              {logbook.documentsPath
                ? [t.setup.documents, ...logbook.documentsPath].join(" › ")
                : logbook.path}
            </strong>
            {logbook.documentsPath ? (
              <details>
                <summary>{t.setup.details}</summary>
                <code>{logbook.path}</code>
              </details>
            ) : null}
          </div>
          {logbook.inRepository ? <p className="setup-warning">{t.setup.inRepository}</p> : null}
          {logbook.oneDrive ? <p className="setup-warning">{t.setup.oneDrive}</p> : null}
          {logbook.hasWorkspace ? <p className="setup-warning">{t.setup.hasWorkspace}</p> : null}
          <div className="action-row">
            {logbook.hasWorkspace ? (
              <OpenLogbook
                reviewers={logbook.reviewers}
                captain={answers?.captain ?? null}
                busy={busy}
                onOpen={async (captain) => {
                  const result = await toWorkspace({
                    action: "open",
                    path: logbook.path,
                    ...(captain ? { captain } : {}),
                  });
                  if (!result.ok && result.kind === "CaptainNeeded") setError(t.setup.notOnShip);
                }}
              />
            ) : (
              <button
                type="button"
                className="button"
                disabled={busy || logbook.inRepository}
                onClick={() => toWorkspace({ action: "create" })}
              >
                {t.setup.fits}
              </button>
            )}
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => go("folder")}
            >
              {t.setup.otherFolder}
            </button>
          </div>
        </Question>
      ) : null;
      break;
    case "folder":
      screen = (
        <TextQuestion
          question={t.setup.logbookQuestion(answers?.shipName ?? "")}
          label={t.setup.folderLabel}
          hint={t.setup.folderHint}
          initial={logbook?.path ?? ""}
          empty={t.setup.folderLabel}
          maxLength={1024}
          submit={t.setup.useFolder}
          busy={busy}
          onBack={() => go("logbook")}
          onSubmit={async (logbookPath) => {
            if ((await send("/api/setup/answers", { logbookPath })).ok) go("logbook");
          }}
        />
      );
      break;
    case "orientation":
      screen = (
        <Question text={t.setup.orientation[orientation] ?? ""} onBack={null}>
          <div className="action-row">
            <button
              type="button"
              className="button"
              onClick={() => {
                if (orientation + 1 < t.setup.orientation.length) setOrientation(orientation + 1);
                else go("script");
              }}
            >
              {t.setup.next}
            </button>
          </div>
        </Question>
      );
      break;
    case "script":
      screen = (
        <Question text={t.setup.scriptMode} onBack={null}>
          <p>{t.setup.bridgeReady}</p>
          <div className="action-row">
            <button type="button" className="button" onClick={onDone}>
              {t.setup.toBridge}
            </button>
          </div>
        </Question>
      );
      break;
  }

  const progress = PROGRESS[step];
  return (
    <div className="setup">
      <section className="panel setup-main" aria-labelledby={titleId}>
        <header className="setup-header">
          <h1 id={titleId}>{t.setup.title}</h1>
          {progress ? <span className="muted">{t.setup.progress(progress, TOTAL)}</span> : null}
        </header>
        {screen}
        {busy ? <p className="muted">{t.setup.working}</p> : null}
        {error ? (
          <p className="action-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <aside className="panel setup-systems" aria-label={t.setup.systems}>
        <h2>{t.setup.systems}</h2>
        <ul className="plain">
          <li>
            <span className="status-dot status-ready" aria-hidden="true" />
            {t.setup.shipComputer} … {t.setup.ready}
          </li>
          <li>
            <span
              className={`status-dot ${logbookCreated ? "status-ready" : "status-waiting"}`}
              aria-hidden="true"
            />
            {t.setup.logbook} …{" "}
            {logbookCreated
              ? t.setup.ready
              : info.existing || info.logbook?.hasWorkspace
                ? t.setup.logbookFound
                : t.setup.logbookPending}
          </li>
          <li>
            <span className="status-dot status-off" aria-hidden="true" />
            Xora … {t.setup.xoraNotOnBoard}
          </li>
        </ul>
      </aside>
    </div>
  );
}

function Question({
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

function TextQuestion({
  question,
  label,
  hint,
  initial,
  empty,
  submit,
  maxLength = 80,
  busy,
  onBack,
  onSubmit,
}: {
  question: string;
  label: string;
  hint?: string;
  initial: string;
  empty: string;
  submit?: string;
  maxLength?: number;
  busy: boolean;
  onBack: (() => void) | null;
  onSubmit: (value: string) => Promise<void>;
}) {
  const t = useLabels();
  const id = useId();
  const [value, setValue] = useState(initial);
  const [missing, setMissing] = useState(false);
  const handle = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setMissing(true);
      return;
    }
    setMissing(false);
    void onSubmit(value.trim());
  };
  return (
    <Question text={question} onBack={onBack}>
      <form className="setup-form" onSubmit={handle}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          value={value}
          maxLength={maxLength}
          onChange={(event) => setValue(event.target.value)}
          // biome-ignore lint/a11y/noAutofocus: one question per screen; the field is the screen.
          autoFocus
        />
        {hint ? <small className="muted">{hint}</small> : null}
        {missing ? <p className="setup-warning">{empty}</p> : null}
        <div className="action-row">
          <button type="submit" className="button" disabled={busy}>
            {submit ?? t.setup.next}
          </button>
        </div>
      </form>
    </Question>
  );
}

function ShipQuestion({
  name,
  initial,
  busy,
  onBack,
  onSubmit,
}: {
  name: string;
  initial: string | null;
  busy: boolean;
  onBack: () => void;
  onSubmit: (shipName: string) => Promise<void>;
}) {
  const t = useLabels();
  const [own, setOwn] = useState(initial !== null && !SHIP_NAMES.some((ship) => ship === initial));
  if (own) {
    return (
      <TextQuestion
        question={t.setup.shipQuestion(name)}
        label={t.setup.shipLabel}
        initial={initial ?? ""}
        empty={t.setup.shipLabel}
        busy={busy}
        onBack={() => setOwn(false)}
        onSubmit={onSubmit}
      />
    );
  }
  return (
    <Question text={t.setup.shipQuestion(name)} onBack={onBack}>
      <div className="action-row">
        {SHIP_NAMES.map((ship) => (
          <button
            key={ship}
            type="button"
            className="button"
            disabled={busy}
            onClick={() => onSubmit(ship)}
          >
            {ship}
          </button>
        ))}
        <button
          type="button"
          className="button button-quiet"
          disabled={busy}
          onClick={() => setOwn(true)}
        >
          {t.setup.ownName}
        </button>
      </div>
    </Question>
  );
}

function ExistingShip({
  existing,
  busy,
  onOpen,
  onNew,
}: {
  existing: NonNullable<SetupInfo["existing"]>;
  busy: boolean;
  onOpen: (captain: string | null) => Promise<void>;
  onNew: () => void;
}) {
  const t = useLabels();
  const several = existing.reviewers.length > 1;
  return (
    <Question text={t.setup.existing(existing.name)} onBack={null}>
      {several ? <p>{t.setup.whoAreYou}</p> : null}
      <div className="action-row">
        {several ? (
          existing.reviewers.map((reviewer) => (
            <button
              key={reviewer}
              type="button"
              className="button"
              disabled={busy}
              onClick={() => onOpen(reviewer)}
            >
              {reviewer}
            </button>
          ))
        ) : (
          <button type="button" className="button" disabled={busy} onClick={() => onOpen(null)}>
            {t.setup.openShip}
          </button>
        )}
        <button type="button" className="button button-quiet" disabled={busy} onClick={onNew}>
          {t.setup.newShip}
        </button>
      </div>
    </Question>
  );
}

/**
 * Opens a logbook found in the chosen folder. The derived captain is used when it is one of
 * its reviewers; with a single reviewer the server picks it; otherwise the person chooses.
 */
function OpenLogbook({
  reviewers,
  captain,
  busy,
  onOpen,
}: {
  reviewers: readonly string[];
  captain: string | null;
  busy: boolean;
  onOpen: (captain: string | null) => Promise<void>;
}) {
  const t = useLabels();
  if (reviewers.length > 1 && !(captain && reviewers.includes(captain))) {
    return (
      <>
        <p>{t.setup.whoAreYou}</p>
        <fieldset className="action-row">
          <legend className="visually-hidden">{t.setup.whoAreYou}</legend>
          {reviewers.map((reviewer) => (
            <button
              key={reviewer}
              type="button"
              className="button"
              disabled={busy}
              onClick={() => onOpen(reviewer)}
            >
              {reviewer}
            </button>
          ))}
        </fieldset>
      </>
    );
  }
  const chosen = captain && reviewers.includes(captain) ? captain : null;
  return (
    <button type="button" className="button" disabled={busy} onClick={() => onOpen(chosen)}>
      {t.setup.openLogbook}
    </button>
  );
}
