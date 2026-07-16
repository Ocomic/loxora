import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DemoAction } from "../../shared/contracts.js";
import { post } from "../api.js";
import { useDemoState } from "./DemoState.js";

export function DemoActionButton({
  action,
  secondary = false,
}: {
  action: DemoAction;
  secondary?: boolean;
}) {
  const navigate = useNavigate();
  const { refresh, mode } = useDemoState();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (!action.enabled || pending) return;
    if (action.intent === "Navigate") {
      navigate(withMode(action.href, mode));
      return;
    }
    if (!action.endpoint) return;
    try {
      setPending(true);
      setError(null);
      await post(action.endpoint, action.id === "reset" ? { stage: "Prepared" } : {});
      await refresh();
      navigate(withMode(action.href, mode));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Action failed");
      await refresh();
    } finally {
      setPending(false);
    }
  };
  return (
    <span className="action-control">
      <button
        className={secondary ? "button secondary" : "button primary"}
        type="button"
        disabled={!action.enabled || pending}
        aria-describedby={
          !action.enabled && action.disabledReason ? `${action.id}-reason` : undefined
        }
        onClick={() => void run()}
      >
        {pending ? "Working…" : action.label}
      </button>
      {!action.enabled && action.disabledReason ? (
        <small id={`${action.id}-reason`}>{action.disabledReason}</small>
      ) : null}
      {error ? (
        <small className="error-text" role="alert">
          {error}
        </small>
      ) : null}
    </span>
  );
}

export function withMode(path: string, mode: "guided" | "explore"): string {
  const [pathname, raw = ""] = path.split("?");
  const params = new URLSearchParams(raw);
  params.set("mode", mode);
  return `${pathname}?${params.toString()}`;
}
