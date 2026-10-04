/**
 * All UI text in one place (RFC-010, section 3 and Amendment 1): one entry per language.
 * German is the language of the designs; English carries the same keys.
 */
import type { MissionFilter, MissionState } from "./types.js";

export type Language = "de" | "en";

export const LANGUAGES: readonly Language[] = ["de", "en"];

/** German if the system language is German, English otherwise (Amendment 1). */
export function systemLanguage(preferred: readonly string[]): Language {
  return preferred[0]?.toLowerCase().startsWith("de") ? "de" : "en";
}

export interface Labels {
  readonly locale: string;
  readonly languageName: string;
  readonly shell: {
    readonly skipLink: string;
    readonly sections: string;
    readonly missions: string;
    readonly workspace: string;
    readonly actorTitle: string;
    readonly actor: (actor: string) => string;
    readonly readOnly: string;
    readonly language: string;
  };
  readonly filters: Record<MissionFilter, string>;
  readonly states: Record<MissionState, string>;
  readonly waits: Record<string, string>;
  readonly events: Record<string, string>;
  readonly planStatus: Record<string, string>;
  readonly proposalStatus: Record<string, string>;
  readonly time: {
    readonly justNow: string;
    readonly minutesAgo: (minutes: number) => string;
    readonly hoursAgo: (hours: number) => string;
    readonly daysAgo: (days: number) => string;
    readonly today: (time: string) => string;
    readonly reached: string;
    readonly inMinutes: (minutes: number) => string;
    readonly inHours: (hours: number, minutes: number) => string;
  };
  readonly overview: {
    readonly newMission: string;
    readonly statusFilter: string;
    readonly active: string;
    readonly recent: string;
    readonly loading: string;
    readonly sortedBy: string;
    readonly empty: string;
    readonly needsYou: string;
    readonly unavailable: string;
  };
  readonly detail: {
    readonly notFound: string;
    readonly back: string;
    readonly loading: string;
    readonly breadcrumb: string;
    readonly started: string;
    readonly created: string;
    readonly lastActivity: string;
    readonly projectAndContext: string;
    readonly currentState: string;
    readonly noActivity: string;
    readonly reportedBy: (actor: string) => string;
    readonly limitReached: string;
    readonly notFailed: string;
    readonly nextWindow: string;
    readonly noAutoResume: string;
    readonly answerReceived: string;
    readonly decisionRequired: string;
    readonly why: string;
    readonly answeredBy: string;
    readonly approved: string;
    readonly rejected: string;
    readonly waitsForResume: string;
    readonly answerWith: string;
    readonly completed: string;
    readonly failed: string;
    readonly outputs: string;
    readonly validations: string;
    readonly decisions: string;
    readonly proposals: string;
    readonly proposal: string;
    readonly logs: string;
    readonly notPortable: string;
    readonly notAccepted: string;
    readonly queuedText: string;
    readonly pausedText: string;
    readonly cancelledText: string;
    readonly timeline: string;
    readonly live: string;
    readonly liveTitle: string;
    readonly answer: string;
    readonly project: string;
    readonly otherProjects: string;
    readonly nodes: string;
    readonly plans: string;
    readonly noReferences: string;
    readonly technical: string;
    readonly missionId: string;
    readonly state: string;
    readonly events: string;
    readonly createdBy: string;
    readonly predecessor: string;
  };
}

const de: Labels = {
  locale: "de-DE",
  languageName: "Deutsch",
  shell: {
    skipLink: "Zum Inhalt springen",
    sections: "Bereiche",
    missions: "Missionen",
    workspace: "Workspace",
    actorTitle: "Schreiben in der UI braucht einen konfigurierten Akteur (RFC-010, Abschnitt 9)",
    actor: (actor) => `Akteur: ${actor}`,
    readOnly: "Nur lesen",
    language: "Sprache",
  },
  filters: {
    all: "Alle",
    running: "Läuft",
    limit: "Wartet",
    input: "Benötigt Input",
    completed: "Abgeschlossen",
    failed: "Fehlgeschlagen",
  },
  states: {
    queued: "Geplant",
    running: "Läuft",
    waiting: "Wartet",
    paused: "Pausiert",
    completed: "Abgeschlossen",
    failed: "Fehlgeschlagen",
    cancelled: "Abgebrochen",
  },
  waits: {
    provider_limit: "Limit erreicht",
    needs_input: "Benötigt Input",
    needs_approval: "Freigabe nötig",
    needs_permission: "Berechtigung nötig",
    needs_manual_action: "Handlung nötig",
  },
  events: {
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
  },
  planStatus: {
    Proposed: "Vorgeschlagen",
    Deferred: "Zurückgestellt",
    Ready: "Bereit",
    InProgress: "In Arbeit",
    Completed: "Abgeschlossen",
    Cancelled: "Abgebrochen",
  },
  proposalStatus: {
    Submitted: "wartet auf Review",
    Accepted: "angenommen",
    Rejected: "abgelehnt",
  },
  time: {
    justNow: "gerade eben",
    minutesAgo: (minutes) => `vor ${minutes} Min.`,
    hoursAgo: (hours) => `vor ${hours} Std.`,
    daysAgo: (days) => `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`,
    today: (time) => `Heute, ${time}`,
    reached: "Zeitpunkt erreicht",
    inMinutes: (minutes) => `in ${minutes} Min.`,
    inHours: (hours, minutes) => `in ${hours} Std. ${minutes} Min.`,
  },
  overview: {
    newMission: "Neue Mission:",
    statusFilter: "Statusfilter",
    active: "Aktive Missionen",
    recent: "Letzte Missionen",
    loading: "Lade Missionen …",
    sortedBy: "Sortiert nach Bedarf an Aufmerksamkeit",
    empty: "Keine Missionen. Agenten erfassen ihre Arbeit mit",
    needsYou: "Braucht dich:",
    unavailable: "Workspace nicht verfügbar",
  },
  detail: {
    notFound: "Mission nicht gefunden",
    back: "Zurück zu den Missionen",
    loading: "Lade Mission …",
    breadcrumb: "Pfad",
    started: "Gestartet",
    created: "Erstellt",
    lastActivity: "Letzte Aktivität",
    projectAndContext: "Projekt & Kontext",
    currentState: "Aktueller Stand",
    noActivity: "Der Agent hat noch keine Tätigkeit gemeldet.",
    reportedBy: (actor) => `Gemeldet von ${actor}`,
    limitReached: "Limit erreicht – Mission sicher pausiert",
    notFailed: "Die Mission ist nicht fehlgeschlagen.",
    nextWindow: "Nächstes Fenster:",
    noAutoResume: "Nichts wird automatisch fortgesetzt. Fortsetzen mit",
    answerReceived: "Antwort erhalten",
    decisionRequired: "Entscheidung erforderlich",
    why: "Warum:",
    answeredBy: "Beantwortet von",
    approved: "freigegeben",
    rejected: "abgelehnt",
    waitsForResume: "Die Mission wartet auf das Fortsetzen.",
    answerWith: "Antworten mit",
    completed: "Mission abgeschlossen",
    failed: "Mission fehlgeschlagen",
    outputs: "Ergebnisse",
    validations: "Prüfungen",
    decisions: "Entscheidungen",
    proposals: "Wissensvorschläge",
    proposal: "Vorschlag",
    logs: "Logs",
    notPortable: "(nicht portabel)",
    notAccepted:
      "Ein Abschluss ist noch kein angenommenes Wissen; Vorschläge laufen durch das Review.",
    queuedText: "Die Mission wurde erfasst und wartet auf den Start.",
    pausedText: "Ein Mensch hat die Mission bewusst angehalten.",
    cancelledText: "Die Mission wurde abgebrochen.",
    timeline: "Timeline",
    live: "Live",
    liveTitle: "Aktualisiert alle 5 Sekunden",
    answer: "Antwort:",
    project: "Projekt",
    otherProjects: "Weitere Projekte",
    nodes: "Wissensknoten",
    plans: "Pläne",
    noReferences: "Keine verknüpften Knoten oder Pläne.",
    technical: "Technische Details",
    missionId: "Mission-ID",
    state: "Zustand",
    events: "Ereignisse",
    createdBy: "Erstellt von",
    predecessor: "Vorgänger",
  },
};

const en: Labels = {
  locale: "en-GB",
  languageName: "English",
  shell: {
    skipLink: "Skip to content",
    sections: "Sections",
    missions: "Missions",
    workspace: "Workspace",
    actorTitle: "Writing in the UI needs a configured actor (RFC-010, section 9)",
    actor: (actor) => `Actor: ${actor}`,
    readOnly: "Read only",
    language: "Language",
  },
  filters: {
    all: "All",
    running: "Running",
    limit: "Waiting",
    input: "Needs input",
    completed: "Completed",
    failed: "Failed",
  },
  states: {
    queued: "Queued",
    running: "Running",
    waiting: "Waiting",
    paused: "Paused",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  waits: {
    provider_limit: "Limit reached",
    needs_input: "Needs input",
    needs_approval: "Needs approval",
    needs_permission: "Needs permission",
    needs_manual_action: "Needs action",
  },
  events: {
    Created: "Mission created",
    Started: "Mission started",
    ActivityReported: "Activity",
    Waiting: "Waiting",
    AttentionAnswered: "Answer received",
    Resumed: "Resumed",
    Paused: "Paused",
    Cancelled: "Cancelled",
    Completed: "Completed",
    Failed: "Failed",
  },
  planStatus: {
    Proposed: "Proposed",
    Deferred: "Deferred",
    Ready: "Ready",
    InProgress: "In progress",
    Completed: "Completed",
    Cancelled: "Cancelled",
  },
  proposalStatus: {
    Submitted: "waiting for review",
    Accepted: "accepted",
    Rejected: "rejected",
  },
  time: {
    justNow: "just now",
    minutesAgo: (minutes) => `${minutes} min ago`,
    hoursAgo: (hours) => `${hours} h ago`,
    daysAgo: (days) => `${days} ${days === 1 ? "day" : "days"} ago`,
    today: (time) => `Today, ${time}`,
    reached: "Time reached",
    inMinutes: (minutes) => `in ${minutes} min`,
    inHours: (hours, minutes) => `in ${hours} h ${minutes} min`,
  },
  overview: {
    newMission: "New mission:",
    statusFilter: "Status filter",
    active: "Active missions",
    recent: "Recent missions",
    loading: "Loading missions …",
    sortedBy: "Sorted by need for attention",
    empty: "No missions. Agents record their work with",
    needsYou: "Needs you:",
    unavailable: "Workspace unavailable",
  },
  detail: {
    notFound: "Mission not found",
    back: "Back to missions",
    loading: "Loading mission …",
    breadcrumb: "Path",
    started: "Started",
    created: "Created",
    lastActivity: "Last activity",
    projectAndContext: "Project & context",
    currentState: "Current state",
    noActivity: "The agent has not reported any activity yet.",
    reportedBy: (actor) => `Reported by ${actor}`,
    limitReached: "Limit reached – mission safely paused",
    notFailed: "The mission has not failed.",
    nextWindow: "Next window:",
    noAutoResume: "Nothing resumes automatically. Resume with",
    answerReceived: "Answer received",
    decisionRequired: "Decision required",
    why: "Why:",
    answeredBy: "Answered by",
    approved: "approved",
    rejected: "rejected",
    waitsForResume: "The mission is waiting to be resumed.",
    answerWith: "Answer with",
    completed: "Mission completed",
    failed: "Mission failed",
    outputs: "Outputs",
    validations: "Validations",
    decisions: "Decisions",
    proposals: "Knowledge proposals",
    proposal: "Proposal",
    logs: "Logs",
    notPortable: "(not portable)",
    notAccepted: "A completed mission is not accepted knowledge yet; proposals go through review.",
    queuedText: "The mission was recorded and is waiting to start.",
    pausedText: "A person paused the mission on purpose.",
    cancelledText: "The mission was cancelled.",
    timeline: "Timeline",
    live: "Live",
    liveTitle: "Updates every 5 seconds",
    answer: "Answer:",
    project: "Project",
    otherProjects: "Other projects",
    nodes: "Knowledge nodes",
    plans: "Plans",
    noReferences: "No linked nodes or plans.",
    technical: "Technical details",
    missionId: "Mission ID",
    state: "State",
    events: "Events",
    createdBy: "Created by",
    predecessor: "Predecessor",
  },
};

export const LABELS: Record<Language, Labels> = { de, en };

export type Tone = "running" | "limit" | "input" | "done" | "failed" | "neutral";

export function statusLabel(t: Labels, state: MissionState, waitReason: string | null): string {
  return state === "waiting" && waitReason
    ? (t.waits[waitReason] ?? t.states.waiting)
    : t.states[state];
}

export function waitReasonLabel(t: Labels, waitReason: string): string {
  return t.waits[waitReason] ?? waitReason;
}

export function eventLabel(t: Labels, type: string): string {
  return t.events[type] ?? type;
}

export function statusTone(state: MissionState, waitReason: string | null): Tone {
  if (state === "running") return "running";
  if (state === "waiting") return waitReason === "provider_limit" ? "limit" : "input";
  if (state === "completed") return "done";
  if (state === "failed") return "failed";
  return "neutral";
}

export function relativeTime(t: Labels, iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return t.time.justNow;
  if (seconds < 3600) return t.time.minutesAgo(Math.round(seconds / 60));
  if (seconds < 86400) return t.time.hoursAgo(Math.round(seconds / 3600));
  return t.time.daysAgo(Math.round(seconds / 86400));
}

export function clockTime(t: Labels, iso: string): string {
  return new Date(iso).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(t: Labels, iso: string): string {
  const date = new Date(iso);
  const time = clockTime(t, iso);
  return date.toDateString() === new Date().toDateString()
    ? t.time.today(time)
    : `${date.toLocaleDateString(t.locale)}, ${time}`;
}

export function untilTime(t: Labels, iso: string, now = Date.now()): string {
  const minutes = Math.round((Date.parse(iso) - now) / 60000);
  if (minutes <= 0) return t.time.reached;
  if (minutes < 60) return t.time.inMinutes(minutes);
  return t.time.inHours(Math.floor(minutes / 60), minutes % 60);
}

export function proposalStatusLabel(t: Labels, status: string): string {
  return t.proposalStatus[status] ?? status;
}

export function planStatusLabel(t: Labels, status: string): string {
  return t.planStatus[status] ?? status;
}
