/**
 * All UI text in one place (RFC-010, section 3 and Amendment 1): one entry per language.
 * German is the language of the designs; English carries the same keys.
 */
import type { FirstStepsStage, Goal, MissionFilter, MissionState } from "./types.js";

export type Language = "de" | "en";

export const LANGUAGES: readonly Language[] = ["de", "en"];

/** German if the system language is German, English otherwise (Amendment 1). */
export function systemLanguage(preferred: readonly string[]): Language {
  return preferred[0]?.toLowerCase().startsWith("de") ? "de" : "en";
}

/**
 * The language on start (Milestone 13): the settings file wins; without a stored language a
 * choice from browser storage (Milestones 11 and 12) is used and imported once; otherwise the
 * system language.
 */
export function startLanguage(
  stored: { readonly available: boolean; readonly language: Language | null },
  browser: Language | null,
  system: Language,
): { readonly language: Language; readonly importBrowserChoice: boolean } {
  if (stored.available && stored.language) {
    return { language: stored.language, importBrowserChoice: false };
  }
  return {
    language: browser ?? system,
    importBrowserChoice: stored.available && browser !== null,
  };
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
  readonly actions: {
    readonly label: string;
    readonly pause: string;
    readonly resume: string;
    readonly stop: string;
    readonly stopTitle: string;
    readonly stopReason: string;
    readonly stopConfirm: string;
    readonly keepRunning: string;
    readonly yourAnswer: string;
    readonly send: string;
    readonly approve: string;
    readonly reject: string;
    readonly saving: string;
    readonly stale: string;
    readonly failed: (message: string) => string;
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
  readonly setup: {
    readonly title: string;
    readonly progress: (step: number, total: number) => string;
    readonly back: string;
    readonly next: string;
    readonly systems: string;
    readonly shipComputer: string;
    readonly ready: string;
    readonly logbook: string;
    readonly logbookPending: string;
    readonly logbookFound: string;
    readonly xoraNotOnBoard: string;
    readonly existing: (ship: string) => string;
    readonly openShip: string;
    readonly newShip: string;
    readonly whoAreYou: string;
    readonly nameQuestion: string;
    readonly nameLabel: string;
    readonly nameEmpty: string;
    readonly shortNameQuestion: string;
    readonly shortNameLabel: string;
    readonly shipQuestion: (name: string) => string;
    readonly shipLabel: string;
    readonly ownName: string;
    readonly logbookQuestion: (ship: string) => string;
    readonly documents: string;
    readonly details: string;
    readonly fits: string;
    readonly otherFolder: string;
    readonly folderLabel: string;
    readonly folderHint: string;
    readonly useFolder: string;
    readonly inRepository: string;
    readonly oneDrive: string;
    readonly hasWorkspace: string;
    readonly openLogbook: string;
    readonly notOnShip: string;
    readonly working: string;
    readonly orientation: readonly string[];
    readonly scriptMode: string;
    readonly bridgeReady: string;
    readonly toBridge: string;
    readonly settingsError: string;
    readonly failed: (message: string) => string;
  };
  readonly firstSteps: {
    readonly title: string;
    readonly banner: Record<FirstStepsStage, string>;
    readonly continue: string;
    readonly skip: string;
    readonly goalQuestion: string;
    readonly goals: Record<Goal, string>;
    readonly stations: Record<Goal, string>;
    readonly stationExplained: string;
    readonly purposeQuestion: string;
    readonly purposeLabel: string;
    readonly projectQuestion: string;
    readonly projectSuggestions: Record<Goal, string>;
    readonly ownName: string;
    readonly projectLabel: string;
    readonly confirmation: string;
    readonly createProject: (name: string, purpose: string) => string;
    readonly spaces: (spaces: readonly string[], collection: string) => string;
    readonly rule: string;
    readonly create: string;
    readonly change: string;
    readonly missionIntro: string;
    readonly startMission: (title: string) => string;
    readonly missionQuestion: (question: string) => string;
    readonly start: string;
    readonly waiting: string;
    readonly openMission: string;
    readonly recordQuestion: string;
    readonly goalLabel: string;
    readonly template: (purpose: string, answer: string) => string;
    readonly recordCard: (title: string) => string;
    readonly accept: string;
    readonly hints: readonly string[];
    readonly closing: string;
    readonly finish: string;
  };
  readonly xora: {
    readonly bar: string;
    readonly placeholder: string;
    readonly send: string;
    readonly close: string;
    readonly notStored: string;
    readonly replies: Record<"notOnBoard" | "missions", string>;
    readonly askMissions: string;
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
    empty: "Hier ist noch keine Mission.",
    needsYou: "Braucht dich:",
    unavailable: "Workspace nicht verfügbar",
  },
  actions: {
    label: "Aktionen",
    pause: "Pausieren",
    resume: "Fortsetzen",
    stop: "Stoppen",
    stopTitle: "Mission stoppen?",
    stopReason: "Grund",
    stopConfirm: "Endgültig stoppen",
    keepRunning: "Nicht stoppen",
    yourAnswer: "Deine Antwort",
    send: "Antworten",
    approve: "Freigeben",
    reject: "Ablehnen",
    saving: "Wird gespeichert …",
    stale:
      "Die Mission hat sich inzwischen geändert. Sie wurde neu geladen; bitte prüfe sie noch einmal.",
    failed: (message) => `Das hat nicht geklappt: ${message}`,
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
  setup: {
    title: "Erster Start",
    progress: (step, total) => `Schritt ${step} von ${total}`,
    back: "Zurück",
    next: "Weiter",
    systems: "Schiffssysteme",
    shipComputer: "Bordcomputer",
    ready: "bereit",
    logbook: "Logbuch",
    logbookPending: "wird gleich angelegt",
    logbookFound: "gefunden",
    xoraNotOnBoard: "in dieser Version noch nicht an Bord",
    existing: (ship) =>
      `Auf diesem Rechner gibt es schon ein Schiff: „${ship}“. Willst du damit weiterfliegen?`,
    openShip: "Dieses Schiff öffnen",
    newShip: "Neues Schiff anlegen",
    whoAreYou: "Wer von euch bist du?",
    nameQuestion:
      "Willkommen an Bord. Ich bin Xora, deine Erste Offizierin. Ein paar Dinge klären wir gleich zu Beginn. Wie soll ich dich nennen?",
    nameLabel: "Dein Name",
    nameEmpty:
      "Ich brauche einen Namen, damit ich weiß, wer an Bord entscheidet. Ein Spitzname reicht.",
    shortNameQuestion:
      "Aus diesem Namen kann ich keine Kennung für deine Freigaben machen. Gib mir bitte einen kurzen Namen aus Buchstaben oder Ziffern, etwa „alex“.",
    shortNameLabel: "Kurzer Name",
    shipQuestion: (name) =>
      `Schön, dich kennenzulernen, ${name}. Dein Schiff ist dein Arbeitsbereich für alle deine Projekte, und es braucht einen Namen. Wie soll deins heißen?`,
    shipLabel: "Schiffsname",
    ownName: "Selbst eingeben",
    logbookQuestion: (ship) =>
      `Wo soll ich das Logbuch der ${ship} aufbewahren, also alles, was wir über deine Projekte festhalten? Ich schlage diesen Ordner vor. Alles bleibt auf diesem Rechner.`,
    documents: "Dokumente",
    details: "Details",
    fits: "Passt so",
    otherFolder: "Anderen Ordner wählen",
    folderLabel: "Voller Pfad des Ordners",
    folderHint: "Zum Beispiel C:\\Users\\alex\\Documents\\Loxora. Fehlende Ordner lege ich an.",
    useFolder: "Diesen Ordner nehmen",
    inRepository:
      "Dieser Ordner gehört zu einem Code-Projekt. Das Logbuch sollte getrennt davon liegen.",
    oneDrive:
      "Dieser Ordner wird mit OneDrive synchronisiert. Dann läge dein Logbuch auch in der Cloud. Wenn du das nicht willst, wähle einen anderen Ordner.",
    hasWorkspace: "In diesem Ordner liegt schon ein Logbuch.",
    openLogbook: "Dieses Logbuch öffnen",
    notOnShip:
      "Dein Name steht nicht auf der Liste dieses Schiffs. Wähle einen anderen Ordner für dein Logbuch.",
    working: "Einen Moment …",
    orientation: [
      "Kurz zur Orientierung: Das hier ist die Brücke. Von hier aus steuerst du deine Projekte.",
      "Später arbeiten hier weitere KI-Helfer als deine Crew. Ich koordiniere sie und hole dich, wenn etwas entschieden werden muss.",
      "Das Wichtigste an Bord: Ich schlage vor, du entscheidest. Nichts wird ohne dich festgeschrieben.",
    ],
    scriptMode:
      "In dieser Version bin ich noch nicht ganz an Bord und kann noch nicht frei antworten. Wir kommen trotzdem ans Ziel: Bis dahin gebe ich dir feste Auswahlmöglichkeiten.",
    bridgeReady:
      "Dein Logbuch ist angelegt. Als Nächstes legen wir dein erstes Projekt und deine erste Mission an.",
    toBridge: "Weiter",
    settingsError:
      "Deine Einstellungsdatei lässt sich nicht lesen. Loxora ändert sie nicht. Korrigiere oder entferne sie und lade die Seite dann neu.",
    failed: (message) => `Das hat nicht geklappt: ${message}`,
  },
  firstSteps: {
    title: "Erste Schritte",
    banner: {
      goal: "Deine ersten Schritte sind noch offen: dein erstes Projekt und deine erste Mission.",
      mission: "Deine ersten Schritte sind noch offen: deine erste Mission.",
      answer: "Deine erste Mission wartet auf deine Entscheidung.",
      record: "Deine erste Mission hat eine Antwort. Jetzt halten wir das Projektziel fest.",
      hints: "Fast geschafft: noch zwei kurze Hinweise zur Brücke.",
    },
    continue: "Weiter einrichten",
    skip: "Erste Schritte überspringen",
    goalQuestion: "Was möchtest du mit Loxora machen?",
    goals: {
      game: "Ein Spiel entwickeln",
      website: "Eine Website bauen",
      writing: "Texte oder ein Buch schreiben",
      other: "Etwas anderes",
    },
    stations: {
      game: "Dafür helfen später Stationen für Programmieren, Grafik und Tests.",
      website: "Dafür helfen später Stationen für Gestaltung, Texte und Technik.",
      writing: "Dafür helfen später Stationen für Schreiben, Lektorat und Recherche.",
      other: "Welche Stationen dafür helfen, schauen wir uns später zusammen an.",
    },
    stationExplained:
      "Eine Station ist ein Arbeitsplatz auf der Brücke, an dem später ein KI-Helfer der Crew arbeitet.",
    purposeQuestion: "Erzähl mir in ein, zwei Sätzen, was du vorhast.",
    purposeLabel: "Dein Vorhaben",
    projectQuestion: "Wie soll das Projekt heißen?",
    projectSuggestions: {
      game: "Mein Spiel",
      website: "Meine Website",
      writing: "Mein Buch",
      other: "Mein Projekt",
    },
    ownName: "Selbst eingeben",
    projectLabel: "Name des Projekts",
    confirmation: "Das schreibe ich ins Logbuch",
    createProject: (name, purpose) => `Ich lege an: Projekt „${name}“. Zweck: ${purpose}`,
    spaces: (spaces, collection) =>
      `Dazu drei Bereiche, also Abschnitte im Logbuch: ${spaces.join(", ")}. Im Bereich „${spaces[0] ?? ""}“ lege ich die Sammlung „${collection}“ an.`,
    rule: "So läuft das an Bord immer: Ich schlage vor, du entscheidest.",
    create: "Anlegen",
    change: "Ändern",
    missionIntro:
      "Zeit für deine erste Mission. Eine Mission ist eine Aufgabe, die an Bord erledigt wird, Schritt für Schritt und für dich sichtbar.",
    startMission: (title) =>
      `Ich starte die Mission „${title}“. Dafür brauche ich eine Entscheidung von dir.`,
    missionQuestion: (question) => `Meine Frage wird sein: ${question}`,
    start: "Starten",
    waiting:
      "Die Mission wartet jetzt auf dich. Öffne sie, beantworte die Frage, und komm dann über den Hinweis oben hierher zurück.",
    openMission: "Mission öffnen",
    recordQuestion:
      "Danke. Schreib das Ziel deines Projekts in ein paar Sätzen auf. Eine Vorlage habe ich dir schon eingetragen.",
    goalLabel: "Projektziel",
    template: (purpose, answer) => `${purpose}\nFür wen: ${answer}.`,
    recordCard: (title) =>
      `Ich halte das als „${title}“ im Logbuch fest und schließe die Mission ab. Mit „Übernehmen“ gibst du es als Kapitän frei; dann gilt es als festes Wissen.`,
    accept: "Übernehmen",
    hints: [
      "Hier unten sprichst du mit mir.",
      "Links siehst du deine Missionen. Rot heißt: Ich brauche dich.",
    ],
    closing:
      "Heute kannst du Missionen verfolgen, Fragen beantworten und Missionen anhalten. Sobald ich ganz an Bord bin, schlage ich dir die nächsten Schritte vor. Sag mir einfach, wenn du etwas anders willst.",
    finish: "Zur Brücke",
  },
  xora: {
    bar: "Nachricht an Xora",
    placeholder: "Schreib Xora eine Nachricht …",
    send: "Senden",
    close: "Schließen",
    notStored: "Nachrichten werden nicht gespeichert.",
    replies: {
      notOnBoard:
        "Ich bin in dieser Version noch nicht an Bord und kann noch nicht frei antworten. Heute kannst du deine Missionen verfolgen, Fragen beantworten und Missionen anhalten oder stoppen.",
      missions:
        "Missionen legen heute Agenten über die Kommandozeile an, mit „loxora mission create“. Sobald ich an Bord bin, kannst du mich direkt darum bitten.",
    },
    askMissions: "Wie bekomme ich Missionen?",
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
    empty: "There is no mission here yet.",
    needsYou: "Needs you:",
    unavailable: "Workspace unavailable",
  },
  actions: {
    label: "Actions",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    stopTitle: "Stop this mission?",
    stopReason: "Reason",
    stopConfirm: "Stop for good",
    keepRunning: "Don't stop",
    yourAnswer: "Your answer",
    send: "Answer",
    approve: "Approve",
    reject: "Reject",
    saving: "Saving …",
    stale: "The mission has changed in the meantime. It was reloaded; please check it again.",
    failed: (message) => `That did not work: ${message}`,
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
  setup: {
    title: "First launch",
    progress: (step, total) => `Step ${step} of ${total}`,
    back: "Back",
    next: "Continue",
    systems: "Ship systems",
    shipComputer: "Ship computer",
    ready: "ready",
    logbook: "Logbook",
    logbookPending: "created in a moment",
    logbookFound: "found",
    xoraNotOnBoard: "not on board in this version yet",
    existing: (ship) =>
      `There is already a ship on this computer: “${ship}”. Do you want to keep flying it?`,
    openShip: "Open this ship",
    newShip: "Create a new ship",
    whoAreYou: "Which of these are you?",
    nameQuestion:
      "Welcome aboard. I'm Xora, your first officer. Let's settle a few things first. What should I call you?",
    nameLabel: "Your name",
    nameEmpty: "I need a name so I know who decides on board. A nickname is fine.",
    shortNameQuestion:
      "I can't make an id for your approvals from this name. Please give me a short name with letters or digits, such as “alex”.",
    shortNameLabel: "Short name",
    shipQuestion: (name) =>
      `Nice to meet you, ${name}. Your ship is your workspace for all your projects, and it needs a name. What should yours be called?`,
    shipLabel: "Ship name",
    ownName: "Enter my own",
    logbookQuestion: (ship) =>
      `Where should I keep the logbook of the ${ship}, that is, everything we record about your projects? I suggest this folder. Everything stays on this computer.`,
    documents: "Documents",
    details: "Details",
    fits: "Looks good",
    otherFolder: "Choose another folder",
    folderLabel: "Full path of the folder",
    folderHint: "For example C:\\Users\\alex\\Documents\\Loxora. I create missing folders.",
    useFolder: "Use this folder",
    inRepository:
      "This folder belongs to a code project. The logbook should be kept separate from it.",
    oneDrive:
      "OneDrive synchronizes this folder. Your logbook would then also be in the cloud. If you don't want that, choose another folder.",
    hasWorkspace: "This folder already holds a logbook.",
    openLogbook: "Open this logbook",
    notOnShip: "Your name is not on this ship's list. Choose another folder for your logbook.",
    working: "One moment …",
    orientation: [
      "A quick orientation: this is the bridge. From here you steer your projects.",
      "Later, more AI helpers will work here as your crew. I coordinate them and fetch you when something needs a decision.",
      "The most important rule on board: I propose, you decide. Nothing is recorded without you.",
    ],
    scriptMode:
      "In this version I'm not fully on board yet and can't answer freely. We'll still get there: until then, I'll give you fixed choices.",
    bridgeReady:
      "Your logbook is ready. Next, we set up your first project and your first mission.",
    toBridge: "Continue",
    settingsError:
      "Your settings file cannot be read. Loxora does not change it. Fix or remove it, then reload the page.",
    failed: (message) => `That didn't work: ${message}`,
  },
  firstSteps: {
    title: "First steps",
    banner: {
      goal: "Your first steps are still open: your first project and your first mission.",
      mission: "Your first steps are still open: your first mission.",
      answer: "Your first mission is waiting for your decision.",
      record: "Your first mission has an answer. Now let's record the project goal.",
      hints: "Almost done: two short hints about the bridge.",
    },
    continue: "Continue setup",
    skip: "Skip the first steps",
    goalQuestion: "What do you want to do with Loxora?",
    goals: {
      game: "Develop a game",
      website: "Build a website",
      writing: "Write texts or a book",
      other: "Something else",
    },
    stations: {
      game: "Later, stations for programming, graphics, and testing will help with that.",
      website: "Later, stations for design, writing, and technology will help with that.",
      writing: "Later, stations for writing, editing, and research will help with that.",
      other: "We'll look at which stations help with that together later.",
    },
    stationExplained:
      "A station is a workplace on the bridge where an AI helper of the crew will work later.",
    purposeQuestion: "Tell me in one or two sentences what you have in mind.",
    purposeLabel: "Your plan",
    projectQuestion: "What should the project be called?",
    projectSuggestions: {
      game: "My game",
      website: "My website",
      writing: "My book",
      other: "My project",
    },
    ownName: "Enter my own",
    projectLabel: "Project name",
    confirmation: "This is what I write into the logbook",
    createProject: (name, purpose) => `I create: project “${name}”. Purpose: ${purpose}`,
    spaces: (spaces, collection) =>
      `Plus three areas, that is, sections of the logbook: ${spaces.join(", ")}. In the area “${spaces[0] ?? ""}” I create the collection “${collection}”.`,
    rule: "That's how it always works on board: I propose, you decide.",
    create: "Create",
    change: "Change",
    missionIntro:
      "Time for your first mission. A mission is a task done on board, step by step and visible to you.",
    startMission: (title) => `I start the mission “${title}”. For it I need a decision from you.`,
    missionQuestion: (question) => `My question will be: ${question}`,
    start: "Start",
    waiting:
      "The mission is now waiting for you. Open it, answer the question, then come back here through the notice at the top.",
    openMission: "Open the mission",
    recordQuestion:
      "Thanks. Write down the goal of your project in a few sentences. I've already filled in a template.",
    goalLabel: "Project goal",
    template: (purpose, answer) => `${purpose}\nFor whom: ${answer}.`,
    recordCard: (title) =>
      `I record this as “${title}” in the logbook and complete the mission. With “Accept” you approve it as captain; then it counts as established knowledge.`,
    accept: "Accept",
    hints: [
      "Down here you talk to me.",
      "On the left you see your missions. Red means: I need you.",
    ],
    closing:
      "Today you can follow missions, answer questions, and pause missions. Once I'm fully on board, I'll suggest the next steps. Just tell me if you want something different.",
    finish: "To the bridge",
  },
  xora: {
    bar: "Message to Xora",
    placeholder: "Write Xora a message …",
    send: "Send",
    close: "Close",
    notStored: "Messages are not stored.",
    replies: {
      notOnBoard:
        "In this version I'm not on board yet and can't answer freely. Today you can follow your missions, answer questions, and pause or stop missions.",
      missions:
        "Today agents create missions on the command line, with “loxora mission create”. Once I'm on board, you can simply ask me.",
    },
    askMissions: "How do I get missions?",
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
