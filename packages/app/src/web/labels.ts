/**
 * All UI text in one place (RFC-010, section 3 and Amendment 1): one entry per language.
 * German is the language of the designs; English carries the same keys.
 */
import type { PromptKey, SetupStep, Term } from "../shared/conversation.js";
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
    readonly connecting: string;
    readonly boot: {
      readonly shipComputer: string;
      readonly ready: string;
      readonly logbook: string;
      readonly found: string;
      readonly notCreated: string;
      readonly xora: string;
      readonly scriptMode: string;
    };
    readonly unreachable: string;
    readonly retry: string;
    readonly progress: string;
    readonly steps: Record<SetupStep, string>;
    readonly stepDone: string;
    readonly stepCurrent: string;
    readonly xoraRole: string;
    readonly statusConnecting: string;
    readonly statusOnline: string;
    readonly scriptNote: string;
    readonly conversation: string;
    readonly captain: string;
    readonly termsTitle: string;
    readonly terms: Record<Term, { readonly name: string; readonly text: string }>;
    readonly answer: string;
    readonly placeholder: string;
    readonly placeholders: Partial<Record<PromptKey, string>>;
    readonly send: string;
    readonly later: string;
    readonly choices: {
      readonly existing: Record<"open" | "new", string>;
      readonly ship: Record<"nova" | "aurora" | "kepler", string>;
      readonly logbook: Record<"fits" | "other" | "local" | "oneDrive" | "open", string>;
      readonly project: Record<"new" | "existing" | "look", string>;
      readonly existingProject: Record<"new" | "look", string>;
      readonly describe: Record<Goal, string>;
      readonly confirm: Record<"create" | "rename", string>;
      readonly bridge: Record<"toBridge", string>;
    };
    readonly intro: string;
    readonly shortName: string;
    readonly existing: (ship: string) => string;
    readonly whoAreYou: string;
    readonly notReviewer: string;
    readonly shipOpened: (ship: string) => string;
    readonly ship: (name: string) => string;
    readonly logbook: (ship: string, local: boolean) => string;
    readonly documents: string;
    readonly details: string;
    readonly inRepository: string;
    readonly oneDrive: string;
    readonly hasWorkspace: string;
    readonly notOnShip: string;
    readonly folder: string;
    readonly picking: string;
    readonly pickTitle: string;
    readonly notPicked: string;
    readonly pickFailed: string;
    readonly notFullPath: string;
    readonly logbookCreated: (ship: string) => string;
    readonly project: string;
    readonly existingProject: string;
    readonly describe: string;
    readonly purpose: string;
    readonly projectNames: Record<Goal, string>;
    readonly proposal: string;
    readonly confirmation: string;
    readonly createProject: (name: string, purpose: string) => string;
    readonly spaces: (spaces: readonly string[], collection: string) => string;
    readonly rule: string;
    readonly rename: string;
    readonly projectCreated: (name: string) => string;
    readonly bridgeWithProject: string;
    readonly bridgeWithoutProject: string;
    readonly working: string;
    readonly settingsError: string;
    readonly failed: (message: string) => string;
  };
  readonly firstSteps: {
    readonly title: string;
    readonly progress: (step: number, total: number) => string;
    readonly banner: Record<FirstStepsStage, string>;
    readonly continue: string;
    readonly dismiss: string;
    readonly offer: string;
    readonly confirmation: string;
    readonly missionIntro: string;
    readonly startMission: (title: string) => string;
    readonly missionGoal: (goal: string) => string;
    readonly missionQuestion: (question: string) => string;
    readonly missionRationale: (rationale: string) => string;
    readonly start: string;
    readonly waiting: string;
    readonly openMission: string;
    readonly recordQuestion: string;
    readonly goalLabel: string;
    readonly template: (purpose: string, answer: string) => string;
    readonly recordCard: (title: string) => string;
    readonly accept: string;
    readonly change: string;
    readonly next: string;
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
    readonly replies: Record<"notOnBoard" | "missions" | "notUnderstood", string>;
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
    connecting: "Verbindung zum Kommandozentrum wird hergestellt",
    boot: {
      shipComputer: "Bordcomputer",
      ready: "bereit",
      logbook: "Logbuch",
      found: "gefunden",
      notCreated: "noch nicht angelegt",
      xora: "Xora",
      scriptMode: "online im Skriptmodus",
    },
    unreachable: "Der Bordcomputer antwortet nicht. Läuft Loxora noch?",
    retry: "Erneut verbinden",
    progress: "Fortschritt der Einrichtung",
    steps: {
      name: "Name",
      ship: "Schiff",
      logbook: "Logbuch",
      project: "Projekt",
      bridge: "Brücke",
    },
    stepDone: "erledigt",
    stepCurrent: "aktuell",
    xoraRole: "Erste Offizierin",
    statusConnecting: "Verbinde …",
    statusOnline: "Online · Skriptmodus",
    scriptNote:
      "Skriptmodus: Ich antworte noch mit festen Texten. Tipp eine Antwort an oder schreib sie unten.",
    conversation: "Gespräch mit Xora",
    captain: "Du",
    termsTitle: "Bordbegriffe",
    terms: {
      captain: {
        name: "Kapitän",
        text: "Das bist du. Du entscheidest an Bord; nichts wird ohne dich festgeschrieben.",
      },
      firstOfficer: {
        name: "Erste Offizierin",
        text: "Das bin ich, Xora. Ich kenne die Systeme des Schiffs, schlage vor und koordiniere die Crew.",
      },
      ship: { name: "Schiff", text: "Dein Arbeitsbereich für alle deine Projekte." },
      logbook: {
        name: "Logbuch",
        text: "Alles, was wir über deine Projekte festhalten. Es liegt als Ordner auf deinem Rechner.",
      },
      project: {
        name: "Projekt",
        text: "Ein Vorhaben, etwa ein Spiel oder ein Buch, mit eigenen Bereichen im Logbuch.",
      },
      bridge: {
        name: "Brücke",
        text: "Deine Kommandozentrale. Hier siehst du deine Missionen und triffst Entscheidungen.",
      },
      mission: {
        name: "Mission",
        text: "Eine Aufgabe, die an Bord Schritt für Schritt erledigt wird, für dich sichtbar.",
      },
      crew: {
        name: "Crew",
        text: "KI-Helfer, die später an Bord mitarbeiten. In dieser Version bin nur ich an Bord.",
      },
    },
    answer: "Antwort an Xora",
    placeholder: "Antworte Xora oder tipp oben eine Antwort an …",
    placeholders: {
      name: "Dein Name",
      shortName: "Kurzer Name, etwa „alex“",
      reviewer: "Dein Name auf diesem Schiff",
      ship: "Name deines Schiffs",
      folder: "Voller Pfad, etwa C:\\Users\\alex\\Documents\\Loxora",
      describe: "Was hast du vor?",
      purpose: "Worum geht es?",
      rename: "Name des Projekts",
    },
    send: "Senden",
    later: "kommt später",
    choices: {
      existing: { open: "Dieses Schiff öffnen", new: "Neues Schiff anlegen" },
      ship: { nova: "Nova", aurora: "Aurora", kepler: "Kepler" },
      logbook: {
        fits: "Passt so",
        other: "Anderen Ordner wählen",
        local: "Ordner auf diesem PC wählen",
        oneDrive: "Ordner in OneDrive wählen",
        open: "Dieses Logbuch öffnen",
      },
      project: {
        new: "Neues Projekt starten",
        existing: "Bestehendes Projekt hinzufügen",
        look: "Erst umsehen",
      },
      existingProject: { new: "Stattdessen neues Projekt starten", look: "Erst umsehen" },
      describe: {
        game: "Ein Spiel",
        website: "Eine Website",
        writing: "Texte oder ein Buch",
        other: "Etwas anderes",
      },
      confirm: { create: "Anlegen", rename: "Namen ändern" },
      bridge: { toBridge: "Zur Brücke" },
    },
    intro:
      "Willkommen an Bord. Ich bin Xora, deine Erste Offizierin: Ich kenne die Systeme dieses Schiffs und helfe dir. Du bist der Kapitän, also die Person, die an Bord entscheidet. Wie soll ich dich nennen?",
    shortName:
      "Aus diesem Namen kann ich keine Kennung für deine Freigaben machen. Gib mir bitte einen kurzen Namen aus Buchstaben oder Ziffern, etwa „alex“.",
    existing: (ship) =>
      `Auf diesem Rechner gibt es schon ein Schiff: „${ship}“. Willst du damit weiterfliegen?`,
    whoAreYou: "Auf diesem Schiff gibt es mehrere Namen. Wer von ihnen bist du?",
    notReviewer: "Dieser Name steht nicht auf der Liste des Schiffs. Tipp einen der Namen an.",
    shipOpened: (ship) => `Willkommen zurück auf der ${ship}. Dein Logbuch habe ich gefunden.`,
    ship: (name) =>
      `Schön, dich kennenzulernen, ${name}. Dein Schiff ist dein Arbeitsbereich für alle deine Projekte, und es braucht einen Namen. Wie soll deins heißen?`,
    logbook: (ship, local) =>
      `Wo soll ich das Logbuch der ${ship} aufbewahren, also alles, was wir über deine Projekte festhalten? Ich schlage diesen Ordner vor.${local ? " Alles bleibt auf diesem Rechner." : ""}`,
    documents: "Dokumente",
    details: "Details",
    inRepository:
      "Dieser Ordner gehört zu einem Code-Projekt. Das Logbuch sollte getrennt davon liegen; wähle bitte einen anderen Ordner.",
    oneDrive:
      "Dieser Ordner wird mit OneDrive synchronisiert. Dann läge dein Logbuch auch in der Cloud. Wenn du das nicht willst, wähle einen anderen Ordner.",
    hasWorkspace: "In diesem Ordner liegt schon ein Logbuch.",
    notOnShip:
      "Dein Name steht nicht auf der Liste dieses Logbuchs. Wähle bitte einen anderen Ordner.",
    folder:
      "Gib mir den vollen Pfad des Ordners, zum Beispiel C:\\Users\\alex\\Documents\\Loxora. Fehlende Ordner lege ich an.",
    picking:
      "Ich öffne das Fenster zur Ordnerauswahl. Wähle dort den Ordner, in den das Logbuch kommt; darin lege ich den Ordner „Loxora“ an. Siehst du das Fenster nicht, findest du es in der Taskleiste.",
    pickTitle: "Loxora: Wähle den Ordner für dein Logbuch",
    notPicked: "Du hast keinen Ordner gewählt. Wo soll das Logbuch liegen?",
    pickFailed: "Das Fenster zur Ordnerauswahl ließ sich nicht öffnen.",
    notFullPath: "Das ist kein voller Pfad. Er beginnt zum Beispiel mit C:\\ oder mit /.",
    logbookCreated: (ship) => `Das Logbuch der ${ship} ist angelegt.`,
    project:
      "Jetzt zu deinem ersten Projekt. Ein Projekt ist ein Vorhaben, etwa ein Spiel oder ein Buch, und bekommt eigene Bereiche im Logbuch. Was möchtest du tun?",
    existingProject:
      "Ein bestehendes Projekt einzubinden kommt in einer späteren Version. Bis dahin kann ich ein neues anlegen, oder du siehst dich erst um.",
    describe: "Erzähl mir in ein, zwei Sätzen, was du vorhast. Oder tipp an, was am ehesten passt.",
    purpose: "Erzähl mir in ein, zwei Sätzen, worum es geht.",
    projectNames: {
      game: "Mein Spiel",
      website: "Meine Website",
      writing: "Mein Buch",
      other: "Mein Projekt",
    },
    proposal: "Dann schlage ich dir das vor:",
    confirmation: "Das schreibe ich ins Logbuch",
    createProject: (name, purpose) => `Ich lege an: Projekt „${name}“. Zweck: ${purpose}`,
    spaces: (spaces, collection) =>
      `Dazu drei Bereiche, also Abschnitte im Logbuch: ${spaces.join(", ")}. Im Bereich „${spaces[0] ?? ""}“ lege ich die Sammlung „${collection}“ an.`,
    rule: "So läuft das an Bord immer: Ich schlage vor, du entscheidest.",
    rename: "Wie soll das Projekt heißen?",
    projectCreated: (name) => `Das Projekt „${name}“ ist angelegt.`,
    bridgeWithProject:
      "Alles bereit. Jetzt geht es auf die Brücke, deine Kommandozentrale. Dort wartet deine erste Mission, also eine Aufgabe, die an Bord Schritt für Schritt erledigt wird. Später arbeiten dort auch KI-Helfer als deine Crew.",
    bridgeWithoutProject:
      "Alles bereit. Jetzt geht es auf die Brücke, deine Kommandozentrale. Dort siehst du deine Missionen, also Aufgaben, die an Bord Schritt für Schritt erledigt werden. Später arbeiten dort auch KI-Helfer als deine Crew. Sieh dich in Ruhe um.",
    working: "Einen Moment …",
    settingsError:
      "Deine Einstellungsdatei lässt sich nicht lesen. Loxora ändert sie nicht. Korrigiere oder entferne sie und lade die Seite dann neu.",
    failed: (message) => `Das hat nicht geklappt: ${message}`,
  },
  firstSteps: {
    title: "Erste Mission",
    progress: (step, total) => `Schritt ${step} von ${total}`,
    banner: {
      goal: "Dein erstes Projekt fehlt noch.",
      mission: "Deine erste Mission wartet: Halte das Ziel deines Projekts fest.",
      answer: "Deine erste Mission wartet auf deine Entscheidung.",
      record: "Deine erste Mission hat eine Antwort. Jetzt halten wir das Projektziel fest.",
      hints: "Fast geschafft: noch zwei kurze Hinweise zur Brücke.",
    },
    continue: "Erste Mission",
    dismiss: "Nicht jetzt",
    offer:
      "Noch keine Missionen. Deine erste Mission ist bereit: Gemeinsam halten wir das Ziel deines Projekts fest.",
    confirmation: "Das schreibe ich ins Logbuch",
    missionIntro:
      "Zeit für deine erste Mission. Eine Mission ist eine Aufgabe, die an Bord erledigt wird, Schritt für Schritt und für dich sichtbar.",
    startMission: (title) =>
      `Ich starte die Mission „${title}“. Dafür brauche ich eine Entscheidung von dir.`,
    missionGoal: (goal) => `Ziel der Mission: ${goal}`,
    missionQuestion: (question) => `Meine Frage wird sein: ${question}`,
    missionRationale: (rationale) => `Warum ich frage: ${rationale}`,
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
    change: "Ändern",
    next: "Weiter",
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
      notUnderstood:
        "Das verstehe ich noch nicht, ich bin noch im Skriptmodus. Tipp einfach eine der Antworten an.",
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
    connecting: "Establishing connection to the command center",
    boot: {
      shipComputer: "Ship computer",
      ready: "ready",
      logbook: "Logbook",
      found: "found",
      notCreated: "not created yet",
      xora: "Xora",
      scriptMode: "online in script mode",
    },
    unreachable: "The ship computer does not answer. Is Loxora still running?",
    retry: "Connect again",
    progress: "Setup progress",
    steps: {
      name: "Name",
      ship: "Ship",
      logbook: "Logbook",
      project: "Project",
      bridge: "Bridge",
    },
    stepDone: "done",
    stepCurrent: "current",
    xoraRole: "First officer",
    statusConnecting: "Connecting …",
    statusOnline: "Online · script mode",
    scriptNote: "Script mode: I still answer with fixed texts. Tap an answer or type it below.",
    conversation: "Conversation with Xora",
    captain: "You",
    termsTitle: "Ship terms",
    terms: {
      captain: {
        name: "Captain",
        text: "That's you. You decide on board; nothing is recorded without you.",
      },
      firstOfficer: {
        name: "First officer",
        text: "That's me, Xora. I know the ship's systems, make proposals, and coordinate the crew.",
      },
      ship: { name: "Ship", text: "Your workspace for all your projects." },
      logbook: {
        name: "Logbook",
        text: "Everything we record about your projects. It is a folder on your computer.",
      },
      project: {
        name: "Project",
        text: "An undertaking, such as a game or a book, with its own areas in the logbook.",
      },
      bridge: {
        name: "Bridge",
        text: "Your command center. Here you see your missions and make decisions.",
      },
      mission: {
        name: "Mission",
        text: "A task done on board, step by step and visible to you.",
      },
      crew: {
        name: "Crew",
        text: "AI helpers that will work on board later. In this version only I am on board.",
      },
    },
    answer: "Answer to Xora",
    placeholder: "Answer Xora or tap an answer above …",
    placeholders: {
      name: "Your name",
      shortName: "A short name, such as “alex”",
      reviewer: "Your name on this ship",
      ship: "Your ship's name",
      folder: "Full path, such as C:\\Users\\alex\\Documents\\Loxora",
      describe: "What do you have in mind?",
      purpose: "What is it about?",
      rename: "Project name",
    },
    send: "Send",
    later: "coming later",
    choices: {
      existing: { open: "Open this ship", new: "Create a new ship" },
      ship: { nova: "Nova", aurora: "Aurora", kepler: "Kepler" },
      logbook: {
        fits: "That's fine",
        other: "Choose another folder",
        local: "Choose a folder on this PC",
        oneDrive: "Choose a folder in OneDrive",
        open: "Open this logbook",
      },
      project: {
        new: "Start a new project",
        existing: "Add an existing project",
        look: "Look around first",
      },
      existingProject: { new: "Start a new project instead", look: "Look around first" },
      describe: {
        game: "A game",
        website: "A website",
        writing: "Texts or a book",
        other: "Something else",
      },
      confirm: { create: "Create", rename: "Change name" },
      bridge: { toBridge: "To the bridge" },
    },
    intro:
      "Welcome aboard. I'm Xora, your first officer: I know this ship's systems and help you. You are the captain, the person who decides on board. What should I call you?",
    shortName:
      "I can't make an id for your approvals from this name. Please give me a short name with letters or digits, such as “alex”.",
    existing: (ship) =>
      `There is already a ship on this computer: “${ship}”. Do you want to keep flying it?`,
    whoAreYou: "This ship has several names on its list. Which of them are you?",
    notReviewer: "That name is not on the ship's list. Tap one of the names.",
    shipOpened: (ship) => `Welcome back on the ${ship}. I found your logbook.`,
    ship: (name) =>
      `Nice to meet you, ${name}. Your ship is your workspace for all your projects, and it needs a name. What should yours be called?`,
    logbook: (ship, local) =>
      `Where should I keep the logbook of the ${ship}, that is, everything we record about your projects? I suggest this folder.${local ? " Everything stays on this computer." : ""}`,
    documents: "Documents",
    details: "Details",
    inRepository:
      "This folder belongs to a code project. The logbook should be kept separate from it; please choose another folder.",
    oneDrive:
      "OneDrive synchronizes this folder. Your logbook would then also be in the cloud. If you don't want that, choose another folder.",
    hasWorkspace: "This folder already holds a logbook.",
    notOnShip: "Your name is not on this logbook's list. Please choose another folder.",
    folder:
      "Give me the full path of the folder, for example C:\\Users\\alex\\Documents\\Loxora. I create missing folders.",
    picking:
      "I'm opening the folder window. Choose the folder the logbook goes into; I create the folder “Loxora” inside it. If you don't see the window, look for it in the taskbar.",
    pickTitle: "Loxora: Choose the folder for your logbook",
    notPicked: "You didn't choose a folder. Where should the logbook be?",
    pickFailed: "The folder window could not be opened.",
    notFullPath: "That is not a full path. It starts with C:\\ or with /, for example.",
    logbookCreated: (ship) => `The logbook of the ${ship} is ready.`,
    project:
      "Now to your first project. A project is an undertaking, such as a game or a book, and gets its own areas in the logbook. What would you like to do?",
    existingProject:
      "Adding an existing project comes in a later version. Until then I can create a new one, or you look around first.",
    describe: "Tell me in one or two sentences what you have in mind. Or tap what fits best.",
    purpose: "Tell me in one or two sentences what it is about.",
    projectNames: {
      game: "My game",
      website: "My website",
      writing: "My book",
      other: "My project",
    },
    proposal: "Then I propose this:",
    confirmation: "This is what I write into the logbook",
    createProject: (name, purpose) => `I create: project “${name}”. Purpose: ${purpose}`,
    spaces: (spaces, collection) =>
      `Plus three areas, that is, sections of the logbook: ${spaces.join(", ")}. In the area “${spaces[0] ?? ""}” I create the collection “${collection}”.`,
    rule: "That's how it always works on board: I propose, you decide.",
    rename: "What should the project be called?",
    projectCreated: (name) => `The project “${name}” is created.`,
    bridgeWithProject:
      "All set. Now we go to the bridge, your command center. Your first mission waits there: a task done on board, step by step. Later, AI helpers will work there too, as your crew.",
    bridgeWithoutProject:
      "All set. Now we go to the bridge, your command center. There you see your missions, tasks done on board step by step. Later, AI helpers will work there too, as your crew. Take your time to look around.",
    working: "One moment …",
    settingsError:
      "Your settings file cannot be read. Loxora does not change it. Fix or remove it, then reload the page.",
    failed: (message) => `That didn't work: ${message}`,
  },
  firstSteps: {
    title: "First mission",
    progress: (step, total) => `Step ${step} of ${total}`,
    banner: {
      goal: "Your first project is still missing.",
      mission: "Your first mission is waiting: record the goal of your project.",
      answer: "Your first mission is waiting for your decision.",
      record: "Your first mission has an answer. Now let's record the project goal.",
      hints: "Almost done: two short hints about the bridge.",
    },
    continue: "First mission",
    dismiss: "Not now",
    offer:
      "No missions yet. Your first mission is ready: together we record the goal of your project.",
    confirmation: "This is what I write into the logbook",
    missionIntro:
      "Time for your first mission. A mission is a task done on board, step by step and visible to you.",
    startMission: (title) => `I start the mission “${title}”. For it I need a decision from you.`,
    missionGoal: (goal) => `Mission goal: ${goal}`,
    missionQuestion: (question) => `My question will be: ${question}`,
    missionRationale: (rationale) => `Why I ask: ${rationale}`,
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
    change: "Change",
    next: "Continue",
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
      notUnderstood:
        "I don't understand that yet, I'm still in script mode. Just tap one of the answers.",
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
