import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "./ports.js";
import type {
  AuditEvent,
  CorrelationId,
  CrossProjectRelationshipProposalId,
  EvidenceReference,
  NavigationPath,
  NodeId,
  PlannedKnowledgeId,
  ProjectId,
  ProposalId,
  RevisionId,
  Scope,
  SourceReference,
} from "./types.js";
import { DEFAULT_SCOPE } from "./types.js";
import type {
  CrossProjectRelationshipProposal,
  ProjectQualifiedEvidenceId,
} from "./cross-project.js";
import type { KnowledgeProposal } from "./types.js";
import { ValidationError } from "./errors.js";

export type PlannedKnowledgeStatus = "Proposed" | "Deferred" | "Ready" | "Completed" | "Cancelled";

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
}

export type ReviewInboxItem =
  | {
      readonly kind: "KnowledgeProposal";
      readonly id: ProposalId;
      readonly projectIds: readonly ProjectId[];
      readonly createdAt: string;
      readonly proposal: KnowledgeProposal;
      readonly relationshipProposal: null;
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

export class PlannedKnowledgeService {
  public constructor(
    private readonly store: PlannedKnowledgeStore,
    private readonly ids: IdGenerator = defaultIds,
    private readonly clock: Clock = defaultClock,
  ) {}

  public async createPlannedKnowledge(
    input: CreatePlannedKnowledgeInput,
  ): Promise<PlannedKnowledge> {
    const createdAt = this.clock.now();
    const id = input.id ?? (this.ids.next() as PlannedKnowledgeId);
    const correlationId = this.ids.next() as CorrelationId;
    const item: PlannedKnowledge = Object.freeze({
      id,
      ownerProjectId: input.ownerProjectId,
      relatedProjectId: input.relatedProjectId ?? null,
      relatedNodes: Object.freeze([...input.relatedNodes]),
      title: required(input.title, "Planned title"),
      description: required(input.description, "Planned description"),
      status: input.status,
      reason: required(input.reason, "Planned reason"),
      blockingCondition: required(input.blockingCondition, "Blocking condition"),
      evidence: Object.freeze([...input.evidence]),
      authorId: required(input.authorId, "Author"),
      createdAt,
      scope: input.scope ?? DEFAULT_SCOPE,
      relatedRevision: input.relatedRevision ?? null,
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
      evidenceReferenceIds: Object.freeze(
        item.evidence
          .filter((entry) => entry.projectId === item.ownerProjectId)
          .map((entry) => entry.evidenceReferenceId),
      ),
    });
    return this.store.createPlannedKnowledge(item, audit);
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
