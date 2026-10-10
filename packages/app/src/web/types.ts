/** Response shapes of the read API; kept here so the browser never imports server code. */
import type { Interpretation, PromptKey, SetupStep, Term } from "../shared/conversation.js";

export type MissionState =
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
export type MissionFilter = "all" | "running" | "limit" | "input" | "completed" | "failed";

export interface ProjectLabel {
  readonly id: string;
  readonly name: string;
}

export interface MissionSummary {
  readonly id: string;
  readonly title: string;
  readonly project: ProjectLabel;
  readonly state: MissionState;
  readonly waitReason: string | null;
  readonly workerRole: string | null;
  readonly currentActivity: string | null;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly needsHuman: boolean;
  readonly question: string | null;
}

export interface MissionList {
  readonly counts: Record<MissionFilter, number>;
  readonly missions: readonly MissionSummary[];
}

export interface AttentionRequest {
  readonly waitReason: string;
  readonly question: string;
  readonly rationale: string;
  readonly options: readonly { option: string; consequence: string | null }[];
  readonly response: string | null;
  readonly decision: "approve" | "reject" | null;
  readonly responderId: string | null;
  readonly answeredAt: string | null;
}

export interface Outcome {
  readonly kind: "Completed" | "Failed";
  readonly summary: string;
  readonly outputs: readonly string[];
  readonly validations: readonly string[];
  readonly decisions: readonly string[];
  readonly proposals: readonly { projectId: string; proposalId: string; status: string }[];
  readonly logReferences: readonly { kind: string; locator: string; portable: boolean }[];
  readonly recordedBy: string;
  readonly recordedAt: string;
}

export interface MissionDetail extends MissionSummary {
  readonly goal: string;
  readonly waitDetail: string | null;
  readonly limitedCapability: string | null;
  readonly expectedResumeAt: string | null;
  readonly predecessorMissionId: string | null;
  readonly createdBy: string;
  readonly startedAt: string | null;
  readonly latestActor: string;
  readonly sequence: number;
  readonly attentionRequest: AttentionRequest | null;
  readonly outcome: Outcome | null;
  readonly references: {
    readonly projects: readonly ProjectLabel[];
    readonly nodes: readonly {
      projectId: string;
      nodeId: string;
      title: string;
      key: string | null;
    }[];
    readonly plans: readonly {
      projectId: string;
      planId: string;
      title: string;
      status: string | null;
    }[];
  };
  readonly availableActions: readonly MissionAction[];
}

export interface MissionEvent {
  readonly id: string;
  readonly sequence: number;
  readonly type: string;
  readonly previousState: MissionState | null;
  readonly newState: MissionState;
  readonly waitReason: string | null;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly reason: string | null;
  readonly payload: Record<string, unknown>;
}

/** Write actions offered by the server (Milestone 12). */
export type MissionAction = "answer" | "pause" | "cancel" | "resume";

export interface WorkspaceInfo {
  readonly name: string;
  readonly reviewers: readonly string[];
  readonly actor: string | null;
  readonly actorSource: "flag" | "settings" | null;
  readonly readOnly: boolean;
  readonly setupComplete: boolean;
}

/**
 * `GET /api/setup` (Milestones 13 and 14). In setup mode, and in ready mode while the setup
 * conversation is not finished, it carries the conversation step, the stored answers, and the
 * start screen states.
 */
export interface SetupInfo {
  readonly mode: "fixed" | "ready" | "setup" | "settingsError";
  readonly settingsError?: string;
  /** The conversation step; null (ready mode) once the setup has ended. */
  readonly step?: SetupStep | null;
  readonly boot?: {
    readonly shipComputer: "ready";
    readonly logbook: "found" | "notCreated";
    readonly xora: "scriptMode";
  };
  readonly answers?: {
    readonly name: string | null;
    readonly captain: string | null;
    readonly shipName: string | null;
    readonly logbookPath: string | null;
  };
  readonly existing?: {
    readonly path: string;
    readonly name: string;
    readonly reviewers: readonly string[];
  } | null;
  readonly logbook?: {
    readonly path: string;
    readonly isDefault: boolean;
    readonly documentsPath: readonly string[] | null;
    readonly inRepository: boolean;
    readonly oneDrive: boolean;
    readonly hasWorkspace: boolean;
    readonly reviewers: readonly string[];
    /** Where the folder window starts; null when OneDrive is not set up. */
    readonly places: { readonly local: string; readonly oneDrive: string } | null;
    /** True when the server can open the folder window of the operating system. */
    readonly picker: boolean;
  };
  /** After `POST /api/setup/folder`: whether a folder was chosen in the window. */
  readonly picked?: boolean;
  readonly xora?: { readonly state: "not_installed" };
  /** Ready mode: the first Mission and its offer on the bridge. */
  readonly firstSteps?: FirstSteps;
}

export type FirstStepsStage = "goal" | "mission" | "answer" | "record" | "hints";

export interface FirstSteps {
  readonly pending: boolean;
  readonly stage: FirstStepsStage;
  readonly projectId: string | null;
  readonly purpose: string | null;
  readonly missionId: string | null;
  readonly answer: string | null;
}

export type Goal = "game" | "website" | "writing" | "other";

/** A proposed action of `POST /api/assistant/message`; nothing is written before confirm. */
export type ProposedAction = { readonly id: string } & (
  | {
      readonly kind: "createProject";
      readonly name: string;
      readonly purpose: string;
      readonly spaces: readonly string[];
      readonly collection: string;
    }
  | {
      readonly kind: "startFirstMission";
      readonly title: string;
      readonly goal: string;
      readonly question: string;
      readonly rationale: string;
      readonly options: readonly { option: string; consequence: string }[];
    }
  | { readonly kind: "recordGoal"; readonly title: string; readonly content: string }
);

export interface AssistantReply extends Interpretation {
  readonly text?: string;
  /** A fixed reply key; the text is in the labels. */
  readonly reply?: "notOnBoard" | "missions" | "notUnderstood";
  readonly action?: ProposedAction;
  /** For a setup answer: the prompt, its answer buttons, and the terms it introduces. */
  readonly prompt?: PromptKey;
  readonly choices?: readonly string[];
  readonly terms?: readonly Term[];
}

/** The bridge chat (Milestone 15 section 6). Addresses: ship, project:<id>, topic:<id>, decisions, direct:xora. */
export type ChatKind = "ship" | "project" | "topic" | "direct" | "decisions";

export interface ChatSummary {
  readonly address: string;
  readonly kind: ChatKind;
  readonly name: string | null;
  readonly projectId: string | null;
  readonly archived: boolean;
}

/** `GET /api/chats`: the side list. */
export interface ChatList {
  /** False on a workspace without migration 008_chat: the bridge is read-only. */
  readonly available: boolean;
  readonly writable: boolean;
  readonly decisions: { readonly address: string; readonly count: number };
  readonly channels: readonly ChatSummary[];
  readonly direct: readonly ChatSummary[];
  readonly projects: readonly ProjectLabel[];
}

export interface ChatAuthor {
  readonly id: string;
  readonly name: string;
  readonly role: "captain" | "xora" | "shipComputer" | "other";
}

export interface MessagePreview {
  readonly id: string;
  readonly address: string;
  readonly chat: ChatSummary;
  readonly thread: string | null;
  readonly author: ChatAuthor;
  readonly excerpt: string | null;
  readonly at: string;
  readonly deleted: boolean;
}

export interface MessageEntry {
  readonly type: "message";
  readonly id: string;
  readonly at: string;
  readonly author: ChatAuthor;
  readonly body: string | null;
  readonly deleted: { readonly by: string; readonly at: string } | null;
  readonly thread: string | null;
  readonly mentions: readonly ChatAuthor[];
  readonly links: readonly MessagePreview[];
  readonly replies: number;
  readonly lastReplyAt: string | null;
}

export type ShipEventKind =
  | "projectCreated"
  | "missionCreated"
  | "missionStarted"
  | "missionWaiting"
  | "missionCompleted"
  | "missionFailed"
  | "missionCancelled"
  | "knowledgeAccepted";

export interface ShipEventEntry {
  readonly type: "event";
  readonly id: string;
  readonly at: string;
  readonly event: ShipEventKind;
  readonly author: ChatAuthor;
  readonly project: ProjectLabel;
  readonly address: string;
  readonly mission?: { readonly id: string; readonly title: string };
  readonly thread?: string;
  readonly title?: string | null;
}

export interface MissionCardEntry {
  readonly type: "mission";
  readonly id: string;
  readonly at: string;
  readonly mission: MissionSummary;
  readonly thread: string;
  readonly replies: number;
  readonly lastReplyAt: string | null;
}

export interface AttentionEntry {
  readonly type: "attention";
  readonly id: string;
  readonly at: string;
  readonly mission: MissionSummary;
  readonly waitReason: string | null;
  readonly address: string;
  readonly thread: string;
}

export interface MissionEventEntry {
  readonly type: "missionEvent";
  readonly id: string;
  readonly at: string;
  readonly event: Pick<
    MissionEvent,
    "type" | "newState" | "waitReason" | "actorId" | "reason" | "payload"
  >;
}

export type ChatEntry =
  | MessageEntry
  | ShipEventEntry
  | MissionCardEntry
  | AttentionEntry
  | MissionEventEntry;

export type ChatDetails =
  | {
      readonly kind: "project";
      readonly project: ProjectLabel & { readonly purpose: string };
      readonly missions: number;
      readonly open: number;
    }
  | { readonly kind: "topic"; readonly project: (ProjectLabel & { purpose: string }) | null }
  | { readonly kind: "direct"; readonly mode: "script" }
  | { readonly kind: "ship" | "decisions"; readonly crew: readonly ChatAuthor[] };

export interface ChatThread {
  readonly key: string;
  readonly root: MessageEntry | { readonly type: "mission"; readonly mission: MissionDetail };
  readonly entries: readonly ChatEntry[];
}

/** `GET /api/chats/:address`. */
export interface ChatView {
  readonly chat: ChatSummary & { readonly writable: boolean };
  readonly details: ChatDetails;
  readonly entries: readonly ChatEntry[];
  readonly thread?: ChatThread;
}

/** `POST /api/chats/:address/messages`. */
export interface PostedMessage {
  readonly message: MessageEntry;
  readonly reply?: MessageEntry;
  readonly thread: string | null;
}
