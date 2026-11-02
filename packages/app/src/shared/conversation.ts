/**
 * The setup conversation in script mode (RFC-011 Amendment 1, Milestone 14 sections 3 and 6):
 * the prompts Xora asks, their answer buttons, the ship terms each prompt introduces, and the
 * fixed keyword list that places a typed answer. The server interprets answers with it and the
 * web client shows the buttons from it, so both use one list. It has no dependencies.
 */

export type Language = "de" | "en";

/** The six steps of the progress bar (Milestone 16 adds "xora"). */
export const SETUP_STEPS = ["name", "xora", "ship", "logbook", "project", "bridge"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** The ship terms, in the order the conversation introduces them (section 5). */
export const TERMS = [
  "captain",
  "firstOfficer",
  "model",
  "ship",
  "logbook",
  "project",
  "bridge",
  "mission",
  "crew",
] as const;
export type Term = (typeof TERMS)[number];

export const PROJECT_GOALS = ["game", "website", "writing", "other"] as const;
export type ProjectGoal = (typeof PROJECT_GOALS)[number];

/**
 * What a typed answer can be: any text (never "not understood"), one of the answer buttons,
 * a button or any text, or a button or a full folder path.
 */
export type Accepts = "text" | "choices" | "choicesOrText" | "choicesOrPath";

export interface Prompt {
  readonly step: SetupStep;
  readonly choices: readonly string[];
  readonly accepts: Accepts;
  readonly terms: readonly Term[];
}

export const PROMPTS = {
  /** The person's name; explains captain and first officer. */
  name: { step: "name", choices: [], accepts: "text", terms: ["captain", "firstOfficer"] },
  /** A short name, when no captain id can be derived from the name. */
  shortName: { step: "name", choices: [], accepts: "text", terms: [] },
  /** Xora's last start failed: start her again, or go on without her (Milestone 16). */
  restart: { step: "name", choices: ["again", "without"], accepts: "choices", terms: [] },
  /** Keep Xora's model, choose another one, or hear what that means (Milestone 16). */
  xora: {
    step: "xora",
    choices: ["keep", "change", "explain"],
    accepts: "choices",
    terms: ["model"],
  },
  /** Which other model; "cloud" is shown inactive until the cloud proof of concept. */
  model: {
    step: "xora",
    choices: ["localFile", "attached", "cloud", "later"],
    accepts: "choices",
    terms: [],
  },
  /** Without a file window: the typed path of the model program and of the model file. */
  runtimePath: { step: "xora", choices: [], accepts: "text", terms: [] },
  modelPath: { step: "xora", choices: [], accepts: "text", terms: [] },
  /** The address of a model program that already runs; "default" is http://127.0.0.1:8080. */
  modelUrl: { step: "xora", choices: ["default"], accepts: "choicesOrText", terms: [] },
  /** A name for that model, shown in Xora's status. */
  modelName: { step: "xora", choices: [], accepts: "text", terms: [] },
  /** The confirmation card of the model change. */
  modelConfirm: { step: "xora", choices: ["switch", "stay"], accepts: "choices", terms: [] },
  /** A workspace already exists on this computer (Milestone 13 scene B0). */
  existing: { step: "ship", choices: ["open", "new"], accepts: "choices", terms: ["ship"] },
  /** Which reviewer of the existing ship the person is; buttons are the reviewer ids. */
  reviewer: { step: "ship", choices: [], accepts: "text", terms: [] },
  ship: {
    step: "ship",
    choices: ["nova", "aurora", "kepler"],
    accepts: "choicesOrText",
    terms: ["ship"],
  },
  /** The logbook folder; "open" only when the folder already holds a logbook. */
  logbook: {
    step: "logbook",
    choices: ["fits", "other", "open"],
    accepts: "choicesOrPath",
    terms: ["logbook"],
  },
  /** With OneDrive set up, "other" asks where the folder window opens: on this PC or in OneDrive. */
  place: {
    step: "logbook",
    choices: ["local", "oneDrive"],
    accepts: "choicesOrPath",
    terms: [],
  },
  /** Another folder: any text is the path; the server checks that it is a full path. */
  folder: { step: "logbook", choices: [], accepts: "text", terms: [] },
  project: {
    step: "project",
    choices: ["new", "existing", "look"],
    accepts: "choices",
    terms: ["project"],
  },
  /** "Add an existing project" is shown but not active (import is gated). */
  existingProject: { step: "project", choices: ["new", "look"], accepts: "choices", terms: [] },
  /** One or two sentences about the plan; a typed text is the project purpose. */
  describe: { step: "project", choices: PROJECT_GOALS, accepts: "choicesOrText", terms: [] },
  /** The purpose after "Something else". */
  purpose: { step: "project", choices: [], accepts: "text", terms: [] },
  /**
   * The project name: the captain types it, or takes Xora's suggestion, which fits the
   * description (decided by the decision owner on November 2, 2026).
   */
  projectName: { step: "project", choices: ["suggest"], accepts: "choicesOrText", terms: [] },
  /** The confirmation card of the new project. */
  confirm: { step: "project", choices: ["create", "rename"], accepts: "choices", terms: [] },
  rename: { step: "project", choices: [], accepts: "text", terms: [] },
  bridge: {
    step: "bridge",
    choices: ["toBridge"],
    accepts: "choices",
    terms: ["bridge", "mission", "crew"],
  },
} as const satisfies Record<string, Prompt>;

export type PromptKey = keyof typeof PROMPTS;
export const PROMPT_KEYS = Object.keys(PROMPTS) as PromptKey[];

/**
 * The keyword list per language. A keyword ending in "*" matches the start of a word, any
 * other keyword a whole word. Answers are compared in lower case, with umlauts written as
 * ae, oe, ue, and ss, without accents and punctuation.
 */
type Keywords = Readonly<Record<string, readonly string[]>>;

const CHOICE_KEYWORDS: Record<Language, Partial<Record<PromptKey, Keywords>>> = {
  de: {
    restart: {
      again: ["nochmal", "noch", "erneut", "wieder*", "start*", "ja", "versuch*"],
      without: ["ohne", "nein", "skript*"],
    },
    xora: {
      keep: ["lass*", "behalt*", "passt", "so", "ok", "okay", "ja", "gut", "bleib*"],
      change: ["wechsel*", "ander*", "besser*", "staerker*", "aender*", "neu*"],
      explain: ["was", "erklaer*", "bedeut*", "heisst", "warum", "wieso"],
    },
    model: {
      localFile: ["datei*", "gguf"],
      attached: ["laeuft", "laufend*", "adresse", "url", "programm*", "server"],
      cloud: ["cloud", "claude", "gpt", "openai", "anthropic", "internet"],
      later: ["spaeter", "nein", "abbrech*", "zurueck", "nichts"],
    },
    modelUrl: { default: ["standard*", "vorschlag*", "passt", "ja", "ok", "okay"] },
    modelConfirm: {
      switch: ["wechsel*", "ja", "ok", "okay", "los", "passt", "umstell*"],
      stay: ["bleib*", "nein", "abbrech*", "nicht"],
    },
    projectName: { suggest: ["vorschlag*", "schlag*", "egal"] },
    existing: {
      open: ["oeffn*", "weiter*", "ja", "behalt*", "dieses", "nehm*"],
      new: ["neu*", "nein", "anleg*"],
    },
    logbook: {
      fits: ["passt", "ja", "ok", "okay", "gut", "einverstanden", "klar", "genau", "nimm"],
      other: ["ander*", "ordner", "woanders", "nein", "aender*", "auswahl"],
      open: ["oeffn*"],
    },
    place: {
      local: ["lokal*", "pc", "rechner", "computer", "hier"],
      oneDrive: ["onedrive", "drive", "cloud"],
    },
    project: {
      new: ["neu*", "anleg*", "erstell*", "start*"],
      existing: ["bestehend*", "vorhanden*", "hinzufueg*", "import*", "einbind*"],
      look: ["umseh*", "umschau*", "schau*", "spaeter", "nichts"],
    },
    existingProject: {
      new: ["neu*", "anleg*", "erstell*", "start*"],
      look: ["umseh*", "umschau*", "schau*", "spaeter", "nichts"],
    },
    describe: { other: ["ander*", "sonstig*"] },
    confirm: {
      create: ["anleg*", "ja", "ok", "okay", "passt", "los", "gut", "erstell*"],
      rename: ["aender*", "name*", "nein", "anders", "umbenenn*"],
    },
    bridge: { toBridge: ["bruecke", "los", "ja", "ok", "okay", "weiter", "gehen", "auf"] },
  },
  en: {
    restart: {
      again: ["again", "restart", "start*", "yes", "retry", "try"],
      without: ["without", "no", "skip", "script*"],
    },
    xora: {
      keep: ["keep", "fine", "ok", "okay", "yes", "good", "stay"],
      change: ["change", "switch", "better", "other", "another", "different", "stronger"],
      explain: ["what", "explain", "mean*", "why"],
    },
    model: {
      localFile: ["file*", "gguf"],
      attached: ["running", "address", "url", "program*", "server"],
      cloud: ["cloud", "claude", "gpt", "openai", "anthropic", "internet"],
      later: ["later", "no", "cancel", "back", "nothing"],
    },
    modelUrl: { default: ["default", "suggested", "fine", "yes", "ok", "okay"] },
    modelConfirm: {
      switch: ["switch", "yes", "ok", "okay", "go", "sure"],
      stay: ["stay", "no", "cancel", "keep"],
    },
    projectName: { suggest: ["suggest*", "whatever", "dunno"] },
    existing: {
      open: ["open*", "keep", "yes", "continue", "this"],
      new: ["new", "no", "create"],
    },
    logbook: {
      fits: ["fine", "yes", "ok", "okay", "good", "sure", "great", "fits", "agree"],
      other: ["other", "another", "different", "folder", "elsewhere", "no", "change"],
      open: ["open*"],
    },
    place: {
      local: ["local*", "pc", "computer", "here"],
      oneDrive: ["onedrive", "drive", "cloud"],
    },
    project: {
      new: ["new", "start*", "create"],
      existing: ["existing", "add", "import*"],
      look: ["look*", "around", "later", "nothing"],
    },
    existingProject: {
      new: ["new", "start*", "create"],
      look: ["look*", "around", "later", "nothing"],
    },
    describe: { other: ["else", "other"] },
    confirm: {
      create: ["create", "yes", "ok", "okay", "go", "sure", "fine", "good"],
      rename: ["change", "name", "rename", "no", "different"],
    },
    bridge: { toBridge: ["bridge", "go", "yes", "ok", "okay", "continue", "lets"] },
  },
};

/** Keywords that place a typed plan description under one of the goal templates. */
const GOAL_KEYWORDS: Record<Language, Record<Exclude<ProjectGoal, "other">, readonly string[]>> = {
  de: {
    game: ["spiel*", "game*", "jump*", "rollenspiel*", "level*"],
    website: ["website*", "webseite*", "homepage*", "internetseite*", "shop*", "blog*"],
    writing: [
      "buch*",
      "buech*",
      "roman*",
      "text*",
      "geschicht*",
      "schreib*",
      "kapitel*",
      "gedicht*",
    ],
  },
  en: {
    game: ["game*", "gaming", "level*", "rpg"],
    website: ["website*", "site*", "homepage*", "web", "shop*", "blog*"],
    writing: ["book*", "novel*", "text*", "story", "stories", "writ*", "chapter*", "poem*"],
  },
};

/** Lower case words without accents and punctuation; umlauts as ae, oe, ue, ss. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function matches(list: readonly string[], found: readonly string[]): boolean {
  return list.some((keyword) =>
    keyword.endsWith("*")
      ? found.some((word) => word.startsWith(keyword.slice(0, -1)))
      : found.includes(keyword),
  );
}

/** A full folder path on Windows (drive or network share) or elsewhere. */
export function looksLikePath(text: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(text.trim());
}

/** The goal template a plan description fits, by keyword; "other" when none or several fit. */
export function goalOf(text: string, language: Language): ProjectGoal {
  const found = words(text);
  const fitting = (Object.keys(GOAL_KEYWORDS[language]) as Exclude<ProjectGoal, "other">[]).filter(
    (goal) => matches(GOAL_KEYWORDS[language][goal], found),
  );
  return fitting.length === 1 ? (fitting[0] as ProjectGoal) : "other";
}

export interface Interpretation {
  /** The answer button the text stands for. */
  readonly choice?: string;
  /** The typed text, for answers that accept text or a path. */
  readonly value?: string;
  /** For a plan description: the goal template it fits. */
  readonly goal?: ProjectGoal;
  /** For a plan description: the project name Xora's model proposed (Milestone 16). */
  readonly projectName?: string;
}

/**
 * Places a typed answer. Returns null when the keyword list cannot place it ("not
 * understood"); prompts that accept any text never return null. When the keywords of more
 * than one button match, the answer is not understood rather than guessed.
 */
export function interpret(
  prompt: PromptKey,
  text: string,
  language: Language,
): Interpretation | null {
  const value = text.trim();
  const { accepts } = PROMPTS[prompt];
  if (accepts === "text") return { value };
  if (prompt === "describe") {
    const keywords = CHOICE_KEYWORDS[language].describe ?? {};
    const found = words(value);
    if (found.length <= 2 && matches(keywords.other ?? [], found)) return { choice: "other" };
    return { value, goal: goalOf(value, language) };
  }
  if (accepts === "choicesOrPath" && looksLikePath(value)) return { choice: "path", value };
  const found = words(value);
  const keywords = CHOICE_KEYWORDS[language][prompt] ?? {};
  const fitting = Object.entries(keywords)
    .filter(([, list]) => matches(list, found))
    .map(([choice]) => choice);
  if (fitting.length === 1) return { choice: fitting[0] as string };
  if (accepts === "choicesOrText" && value) return { value };
  return null;
}

const MODEL_WORDS: Record<Language, readonly string[]> = {
  de: ["modell*", "model*", "ki", "sprachmodell*"],
  en: ["model*", "ai", "llm*"],
};
const CHANGE_WORDS: Record<Language, readonly string[]> = {
  de: ["wechsel*", "ander*", "besser*", "staerker*", "aender*", "neu*", "tausch*", "upgrade*"],
  en: ["change*", "switch*", "better", "stronger", "other", "another", "different", "upgrade*"],
};

/**
 * True when a message asks Xora for another model, for example "Kannst du ein besseres
 * Modell nehmen?" (Milestone 16 section 6). The keyword list decides, with or without model.
 */
export function asksForModelChange(text: string, language: Language): boolean {
  const found = words(text);
  return matches(MODEL_WORDS[language], found) && matches(CHANGE_WORDS[language], found);
}

/** Xora's fixed replies in script mode (Milestone 13 section 6). */
export const XORA_REPLY_KEYS = ["notOnBoard", "missions", "notUnderstood", "model"] as const;
export type XoraReply = (typeof XORA_REPLY_KEYS)[number];

/**
 * The reply texts. The setup shows them from here, and on the bridge the server stores the
 * text shown as Xora's chat message, in the language it was shown in (Milestone 15 section 4).
 */
export const XORA_REPLIES: Record<Language, Record<XoraReply, string>> = {
  de: {
    notOnBoard:
      "Ich bin in dieser Version noch nicht an Bord und kann noch nicht frei antworten. Heute kannst du deine Missionen verfolgen, Fragen beantworten und Missionen anhalten oder stoppen.",
    missions:
      "Missionen legen heute Agenten über die Kommandozeile an, mit „loxora mission create“. Sobald ich an Bord bin, kannst du mich direkt darum bitten.",
    notUnderstood:
      "Das verstehe ich noch nicht, ich bin noch im Skriptmodus. Tipp einfach eine der Antworten an.",
    model:
      "Mein Modell wechselst du in meinen Details: Öffne rechts „Details“ und wähle „Modell wechseln“. Nichts ändert sich, bevor du die Karte bestätigst.",
  },
  en: {
    notOnBoard:
      "In this version I'm not on board yet and can't answer freely. Today you can follow your missions, answer questions, and pause or stop missions.",
    missions:
      "Today agents create missions on the command line, with “loxora mission create”. Once I'm on board, you can simply ask me.",
    notUnderstood:
      "I don't understand that yet, I'm still in script mode. Just tap one of the answers.",
    model:
      "You change my model in my details: open “Details” on the right and choose “Change model”. Nothing changes before you confirm the card.",
  },
};
