import { createHash, randomUUID } from "node:crypto";
import { ValidationError } from "./errors.js";
import type { Clock, IdGenerator } from "./ports.js";
import type {
  CorrelationId,
  CrossProjectRelationshipId,
  CrossProjectRelationshipProposalId,
  CrossProjectRelationshipReviewDecisionId,
  EvidenceReference,
  EvidenceReferenceId,
  ImpactAssessmentId,
  NavigationPath,
  NodeId,
  ProjectId,
  RevisionId,
  Scope,
  SourceReference,
} from "./types.js";
import { DEFAULT_SCOPE } from "./types.js";

export type RelationshipProposalStatus = "Submitted" | "Accepted" | "Rejected";
export type CrossProjectVisibility = "SharedBetweenProjects" | "Restricted";
export type RelationshipConfidence = "Low" | "Medium" | "High";
export type RelationshipBindingFreshness = "Fresh" | "Stale";
export type AssessmentFreshness = "Fresh" | "Stale";
export type ImpactSeverity = "Low" | "Medium" | "High" | "Critical";

export interface ProjectQualifiedEvidenceId {
  readonly projectId: ProjectId;
  readonly evidenceReferenceId: EvidenceReferenceId;
}

export interface CrossProjectEndpointBinding {
  readonly projectId: ProjectId;
  readonly nodeId: NodeId;
  readonly revisionId: RevisionId;
}

export interface CrossProjectRelationshipProposal {
  readonly id: CrossProjectRelationshipProposalId;
  readonly source: CrossProjectEndpointBinding;
  readonly target: CrossProjectEndpointBinding;
  readonly scope: Scope;
  readonly type: "DependsOn";
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly confidence: RelationshipConfidence;
  readonly reason: string;
  readonly visibility: CrossProjectVisibility;
  readonly proposerId: string;
  readonly proposedAt: string;
  readonly status: RelationshipProposalStatus;
  readonly correlationId: CorrelationId;
}

export interface CrossProjectRelationshipReviewDecision {
  readonly id: CrossProjectRelationshipReviewDecisionId;
  readonly proposalId: CrossProjectRelationshipProposalId;
  readonly decision: "Accepted" | "Rejected";
  readonly reviewerId: string;
  readonly reason: string;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly decidedAt: string;
  readonly correlationId: CorrelationId;
}

export interface CrossProjectRelationship {
  readonly id: CrossProjectRelationshipId;
  readonly proposalId: CrossProjectRelationshipProposalId;
  readonly reviewDecisionId: CrossProjectRelationshipReviewDecisionId;
  readonly source: CrossProjectEndpointBinding;
  readonly target: CrossProjectEndpointBinding;
  readonly scope: Scope;
  readonly type: "DependsOn";
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly confidence: RelationshipConfidence;
  readonly reason: string;
  readonly visibility: CrossProjectVisibility;
  readonly acceptedAt: string;
  readonly reviewerId: string;
  readonly correlationId: CorrelationId;
}

export interface StructuredImpactFacts {
  readonly changeCompatibility: "Compatible" | "PotentiallyBreaking" | "Breaking";
  readonly consumerRequirement: "Optional" | "Required";
  readonly operationalCriticality: "Normal" | "Critical";
  readonly observedFailure: boolean;
  readonly changeSummary: string;
  readonly consumerConstraint: string;
  readonly consequence: string;
}

export interface ImpactAssessment {
  readonly id: ImpactAssessmentId;
  readonly relationshipId: CrossProjectRelationshipId;
  readonly providerRevisionId: RevisionId;
  readonly consumerRevisionId: RevisionId;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly facts: StructuredImpactFacts;
  readonly severity: ImpactSeverity;
  readonly confidence: RelationshipConfidence;
  readonly severityEvaluatorVersion: typeof IMPACT_SEVERITY_EVALUATOR_VERSION;
  readonly basisFingerprintVersion: typeof IMPACT_BASIS_FINGERPRINT_VERSION;
  readonly basisFingerprint: string;
  readonly requestingActorId: string;
  readonly assessedAt: string;
  readonly correlationId: CorrelationId;
}

export interface ReadableProjects {
  readonly readableProjectIds: readonly ProjectId[];
  readonly revealRestrictedProjectIds?: boolean;
}

export interface CrossProjectEndpointView {
  readonly projectId: ProjectId | null;
  readonly inaccessibleReferenceId: string | null;
  readonly nodeId: NodeId | null;
  readonly revisionId: RevisionId | null;
  readonly temporalClassification: "Current" | "Historical" | null;
  readonly path: NavigationPath | null;
  readonly content: string | null;
  readonly inaccessible: boolean;
}

export interface ImpactPath {
  readonly relationship: CrossProjectRelationship;
  readonly canonicalLabel: "DependsOn";
  readonly reverseLabel: "DependedOnBy";
  readonly provider: CrossProjectEndpointView;
  readonly consumer: CrossProjectEndpointView;
  readonly selectedProviderRevisionId: RevisionId;
  readonly selectedConsumerRevisionId: RevisionId;
  readonly relationshipBindingFreshness: RelationshipBindingFreshness;
  readonly assessmentFreshness: AssessmentFreshness | null;
  readonly assessment: ImpactAssessment | null;
  readonly evidence: readonly EvidenceReference[];
  readonly sources: readonly SourceReference[];
  readonly warnings: readonly string[];
}

export interface ProjectDependencyResult {
  readonly relationship: CrossProjectRelationship;
  readonly direction: "Outgoing" | "Incoming";
  readonly relationshipBindingFreshness: RelationshipBindingFreshness;
  readonly assessmentFreshness: AssessmentFreshness | null;
  readonly assessment: ImpactAssessment | null;
  readonly path: ImpactPath;
}

export interface RelationshipReviewPolicy {
  mayAccept(reviewerId: string): boolean;
}

export interface RelationshipProposalTransactionInput {
  readonly proposal: CrossProjectRelationshipProposal;
  readonly auditEventIds: readonly string[];
}

export interface RelationshipReviewTransactionInput {
  readonly proposalId: CrossProjectRelationshipProposalId;
  readonly decisionId: CrossProjectRelationshipReviewDecisionId;
  readonly relationshipId: CrossProjectRelationshipId | null;
  readonly reviewerId: string;
  readonly decision: "Accepted" | "Rejected";
  readonly reason: string;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly decidedAt: string;
  readonly correlationId: CorrelationId;
  readonly auditEventIds: readonly string[];
}

export interface ImpactAssessmentTransactionInput {
  readonly assessment: ImpactAssessment;
  readonly auditEventIds: readonly string[];
}

export interface CrossProjectImpactStore {
  getCurrentEndpoint(input: {
    projectId: ProjectId;
    nodeId: NodeId;
    scope: Scope;
  }): Promise<CrossProjectEndpointBinding | null>;
  submitCrossProjectRelationshipProposal(
    input: RelationshipProposalTransactionInput,
  ): Promise<CrossProjectRelationshipProposal>;
  reviewCrossProjectRelationshipProposal(input: RelationshipReviewTransactionInput): Promise<{
    proposal: CrossProjectRelationshipProposal;
    decision: CrossProjectRelationshipReviewDecision;
    relationship: CrossProjectRelationship | null;
  }>;
  getCrossProjectRelationship(
    relationshipId: CrossProjectRelationshipId,
  ): Promise<CrossProjectRelationship | null>;
  createImpactAssessment(input: ImpactAssessmentTransactionInput): Promise<ImpactAssessment>;
  getProjectDependencies(input: {
    projectId: ProjectId;
    scope: Scope;
    direction: "Outgoing" | "Incoming" | "Both";
    access: ReadableProjects;
  }): Promise<readonly ProjectDependencyResult[]>;
  getRevisionImpact(input: {
    providerProjectId: ProjectId;
    providerNodeId: NodeId;
    providerRevisionId: RevisionId;
    scope: Scope;
    access: ReadableProjects;
  }): Promise<readonly ImpactPath[]>;
  getImpactPath(input: {
    assessmentId: ImpactAssessmentId;
    access: ReadableProjects;
  }): Promise<ImpactPath | null>;
}

export interface SubmitCrossProjectRelationshipProposalInput {
  readonly id?: CrossProjectRelationshipProposalId;
  readonly sourceProjectId: ProjectId;
  readonly sourceNodeId: NodeId;
  readonly targetProjectId: ProjectId;
  readonly targetNodeId: NodeId;
  readonly scope?: Scope;
  readonly evidence: readonly ProjectQualifiedEvidenceId[];
  readonly confidence: RelationshipConfidence;
  readonly reason: string;
  readonly visibility: CrossProjectVisibility;
  readonly proposerId: string;
}

export const IMPACT_SEVERITY_EVALUATOR_VERSION = "loxora-impact-severity-v1";
export const IMPACT_BASIS_FINGERPRINT_VERSION = "sha256-impact-assessment-basis-json-v1";

export class ImpactAssessmentBuilder {
  public severity(facts: StructuredImpactFacts): ImpactSeverity {
    if (
      facts.observedFailure &&
      facts.consumerRequirement === "Required" &&
      facts.operationalCriticality === "Critical"
    )
      return "Critical";
    if (
      (facts.observedFailure && facts.consumerRequirement === "Required") ||
      (facts.changeCompatibility === "Breaking" && facts.consumerRequirement === "Required")
    )
      return "High";
    if (
      (facts.changeCompatibility === "PotentiallyBreaking" &&
        facts.consumerRequirement === "Required") ||
      (facts.changeCompatibility === "Breaking" && facts.consumerRequirement === "Optional")
    )
      return "Medium";
    return "Low";
  }

  public fingerprint(input: {
    relationshipId: CrossProjectRelationshipId;
    providerRevisionId: RevisionId;
    consumerRevisionId: RevisionId;
    facts: StructuredImpactFacts;
    evidence: readonly ProjectQualifiedEvidenceId[];
  }): string {
    const basis = {
      relationshipId: input.relationshipId,
      providerRevisionId: input.providerRevisionId,
      consumerRevisionId: input.consumerRevisionId,
      facts: normalizeFacts(input.facts),
      evidence: [...input.evidence]
        .map((item) => `${item.projectId}:${item.evidenceReferenceId}`)
        .sort(),
      severityEvaluatorVersion: IMPACT_SEVERITY_EVALUATOR_VERSION,
    };
    return createHash("sha256").update(stableJson(basis)).digest("hex");
  }
}

const defaultIds: IdGenerator = { next: () => randomUUID() };
const defaultClock: Clock = { now: () => new Date().toISOString() };

export class CrossProjectImpactService {
  public constructor(
    private readonly store: CrossProjectImpactStore,
    private readonly reviewPolicy: RelationshipReviewPolicy,
    private readonly idGenerator: IdGenerator = defaultIds,
    private readonly clock: Clock = defaultClock,
    private readonly assessmentBuilder = new ImpactAssessmentBuilder(),
  ) {}

  public async submitCrossProjectRelationshipProposal(
    input: SubmitCrossProjectRelationshipProposalInput,
  ): Promise<CrossProjectRelationshipProposal> {
    if (input.sourceProjectId === input.targetProjectId)
      throw new ValidationError("Cross-project endpoints must belong to different Projects");
    const scope = required(input.scope ?? DEFAULT_SCOPE, "Scope") as Scope;
    const [source, target] = await Promise.all([
      this.store.getCurrentEndpoint({
        projectId: input.sourceProjectId,
        nodeId: input.sourceNodeId,
        scope,
      }),
      this.store.getCurrentEndpoint({
        projectId: input.targetProjectId,
        nodeId: input.targetNodeId,
        scope,
      }),
    ]);
    if (!source || !target) throw new ValidationError("Both endpoints require Current knowledge");
    const proposedAt = this.clock.now();
    const proposal = freeze({
      id: input.id ?? (this.idGenerator.next() as CrossProjectRelationshipProposalId),
      source,
      target,
      scope,
      type: "DependsOn" as const,
      evidence: qualifiedEvidence(input.evidence),
      confidence: input.confidence,
      reason: required(input.reason, "Relationship reason"),
      visibility: input.visibility,
      proposerId: required(input.proposerId, "Proposer identity"),
      proposedAt,
      status: "Submitted" as const,
      correlationId: this.idGenerator.next() as CorrelationId,
    });
    return this.store.submitCrossProjectRelationshipProposal({
      proposal,
      auditEventIds: freeze([this.idGenerator.next(), this.idGenerator.next()]),
    });
  }

  public async reviewCrossProjectRelationshipProposal(input: {
    proposalId: CrossProjectRelationshipProposalId;
    reviewerId: string;
    decision: "Accepted" | "Rejected";
    reason: string;
    evidence: readonly ProjectQualifiedEvidenceId[];
  }) {
    const reviewerId = required(input.reviewerId, "Reviewer identity");
    if (input.decision === "Accepted" && !this.reviewPolicy.mayAccept(reviewerId))
      throw new ValidationError("Reviewer is not permitted to accept cross-project relationships");
    return this.store.reviewCrossProjectRelationshipProposal({
      proposalId: input.proposalId,
      decisionId: this.idGenerator.next() as CrossProjectRelationshipReviewDecisionId,
      relationshipId:
        input.decision === "Accepted"
          ? (this.idGenerator.next() as CrossProjectRelationshipId)
          : null,
      reviewerId,
      decision: input.decision,
      reason: required(input.reason, "Review reason"),
      evidence: qualifiedEvidence(input.evidence),
      decidedAt: this.clock.now(),
      correlationId: this.idGenerator.next() as CorrelationId,
      auditEventIds: freeze([this.idGenerator.next(), this.idGenerator.next()]),
    });
  }

  public async assessRevisionImpact(input: {
    id?: ImpactAssessmentId;
    relationshipId: CrossProjectRelationshipId;
    providerRevisionId: RevisionId;
    evidence: readonly ProjectQualifiedEvidenceId[];
    facts: StructuredImpactFacts;
    requestingActorId: string;
  }): Promise<ImpactAssessment> {
    const relationship = await this.store.getCrossProjectRelationship(input.relationshipId);
    if (!relationship) throw new ValidationError("Accepted relationship was not found");
    const consumer = await this.store.getCurrentEndpoint({
      projectId: relationship.source.projectId,
      nodeId: relationship.source.nodeId,
      scope: relationship.scope,
    });
    if (!consumer) throw new ValidationError("Consumer endpoint has no Current Revision");
    const facts = normalizeFacts(input.facts);
    const evidence = qualifiedEvidence(input.evidence);
    const assessedAt = this.clock.now();
    const assessment = freeze({
      id: input.id ?? (this.idGenerator.next() as ImpactAssessmentId),
      relationshipId: input.relationshipId,
      providerRevisionId: input.providerRevisionId,
      consumerRevisionId: consumer.revisionId,
      evidence,
      facts,
      severity: this.assessmentBuilder.severity(facts),
      confidence: relationship.confidence,
      severityEvaluatorVersion: "loxora-impact-severity-v1" as const,
      basisFingerprintVersion: "sha256-impact-assessment-basis-json-v1" as const,
      basisFingerprint: this.assessmentBuilder.fingerprint({
        relationshipId: input.relationshipId,
        providerRevisionId: input.providerRevisionId,
        consumerRevisionId: consumer.revisionId,
        facts,
        evidence,
      }),
      requestingActorId: required(input.requestingActorId, "Requesting actor"),
      assessedAt,
      correlationId: this.idGenerator.next() as CorrelationId,
    });
    return this.store.createImpactAssessment({
      assessment,
      auditEventIds: freeze([this.idGenerator.next(), this.idGenerator.next()]),
    });
  }

  public getProjectDependencies(input: {
    projectId: ProjectId;
    scope?: Scope;
    direction: "Outgoing" | "Incoming" | "Both";
    access: ReadableProjects;
  }) {
    return this.store.getProjectDependencies({
      ...input,
      scope: (input.scope ?? DEFAULT_SCOPE) as Scope,
    });
  }

  public getRevisionImpact(input: {
    providerProjectId: ProjectId;
    providerNodeId: NodeId;
    providerRevisionId: RevisionId;
    scope?: Scope;
    access: ReadableProjects;
  }) {
    return this.store.getRevisionImpact({
      ...input,
      scope: (input.scope ?? DEFAULT_SCOPE) as Scope,
    });
  }

  public getImpactPath(input: { assessmentId: ImpactAssessmentId; access: ReadableProjects }) {
    return this.store.getImpactPath(input);
  }
}

function required(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new ValidationError(`${field} must not be empty`);
  return result;
}

function qualifiedEvidence(
  values: readonly ProjectQualifiedEvidenceId[],
): readonly ProjectQualifiedEvidenceId[] {
  if (values.length === 0) throw new ValidationError("Evidence must not be empty");
  const unique = new Map(
    values.map((item) => [`${item.projectId}:${item.evidenceReferenceId}`, freeze({ ...item })]),
  );
  return freeze(
    [...unique.values()].sort((a, b) => {
      const project = a.projectId.localeCompare(b.projectId);
      return project || a.evidenceReferenceId.localeCompare(b.evidenceReferenceId);
    }),
  );
}

function normalizeFacts(facts: StructuredImpactFacts): StructuredImpactFacts {
  return freeze({
    changeCompatibility: facts.changeCompatibility,
    consumerRequirement: facts.consumerRequirement,
    operationalCriticality: facts.operationalCriticality,
    observedFailure: facts.observedFailure,
    changeSummary: required(facts.changeSummary, "Change summary"),
    consumerConstraint: required(facts.consumerConstraint, "Consumer constraint"),
    consequence: required(facts.consequence, "Consequence"),
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
