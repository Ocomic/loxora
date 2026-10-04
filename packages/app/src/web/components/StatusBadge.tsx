import { statusLabel, statusTone } from "../labels.js";
import type { MissionState } from "../types.js";

/** Status is always shown as text and color, never color alone. */
export function StatusBadge({
  state,
  waitReason,
  large = false,
}: {
  state: MissionState;
  waitReason: string | null;
  large?: boolean;
}) {
  const tone = statusTone(state, waitReason);
  return (
    <span className={`badge badge-${tone}${large ? " badge-large" : ""}`}>
      <span className="dot" aria-hidden="true" />
      {statusLabel(state, waitReason)}
    </span>
  );
}
