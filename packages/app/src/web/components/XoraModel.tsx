import { type FormEvent, useId, useState } from "react";
import { ApiError, post } from "../api.js";
import { useLabels } from "../i18n.js";
import type { ModelChangeAction, XoraInfo } from "../types.js";
import { ModelCard } from "./Setup.js";

const DEFAULT_MODEL_URL = "http://127.0.0.1:8080";

/**
 * Xora's model in her details panel on the bridge (Milestone 16 section 6): the state,
 * "Change model" with the same choice as in the setup, ending on the same card, and "Restart
 * Xora". Nothing changes before the card is confirmed.
 */
export function XoraModel({
  xora,
  onChanged,
}: {
  xora: XoraInfo | undefined;
  onChanged: () => void;
}) {
  const t = useLabels();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"managed" | "attached">("managed");
  const [runtimePath, setRuntimePath] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [url, setUrl] = useState(DEFAULT_MODEL_URL);
  const [label, setLabel] = useState("");
  const [change, setChange] = useState<ModelChangeAction | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const model = xora?.modelLabel ?? null;
  let status = t.bridge.xoraStatus;
  if (xora?.state === "ready" && model) status = t.setup.statusModel(model);
  else if (xora?.state === "starting" && model) status = t.bridge.xoraStarting(model);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await work();
    } catch (error) {
      const kind = error instanceof ApiError ? (error.kind ?? "") : "";
      setNote(
        t.setup.modelErrors[kind] ??
          t.bridge.failed(error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setBusy(false);
    }
  };

  const pick = (kind: "runtime" | "model") =>
    run(async () => {
      const result = await post<{ path?: string }>("/api/xora/pick", {
        kind,
        title: kind === "runtime" ? t.setup.pickRuntimeTitle : t.setup.pickModelTitle,
      });
      if (result.path) (kind === "runtime" ? setRuntimePath : setModelPath)(result.path);
    });

  const propose = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const body =
        mode === "managed"
          ? { mode, runtimePath, modelPath, ...(label.trim() ? { modelLabel: label } : {}) }
          : { mode, url, modelLabel: label };
      const result = await post<{ action: ModelChangeAction }>("/api/xora/model", {
        provider: "local",
        ...body,
      });
      setChange(result.action);
    });
  };

  const confirm = (yes: boolean) =>
    run(async () => {
      if (!change) return;
      await post("/api/assistant/confirm", { actionId: change.id, confirm: yes });
      setChange(null);
      if (yes) {
        setOpen(false);
        setNote(t.bridge.modelChanged);
      }
      onChanged();
    });

  const restart = () =>
    run(async () => {
      await post("/api/xora/restart", {});
      setNote(t.bridge.restartingXora);
      onChanged();
    });

  return (
    <div className="xora-model">
      <p className="presence-line">
        <span className="presence" aria-hidden="true" /> {status}
      </p>
      {xora?.state === "scriptMode" && xora.reason ? (
        <p className="muted">
          {t.bridge.scriptReason(t.setup.reasons[xora.reason] ?? xora.reason)}
        </p>
      ) : null}
      {xora?.failedChange ? (
        <p className="setup-warning">{t.setup.changeFailed(xora.failedChange)}</p>
      ) : null}
      {note ? <output>{note}</output> : null}
      {xora?.canChange ? (
        <div className="xora-model-actions">
          <button
            type="button"
            className="button"
            aria-expanded={open}
            disabled={busy}
            onClick={() => {
              setOpen(!open);
              setChange(null);
            }}
          >
            {t.bridge.changeModel}
          </button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={restart}>
            {t.bridge.restartXora}
          </button>
        </div>
      ) : null}
      {open && !change ? (
        <form className="xora-model-form" onSubmit={propose} aria-label={t.bridge.modelChoice}>
          <fieldset>
            <legend>{t.bridge.modelChoice}</legend>
            <label>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={mode === "managed"}
                onChange={() => setMode("managed")}
              />{" "}
              {t.setup.choices.model.localFile}
            </label>
            <label>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={mode === "attached"}
                onChange={() => setMode("attached")}
              />{" "}
              {t.setup.choices.model.attached}
            </label>
            <label className="muted">
              <input type="radio" name={`${id}-mode`} disabled /> {t.setup.choices.model.cloud} ·{" "}
              {t.setup.later}
            </label>
          </fieldset>
          {mode === "managed" ? (
            <>
              <label htmlFor={`${id}-runtime`}>{t.bridge.runtimeField}</label>
              <div className="xora-model-file">
                <input
                  id={`${id}-runtime`}
                  value={runtimePath}
                  maxLength={1024}
                  placeholder={t.setup.placeholders.runtimePath}
                  onChange={(event) => setRuntimePath(event.target.value)}
                />
                {xora?.picker ? (
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={busy}
                    onClick={() => void pick("runtime")}
                  >
                    {t.bridge.choose}
                  </button>
                ) : null}
              </div>
              <label htmlFor={`${id}-model`}>{t.bridge.modelField}</label>
              <div className="xora-model-file">
                <input
                  id={`${id}-model`}
                  value={modelPath}
                  maxLength={1024}
                  placeholder={t.setup.placeholders.modelPath}
                  onChange={(event) => setModelPath(event.target.value)}
                />
                {xora?.picker ? (
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={busy}
                    onClick={() => void pick("model")}
                  >
                    {t.bridge.choose}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <label htmlFor={`${id}-url`}>{t.bridge.urlField}</label>
              <input
                id={`${id}-url`}
                value={url}
                maxLength={200}
                onChange={(event) => setUrl(event.target.value)}
              />
            </>
          )}
          <label htmlFor={`${id}-label`}>{t.bridge.nameField}</label>
          <input
            id={`${id}-label`}
            value={label}
            maxLength={60}
            placeholder={t.setup.placeholders.modelName}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button type="submit" className="button" disabled={busy}>
            {t.bridge.next}
          </button>
        </form>
      ) : null}
      {change ? (
        <>
          <ModelCard t={t} change={change} />
          <div className="xora-model-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void confirm(true)}
            >
              {t.setup.choices.modelConfirm.switch}
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => void confirm(false)}
            >
              {t.setup.choices.modelConfirm.stay}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
