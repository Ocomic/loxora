import { randomUUID } from "node:crypto";
import {
  asksForModelChange,
  type Interpretation,
  interpret,
  PROMPTS,
  type PromptKey,
  words,
} from "../shared/conversation.js";
import {
  chatCompletion,
  limitWords,
  type ModelMessage,
  type ModelRequest,
  type ModelTurn,
  ModelUnavailable,
} from "./model.js";
import {
  CHOICE_SITUATIONS,
  type ChoiceSituation,
  chatPrompt,
  choicePrompt,
  describePrompt,
  namePrompt,
  type PromptPeople,
  UNCLEAR,
} from "./xora-prompt.js";

/**
 * Xora as a capability (RFC-011 section 5, Milestone 13). The flow depends only on the
 * `Assistant` interface. An assistant returns text, a fixed reply key, or one proposed
 * action; it never writes. The server keeps proposed actions pending and executes one only
 * after the person confirms it. `ScriptedAssistant` has fixed content and no model;
 * `ModelAssistant` (Milestone 16) asks a model for free text and falls back to it.
 */

export type Language = "de" | "en";

export const GOALS = ["game", "website", "writing", "other"] as const;
export type Goal = (typeof GOALS)[number];

export type AssistantInput =
  /**
   * An answer in the setup conversation (Milestone 14): the key of an answer button, or a
   * typed text the keyword list places.
   */
  | {
      readonly kind: "setup";
      readonly prompt: PromptKey;
      readonly choice?: string;
      readonly text?: string;
    }
  /**
   * The new project: the goal template, the project name, and the purpose. A typed plan
   * description is the purpose for any goal; "other" needs one.
   */
  | {
      readonly kind: "goal";
      readonly goal: Goal;
      readonly purpose?: string;
      readonly projectName: string;
    }
  /** Scene E1: start the first Mission. */
  | { readonly kind: "firstMission" }
  /** Scene E3 in script mode: the goal text the person wrote. */
  | { readonly kind: "goalText"; readonly text: string }
  /** The input bar; `topic` names an empty state that asked. */
  | {
      readonly kind: "message";
      readonly text: string;
      readonly topic?: string;
      /** The earlier messages of the open thread, oldest first, at most 10 (section 3). */
      readonly history?: readonly ModelMessage[];
    };

export interface CreateProjectAction {
  readonly kind: "createProject";
  readonly name: string;
  readonly purpose: string;
  readonly spaces: readonly string[];
  /** Created in the first space (RFC-011 section 7). */
  readonly collection: string;
}

export interface StartFirstMissionAction {
  readonly kind: "startFirstMission";
  readonly title: string;
  readonly goal: string;
  readonly question: string;
  readonly rationale: string;
  readonly options: readonly { readonly option: string; readonly consequence: string }[];
}

export interface RecordGoalAction {
  readonly kind: "recordGoal";
  readonly title: string;
  readonly content: string;
  readonly sourceTitle: string;
  readonly evidenceSummary: (answer: string) => string;
  readonly reviewReason: string;
  readonly outcome: string;
}

export type ActionPayload = CreateProjectAction | StartFirstMissionAction | RecordGoalAction;
export type ActionKind = ActionPayload["kind"];

export interface AssistantTurn {
  /** Free text from a model; absent in script mode. */
  readonly text?: string;
  /** A fixed reply the web client renders from its labels. */
  readonly reply?: string;
  readonly action?: ActionPayload;
  /** For a setup answer: what it was understood as; absent when it was not understood. */
  readonly answer?: Interpretation;
  /** For a setup answer: who placed it (Milestone 16 section 4). */
  readonly by?: "button" | "keywords" | "model";
}

export interface Assistant {
  respond(input: AssistantInput, language: Language, people?: PromptPeople): Promise<AssistantTurn>;
}

interface Content {
  readonly goals: Record<
    Exclude<Goal, "other">,
    { readonly purpose: string; readonly spaces: readonly string[] }
  >;
  readonly otherSpaces: readonly string[];
  readonly collection: string;
  readonly mission: Omit<StartFirstMissionAction, "kind">;
  readonly goalTitle: string;
  readonly sourceTitle: string;
  readonly evidence: (answer: string) => string;
  readonly reviewReason: string;
  readonly outcome: string;
}

/**
 * Content the setup writes into the workspace, in the person's language. It becomes project
 * data, so it lives here and not in the web client's labels.
 */
const CONTENT: Record<Language, Content> = {
  de: {
    goals: {
      game: {
        purpose: "Ein eigenes Spiel entwickeln.",
        spaces: ["Ideen", "Aufgaben", "Entscheidungen"],
      },
      website: {
        purpose: "Eine eigene Website bauen.",
        spaces: ["Inhalte", "Aufgaben", "Entscheidungen"],
      },
      writing: {
        purpose: "Texte oder ein Buch schreiben.",
        spaces: ["Kapitel", "Ideen", "Aufgaben"],
      },
    },
    otherSpaces: ["Ideen", "Aufgaben", "Entscheidungen"],
    collection: "Projektziel",
    mission: {
      title: "Projektziel festhalten",
      goal: "Das Ziel des Projekts in wenigen Sätzen festhalten.",
      question: "Für wen ist das Projekt?",
      rationale: "Davon hängen Umfang und Stil ab.",
      options: [
        { option: "Für mich selbst", consequence: "Kleiner Umfang, schnell ein erstes Ergebnis." },
        {
          option: "Für Freunde und Familie",
          consequence: "Etwas mehr Feinschliff, leicht verständlich für andere.",
        },
        {
          option: "Für die Öffentlichkeit",
          consequence: "Mehr Aufwand für Qualität und Veröffentlichung.",
        },
      ],
    },
    goalTitle: "Projektziel",
    sourceTitle: "Einrichtungsgespräch",
    evidence: (answer) => `Antwort auf „Für wen ist das Projekt?“: ${answer}`,
    reviewReason: "Bei der Einrichtung vom Kapitän übernommen.",
    outcome: "Das Projektziel ist festgehalten.",
  },
  en: {
    goals: {
      game: { purpose: "Develop a game of my own.", spaces: ["Ideas", "Tasks", "Decisions"] },
      website: { purpose: "Build a website of my own.", spaces: ["Content", "Tasks", "Decisions"] },
      writing: { purpose: "Write texts or a book.", spaces: ["Chapters", "Ideas", "Tasks"] },
    },
    otherSpaces: ["Ideas", "Tasks", "Decisions"],
    collection: "Project goal",
    mission: {
      title: "Record the project goal",
      goal: "Record the goal of the project in a few sentences.",
      question: "Who is the project for?",
      rationale: "Scope and style depend on it.",
      options: [
        { option: "For myself", consequence: "Small scope, a first result quickly." },
        {
          option: "For friends and family",
          consequence: "A bit more polish, easy for others to understand.",
        },
        { option: "For the public", consequence: "More effort for quality and publishing." },
      ],
    },
    goalTitle: "Project goal",
    sourceTitle: "Setup conversation",
    evidence: (answer) => `Answer to “Who is the project for?”: ${answer}`,
    reviewReason: "Accepted by the captain during setup.",
    outcome: "The project goal is recorded.",
  },
};

/** Script mode (RFC-011 section 2): fixed content and fixed choices, deterministic. */
export class ScriptedAssistant implements Assistant {
  public async respond(input: AssistantInput, language: Language): Promise<AssistantTurn> {
    const content = CONTENT[language];
    switch (input.kind) {
      case "goal": {
        const fixed = input.goal === "other" ? null : content.goals[input.goal];
        return {
          action: {
            kind: "createProject",
            name: input.projectName,
            purpose: input.purpose ?? fixed?.purpose ?? "",
            spaces: fixed?.spaces ?? content.otherSpaces,
            collection: content.collection,
          },
        };
      }
      case "firstMission":
        return { action: { kind: "startFirstMission", ...content.mission } };
      case "goalText":
        return {
          action: {
            kind: "recordGoal",
            title: content.goalTitle,
            content: input.text,
            sourceTitle: content.sourceTitle,
            evidenceSummary: content.evidence,
            reviewReason: content.reviewReason,
            outcome: content.outcome,
          },
        };
      case "message":
        if (input.topic === "missions") return { reply: "missions" };
        return { reply: asksForModelChange(input.text, language) ? "model" : "notOnBoard" };
      case "setup": {
        if (input.choice !== undefined) {
          return PROMPTS[input.prompt].choices.some((choice) => choice === input.choice)
            ? { answer: { choice: input.choice }, by: "button" }
            : { reply: "notUnderstood" };
        }
        const answer = interpret(input.prompt, input.text ?? "", language);
        return answer ? { answer, by: "keywords" } : { reply: "notUnderstood" };
      }
    }
  }
}

/** What `ModelAssistant` needs from the runtime (Milestone 16 section 2). */
export interface ModelSource {
  /** The runtime's address while Xora is ready; null otherwise. */
  url(): string | null;
  /** A failed answer: Xora stays in script mode until a restart. */
  fail(reason: "timeout" | "exited"): void;
}

type Complete = (baseUrl: string, request: ModelRequest) => Promise<ModelTurn>;

const MAX_PROJECT_NAME_LENGTH = 80;
const MAX_PROJECT_NAME_WORDS = 4;
const DEFAULT_PEOPLE: PromptPeople = { captain: "Captain" };

/**
 * Xora with a model (Milestone 16 section 3). The app decides everything it can itself: a
 * tapped button, a typed answer the keyword list places, typed names and paths, the first
 * Mission, and the goal text. The model is asked only for free text: a typed answer the
 * keywords could not place (one of the step's buttons or "unclear"), the plan description
 * (a project name and a goal template; the purpose stays the typed text), and messages to
 * Xora on the bridge. Every model answer is checked; a failure falls back to script mode.
 */
export class ModelAssistant implements Assistant {
  public constructor(
    private readonly source: ModelSource,
    private readonly scripted: Assistant = new ScriptedAssistant(),
    private readonly complete: Complete = chatCompletion,
  ) {}

  public async respond(
    input: AssistantInput,
    language: Language,
    people: PromptPeople = DEFAULT_PEOPLE,
  ): Promise<AssistantTurn> {
    const fallback = () => this.scripted.respond(input, language, people);
    const base = this.source.url();
    if (!base) return fallback();
    try {
      if (input.kind === "setup" && input.choice === undefined) {
        return await this.setupText(base, input.prompt, input.text ?? "", language, people);
      }
      if (input.kind === "message" && input.topic === undefined) {
        // Changing her model is a fixed answer, with or without a model (section 6).
        if (asksForModelChange(input.text, language)) return { reply: "model" };
        const turn = await this.complete(base, {
          system: chatPrompt(language, people),
          messages: [...(input.history ?? []).slice(-10), { role: "user", content: input.text }],
          tools: [],
        });
        return turn.text ? { text: limitWords(turn.text) } : await fallback();
      }
    } catch (error) {
      if (!(error instanceof ModelUnavailable)) throw error;
      this.source.fail(error.reason);
    }
    return fallback();
  }

  private async setupText(
    base: string,
    prompt: PromptKey,
    text: string,
    language: Language,
    people: PromptPeople,
  ): Promise<AssistantTurn> {
    const placed = interpret(prompt, text, language);
    if (prompt === "describe") {
      if (!placed || placed.choice !== undefined) {
        return placed ? { answer: placed, by: "keywords" } : { reply: "notUnderstood" };
      }
      const { system, tool } = describePrompt(language, people);
      const turn = await this.complete(base, {
        system,
        messages: [{ role: "user", content: text }],
        tools: [tool],
      });
      let proposal = validProject(turn);
      if (!proposal) {
        // Small models often skip the action: ask once more for the name alone.
        const named = await this.complete(base, {
          system: namePrompt(language, people),
          messages: [{ role: "user", content: text }],
          tools: [],
        });
        const projectName = validName(named.text);
        if (projectName) proposal = { projectName, goal: placed.goal ?? "other" };
      }
      if (!proposal) return { answer: placed, by: "keywords" };
      return {
        answer: { value: placed.value ?? text.trim(), ...proposal },
        by: "model",
        ...(turn.text ? { text: limitWords(turn.text) } : {}),
      };
    }
    if (placed) return { answer: placed, by: "keywords" };
    if (!CHOICE_SITUATIONS.includes(prompt as ChoiceSituation)) return { reply: "notUnderstood" };
    const choices = PROMPTS[prompt].choices;
    const { system, tool } = choicePrompt(prompt as ChoiceSituation, choices, language, people);
    const turn = await this.complete(base, {
      system,
      messages: [{ role: "user", content: text }],
      tools: [tool],
    });
    const choice = turn.call?.name === "place_answer" ? turn.call.arguments.choice : undefined;
    if (typeof choice === "string" && choice !== UNCLEAR && choices.some((one) => one === choice)) {
      return { answer: { choice }, by: "model" };
    }
    return { reply: "notUnderstood", ...(turn.text ? { text: limitWords(turn.text) } : {}) };
  }
}

/** A model's project proposal, if it passes the checks of section 3. */
function validProject(turn: ModelTurn): { projectName: string; goal: Goal } | null {
  if (turn.call?.name !== "propose_project") return null;
  const { name, goal } = turn.call.arguments;
  if (typeof goal !== "string") return null;
  const projectName = validName(name);
  const template = GOALS.find((one) => one === goal);
  return projectName && template ? { projectName, goal: template } : null;
}

/** A project name of 1 to 4 words and at most 80 characters, without quotes around it. */
function validName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value
    .trim()
    .replace(/^["'„“”«»‚‘’]+|["'„“”«»‚‘’.!]+$/g, "")
    .trim();
  const count = words(name).length;
  if (!name || name.includes("\n") || name.length > MAX_PROJECT_NAME_LENGTH) return null;
  return count >= 1 && count <= MAX_PROJECT_NAME_WORDS ? name : null;
}

const PENDING_LIFETIME_MS = 30 * 60 * 1000;

/** Proposed actions waiting for the person's confirmation; kept in memory only. */
export class PendingActions<T = ActionPayload> {
  private readonly actions = new Map<string, { action: T; createdAt: number }>();

  public add(action: T, now = Date.now()): string {
    for (const [id, entry] of this.actions) {
      if (now - entry.createdAt > PENDING_LIFETIME_MS) this.actions.delete(id);
    }
    const id = randomUUID();
    this.actions.set(id, { action, createdAt: now });
    return id;
  }

  /** Removes and returns the action; null when unknown or expired. */
  public take(id: string, now = Date.now()): T | null {
    const entry = this.actions.get(id);
    this.actions.delete(id);
    if (!entry || now - entry.createdAt > PENDING_LIFETIME_MS) return null;
    return entry.action;
  }
}

/** What the browser sees of a proposed action: exactly what will be written. */
export function describeAction(action: ActionPayload) {
  switch (action.kind) {
    case "createProject":
      return {
        kind: action.kind,
        name: action.name,
        purpose: action.purpose,
        spaces: action.spaces,
        collection: action.collection,
      };
    case "startFirstMission":
      return {
        kind: action.kind,
        title: action.title,
        goal: action.goal,
        question: action.question,
        rationale: action.rationale,
        options: action.options,
      };
    case "recordGoal":
      return { kind: action.kind, title: action.title, content: action.content };
  }
}
