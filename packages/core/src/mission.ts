import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "./errors.js";
import type { ProjectQualifiedEvidenceId } from "./cross-project.js";
import type { ProjectQualifiedNodeId } from "./planned.js";
import type { Clock, IdGenerator } from "./ports.js";
import type { Brand, PlannedKnowledgeId, ProjectId, ProposalId } from "./types.js";

export type MissionId = Brand<string, "MissionId">;
export type MissionEventId = Brand<string, "MissionEventId">;
export type AttentionRequestId = Brand<string, "AttentionRequestId">;

/** RFC-009 state model. Terminal: completed, failed, cancelled. */
export type MissionState =
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/** RFC-009 Amendment 1. `needs_budget` is reserved and rejected until a C3 decision. */
export type WaitReason =
  | "provider_limit"
  | "needs_input"
  | "needs_approval"
  | "needs_permission"
  | "needs_manual_action"
  | "needs_budget";

export type HumanWaitReason = Exclude<WaitReason, "provider_limit" | "needs_budget">;

export const MISSION_STATES: readonly MissionState[] = Object.freeze([
  "queued",
  "running",
  "waiting",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export const TERMINAL_MISSION_STATES: readonly MissionState[] = Object.freeze([
  "completed",
  "failed",
  "cancelled",
]);
export const WAIT_REASONS: readonly WaitReason[] = Object.freeze([
  "provider_limit",
  "needs_input",
  "needs_approval",
  "needs_permission",
  "needs_manual_action",
  "needs_budget",
]);
export const HUMAN_WAIT_REASONS: readonly HumanWaitReason[] = Object.freeze([
  "needs_input",
  "needs_approval",
  "needs_permission",
  "needs_manual_action",
]);

/** Allowed transitions (RFC-009, section 4). */
export const MISSION_TRANSITIONS: Readonly<Record<MissionState, readonly MissionState[]>> =
  Object.freeze({
    queued: ["running", "cancelled"],
    running: ["waiting", "paused", "completed", "failed", "cancelled"],
    waiting: ["running", "paused", "failed", "cancelled"],
    paused: ["running", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  });

export type MissionEventType =
  | "Created"
  | "Started"
  | "ActivityReported"
  | "Waiting"
  | "AttentionAnswered"
  | "Resumed"
  | "Paused"
  | "Cancelled"
  | "Completed"
  | "Failed";

export interface AttentionOption {
  readonly option: string;
  readonly consequence: string | null;
}

export interface AttentionRequest {
  readonly id: AttentionRequestId;
  readonly missionId: MissionId;
  readonly eventId: MissionEventId;
  readonly waitReason: HumanWaitReason;
  readonly question: string;
  readonly rationale: string;
  readonly options: readonly AttentionOption[];
  readonly response: string | null;
  readonly decision: "approve" | "reject" | null;
  readonly responderId: string | null;
  readonly answeredAt: string | null;
}

export type LogReferenceKind = "workspace" | "external";

export interface LogReference {
  readonly kind: LogReferenceKind;
  readonly locator: string;
  /** `workspace:` references are portable; `external:` references are not (ADR-005). */
  readonly portable: boolean;
}

export interface MissionOutcomeProposal {
  readonly projectId: ProjectId;
  readonly proposalId: ProposalId;
  /** Read live: the review state of the Proposal now, not when the Mission ended. */
  readonly status: string;
}

export interface MissionOutcome {
  readonly kind: "Completed" | "Failed";
  readonly summary: string;
  readonly outputs: readonly string[];
  readonly validations: readonly string[];
  readonly decisions: readonly string[];
  readonly proposals: readonly MissionOutcomeProposal[];
  readonly logReferences: readonly LogReference[];
  readonly recordedBy: string;
  readonly recordedAt: string;
}

export interface MissionReferences {
  readonly projectIds: readonly ProjectId[];
  readonly nodes: readonly ProjectQualifiedNodeId[];
  readonly plans: readonly {
    readonly projectId: ProjectId;
    readonly plannedKnowledgeId: PlannedKnowledgeId;
  }[];
}

export interface Mission {
  readonly id: MissionId;
  readonly ownerProjectId: ProjectId;
  readonly title: string;
  readonly goal: string;
  readonly state: MissionState;
  readonly waitReason: WaitReason | null;
  readonly waitDetail: string | null;
  readonly limitedCapability: string | null;
  readonly expectedResumeAt: string | null;
  readonly currentActivity: string | null;
  readonly workerRole: string | null;
  readonly agentMetadata: string | null;
  readonly predecessorMissionId: MissionId | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Number of the latest Mission Event; every change appends exactly one. */
  readonly sequence: number;
  /** Derived at read time from the latest event; never persisted (ADR-005). */
  readonly lastActivityAt: string;
  readonly references: MissionReferences;
  /** The Attention Request of the current wait, if the Mission waits for a human. */
  readonly attentionRequest: AttentionRequest | null;
  readonly outcome: MissionOutcome | null;
}

export interface MissionEvent {
  readonly id: MissionEventId;
  readonly missionId: MissionId;
  readonly sequence: number;
  readonly type: MissionEventType;
  readonly previousState: MissionState | null;
  readonly newState: MissionState;
  readonly waitReason: WaitReason | null;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly reason: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
}

/** The mutable part of a Mission row, written together with one event. */
export interface MissionRowChange {
  readonly state: MissionState;
  readonly waitReason: WaitReason | null;
  readonly waitDetail: string | null;
  readonly limitedCapability: string | null;
  readonly expectedResumeAt: string | null;
  readonly currentActivity: string | null;
  readonly updatedAt: string;
}

export interface MissionStore {
  /** Inserts the Mission, its references, and its Created event in one transaction. */
  createMission(input: {
    mission: Omit<Mission, "lastActivityAt" | "attentionRequest" | "outcome">;
    event: MissionEvent;
  }): Promise<void>;
  /**
   * Applies one change in one transaction. Fails with ValidationError when the Mission's
   * sequence is no longer `expectedSequence` (stale state).
   */
  applyMissionChange(input: {
    missionId: MissionId;
    expectedSequence: number;
    change: MissionRowChange;
    event: MissionEvent;
    attentionRequest?: AttentionRequest;
    answer?: {
      readonly attentionRequestId: AttentionRequestId;
      readonly response: string;
      readonly decision: "approve" | "reject" | null;
      readonly responderId: string;
      readonly answeredAt: string;
    };
    outcome?: Omit<MissionOutcome, "proposals"> & {
      readonly proposals: readonly { projectId: ProjectId; proposalId: ProposalId }[];
    };
  }): Promise<void>;
  getMission(input: { missionId: MissionId }): Promise<Mission | null>;
  listMissions(input: {
    projectId?: ProjectId;
    states?: readonly MissionState[];
    waitReasons?: readonly WaitReason[];
  }): Promise<readonly Mission[]>;
  getMissionEvents(input: { missionId: MissionId }): Promise<readonly MissionEvent[]>;
  /** References that do not exist; used to validate Mission references and Outcomes. */
  missingMissionReferences(input: {
    projectIds: readonly ProjectId[];
    nodes: readonly ProjectQualifiedNodeId[];
    plans: MissionReferences["plans"];
    proposals: readonly { projectId: ProjectId; proposalId: ProposalId }[];
  }): Promise<readonly string[]>;
}

export interface CreateMissionInput {
  readonly ownerProjectId: ProjectId;
  readonly title: string;
  readonly goal: string;
  readonly referencedProjectIds?: readonly ProjectId[];
  readonly nodes?: readonly ProjectQualifiedNodeId[];
  readonly plans?: MissionReferences["plans"];
  readonly workerRole?: string;
  readonly agentMetadata?: string;
  readonly predecessorMissionId?: MissionId;
  readonly actorId: string;
}

export interface WaitMissionInput {
  readonly missionId: MissionId;
  readonly reason: WaitReason;
  readonly actorId: string;
  /** Required for `provider_limit`. */
  readonly detail?: string;
  readonly limitedCapability?: string;
  readonly expectedResumeAt?: string;
  /** Required for every `needs_*` reason: the Attention Request. */
  readonly question?: string;
  readonly rationale?: string;
  readonly options?: readonly AttentionOption[];
}

export interface FinishMissionInput {
  readonly missionId: MissionId;
  readonly actorId: string;
  readonly summary: string;
  readonly outputs?: readonly string[];
  readonly validations?: readonly string[];
  readonly decisions?: readonly string[];
  readonly proposalIds?: readonly ProposalId[];
  readonly logReferences?: readonly string[];
  readonly evidence?: readonly ProjectQualifiedEvidenceId[];
}

const defaultIds: IdGenerator = { next: () => randomUUID() };
const defaultClock: Clock = { now: () => new Date().toISOString() };

export function isAgentActorId(actorId: string): boolean {
  return actorId.startsWith("agent:");
}

/** Parses `workspace:<relative path>` or `external:<locator>` (ADR-005, section 5). */
export function parseLogReference(value: string): LogReference {
  const text = value.trim();
  const separator = text.indexOf(":");
  const kind = separator > 0 ? text.slice(0, separator) : "";
  const locator = separator > 0 ? text.slice(separator + 1).trim() : "";
  if (!locator) {
    throw new ValidationError(
      `Log reference "${value}" must be workspace:<relative path> or external:<locator>`,
    );
  }
  if (kind === "workspace") {
    const parts = locator.split(/[\\/]/);
    if (/^([A-Za-z]:|[\\/])/.test(locator) || parts.includes("..")) {
      throw new ValidationError(
        `workspace: log references must be relative paths inside the workspace without "..": ${value}`,
      );
    }
    return Object.freeze({ kind, locator, portable: true });
  }
  if (kind === "external") return Object.freeze({ kind, locator, portable: false });
  throw new ValidationError(`Log reference "${value}" must start with workspace: or external:`);
}

/**
 * Mission operations (ADR-005). Core validates every transition, actor rule, and payload;
 * adapters only call these operations. Mission operations write Mission Events, not
 * knowledge Audit Events.
 */
export class MissionService {
  public constructor(
    private readonly store: MissionStore,
    private readonly ids: IdGenerator = defaultIds,
    private readonly clock: Clock = defaultClock,
  ) {}

  public async createMission(input: CreateMissionInput): Promise<Mission> {
    const actorId = text(input.actorId, "Actor");
    const ownerProjectId = input.ownerProjectId;
    const referencedProjectIds = unique(
      (input.referencedProjectIds ?? []).filter((id) => id !== ownerProjectId),
    );
    const endpoints = new Set<string>([ownerProjectId, ...referencedProjectIds]);
    const nodes = input.nodes ?? [];
    const plans = input.plans ?? [];
    for (const reference of [...nodes, ...plans]) {
      if (!endpoints.has(reference.projectId)) {
        throw new ValidationError(
          "Referenced Nodes and plans must belong to the owning Project or a referenced Project",
        );
      }
    }
    const missing = await this.store.missingMissionReferences({
      projectIds: [ownerProjectId, ...referencedProjectIds],
      nodes,
      plans,
      proposals: [],
    });
    if (missing.length > 0) {
      throw new ValidationError(`Unknown Mission references: ${missing.join(", ")}`);
    }
    if (input.predecessorMissionId) {
      const predecessor = await this.store.getMission({ missionId: input.predecessorMissionId });
      if (!predecessor) {
        throw new NotFoundError(`Predecessor Mission ${input.predecessorMissionId} was not found`);
      }
      if (!TERMINAL_MISSION_STATES.includes(predecessor.state)) {
        throw new ValidationError(
          `Predecessor Mission must be completed, failed, or cancelled (is ${predecessor.state})`,
        );
      }
    }
    const createdAt = this.clock.now();
    const id = this.ids.next() as MissionId;
    const mission = Object.freeze({
      id,
      ownerProjectId,
      title: text(input.title, "Mission title"),
      goal: text(input.goal, "Mission goal"),
      state: "queued" as const,
      waitReason: null,
      waitDetail: null,
      limitedCapability: null,
      expectedResumeAt: null,
      currentActivity: null,
      workerRole: optionalText(input.workerRole),
      agentMetadata: optionalText(input.agentMetadata),
      predecessorMissionId: input.predecessorMissionId ?? null,
      createdBy: actorId,
      createdAt,
      updatedAt: createdAt,
      sequence: 1,
      references: Object.freeze({
        projectIds: Object.freeze(referencedProjectIds),
        nodes: Object.freeze([...nodes]),
        plans: Object.freeze([...plans]),
      }),
    });
    await this.store.createMission({
      mission,
      event: this.event({
        missionId: id,
        sequence: 1,
        type: "Created",
        previousState: null,
        newState: "queued",
        actorId,
        occurredAt: createdAt,
        payload: { title: mission.title },
      }),
    });
    return this.require(id);
  }

  public startMission(input: {
    missionId: MissionId;
    actorId: string;
    activity?: string;
  }): Promise<Mission> {
    return this.transition(input.missionId, input.actorId, "Started", "running", (mission) => {
      if (mission.state !== "queued") throw invalid(mission, "running");
      return { currentActivity: optionalText(input.activity) ?? mission.currentActivity };
    });
  }

  public reportActivity(input: {
    missionId: MissionId;
    actorId: string;
    activity: string;
  }): Promise<Mission> {
    const activity = text(input.activity, "Activity");
    return this.transition(
      input.missionId,
      input.actorId,
      "ActivityReported",
      "running",
      (mission) => {
        if (mission.state !== "running") {
          throw new ValidationError(
            `Activity can only be reported while running (is ${mission.state})`,
          );
        }
        return { currentActivity: activity, payload: { activity } };
      },
    );
  }

  public async waitMission(input: WaitMissionInput): Promise<Mission> {
    if (!WAIT_REASONS.includes(input.reason)) {
      throw new ValidationError(`Unknown Wait Reason: ${String(input.reason)}`);
    }
    if (input.reason === "needs_budget") {
      throw new ValidationError(
        "needs_budget is reserved until budget handling is decided (C3); it cannot be used yet",
      );
    }
    const reason = input.reason;
    let attention: Omit<AttentionRequest, "id" | "missionId" | "eventId"> | null = null;
    let detail: string | null = null;
    let limitedCapability: string | null = null;
    let expectedResumeAt: string | null = null;
    if (reason === "provider_limit") {
      detail = text(input.detail ?? "", "provider_limit detail");
      limitedCapability = optionalText(input.limitedCapability);
      expectedResumeAt = optionalText(input.expectedResumeAt);
      if (expectedResumeAt && Number.isNaN(Date.parse(expectedResumeAt))) {
        throw new ValidationError(`expectedResumeAt must be a date and time: ${expectedResumeAt}`);
      }
    } else {
      detail = optionalText(input.detail);
      attention = Object.freeze({
        waitReason: reason,
        question: text(input.question ?? "", "Attention Request question"),
        rationale: text(input.rationale ?? "", "Attention Request rationale (why)"),
        options: Object.freeze(
          (input.options ?? []).map((entry) =>
            Object.freeze({
              option: text(entry.option, "Option"),
              consequence: optionalText(entry.consequence ?? undefined),
            }),
          ),
        ),
        response: null,
        decision: null,
        responderId: null,
        answeredAt: null,
      });
    }
    return this.transition(
      input.missionId,
      input.actorId,
      "Waiting",
      "waiting",
      (mission, event) => {
        if (mission.state !== "running") throw invalid(mission, "waiting");
        return {
          waitReason: reason,
          waitDetail: detail,
          limitedCapability,
          expectedResumeAt,
          payload: {
            detail,
            limitedCapability,
            expectedResumeAt,
            ...(attention ? { question: attention.question } : {}),
          },
          attentionRequest: attention
            ? Object.freeze({
                ...attention,
                id: this.ids.next() as AttentionRequestId,
                missionId: mission.id,
                eventId: event,
              })
            : undefined,
        };
      },
    );
  }

  /** Human only. Records the answer; the Mission stays waiting until it is resumed. */
  public answerAttentionRequest(input: {
    missionId: MissionId;
    actorId: string;
    response: string;
    decision?: "approve" | "reject";
    evidence?: readonly ProjectQualifiedEvidenceId[];
  }): Promise<Mission> {
    const response = text(input.response, "Response");
    return this.transition(
      input.missionId,
      input.actorId,
      "AttentionAnswered",
      "waiting",
      (mission, _event, answeredAt) => {
        requireHuman(input.actorId, "answer an Attention Request");
        const request = mission.attentionRequest;
        if (mission.state !== "waiting" || !request) {
          throw new ValidationError("The Mission is not waiting for a human answer");
        }
        if (request.answeredAt) {
          throw new ValidationError("The Attention Request was already answered");
        }
        if (request.waitReason === "needs_approval" && !input.decision) {
          throw new ValidationError("needs_approval requires a decision: approve or reject");
        }
        if (request.waitReason !== "needs_approval" && input.decision) {
          throw new ValidationError(
            "A decision (approve or reject) only applies to needs_approval",
          );
        }
        return {
          payload: { response, decision: input.decision ?? null },
          evidence: input.evidence,
          answer: {
            attentionRequestId: request.id,
            response,
            decision: input.decision ?? null,
            responderId: input.actorId.trim(),
            answeredAt,
          },
        };
      },
    );
  }

  public resumeMission(input: { missionId: MissionId; actorId: string }): Promise<Mission> {
    return this.transition(input.missionId, input.actorId, "Resumed", "running", (mission) => {
      if (mission.state === "paused") {
        requireHuman(input.actorId, "resume a paused Mission");
      } else if (mission.state === "waiting") {
        if (mission.waitReason !== "provider_limit" && !mission.attentionRequest?.answeredAt) {
          throw new ValidationError(
            `The Mission waits for a human (${mission.waitReason}); answer the Attention Request first`,
          );
        }
      } else {
        throw invalid(mission, "running");
      }
      return clearedWait();
    });
  }

  public pauseMission(input: { missionId: MissionId; actorId: string; reason?: string }) {
    return this.transition(input.missionId, input.actorId, "Paused", "paused", (mission) => {
      requireHuman(input.actorId, "pause a Mission");
      if (mission.state !== "running" && mission.state !== "waiting") {
        throw invalid(mission, "paused");
      }
      return { ...clearedWait(), reason: optionalText(input.reason) };
    });
  }

  public cancelMission(input: { missionId: MissionId; actorId: string; reason: string }) {
    const reason = text(input.reason, "Cancellation reason");
    return this.transition(input.missionId, input.actorId, "Cancelled", "cancelled", (mission) => {
      requireHuman(input.actorId, "cancel a Mission");
      if (TERMINAL_MISSION_STATES.includes(mission.state)) throw invalid(mission, "cancelled");
      return { ...clearedWait(), reason };
    });
  }

  public async completeMission(input: FinishMissionInput): Promise<Mission> {
    const outcome = await this.outcome(input, "Completed");
    return this.transition(input.missionId, input.actorId, "Completed", "completed", (mission) => {
      if (mission.state !== "running") throw invalid(mission, "completed");
      this.assertOwnProposals(mission, outcome.proposals);
      return { ...clearedWait(), outcome, evidence: input.evidence };
    });
  }

  public async failMission(input: FinishMissionInput): Promise<Mission> {
    const outcome = await this.outcome(input, "Failed");
    return this.transition(input.missionId, input.actorId, "Failed", "failed", (mission) => {
      if (mission.state !== "running" && mission.state !== "waiting") {
        throw invalid(mission, "failed");
      }
      this.assertOwnProposals(mission, outcome.proposals);
      return { ...clearedWait(), outcome, reason: outcome.summary, evidence: input.evidence };
    });
  }

  public getMission(input: { missionId: MissionId }): Promise<Mission | null> {
    return this.store.getMission(input);
  }

  public listMissions(input: {
    projectId?: ProjectId;
    states?: readonly MissionState[];
    waitReasons?: readonly WaitReason[];
  }): Promise<readonly Mission[]> {
    return this.store.listMissions(input);
  }

  public getMissionEvents(input: { missionId: MissionId }): Promise<readonly MissionEvent[]> {
    return this.store.getMissionEvents(input);
  }

  private async outcome(
    input: FinishMissionInput,
    kind: "Completed" | "Failed",
  ): Promise<
    Omit<MissionOutcome, "proposals"> & {
      readonly proposals: readonly { projectId: ProjectId; proposalId: ProposalId }[];
    }
  > {
    const mission = await this.require(input.missionId);
    const proposals = unique(input.proposalIds ?? []).map((proposalId) =>
      Object.freeze({ projectId: mission.ownerProjectId, proposalId }),
    );
    const missing = await this.store.missingMissionReferences({
      projectIds: [],
      nodes: [],
      plans: [],
      proposals,
    });
    if (missing.length > 0) {
      throw new ValidationError(
        `Outcome Proposals must exist in the owning Project: ${missing.join(", ")}`,
      );
    }
    return Object.freeze({
      kind,
      summary: text(input.summary, kind === "Completed" ? "Outcome summary" : "Failure reason"),
      outputs: Object.freeze((input.outputs ?? []).map((value) => text(value, "Output"))),
      validations: Object.freeze(
        (input.validations ?? []).map((value) => text(value, "Validation")),
      ),
      decisions: Object.freeze((input.decisions ?? []).map((value) => text(value, "Decision"))),
      proposals: Object.freeze(proposals),
      logReferences: Object.freeze((input.logReferences ?? []).map(parseLogReference)),
      recordedBy: text(input.actorId, "Actor"),
      recordedAt: this.clock.now(),
    });
  }

  private assertOwnProposals(
    mission: Mission,
    proposals: readonly { projectId: ProjectId }[],
  ): void {
    if (proposals.some((entry) => entry.projectId !== mission.ownerProjectId)) {
      throw new ValidationError("Outcome Proposals must belong to the owning Project");
    }
  }

  private async transition(
    missionId: MissionId,
    actorIdInput: string,
    type: MissionEventType,
    newState: MissionState,
    plan: (
      mission: Mission,
      eventId: MissionEventId,
      occurredAt: string,
    ) => Partial<MissionRowChange> & {
      readonly payload?: Record<string, unknown> | undefined;
      readonly reason?: string | null | undefined;
      readonly evidence?: readonly ProjectQualifiedEvidenceId[] | undefined;
      readonly attentionRequest?: AttentionRequest | undefined;
      readonly answer?: Parameters<MissionStore["applyMissionChange"]>[0]["answer"] | undefined;
      readonly outcome?: Parameters<MissionStore["applyMissionChange"]>[0]["outcome"] | undefined;
    },
  ): Promise<Mission> {
    const actorId = text(actorIdInput, "Actor");
    const mission = await this.require(missionId);
    if (mission.state !== newState && !MISSION_TRANSITIONS[mission.state].includes(newState)) {
      throw invalid(mission, newState);
    }
    const occurredAt = this.clock.now();
    const eventId = this.ids.next() as MissionEventId;
    const planned = plan(mission, eventId, occurredAt);
    const change: MissionRowChange = Object.freeze({
      state: newState,
      waitReason: planned.waitReason === undefined ? mission.waitReason : planned.waitReason,
      waitDetail: planned.waitDetail === undefined ? mission.waitDetail : planned.waitDetail,
      limitedCapability:
        planned.limitedCapability === undefined
          ? mission.limitedCapability
          : planned.limitedCapability,
      expectedResumeAt:
        planned.expectedResumeAt === undefined
          ? mission.expectedResumeAt
          : planned.expectedResumeAt,
      currentActivity:
        planned.currentActivity === undefined ? mission.currentActivity : planned.currentActivity,
      updatedAt: occurredAt,
    });
    await this.store.applyMissionChange({
      missionId,
      expectedSequence: mission.sequence,
      change,
      event: this.event({
        id: eventId,
        missionId,
        sequence: mission.sequence + 1,
        type,
        previousState: mission.state,
        newState,
        waitReason: change.waitReason,
        actorId,
        occurredAt,
        reason: planned.reason ?? null,
        payload: planned.payload ?? {},
        evidence: planned.evidence ?? [],
      }),
      ...(planned.attentionRequest ? { attentionRequest: planned.attentionRequest } : {}),
      ...(planned.answer ? { answer: planned.answer } : {}),
      ...(planned.outcome ? { outcome: planned.outcome } : {}),
    });
    return this.require(missionId);
  }

  private event(input: {
    id?: MissionEventId;
    missionId: MissionId;
    sequence: number;
    type: MissionEventType;
    previousState: MissionState | null;
    newState: MissionState;
    waitReason?: WaitReason | null;
    actorId: string;
    occurredAt: string;
    reason?: string | null;
    payload: Record<string, unknown>;
    evidence?: readonly ProjectQualifiedEvidenceId[];
  }): MissionEvent {
    return Object.freeze({
      id: input.id ?? (this.ids.next() as MissionEventId),
      missionId: input.missionId,
      sequence: input.sequence,
      type: input.type,
      previousState: input.previousState,
      newState: input.newState,
      waitReason: input.waitReason ?? null,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      reason: input.reason ?? null,
      payload: Object.freeze({ ...input.payload }),
      evidence: Object.freeze([...(input.evidence ?? [])]),
    });
  }

  private async require(missionId: MissionId): Promise<Mission> {
    const mission = await this.store.getMission({ missionId });
    if (!mission) throw new NotFoundError(`Mission ${missionId} was not found`);
    return mission;
  }
}

function clearedWait(): Partial<MissionRowChange> {
  return { waitReason: null, waitDetail: null, limitedCapability: null, expectedResumeAt: null };
}

function invalid(mission: Mission, target: MissionState): ValidationError {
  return new ValidationError(
    `Mission "${mission.title}" cannot go from ${mission.state} to ${target}`,
  );
}

function requireHuman(actorId: string, action: string): void {
  if (isAgentActorId(actorId.trim())) {
    throw new ValidationError(`Only a human may ${action}; "${actorId.trim()}" is an agent`);
  }
}

function text(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new ValidationError(`${field} must not be empty`);
  return result;
}

function optionalText(value: string | undefined | null): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
