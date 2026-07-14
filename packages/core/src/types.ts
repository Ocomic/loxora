export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProjectId = Brand<string, "ProjectId">;
export type SpaceId = Brand<string, "SpaceId">;
export type CollectionId = Brand<string, "CollectionId">;
export type NodeId = Brand<string, "NodeId">;
export type SourceReferenceId = Brand<string, "SourceReferenceId">;
export type EvidenceReferenceId = Brand<string, "EvidenceReferenceId">;
export type ProposalId = Brand<string, "ProposalId">;
export type ReviewDecisionId = Brand<string, "ReviewDecisionId">;
export type RevisionId = Brand<string, "RevisionId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type Scope = Brand<string, "Scope">;

export type ProposalStatus = "Submitted" | "Accepted" | "Rejected";
export type ReviewDecisionKind = "Accepted" | "Rejected";
export type AuditEventType =
  | "ProjectCreated"
  | "KnowledgeSpaceCreated"
  | "KnowledgeCollectionCreated"
  | "SourceReferenceRegistered"
  | "EvidenceReferenceRegistered"
  | "ProposalSubmitted"
  | "ReviewDecisionRecorded"
  | "KnowledgeNodeCreated"
  | "KnowledgeRevisionCreated"
  | "CurrentRevisionAssigned"
  | "ProposalAccepted"
  | "ProposalRejected";

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly createdAt: string;
}

export interface KnowledgeSpace {
  readonly id: SpaceId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly createdAt: string;
}

export interface KnowledgeCollection {
  readonly id: CollectionId;
  readonly projectId: ProjectId;
  readonly spaceId: SpaceId;
  readonly name: string;
  readonly createdAt: string;
}

export interface KnowledgeNode {
  readonly id: NodeId;
  readonly projectId: ProjectId;
  readonly spaceId: SpaceId;
  readonly collectionId: CollectionId;
  readonly title: string;
  readonly createdAt: string;
}

export interface SourceReference {
  readonly id: SourceReferenceId;
  readonly projectId: ProjectId;
  readonly kind: string;
  readonly locator: string;
  readonly title: string;
  readonly createdAt: string;
}

export interface EvidenceReference {
  readonly id: EvidenceReferenceId;
  readonly projectId: ProjectId;
  readonly sourceReferenceId: SourceReferenceId;
  readonly summary: string;
  readonly locator: string;
  readonly createdAt: string;
}

export interface KnowledgeProposal {
  readonly id: ProposalId;
  readonly projectId: ProjectId;
  readonly spaceId: SpaceId;
  readonly collectionId: CollectionId;
  readonly proposedNodeId: NodeId;
  readonly proposedNodeTitle: string;
  readonly proposedContent: string;
  readonly sourceReferenceIds: readonly SourceReferenceId[];
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly proposerId: string;
  readonly createdAt: string;
  readonly scope: Scope;
  readonly status: ProposalStatus;
}

export interface ReviewDecision {
  readonly id: ReviewDecisionId;
  readonly proposalId: ProposalId;
  readonly projectId: ProjectId;
  readonly reviewerId: string;
  readonly decision: ReviewDecisionKind;
  readonly reason: string;
  readonly decidedAt: string;
  readonly scope: Scope;
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly correlationId: CorrelationId;
}

export interface KnowledgeRevision {
  readonly id: RevisionId;
  readonly projectId: ProjectId;
  readonly nodeId: NodeId;
  readonly scope: Scope;
  readonly content: string;
  readonly proposalId: ProposalId;
  readonly reviewDecisionId: ReviewDecisionId;
  readonly proposerId: string;
  readonly reviewerId: string;
  readonly acceptedAt: string;
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly correlationId: CorrelationId;
}

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly projectId: ProjectId;
  readonly type: AuditEventType;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly correlationId: CorrelationId;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CurrentKnowledge {
  readonly project: Project;
  readonly space: KnowledgeSpace;
  readonly collection: KnowledgeCollection;
  readonly node: KnowledgeNode;
  readonly revision: KnowledgeRevision;
  readonly lifecycleState: "Canonical";
  readonly temporalClassification: "Current";
  readonly sources: readonly SourceReference[];
  readonly evidence: readonly EvidenceReference[];
  readonly proposal: KnowledgeProposal;
  readonly reviewDecision: ReviewDecision;
}

export type ReviewKnowledgeProposalResult =
  | {
      readonly proposal: KnowledgeProposal;
      readonly reviewDecision: ReviewDecision;
      readonly revision: KnowledgeRevision;
      readonly correlationId: CorrelationId;
      readonly auditEvents: readonly AuditEvent[];
    }
  | {
      readonly proposal: KnowledgeProposal;
      readonly reviewDecision: ReviewDecision;
      readonly revision: null;
      readonly correlationId: CorrelationId;
      readonly auditEvents: readonly AuditEvent[];
    };

export const DEFAULT_SCOPE = "project" as Scope;
