/** Response shapes of the read API; kept here so the browser never imports server code. */
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

/** `GET /api/setup` (Milestone 13); the setup fields are present only in setup mode. */
export interface SetupInfo {
  readonly mode: "fixed" | "ready" | "setup" | "settingsError";
  readonly settingsError?: string;
  /** Ready, but the orientation after creating the logbook was not shown to the end. */
  readonly introPending?: boolean;
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
  };
  readonly xora?: { readonly state: "not_installed" };
}
