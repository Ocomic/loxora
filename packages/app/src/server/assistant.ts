import { randomUUID } from "node:crypto";

/**
 * Xora as a capability (RFC-011 section 5, Milestone 13). The flow depends only on the
 * `Assistant` interface. An assistant returns text, a fixed reply key, or one proposed
 * action; it never writes. The server keeps proposed actions pending and executes one only
 * after the person confirms it. This milestone has only `ScriptedAssistant`: fixed content,
 * no model. A local model is another implementation (milestone 3).
 */

export type Language = "de" | "en";

export const GOALS = ["game", "website", "writing", "other"] as const;
export type Goal = (typeof GOALS)[number];

export type AssistantInput =
  /** Scene D1 and D2: the chosen goal, the purpose for "other", and the project name. */
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
  | { readonly kind: "message"; readonly text: string; readonly topic?: string };

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
}

export interface Assistant {
  respond(input: AssistantInput, language: Language): Promise<AssistantTurn>;
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
            purpose: fixed?.purpose ?? input.purpose ?? "",
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
        return { reply: input.topic === "missions" ? "missions" : "notOnBoard" };
    }
  }
}

const PENDING_LIFETIME_MS = 30 * 60 * 1000;

/** Proposed actions waiting for the person's confirmation; kept in memory only. */
export class PendingActions {
  private readonly actions = new Map<string, { action: ActionPayload; createdAt: number }>();

  public add(action: ActionPayload, now = Date.now()): string {
    for (const [id, entry] of this.actions) {
      if (now - entry.createdAt > PENDING_LIFETIME_MS) this.actions.delete(id);
    }
    const id = randomUUID();
    this.actions.set(id, { action, createdAt: now });
    return id;
  }

  /** Removes and returns the action; null when unknown or expired. */
  public take(id: string, now = Date.now()): ActionPayload | null {
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
        question: action.question,
        options: action.options,
      };
    case "recordGoal":
      return { kind: action.kind, title: action.title, content: action.content };
  }
}
