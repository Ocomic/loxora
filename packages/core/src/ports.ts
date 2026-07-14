import type {
  AuditEvent,
  CollectionId,
  CorrelationId,
  CurrentKnowledge,
  EvidenceReference,
  EvidenceReferenceId,
  KnowledgeCollection,
  KnowledgeProposal,
  KnowledgeRevision,
  KnowledgeSpace,
  NodeId,
  Project,
  ProjectId,
  ProposalId,
  ReviewDecision,
  ReviewDecisionKind,
  ReviewKnowledgeProposalResult,
  Scope,
  SourceReference,
  SourceReferenceId,
  SpaceId,
} from "./types.js";

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  now(): string;
}

export interface ReviewTransactionInput {
  readonly proposalId: ProposalId;
  readonly projectId: ProjectId;
  readonly reviewerId: string;
  readonly decision: ReviewDecisionKind;
  readonly reason: string;
  readonly scope: Scope;
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly decidedAt: string;
  readonly reviewDecisionId: ReviewDecision["id"];
  readonly revisionId: KnowledgeRevision["id"] | null;
  readonly correlationId: CorrelationId;
  readonly auditEventIds: readonly AuditEvent["id"][];
}

export interface LifecycleStore {
  createProject(project: Project, auditEvent: AuditEvent): Promise<void>;
  createKnowledgeSpace(space: KnowledgeSpace, auditEvent: AuditEvent): Promise<void>;
  createKnowledgeCollection(collection: KnowledgeCollection, auditEvent: AuditEvent): Promise<void>;
  registerSourceReference(source: SourceReference, auditEvent: AuditEvent): Promise<void>;
  registerEvidenceReference(evidence: EvidenceReference, auditEvent: AuditEvent): Promise<void>;
  submitProposal(proposal: KnowledgeProposal, auditEvent: AuditEvent): Promise<void>;
  reviewProposal(input: ReviewTransactionInput): Promise<ReviewKnowledgeProposalResult>;
  getCurrentKnowledge(input: {
    readonly projectId: ProjectId;
    readonly nodeId: NodeId;
    readonly scope: Scope;
  }): Promise<CurrentKnowledge | null>;
  close(): Promise<void>;
}

export interface CreateProjectInput {
  readonly id?: ProjectId;
  readonly name: string;
  readonly actorId: string;
}

export interface CreateKnowledgeSpaceInput {
  readonly id?: SpaceId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly actorId: string;
}

export interface CreateKnowledgeCollectionInput {
  readonly id?: CollectionId;
  readonly projectId: ProjectId;
  readonly spaceId: SpaceId;
  readonly name: string;
  readonly actorId: string;
}

export interface RegisterSourceReferenceInput {
  readonly id?: SourceReferenceId;
  readonly projectId: ProjectId;
  readonly kind: string;
  readonly locator: string;
  readonly title: string;
  readonly actorId: string;
}

export interface RegisterEvidenceReferenceInput {
  readonly id?: EvidenceReferenceId;
  readonly projectId: ProjectId;
  readonly sourceReferenceId: SourceReferenceId;
  readonly summary: string;
  readonly locator: string;
  readonly actorId: string;
}

export interface SubmitKnowledgeProposalInput {
  readonly id?: ProposalId;
  readonly projectId: ProjectId;
  readonly spaceId: SpaceId;
  readonly collectionId: CollectionId;
  readonly proposedNodeId?: NodeId;
  readonly proposedNodeTitle: string;
  readonly proposedContent: string;
  readonly sourceReferenceIds: readonly SourceReferenceId[];
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly proposerId: string;
  readonly scope?: Scope;
}

export interface ReviewKnowledgeProposalInput {
  readonly proposalId: ProposalId;
  readonly projectId: ProjectId;
  readonly reviewerId: string;
  readonly decision: ReviewDecisionKind;
  readonly reason: string;
  readonly scope?: Scope;
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
}
