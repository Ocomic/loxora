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
export type RollbackEventId = Brand<string, "RollbackEventId">;
export type RevisionRelationshipId = Brand<string, "RevisionRelationshipId">;
export type CrossProjectRelationshipProposalId = Brand<
  string,
  "CrossProjectRelationshipProposalId"
>;
export type CrossProjectRelationshipReviewDecisionId = Brand<
  string,
  "CrossProjectRelationshipReviewDecisionId"
>;
export type CrossProjectRelationshipId = Brand<string, "CrossProjectRelationshipId">;
export type ImpactAssessmentId = Brand<string, "ImpactAssessmentId">;
export type PlannedKnowledgeId = Brand<string, "PlannedKnowledgeId">;
export type Scope = Brand<string, "Scope">;

export type ProposalStatus = "Submitted" | "Accepted" | "Rejected";
export type ReviewDecisionKind = "Accepted" | "Rejected";
export type ProposalKind = "Initial" | "Successor" | "Restoration";
export type RevisionRole = ProposalKind;
export type RevisionRelationshipType =
  | "DirectPredecessor"
  | "Supersedes"
  | "RestoredFrom"
  | "Reverts";
export type HistoryClassification =
  | "CurrentCanonical"
  | "Historical"
  | "Superseded"
  | "Reverted"
  | "RestorationSource";
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
  | "ProposalRejected"
  | "SuccessorProposalSubmitted"
  | "SuccessorProposalAccepted"
  | "SuccessorProposalRejected"
  | "RevisionSuperseded"
  | "CurrentRevisionChanged"
  | "RollbackRecorded"
  | "RestorationProposalSubmitted"
  | "RestorationProposalAccepted"
  | "RestorationProposalRejected"
  | "RestorationRevisionCreated"
  | "NavigationProjectionRebuilt"
  | "NavigationOrphansDetected"
  | "NavigationOrphansResolved"
  | "CrossProjectRelationshipProposed"
  | "CrossProjectRelationshipReviewDecisionRecorded"
  | "CrossProjectRelationshipAccepted"
  | "CrossProjectRelationshipRejected"
  | "ImpactAssessmentCreated"
  | "PlannedKnowledgeCreated";

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly purpose: string;
  readonly createdAt: string;
}

export interface KnowledgeSpace {
  readonly id: SpaceId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
}

export interface KnowledgeCollection {
  readonly id: CollectionId;
  readonly projectId: ProjectId;
  readonly spaceId: SpaceId;
  readonly name: string;
  readonly description: string;
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
  readonly kind: ProposalKind;
  readonly changeReason: string | null;
  readonly expectedPredecessorRevisionId: RevisionId | null;
  readonly rollbackEventId: RollbackEventId | null;
  readonly restorationSourceRevisionId: RevisionId | null;
}

export interface RollbackEvent {
  readonly id: RollbackEventId;
  readonly projectId: ProjectId;
  readonly nodeId: NodeId;
  readonly scope: Scope;
  readonly revertedRevisionId: RevisionId;
  readonly semanticSourceRevisionId: RevisionId;
  readonly actorId: string;
  readonly reason: string;
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly recordedAt: string;
  readonly correlationId: CorrelationId;
}

export interface RevisionRelationship {
  readonly id: RevisionRelationshipId;
  readonly projectId: ProjectId;
  readonly nodeId: NodeId;
  readonly scope: Scope;
  readonly sourceRevisionId: RevisionId;
  readonly targetRevisionId: RevisionId;
  readonly type: RevisionRelationshipType;
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly rollbackEventId: RollbackEventId | null;
  readonly createdAt: string;
  readonly correlationId: CorrelationId;
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
  readonly evidenceReferenceIds: readonly EvidenceReferenceId[];
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
  readonly revisionRole: RevisionRole;
  readonly incomingRelationships: readonly RevisionRelationship[];
  readonly outgoingRelationships: readonly RevisionRelationship[];
  readonly rollbackEvent: RollbackEvent | null;
  readonly navigationPath: NavigationPath;
}

export interface KnowledgeHistoryEntry {
  readonly revision: KnowledgeRevision;
  readonly revisionRole: RevisionRole;
  readonly classifications: readonly HistoryClassification[];
  readonly isCurrent: boolean;
  readonly proposal: KnowledgeProposal;
  readonly changeReason: string;
  readonly reviewDecision: ReviewDecision;
  readonly evidence: readonly EvidenceReference[];
  readonly sources: readonly SourceReference[];
  readonly incomingRelationships: readonly RevisionRelationship[];
  readonly outgoingRelationships: readonly RevisionRelationship[];
  readonly directPredecessorRevisionId: RevisionId | null;
  readonly rollbackEvent: RollbackEvent | null;
}

export interface KnowledgeHistory {
  readonly project: Project;
  readonly space: KnowledgeSpace;
  readonly collection: KnowledgeCollection;
  readonly node: KnowledgeNode;
  readonly scope: Scope;
  readonly currentRevisionId: RevisionId;
  readonly entries: readonly KnowledgeHistoryEntry[];
  readonly navigationPath: NavigationPath;
}

export type NavigationEntityKind =
  | "Project"
  | "Space"
  | "Collection"
  | "Node"
  | "Revision"
  | "Evidence"
  | "Source"
  | "Proposal"
  | "PlannedKnowledge";

export interface NavigationSegment {
  readonly kind: NavigationEntityKind;
  readonly id: string;
  readonly label: string;
}

export interface NavigationPath {
  readonly segments: readonly NavigationSegment[];
  readonly temporalView: "Current" | "Historical" | "Planned" | null;
}

export type ProjectionFreshness = "Fresh" | "Stale" | "Missing";
export type NavigationWarningCategory =
  | "DatabaseIntegrity"
  | "ProjectionOrphan"
  | "SemanticOrphan"
  | "Quality"
  | "ExternalReferenceGap";

export interface NavigationWarning {
  readonly category: NavigationWarningCategory;
  readonly code: string;
  readonly entityKind: NavigationEntityKind;
  readonly entityId: string;
  readonly detail: string;
  readonly path: NavigationPath | null;
}

export interface NavigationFreshness {
  readonly content: ProjectionFreshness;
  readonly activity: ProjectionFreshness;
  readonly fingerprintVersion: string;
  readonly projectionVersion: number;
  readonly rebuiltAt: string | null;
  readonly lastFailure: string | null;
}

export interface NavigationCounts {
  readonly collectionCount: number;
  readonly nodeCount: number;
  readonly currentNodeCount: number;
  readonly acceptedRevisionCount: number;
  readonly historicalRevisionCount: number;
  readonly nodesWithHistoryCount: number;
}

export interface NodeNavigationSummary {
  readonly node: KnowledgeNode;
  readonly path: NavigationPath;
  readonly currentPreview: string | null;
  readonly currentRevisionId: RevisionId | null;
  readonly latestAcceptedAt: string | null;
  readonly acceptedRevisionCount: number;
  readonly historicalRevisionCount: number;
  readonly hasHistory: boolean;
  readonly currentEvidenceCount: number;
  readonly currentSourceCount: number;
  readonly warnings: readonly NavigationWarning[];
}

export interface CollectionNavigationSummary extends NavigationCounts {
  readonly collection: KnowledgeCollection;
  readonly path: NavigationPath;
  readonly description: string;
  readonly warnings: readonly NavigationWarning[];
}

export interface SpaceNavigationSummary extends NavigationCounts {
  readonly space: KnowledgeSpace;
  readonly path: NavigationPath;
  readonly description: string;
  readonly warnings: readonly NavigationWarning[];
}

export interface ProjectMap extends NavigationCounts {
  readonly project: Project;
  readonly scope: Scope;
  readonly path: NavigationPath;
  readonly purpose: string;
  readonly spaces: readonly SpaceNavigationSummary[];
  readonly externalSources: readonly SourceReference[];
  readonly orphanCount: number;
  readonly warnings: readonly NavigationWarning[];
  readonly freshness: NavigationFreshness;
  readonly lastRelevantActivityAt: string | null;
  readonly outgoingDependencies: readonly CrossProjectDependencySummary[];
  readonly incomingDependents: readonly CrossProjectDependencySummary[];
  readonly relatedProjectIds: readonly ProjectId[];
  readonly plannedKnowledgeCount: number;
}

export interface CrossProjectDependencySummary {
  readonly relationshipId: CrossProjectRelationshipId;
  readonly direction: "DependsOn" | "DependedOnBy";
  readonly relatedProjectId: ProjectId | null;
  readonly inaccessibleReferenceId: string | null;
  readonly relationshipBindingFreshness: "Fresh" | "Stale";
  readonly assessmentFreshness: "Fresh" | "Stale" | null;
  readonly latestSeverity: "Low" | "Medium" | "High" | "Critical" | null;
  readonly visibility: "SharedBetweenProjects" | "Restricted";
  readonly endpointPath: NavigationPath | null;
  readonly warnings: readonly string[];
}

export interface SpaceNavigation {
  readonly summary: SpaceNavigationSummary;
  readonly collections: readonly CollectionNavigationSummary[];
  readonly freshness: NavigationFreshness;
}

export interface CollectionNavigation {
  readonly summary: CollectionNavigationSummary;
  readonly nodes: readonly NodeNavigationSummary[];
  readonly freshness: NavigationFreshness;
}

export interface NodeNavigation {
  readonly summary: NodeNavigationSummary;
  readonly freshness: NavigationFreshness;
}

export interface EvidenceBacklink {
  readonly proposalId: ProposalId | null;
  readonly plannedKnowledgeId: PlannedKnowledgeId | null;
  readonly revisionId: RevisionId | null;
  readonly temporalView: "Current" | "Historical" | "Planned" | null;
  readonly path: NavigationPath;
}

export interface EvidenceNavigation {
  readonly evidence: EvidenceReference;
  readonly source: SourceReference;
  readonly backlinks: readonly EvidenceBacklink[];
}

export interface SourceNavigation {
  readonly source: SourceReference;
  readonly evidence: readonly EvidenceNavigation[];
}

export interface NavigationHealth {
  readonly projectId: ProjectId;
  readonly scope: Scope;
  readonly warnings: readonly NavigationWarning[];
  readonly orphanCount: number;
  readonly freshness: NavigationFreshness;
}

export interface RebuildNavigationProjectionResult {
  readonly projectMap: ProjectMap;
  readonly generationId: string;
  readonly correlationId: CorrelationId;
}

export type ReviewKnowledgeProposalResult =
  | {
      readonly proposal: KnowledgeProposal;
      readonly reviewDecision: ReviewDecision;
      readonly revision: KnowledgeRevision;
      readonly correlationId: CorrelationId;
      readonly auditEvents: readonly AuditEvent[];
      readonly relationships: readonly RevisionRelationship[];
    }
  | {
      readonly proposal: KnowledgeProposal;
      readonly reviewDecision: ReviewDecision;
      readonly revision: null;
      readonly correlationId: CorrelationId;
      readonly auditEvents: readonly AuditEvent[];
      readonly relationships: readonly RevisionRelationship[];
    };

export interface RecordRollbackResult {
  readonly rollbackEvent: RollbackEvent;
  readonly auditEvent: AuditEvent;
  readonly correlationId: CorrelationId;
}

export const DEFAULT_SCOPE = "project" as Scope;
