import { randomUUID } from "node:crypto";
import type {
  CrossProjectRelationshipProposal,
  ProjectQualifiedEvidenceId,
} from "./cross-project.js";
import { NotFoundError, ValidationError } from "./errors.js";
import type { Clock, IdGenerator } from "./ports.js";
import type {
  AuditEvent,
  CorrelationId,
  CrossProjectRelationshipProposalId,
  EvidenceReference,
  KnowledgeProposal,
  NavigationPath,
  NodeId,
  PlannedKnowledgeId,
  PlannedKnowledgeRevisionDecisionId,
  PlannedKnowledgeRevisionId,
  ProjectId,
  ProposalId,
  RevisionId,
  Scope,
  SourceReference,
} from "./types.js";
import { DEFAULT_SCOPE } from "./types.js";

export type PlannedKnowledgeStatus =
  | "Proposed"
  | "Deferred"
  | "Ready"
  | "InProgress"
  | "Completed"
  | "Cancelled";

export const PLANNED_KNOWLEDGE_STATUSES: readonly PlannedKnowledgeStatus[] = Object.freeze([
  "Proposed",
  "Deferred",
  "Ready",
  "InProgress",
  "Completed",
  "Cancelled",
]);

/** Statuses that close a plan. Setting or leaving them needs a reviewer (ADR-006). */
export const CLOSED_PLAN_STATUSES: readonly PlannedKnowledgeStatus[] = Object.freeze([
  "Completed",
  "Cancelled",
]);

export interface ProjectQualifiedNodeId {
  readonly projectId: ProjectId;
  readonly nodeId: NodeId;
}

export interface ProjectQualifiedRevisionId {
  readonly projectId: ProjectId;
  readonly revisionId: RevisionId;
}

export interface PlannedKnowledge {
  readonly id: PlannedKnowledgeId;
  readonly ownerProjectId: ProjectId;
  readonly relatedProjectId: ProjectId | null;
  readonly relatedNodes: readonly ProjectQualifiedNodeId[];
  readonly title: string;
  readonly description: string;
  readonly status: PlannedKnowledgeStatus;
  readonly reason: string;
  readonly blockingCondition: string;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly authorId: string;
  readonly createdAt: string;
  readonly scope: Scope;
  readonly relatedRevision: ProjectQualifiedRevisionId | null;
  /** Number of the effective plan revision; 1 is the creation record (ADR-006). */
  readonly revisionNumber: number;
  readonly revisedBy: string;
  readonly revisedAt: string;
  readonly navigationPaths: readonly NavigationPath[];
  readonly sources: readonly SourceReference[];
  readonly evidenceReferences: readonly EvidenceReference[];
}

export interface CreatePlannedKnowledgeInput {
  readonly id?: PlannedKnowledgeId;
  readonly ownerProjectId: ProjectId;
  readonly relatedProjectId?: ProjectId;
  readonly relatedNodes: readonly ProjectQualifiedNodeId[];
  readonly title: string;
  readonly description: string;
  readonly status: PlannedKnowledgeStatus;
  readonly reason: string;
  readonly blockingCondition: string;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly authorId: string;
  readonly scope?: Scope;
  readonly relatedRevision?: ProjectQualifiedRevisionId;
}

/** The substantive, revisable fields of a plan (ADR-006, section 1). */
export interface PlannedKnowledgeState {
  readonly title: string;
  readonly description: string;
  readonly status: PlannedKnowledgeStatus;
  readonly reason: string;
  readonly blockingCondition: string;
  readonly relatedProjectId: ProjectId | null;
  readonly relatedRevision: ProjectQualifiedRevisionId | null;
  readonly relatedNodes: readonly ProjectQualifiedNodeId[];
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
}

export type PlannedKnowledgeField = keyof PlannedKnowledgeState;

export const PLANNED_KNOWLEDGE_FIELDS: readonly PlannedKnowledgeField[] = Object.freeze([
  "title",
  "description",
  "status",
  "reason",
  "blockingCondition",
  "relatedProjectId",
  "relatedRevision",
  "relatedNodes",
  "evidence",
]);

export type PlannedKnowledgeRevisionKind = "Revision" | "Proposal";

export interface PlannedKnowledgeRevisionDecision {
  readonly id: PlannedKnowledgeRevisionDecisionId;
  readonly proposalId: PlannedKnowledgeRevisionId;
  readonly ownerProjectId: ProjectId;
  readonly reviewerId: string;
  readonly decision: "Accepted" | "Rejected";
  readonly reason: string;
  readonly decidedAt: string;
  readonly resultingRevisionId: PlannedKnowledgeRevisionId | null;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
}

/**
 * A plan revision (kind Revision, number 2 or higher) or a plan revision proposal
 * (kind Proposal, no number until a reviewer accepts it as a new Revision).
 */
export interface PlannedKnowledgeRevision {
  readonly id: PlannedKnowledgeRevisionId;
  readonly plannedKnowledgeId: PlannedKnowledgeId;
  readonly ownerProjectId: ProjectId;
  readonly kind: PlannedKnowledgeRevisionKind;
  readonly revisionNumber: number | null;
  readonly baseRevisionNumber: number;
  readonly state: PlannedKnowledgeState;
  readonly changedFields: readonly PlannedKnowledgeField[];
  readonly changeReason: string;
  readonly authorId: string;
  readonly createdAt: string;
  readonly sourceProposalId: PlannedKnowledgeRevisionId | null;
}

export interface PlannedKnowledgeHistoryEntry {
  readonly kind: PlannedKnowledgeRevisionKind;
  /** Revision 1 has no id; it is the creation record of the plan. */
  readonly id: PlannedKnowledgeRevisionId | null;
  readonly revisionNumber: number | null;
  readonly baseRevisionNumber: number | null;
  readonly state: PlannedKnowledgeState;
  readonly changedFields: readonly PlannedKnowledgeField[];
  readonly changeReason: string | null;
  readonly authorId: string;
  readonly createdAt: string;
  readonly sourceProposalId: PlannedKnowledgeRevisionId | null;
  readonly isEffective: boolean;
  readonly decision: PlannedKnowledgeRevisionDecision | null;
}

export interface PlannedKnowledgeHistory {
  readonly plan: PlannedKnowledge;
  readonly entries: readonly PlannedKnowledgeHistoryEntry[];
}

/** Requested changes; omitted fields stay as in the effective revision. */
export interface PlannedKnowledgeChanges {
  readonly title?: string;
  readonly description?: string;
  readonly status?: PlannedKnowledgeStatus;
  readonly reason?: string;
  readonly blockingCondition?: string;
  /** `null` removes the related Project. */
  readonly relatedProjectId?: ProjectId | null;
  readonly addNodes?: readonly ProjectQualifiedNodeId[];
  readonly removeNodes?: readonly ProjectQualifiedNodeId[];
  readonly addEvidence?: readonly ProjectQualifiedEvidenceId[];
  readonly removeEvidence?: readonly ProjectQualifiedEvidenceId[];
}

export interface RevisePlannedKnowledgeInput {
  readonly ownerProjectId: ProjectId;
  readonly plannedKnowledgeId: PlannedKnowledgeId;
  readonly changes: PlannedKnowledgeChanges;
  readonly changeReason: string;
  readonly actorId: string;
}

export type RevisePlannedKnowledgeResult =
  | { readonly outcome: "Revised"; readonly revision: PlannedKnowledgeRevision }
  | { readonly outcome: "Proposed"; readonly proposal: PlannedKnowledgeRevision };

export interface ReviewPlannedKnowledgeRevisionInput {
  readonly ownerProjectId: ProjectId;
  readonly proposalId: PlannedKnowledgeRevisionId;
  readonly reviewerId: string;
  readonly decision: "Accepted" | "Rejected";
  readonly reason: string;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
}

export interface ReviewPlannedKnowledgeRevisionResult {
  readonly decision: PlannedKnowledgeRevisionDecision;
  readonly revision: PlannedKnowledgeRevision | null;
}

/** Decides who may close or reopen plans and review plan revision proposals. */
export interface PlannedKnowledgePolicy {
  mayDecide(actorId: string): boolean;
}

/** Default policy: any actor that is not an `agent:` id. Adapters pass the workspace reviewers. */
export const DEFAULT_PLANNED_KNOWLEDGE_POLICY: PlannedKnowledgePolicy = Object.freeze({
  mayDecide: (actorId: string) => !actorId.startsWith("agent:"),
});

export interface PlannedKnowledgeStore {
  createPlannedKnowledge(item: PlannedKnowledge, auditEvent: AuditEvent): Promise<PlannedKnowledge>;
  getProjectPlans(input: {
    projectId: ProjectId;
    scope: Scope;
    nodeId?: NodeId;
    statuses?: readonly PlannedKnowledgeStatus[];
  }): Promise<readonly PlannedKnowledge[]>;
  getPlannedKnowledge(input: {
    ownerProjectId: ProjectId;
    plannedKnowledgeId: PlannedKnowledgeId;
  }): Promise<PlannedKnowledge | null>;
  /** Appends a Revision or Proposal. A Revision must have `expectedEffectiveRevisionNumber + 1`. */
  appendPlannedKnowledgeRevision(input: {
    revision: PlannedKnowledgeRevision;
    expectedEffectiveRevisionNumber: number;
    auditEvent: AuditEvent;
  }): Promise<PlannedKnowledgeRevision>;
  recordPlannedKnowledgeRevisionDecision(input: {
    decision: PlannedKnowledgeRevisionDecision;
    revision: PlannedKnowledgeRevision | null;
    expectedEffectiveRevisionNumber: number;
    auditEvent: AuditEvent;
  }): Promise<void>;
  getPlannedKnowledgeHistory(input: {
    ownerProjectId: ProjectId;
    plannedKnowledgeId: PlannedKnowledgeId;
  }): Promise<PlannedKnowledgeHistory | null>;
  getPlannedKnowledgeRevision(input: {
    ownerProjectId: ProjectId;
    revisionId: PlannedKnowledgeRevisionId;
  }): Promise<PlannedKnowledgeRevision | null>;
  /** Linked Nodes without accepted (Current) knowledge; links to them are refused (ADR-006, G5). */
  nodesWithoutCurrentKnowledge(input: {
    nodes: readonly ProjectQualifiedNodeId[];
    scope: Scope;
  }): Promise<readonly ProjectQualifiedNodeId[]>;
}

export interface PlannedKnowledgeRevisionProposalSummary {
  readonly proposal: PlannedKnowledgeRevision;
  readonly planTitle: string;
  readonly effectiveStatus: PlannedKnowledgeStatus;
}

export type ReviewInboxItem =
  | {
      readonly kind: "KnowledgeProposal";
      readonly id: ProposalId;
      readonly projectIds: readonly ProjectId[];
      readonly createdAt: string;
      readonly proposal: KnowledgeProposal;
      readonly relationshipProposal: null;
      readonly plannedRevisionProposal: null;
      readonly paths: readonly NavigationPath[];
      readonly evidence: readonly EvidenceReference[];
      readonly allowedDecisions: readonly ["Accepted", "Rejected"];
    }
  | {
      readonly kind: "CrossProjectRelationshipProposal";
      readonly id: CrossProjectRelationshipProposalId;
      readonly projectIds: readonly ProjectId[];
      readonly createdAt: string;
      readonly proposal: null;
      readonly relationshipProposal: CrossProjectRelationshipProposal;
      readonly plannedRevisionProposal: null;
      readonly paths: readonly NavigationPath[];
      readonly evidence: readonly EvidenceReference[];
      readonly allowedDecisions: readonly ["Accepted", "Rejected"];
    }
  | {
      readonly kind: "PlannedKnowledgeRevisionProposal";
      readonly id: PlannedKnowledgeRevisionId;
      readonly projectIds: readonly ProjectId[];
      readonly createdAt: string;
      readonly proposal: null;
      readonly relationshipProposal: null;
      readonly plannedRevisionProposal: PlannedKnowledgeRevisionProposalSummary;
      readonly paths: readonly NavigationPath[];
      readonly evidence: readonly EvidenceReference[];
      readonly allowedDecisions: readonly ["Accepted", "Rejected"];
    };

export interface ReviewInboxStore {
  getReviewInbox(input: {
    projectIds: readonly ProjectId[];
    scope: Scope;
  }): Promise<readonly ReviewInboxItem[]>;
}

const defaultIds: IdGenerator = { next: () => randomUUID() };
const defaultClock: Clock = { now: () => new Date().toISOString() };
const required = (value: string, field: string): string => {
  const result = value.trim();
  if (!result) throw new ValidationError(`${field} must not be empty`);
  return result;
};
const nodeKey = (node: ProjectQualifiedNodeId) => `${node.projectId}\u0000${node.nodeId}`;
const evidenceKey = (entry: ProjectQualifiedEvidenceId) =>
  `${entry.projectId}\u0000${entry.evidenceReferenceId}`;

export class PlannedKnowledgeService {
  public constructor(
    private readonly store: PlannedKnowledgeStore,
    private readonly ids: IdGenerator = defaultIds,
    private readonly clock: Clock = defaultClock,
    private readonly policy: PlannedKnowledgePolicy = DEFAULT_PLANNED_KNOWLEDGE_POLICY,
  ) {}

  public async createPlannedKnowledge(
    input: CreatePlannedKnowledgeInput,
  ): Promise<PlannedKnowledge> {
    const createdAt = this.clock.now();
    const id = input.id ?? (this.ids.next() as PlannedKnowledgeId);
    const correlationId = this.ids.next() as CorrelationId;
    const authorId = required(input.authorId, "Author");
    const item: PlannedKnowledge = Object.freeze({
      id,
      ownerProjectId: input.ownerProjectId,
      relatedProjectId: input.relatedProjectId ?? null,
      relatedNodes: Object.freeze([...input.relatedNodes]),
      title: required(input.title, "Planned title"),
      description: required(input.description, "Planned description"),
      status: status(input.status),
      reason: required(input.reason, "Planned reason"),
      blockingCondition: required(input.blockingCondition, "Blocking condition"),
      evidence: Object.freeze([...input.evidence]),
      authorId,
      createdAt,
      scope: input.scope ?? DEFAULT_SCOPE,
      relatedRevision: input.relatedRevision ?? null,
      revisionNumber: 1,
      revisedBy: authorId,
      revisedAt: createdAt,
      navigationPaths: Object.freeze([]),
      sources: Object.freeze([]),
      evidenceReferences: Object.freeze([]),
    });
    const audit: AuditEvent = Object.freeze({
      id: this.ids.next() as AuditEvent["id"],
      projectId: item.ownerProjectId,
      type: "PlannedKnowledgeCreated",
      aggregateType: "PlannedKnowledge",
      aggregateId: id,
      actorId: item.authorId,
      occurredAt: createdAt,
      correlationId,
      payload: Object.freeze({ status: item.status, relatedProjectId: item.relatedProjectId }),
      evidenceReferenceIds: ownEvidence(item.ownerProjectId, item.evidence),
    });
    return this.store.createPlannedKnowledge(item, audit);
  }

  /**
   * Applies substantive changes as a new plan revision (ADR-006). Closing a plan
   * (Completed, Cancelled) or changing a closed plan by an actor the policy does not
   * allow to decide creates a plan revision proposal for review instead.
   */
  public async revisePlannedKnowledge(
    input: RevisePlannedKnowledgeInput,
  ): Promise<RevisePlannedKnowledgeResult> {
    const actorId = required(input.actorId, "Actor");
    const changeReason = required(input.changeReason, "Change reason");
    const plan = await this.requirePlan(input.ownerProjectId, input.plannedKnowledgeId);
    const current = stateOf(plan);
    const next = applyChanges(current, input.changes, plan.ownerProjectId);
    const changedFields = diffStates(current, next);
    if (changedFields.length === 0) throw new ValidationError("The plan change changes nothing");
    await this.assertLinkableNodes(current, next, plan.scope);
    const closing = CLOSED_PLAN_STATUSES.includes(next.status) && next.status !== current.status;
    const reopening = CLOSED_PLAN_STATUSES.includes(current.status);
    const needsReview = (closing || reopening) && !this.policy.mayDecide(actorId);
    const createdAt = this.clock.now();
    const revision: PlannedKnowledgeRevision = Object.freeze({
      id: this.ids.next() as PlannedKnowledgeRevisionId,
      plannedKnowledgeId: plan.id,
      ownerProjectId: plan.ownerProjectId,
      kind: needsReview ? "Proposal" : "Revision",
      revisionNumber: needsReview ? null : plan.revisionNumber + 1,
      baseRevisionNumber: plan.revisionNumber,
      state: next,
      changedFields,
      changeReason,
      authorId: actorId,
      createdAt,
      sourceProposalId: null,
    });
    const auditEvent = this.audit({
      projectId: plan.ownerProjectId,
      type: needsReview ? "PlannedKnowledgeRevisionProposed" : "PlannedKnowledgeRevised",
      aggregateId: plan.id,
      actorId,
      occurredAt: createdAt,
      payload: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        changedFields,
        status: next.status,
        changeReason,
      },
      evidence: next.evidence,
    });
    const stored = await this.store.appendPlannedKnowledgeRevision({
      revision,
      expectedEffectiveRevisionNumber: plan.revisionNumber,
      auditEvent,
    });
    return needsReview
      ? Object.freeze({ outcome: "Proposed" as const, proposal: stored })
      : Object.freeze({ outcome: "Revised" as const, revision: stored });
  }

  /**
   * Accepts or rejects a plan revision proposal. On acceptance, the proposal's changed
   * fields apply on top of the then-effective revision; if one of them changed since the
   * proposal's base revision, acceptance fails and the proposal must be resubmitted.
   */
  public async reviewPlannedKnowledgeRevisionProposal(
    input: ReviewPlannedKnowledgeRevisionInput,
  ): Promise<ReviewPlannedKnowledgeRevisionResult> {
    const reviewerId = required(input.reviewerId, "Reviewer");
    if (!this.policy.mayDecide(reviewerId)) {
      throw new ValidationError(`Actor "${reviewerId}" may not review plan revision proposals`);
    }
    const reason = required(input.reason, "Review reason");
    const proposal = await this.store.getPlannedKnowledgeRevision({
      ownerProjectId: input.ownerProjectId,
      revisionId: input.proposalId,
    });
    if (!proposal || proposal.kind !== "Proposal") {
      throw new NotFoundError(`Plan revision proposal ${input.proposalId} was not found`);
    }
    const history = await this.store.getPlannedKnowledgeHistory({
      ownerProjectId: proposal.ownerProjectId,
      plannedKnowledgeId: proposal.plannedKnowledgeId,
    });
    if (!history) throw new NotFoundError(`Plan ${proposal.plannedKnowledgeId} was not found`);
    if (history.entries.some((entry) => entry.id === proposal.id && entry.decision)) {
      throw new ValidationError(`Plan revision proposal ${proposal.id} was already reviewed`);
    }
    const plan = history.plan;
    const decidedAt = this.clock.now();
    let revision: PlannedKnowledgeRevision | null = null;
    if (input.decision === "Accepted") {
      const base = history.entries.find(
        (entry) =>
          entry.kind === "Revision" && entry.revisionNumber === proposal.baseRevisionNumber,
      );
      if (!base) throw new ValidationError("The proposal's base revision was not found");
      const current = stateOf(plan);
      const stale = proposal.changedFields.filter(
        (field) => !sameValue(field, base.state, current),
      );
      if (stale.length > 0) {
        throw new ValidationError(
          `The plan changed since this proposal (${stale.join(", ")}); resubmit the proposal`,
        );
      }
      const next = { ...current } as Record<PlannedKnowledgeField, unknown>;
      for (const field of proposal.changedFields) next[field] = proposal.state[field];
      revision = Object.freeze({
        id: this.ids.next() as PlannedKnowledgeRevisionId,
        plannedKnowledgeId: plan.id,
        ownerProjectId: plan.ownerProjectId,
        kind: "Revision" as const,
        revisionNumber: plan.revisionNumber + 1,
        baseRevisionNumber: plan.revisionNumber,
        state: Object.freeze(next) as unknown as PlannedKnowledgeState,
        changedFields: proposal.changedFields,
        changeReason: proposal.changeReason,
        authorId: proposal.authorId,
        createdAt: decidedAt,
        sourceProposalId: proposal.id,
      });
    }
    const decision: PlannedKnowledgeRevisionDecision = Object.freeze({
      id: this.ids.next() as PlannedKnowledgeRevisionDecisionId,
      proposalId: proposal.id,
      ownerProjectId: plan.ownerProjectId,
      reviewerId,
      decision: input.decision,
      reason,
      decidedAt,
      resultingRevisionId: revision?.id ?? null,
      evidence: Object.freeze([...input.evidence]),
    });
    await this.store.recordPlannedKnowledgeRevisionDecision({
      decision,
      revision,
      expectedEffectiveRevisionNumber: plan.revisionNumber,
      auditEvent: this.audit({
        projectId: plan.ownerProjectId,
        type:
          input.decision === "Accepted"
            ? "PlannedKnowledgeRevisionAccepted"
            : "PlannedKnowledgeRevisionRejected",
        aggregateId: plan.id,
        actorId: reviewerId,
        occurredAt: decidedAt,
        payload: {
          proposalId: proposal.id,
          resultingRevisionId: revision?.id ?? null,
          revisionNumber: revision?.revisionNumber ?? null,
          reason,
        },
        evidence: input.evidence,
      }),
    });
    return Object.freeze({ decision, revision });
  }

  public getProjectPlans(input: {
    projectId: ProjectId;
    scope?: Scope;
    nodeId?: NodeId;
    statuses?: readonly PlannedKnowledgeStatus[];
  }): Promise<readonly PlannedKnowledge[]> {
    return this.store.getProjectPlans({ ...input, scope: input.scope ?? DEFAULT_SCOPE });
  }

  public getPlannedKnowledge(input: {
    ownerProjectId: ProjectId;
    plannedKnowledgeId: PlannedKnowledgeId;
  }): Promise<PlannedKnowledge | null> {
    return this.store.getPlannedKnowledge(input);
  }

  public getPlannedKnowledgeHistory(input: {
    ownerProjectId: ProjectId;
    plannedKnowledgeId: PlannedKnowledgeId;
  }): Promise<PlannedKnowledgeHistory | null> {
    return this.store.getPlannedKnowledgeHistory(input);
  }

  private async requirePlan(
    ownerProjectId: ProjectId,
    plannedKnowledgeId: PlannedKnowledgeId,
  ): Promise<PlannedKnowledge> {
    const plan = await this.store.getPlannedKnowledge({ ownerProjectId, plannedKnowledgeId });
    if (!plan) throw new NotFoundError(`Plan ${plannedKnowledgeId} was not found`);
    return plan;
  }

  private async assertLinkableNodes(
    current: PlannedKnowledgeState,
    next: PlannedKnowledgeState,
    scope: Scope,
  ): Promise<void> {
    const existing = new Set(current.relatedNodes.map(nodeKey));
    const added = next.relatedNodes.filter((node) => !existing.has(nodeKey(node)));
    if (added.length === 0) return;
    const pending = await this.store.nodesWithoutCurrentKnowledge({ nodes: added, scope });
    if (pending.length > 0) {
      throw new ValidationError(
        `Plans can only link Nodes with accepted knowledge; pending: ${pending.map((node) => node.nodeId).join(", ")}`,
      );
    }
  }

  private audit(input: {
    projectId: ProjectId;
    type: AuditEvent["type"];
    aggregateId: string;
    actorId: string;
    occurredAt: string;
    payload: Record<string, unknown>;
    evidence: readonly ProjectQualifiedEvidenceId[];
  }): AuditEvent {
    return Object.freeze({
      id: this.ids.next() as AuditEvent["id"],
      projectId: input.projectId,
      type: input.type,
      aggregateType: "PlannedKnowledge",
      aggregateId: input.aggregateId,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      correlationId: this.ids.next() as CorrelationId,
      payload: Object.freeze(input.payload),
      evidenceReferenceIds: ownEvidence(input.projectId, input.evidence),
    });
  }
}

export class ReviewInboxService {
  public constructor(private readonly store: ReviewInboxStore) {}
  public getReviewInbox(input: {
    projectIds: readonly ProjectId[];
    scope?: Scope;
  }): Promise<readonly ReviewInboxItem[]> {
    return this.store.getReviewInbox({ ...input, scope: input.scope ?? DEFAULT_SCOPE });
  }
}

/** The revisable state of the effective revision of `plan`. */
export function stateOf(plan: PlannedKnowledge): PlannedKnowledgeState {
  return Object.freeze({
    title: plan.title,
    description: plan.description,
    status: plan.status,
    reason: plan.reason,
    blockingCondition: plan.blockingCondition,
    relatedProjectId: plan.relatedProjectId,
    relatedRevision: plan.relatedRevision,
    relatedNodes: plan.relatedNodes,
    evidence: plan.evidence,
  });
}

function status(value: PlannedKnowledgeStatus): PlannedKnowledgeStatus {
  if (!PLANNED_KNOWLEDGE_STATUSES.includes(value)) {
    throw new ValidationError(`Unknown plan status: ${String(value)}`);
  }
  return value;
}

function ownEvidence(
  projectId: ProjectId,
  evidence: readonly ProjectQualifiedEvidenceId[],
): AuditEvent["evidenceReferenceIds"] {
  return Object.freeze(
    evidence
      .filter((entry) => entry.projectId === projectId)
      .map((entry) => entry.evidenceReferenceId),
  );
}

function applyChanges(
  current: PlannedKnowledgeState,
  changes: PlannedKnowledgeChanges,
  ownerProjectId: ProjectId,
): PlannedKnowledgeState {
  const relatedProjectId =
    changes.relatedProjectId === undefined ? current.relatedProjectId : changes.relatedProjectId;
  if (relatedProjectId === ownerProjectId) {
    throw new ValidationError("The related Project must differ from the owning Project");
  }
  const removeNodes = new Set((changes.removeNodes ?? []).map(nodeKey));
  const nodes = new Map<string, ProjectQualifiedNodeId>();
  for (const node of [...current.relatedNodes, ...(changes.addNodes ?? [])]) {
    if (!removeNodes.has(nodeKey(node))) nodes.set(nodeKey(node), Object.freeze({ ...node }));
  }
  const removeEvidence = new Set((changes.removeEvidence ?? []).map(evidenceKey));
  const evidence = new Map<string, ProjectQualifiedEvidenceId>();
  for (const entry of [...current.evidence, ...(changes.addEvidence ?? [])]) {
    if (!removeEvidence.has(evidenceKey(entry)))
      evidence.set(evidenceKey(entry), Object.freeze({ ...entry }));
  }
  const endpoints = new Set<string>([
    ownerProjectId,
    ...(relatedProjectId ? [relatedProjectId] : []),
  ]);
  for (const node of nodes.values()) {
    if (!endpoints.has(node.projectId)) {
      throw new ValidationError(`Node ${node.nodeId} is not in the owning or related Project`);
    }
  }
  for (const entry of evidence.values()) {
    if (!endpoints.has(entry.projectId)) {
      throw new ValidationError(
        `Evidence ${entry.evidenceReferenceId} is not in the owning or related Project`,
      );
    }
  }
  if (current.relatedRevision && !endpoints.has(current.relatedRevision.projectId)) {
    throw new ValidationError("The related Revision is not in the owning or related Project");
  }
  return Object.freeze({
    title: changes.title === undefined ? current.title : required(changes.title, "Planned title"),
    description:
      changes.description === undefined
        ? current.description
        : required(changes.description, "Planned description"),
    status: changes.status === undefined ? current.status : status(changes.status),
    reason:
      changes.reason === undefined ? current.reason : required(changes.reason, "Planned reason"),
    blockingCondition:
      changes.blockingCondition === undefined
        ? current.blockingCondition
        : required(changes.blockingCondition, "Blocking condition"),
    relatedProjectId,
    relatedRevision: current.relatedRevision,
    relatedNodes: Object.freeze([...nodes.values()].sort(compareBy(nodeKey))),
    evidence: Object.freeze([...evidence.values()].sort(compareBy(evidenceKey))),
  });
}

function diffStates(
  current: PlannedKnowledgeState,
  next: PlannedKnowledgeState,
): readonly PlannedKnowledgeField[] {
  return Object.freeze(
    PLANNED_KNOWLEDGE_FIELDS.filter((field) => !sameValue(field, current, next)),
  );
}

function sameValue(
  field: PlannedKnowledgeField,
  left: PlannedKnowledgeState,
  right: PlannedKnowledgeState,
): boolean {
  return canonical(field, left) === canonical(field, right);
}

function canonical(field: PlannedKnowledgeField, state: PlannedKnowledgeState): string {
  if (field === "relatedNodes") return state.relatedNodes.map(nodeKey).sort().join("\n");
  if (field === "evidence") return state.evidence.map(evidenceKey).sort().join("\n");
  if (field === "relatedRevision") {
    return state.relatedRevision
      ? `${state.relatedRevision.projectId}\u0000${state.relatedRevision.revisionId}`
      : "";
  }
  return String(state[field] ?? "");
}

function compareBy<T>(key: (value: T) => string): (left: T, right: T) => number {
  return (left, right) => (key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0);
}
