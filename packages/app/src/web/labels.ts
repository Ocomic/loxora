/** All UI text in one place (RFC-010, section 3): German first, English possible later. */
import type { MissionFilter, MissionState } from "./types.js";

export const FILTER_LABELS: Record<MissionFilter, string> = {
  all: "Alle",
  running: "Läuft",
  limit: "Wartet",
  input: "Benötigt Input",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
};

const STATE_LABELS: Record<MissionState, string> = {
  queued: "Geplant",
  running: "Läuft",
  waiting: "Wartet",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

const WAIT_LABELS: Record<string, string> = {
  provider_limit: "Limit erreicht",
  needs_input: "Benötigt Input",
  needs_approval: "Freigabe nötig",
  needs_permission: "Berechtigung nötig",
  needs_manual_action: "Handlung nötig",
};

export const EVENT_LABELS: Record<string, string> = {
  Created: "Mission erstellt",
  Started: "Mission gestartet",
  ActivityReported: "Aktivität",
  Waiting: "Wartet",
  AttentionAnswered: "Antwort erhalten",
  Resumed: "Fortgesetzt",
  Paused: "Pausiert",
  Cancelled: "Abgebrochen",
  Completed: "Abgeschlossen",
  Failed: "Fehlgeschlagen",
};

export type Tone = "running" | "limit" | "input" | "done" | "failed" | "neutral";

export function statusLabel(state: MissionState, waitReason: string | null): string {
  return state === "waiting" && waitReason
    ? (WAIT_LABELS[waitReason] ?? STATE_LABELS.waiting)
    : STATE_LABELS[state];
}

export function waitReasonLabel(waitReason: string): string {
  return WAIT_LABELS[waitReason] ?? waitReason;
}

export function statusTone(state: MissionState, waitReason: string | null): Tone {
  if (state === "running") return "running";
  if (state === "waiting") return waitReason === "provider_limit" ? "limit" : "input";
  if (state === "completed") return "done";
  if (state === "failed") return "failed";
  return "neutral";
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "gerade eben";
  if (seconds < 3600) return `vor ${Math.round(seconds / 60)} Min.`;
  if (seconds < 86400) return `vor ${Math.round(seconds / 3600)} Std.`;
  const days = Math.round(seconds / 86400);
  return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(iso: string): string {
  const date = new Date(iso);
  const time = clockTime(iso);
  return date.toDateString() === new Date().toDateString()
    ? `Heute, ${time}`
    : `${date.toLocaleDateString("de-DE")}, ${time}`;
}

export function untilTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((Date.parse(iso) - now) / 60000);
  if (minutes <= 0) return "Zeitpunkt erreicht";
  if (minutes < 60) return `in ${minutes} Min.`;
  return `in ${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

export function proposalStatusLabel(status: string): string {
  if (status === "Submitted") return "wartet auf Review";
  if (status === "Accepted") return "angenommen";
  if (status === "Rejected") return "abgelehnt";
  return status;
}

const PLAN_STATUS_LABELS: Record<string, string> = {
  Proposed: "Vorgeschlagen",
  Deferred: "Zurückgestellt",
  Ready: "Bereit",
  InProgress: "In Arbeit",
  Completed: "Abgeschlossen",
  Cancelled: "Abgebrochen",
};

export function planStatusLabel(status: string): string {
  return PLAN_STATUS_LABELS[status] ?? status;
}
