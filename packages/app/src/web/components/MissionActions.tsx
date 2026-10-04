import { type FormEvent, useId, useState } from "react";
import { ApiError, post } from "../api.js";
import { useLabels } from "../i18n.js";
import type { MissionAction, MissionDetail } from "../types.js";

/**
 * Write actions of Mission Control (RFC-010, section 9; Milestone 12). The server decides
 * which actions exist and assigns the configured actor; the browser only sends the choice
 * and the sequence it was showing.
 */
function useMissionAction(mission: MissionDetail, onDone: () => void) {
  const t = useLabels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: MissionAction, body: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/missions/${encodeURIComponent(mission.id)}/${action}`, {
        ...body,
        sequence: mission.sequence,
      });
    } catch (value) {
      setError(
        value instanceof ApiError && value.status === 409
          ? t.actions.stale
          : t.actions.failed(value instanceof Error ? value.message : String(value)),
      );
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return { run, busy, error };
}

export function MissionActionBar({
  mission,
  onDone,
}: {
  mission: MissionDetail;
  onDone: () => void;
}) {
  const t = useLabels();
  const reasonId = useId();
  const { run, busy, error } = useMissionAction(mission, onDone);
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");
  const available = new Set(mission.availableActions);
  if (!available.has("pause") && !available.has("resume") && !available.has("cancel")) {
    return null;
  }
  const stop = async (event: FormEvent) => {
    event.preventDefault();
    await run("cancel", { reason });
    setStopping(false);
    setReason("");
  };
  return (
    <div className="mission-actions">
      <fieldset className="action-row">
        <legend className="visually-hidden">{t.actions.label}</legend>
        {available.has("resume") ? (
          <button type="button" className="button" disabled={busy} onClick={() => run("resume")}>
            {t.actions.resume}
          </button>
        ) : null}
        {available.has("pause") ? (
          <button
            type="button"
            className="button button-quiet"
            disabled={busy}
            onClick={() => run("pause")}
          >
            {t.actions.pause}
          </button>
        ) : null}
        {available.has("cancel") && !stopping ? (
          <button
            type="button"
            className="button button-danger"
            disabled={busy}
            onClick={() => setStopping(true)}
          >
            {t.actions.stop}
          </button>
        ) : null}
      </fieldset>
      {stopping ? (
        <form className="stop-form" onSubmit={stop}>
          <strong>{t.actions.stopTitle}</strong>
          <label htmlFor={reasonId}>{t.actions.stopReason}</label>
          <input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={500}
          />
          <div className="action-row">
            <button
              type="submit"
              className="button button-danger"
              disabled={busy || !reason.trim()}
            >
              {t.actions.stopConfirm}
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setStopping(false);
                setReason("");
              }}
            >
              {t.actions.keepRunning}
            </button>
          </div>
        </form>
      ) : null}
      <ActionStatus busy={busy} error={error} />
    </div>
  );
}

export function AnswerForm({ mission, onDone }: { mission: MissionDetail; onDone: () => void }) {
  const t = useLabels();
  const answerId = useId();
  const { run, busy, error } = useMissionAction(mission, onDone);
  const [response, setResponse] = useState("");
  const request = mission.attentionRequest;
  if (!request || !mission.availableActions.includes("answer")) return null;
  const approval = request.waitReason === "needs_approval";
  const answer = (value: string, decision?: "approve" | "reject") =>
    run("answer", { response: value, ...(decision ? { decision } : {}) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!approval && response.trim()) void answer(response.trim());
  };
  return (
    <form className="answer-form" onSubmit={submit}>
      {!approval && request.options.length > 0 ? (
        <div className="options">
          {request.options.map((option) => (
            <button
              key={option.option}
              type="button"
              className="option option-button"
              disabled={busy}
              onClick={() => answer(option.option)}
            >
              <strong>{option.option}</strong>
              {option.consequence ? <span>{option.consequence}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <label htmlFor={answerId}>{t.actions.yourAnswer}</label>
      <textarea
        id={answerId}
        rows={2}
        value={response}
        onChange={(event) => setResponse(event.target.value)}
        maxLength={4000}
      />
      <div className="action-row">
        {approval ? (
          <>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => answer(response.trim() || t.actions.approve, "approve")}
            >
              {t.actions.approve}
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={busy}
              onClick={() => answer(response.trim() || t.actions.reject, "reject")}
            >
              {t.actions.reject}
            </button>
          </>
        ) : (
          <button type="submit" className="button" disabled={busy || !response.trim()}>
            {t.actions.send}
          </button>
        )}
      </div>
      <ActionStatus busy={busy} error={error} />
    </form>
  );
}

function ActionStatus({ busy, error }: { busy: boolean; error: string | null }) {
  const t = useLabels();
  if (busy) return <p className="muted">{t.actions.saving}</p>;
  if (error) {
    return (
      <p className="action-error" role="alert">
        {error}
      </p>
    );
  }
  return null;
}
