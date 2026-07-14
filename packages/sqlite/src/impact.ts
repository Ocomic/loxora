import type { DatabaseSync } from "node:sqlite";
import {
  CurrentRevisionMismatchError,
  IntegrityError,
  ProposalNotReviewableError,
  type AssessmentFreshness,
  type CrossProjectEndpointBinding,
  type CrossProjectEndpointView,
  type CrossProjectImpactStore,
  type CrossProjectRelationship,
  type CrossProjectRelationshipId,
  type CrossProjectRelationshipProposal,
  type CrossProjectRelationshipProposalId,
  type CrossProjectRelationshipReviewDecision,
  type EvidenceReference,
  type ImpactAssessment,
  type ImpactAssessmentId,
  type ImpactAssessmentTransactionInput,
  type ImpactPath,
  type NavigationPath,
  type NodeId,
  type ProjectDependencyResult,
  type ProjectId,
  type ProjectQualifiedEvidenceId,
  type ReadableProjects,
  type RelationshipBindingFreshness,
  type RelationshipProposalTransactionInput,
  type RelationshipReviewTransactionInput,
  type RevisionId,
  type Scope,
  type SourceReference,
} from "@loxora/core";

type Row = Record<string, string | number | null>;

export interface SqliteImpactFaults {
  readonly afterRelationshipInserted?: () => void;
  readonly afterAssessmentInserted?: () => void;
}

export class SqliteCrossProjectImpactStore implements CrossProjectImpactStore {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly faults: SqliteImpactFaults = {},
  ) {}

  public async getCurrentEndpoint(input: {
    projectId: ProjectId;
    nodeId: NodeId;
    scope: Scope;
  }): Promise<CrossProjectEndpointBinding | null> {
    const row = this.database
      .prepare(
        "SELECT revision_id FROM current_revisions WHERE project_id=? AND node_id=? AND scope=?",
      )
      .get(input.projectId, input.nodeId, input.scope) as Row | undefined;
    return row ? freeze({ ...input, revisionId: row.revision_id as RevisionId }) : null;
  }

  public async submitCrossProjectRelationshipProposal(
    input: RelationshipProposalTransactionInput,
  ): Promise<CrossProjectRelationshipProposal> {
    const p = input.proposal;
    this.transaction(() => {
      this.assertEndpointCurrent(p.source, p.scope);
      this.assertEndpointCurrent(p.target, p.scope);
      this.assertEvidence(p.evidence, p.source.projectId, p.target.projectId);
      this.database
        .prepare(`INSERT INTO cross_project_relationship_proposals
        (id,source_project_id,source_node_id,source_revision_id,target_project_id,target_node_id,target_revision_id,
         scope,relationship_type,confidence,reason,visibility,proposer_id,proposed_at,status,correlation_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          p.id,
          p.source.projectId,
          p.source.nodeId,
          p.source.revisionId,
          p.target.projectId,
          p.target.nodeId,
          p.target.revisionId,
          p.scope,
          p.type,
          p.confidence,
          p.reason,
          p.visibility,
          p.proposerId,
          p.proposedAt,
          p.status,
          p.correlationId,
        );
      this.insertQualifiedEvidence(
        "cross_project_relationship_proposal_evidence",
        "proposal_id",
        p.id,
        p.source.projectId,
        p.target.projectId,
        p.evidence,
      );
      this.insertEndpointAudits(
        input.auditEventIds,
        p.source.projectId,
        p.target.projectId,
        "CrossProjectRelationshipProposed",
        "CrossProjectRelationshipProposal",
        p.id,
        p.proposerId,
        p.proposedAt,
        p.correlationId,
        { sourceRevisionId: p.source.revisionId, targetRevisionId: p.target.revisionId },
      );
    });
    return p;
  }

  public async reviewCrossProjectRelationshipProposal(
    input: RelationshipReviewTransactionInput,
  ): Promise<{
    proposal: CrossProjectRelationshipProposal;
    decision: CrossProjectRelationshipReviewDecision;
    relationship: CrossProjectRelationship | null;
  }> {
    let result!: {
      proposal: CrossProjectRelationshipProposal;
      decision: CrossProjectRelationshipReviewDecision;
      relationship: CrossProjectRelationship | null;
    };
    this.transaction(() => {
      const row = this.proposalRow(input.proposalId);
      if (!row) throw new IntegrityError(`Relationship Proposal ${input.proposalId} not found`);
      if (row.status !== "Submitted")
        throw new ProposalNotReviewableError(
          `Relationship Proposal ${input.proposalId} is decided`,
        );
      const proposal = this.mapProposal(row);
      this.assertEvidence(input.evidence, proposal.source.projectId, proposal.target.projectId);
      if (input.decision === "Accepted") {
        this.assertEndpointCurrent(proposal.source, proposal.scope);
        this.assertEndpointCurrent(proposal.target, proposal.scope);
      }
      this.database
        .prepare(`INSERT INTO cross_project_relationship_review_decisions
        (id,proposal_id,source_project_id,target_project_id,reviewer_id,decision,reason,decided_at,correlation_id)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(
          input.decisionId,
          proposal.id,
          proposal.source.projectId,
          proposal.target.projectId,
          input.reviewerId,
          input.decision,
          input.reason,
          input.decidedAt,
          input.correlationId,
        );
      this.insertQualifiedEvidence(
        "cross_project_relationship_review_evidence",
        "review_decision_id",
        input.decisionId,
        proposal.source.projectId,
        proposal.target.projectId,
        input.evidence,
      );
      const decision = freeze({
        id: input.decisionId,
        proposalId: proposal.id,
        decision: input.decision,
        reviewerId: input.reviewerId,
        reason: input.reason,
        evidence: freeze([...input.evidence]),
        decidedAt: input.decidedAt,
        correlationId: input.correlationId,
      });
      let relationship: CrossProjectRelationship | null = null;
      if (input.decision === "Accepted") {
        if (!input.relationshipId)
          throw new IntegrityError("Accepted review requires Relationship ID");
        const evidence = mergeEvidence(proposal.evidence, input.evidence);
        this.database
          .prepare(`INSERT INTO cross_project_relationships
          (id,proposal_id,review_decision_id,source_project_id,source_node_id,source_revision_id,
           target_project_id,target_node_id,target_revision_id,scope,relationship_type,confidence,reason,
           visibility,accepted_at,reviewer_id,correlation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(
            input.relationshipId,
            proposal.id,
            input.decisionId,
            proposal.source.projectId,
            proposal.source.nodeId,
            proposal.source.revisionId,
            proposal.target.projectId,
            proposal.target.nodeId,
            proposal.target.revisionId,
            proposal.scope,
            proposal.type,
            proposal.confidence,
            proposal.reason,
            proposal.visibility,
            input.decidedAt,
            input.reviewerId,
            input.correlationId,
          );
        this.insertQualifiedEvidence(
          "cross_project_relationship_evidence",
          "relationship_id",
          input.relationshipId,
          proposal.source.projectId,
          proposal.target.projectId,
          evidence,
        );
        this.faults.afterRelationshipInserted?.();
        relationship = freeze({
          id: input.relationshipId,
          proposalId: proposal.id,
          reviewDecisionId: input.decisionId,
          source: proposal.source,
          target: proposal.target,
          scope: proposal.scope,
          type: "DependsOn",
          evidence,
          confidence: proposal.confidence,
          reason: proposal.reason,
          visibility: proposal.visibility,
          acceptedAt: input.decidedAt,
          reviewerId: input.reviewerId,
          correlationId: input.correlationId,
        });
      }
      this.database
        .prepare("UPDATE cross_project_relationship_proposals SET status=? WHERE id=?")
        .run(input.decision, proposal.id);
      this.insertEndpointAudits(
        input.auditEventIds,
        proposal.source.projectId,
        proposal.target.projectId,
        input.decision === "Accepted"
          ? "CrossProjectRelationshipAccepted"
          : "CrossProjectRelationshipRejected",
        "CrossProjectRelationshipProposal",
        proposal.id,
        input.reviewerId,
        input.decidedAt,
        input.correlationId,
        { decisionId: input.decisionId, relationshipId: input.relationshipId },
      );
      result = {
        proposal: freeze({ ...proposal, status: input.decision }),
        decision,
        relationship,
      };
    });
    return result;
  }

  public async getCrossProjectRelationship(
    relationshipId: CrossProjectRelationshipId,
  ): Promise<CrossProjectRelationship | null> {
    const row = this.database
      .prepare("SELECT * FROM cross_project_relationships WHERE id=?")
      .get(relationshipId) as Row | undefined;
    return row ? this.mapRelationship(row) : null;
  }

  public async createImpactAssessment(
    input: ImpactAssessmentTransactionInput,
  ): Promise<ImpactAssessment> {
    const a = input.assessment;
    this.transaction(() => {
      const relationshipRow = this.database
        .prepare("SELECT * FROM cross_project_relationships WHERE id=?")
        .get(a.relationshipId) as Row | undefined;
      if (!relationshipRow) throw new IntegrityError("Accepted relationship not found");
      const relationship = this.mapRelationship(relationshipRow);
      this.assertRevision(
        a.providerRevisionId,
        relationship.target.projectId,
        relationship.target.nodeId,
        relationship.scope,
      );
      const consumerCurrent = this.currentRevision(
        relationship.source.projectId,
        relationship.source.nodeId,
        relationship.scope,
      );
      if (consumerCurrent !== a.consumerRevisionId)
        throw new CurrentRevisionMismatchError(a.consumerRevisionId, consumerCurrent);
      this.assertEvidence(a.evidence, relationship.source.projectId, relationship.target.projectId);
      this.database
        .prepare(`INSERT INTO impact_assessments
        (id,relationship_id,source_project_id,target_project_id,provider_revision_id,consumer_revision_id,
         change_compatibility,consumer_requirement,operational_criticality,observed_failure,
         change_summary,consumer_constraint,consequence,severity,confidence,severity_evaluator_version,
         basis_fingerprint_version,basis_fingerprint,requesting_actor_id,assessed_at,correlation_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          a.id,
          a.relationshipId,
          relationship.source.projectId,
          relationship.target.projectId,
          a.providerRevisionId,
          a.consumerRevisionId,
          a.facts.changeCompatibility,
          a.facts.consumerRequirement,
          a.facts.operationalCriticality,
          a.facts.observedFailure ? 1 : 0,
          a.facts.changeSummary,
          a.facts.consumerConstraint,
          a.facts.consequence,
          a.severity,
          a.confidence,
          a.severityEvaluatorVersion,
          a.basisFingerprintVersion,
          a.basisFingerprint,
          a.requestingActorId,
          a.assessedAt,
          a.correlationId,
        );
      this.insertQualifiedEvidence(
        "impact_assessment_evidence",
        "assessment_id",
        a.id,
        relationship.source.projectId,
        relationship.target.projectId,
        a.evidence,
      );
      this.faults.afterAssessmentInserted?.();
      this.insertEndpointAudits(
        input.auditEventIds,
        relationship.source.projectId,
        relationship.target.projectId,
        "ImpactAssessmentCreated",
        "ImpactAssessment",
        a.id,
        a.requestingActorId,
        a.assessedAt,
        a.correlationId,
        { relationshipId: a.relationshipId, severity: a.severity },
      );
    });
    return a;
  }

  public async getProjectDependencies(input: {
    projectId: ProjectId;
    scope: Scope;
    direction: "Outgoing" | "Incoming" | "Both";
    access: ReadableProjects;
  }): Promise<readonly ProjectDependencyResult[]> {
    const clauses: string[] = [];
    if (input.direction !== "Incoming") clauses.push("source_project_id=?");
    if (input.direction !== "Outgoing") clauses.push("target_project_id=?");
    const rows = this.database
      .prepare(
        `SELECT * FROM cross_project_relationships WHERE scope=? AND (${clauses.join(
          " OR ",
        )}) ORDER BY id`,
      )
      .all(input.scope, ...clauses.map(() => input.projectId)) as Row[];
    const results: ProjectDependencyResult[] = [];
    for (const row of rows) {
      const relationship = this.mapRelationship(row);
      const provider = this.currentRevision(
        relationship.target.projectId,
        relationship.target.nodeId,
        relationship.scope,
      );
      const consumer = this.currentRevision(
        relationship.source.projectId,
        relationship.source.nodeId,
        relationship.scope,
      );
      if (!provider || !consumer) continue;
      const path = this.path(relationship, provider, consumer, input.access);
      results.push(
        freeze({
          relationship,
          direction: relationship.source.projectId === input.projectId ? "Outgoing" : "Incoming",
          relationshipBindingFreshness: path.relationshipBindingFreshness,
          assessmentFreshness: path.assessmentFreshness,
          assessment: path.assessment,
          path,
        }),
      );
    }
    return freeze(results);
  }

  public async getRevisionImpact(input: {
    providerProjectId: ProjectId;
    providerNodeId: NodeId;
    providerRevisionId: RevisionId;
    scope: Scope;
    access: ReadableProjects;
  }): Promise<readonly ImpactPath[]> {
    this.assertRevision(
      input.providerRevisionId,
      input.providerProjectId,
      input.providerNodeId,
      input.scope,
    );
    const rows = this.database
      .prepare(`SELECT * FROM cross_project_relationships
        WHERE target_project_id=? AND target_node_id=? AND scope=? ORDER BY id,source_project_id,source_node_id`)
      .all(input.providerProjectId, input.providerNodeId, input.scope) as Row[];
    const paths = rows.flatMap((row) => {
      const relationship = this.mapRelationship(row);
      const consumer = this.currentRevision(
        relationship.source.projectId,
        relationship.source.nodeId,
        relationship.scope,
      );
      return consumer
        ? [this.path(relationship, input.providerRevisionId, consumer, input.access)]
        : [];
    });
    return freeze(paths);
  }

  public async getImpactPath(input: {
    assessmentId: ImpactAssessmentId;
    access: ReadableProjects;
  }): Promise<ImpactPath | null> {
    const row = this.database
      .prepare("SELECT * FROM impact_assessments WHERE id=?")
      .get(input.assessmentId) as Row | undefined;
    if (!row) return null;
    const assessment = this.mapAssessment(row);
    const relationship = await this.getCrossProjectRelationship(assessment.relationshipId);
    return relationship
      ? this.path(
          relationship,
          assessment.providerRevisionId,
          assessment.consumerRevisionId,
          input.access,
          assessment.id,
        )
      : null;
  }

  private path(
    relationship: CrossProjectRelationship,
    providerRevisionId: RevisionId,
    consumerRevisionId: RevisionId,
    access: ReadableProjects,
    preferredAssessmentId?: ImpactAssessmentId,
  ): ImpactPath {
    const relationshipBindingFreshness = this.bindingFreshness(relationship);
    const applicable = this.applicableAssessment(
      relationship.id,
      providerRevisionId,
      consumerRevisionId,
      preferredAssessmentId,
    );
    const assessmentFreshness = applicable
      ? this.assessmentFreshness(applicable, relationship)
      : null;
    const readable = new Set(access.readableProjectIds);
    const canReadProvider = readable.has(relationship.target.projectId);
    const canReadConsumer = readable.has(relationship.source.projectId);
    const restricted = relationship.visibility === "Restricted";
    const warnings: string[] = [];
    if (!applicable) warnings.push("NoApplicableImpactAssessment");
    if (!canReadProvider || !canReadConsumer) warnings.push("InaccessibleEndpoint");
    const provider = this.endpointView(
      relationship.target,
      providerRevisionId,
      canReadProvider,
      restricted,
      access,
    );
    const consumer = this.endpointView(
      relationship.source,
      consumerRevisionId,
      canReadConsumer,
      restricted,
      access,
    );
    const exposeDetails = canReadProvider && canReadConsumer;
    const evidence = exposeDetails ? this.evidenceForRelationship(relationship.id) : [];
    const sources = exposeDetails
      ? uniqueSources(evidence.map((item) => this.sourceForEvidence(item)).filter(isDefined))
      : [];
    return freeze({
      relationship: exposeDetails
        ? relationship
        : freeze({ ...relationship, reason: "", evidence: freeze([]) }),
      canonicalLabel: "DependsOn",
      reverseLabel: "DependedOnBy",
      provider,
      consumer,
      selectedProviderRevisionId: providerRevisionId,
      selectedConsumerRevisionId: consumerRevisionId,
      relationshipBindingFreshness,
      assessmentFreshness,
      assessment: exposeDetails ? applicable : null,
      evidence: freeze(evidence),
      sources: freeze(sources),
      warnings: freeze(warnings),
    });
  }

  private endpointView(
    frozenBinding: CrossProjectEndpointBinding,
    selectedRevisionId: RevisionId,
    readable: boolean,
    restricted: boolean,
    access: ReadableProjects,
  ): CrossProjectEndpointView {
    if (!readable) {
      const reveal = !restricted || access.revealRestrictedProjectIds === true;
      return freeze({
        projectId: reveal ? frozenBinding.projectId : null,
        inaccessibleReferenceId: reveal
          ? null
          : `restricted:${createOpaqueReference(frozenBinding.projectId)}`,
        nodeId: null,
        revisionId: null,
        temporalClassification: null,
        path: null,
        content: null,
        inaccessible: true,
      });
    }
    const row = this.database
      .prepare(`SELECT p.name project_name,s.id space_id,s.name space_name,c.id collection_id,c.name collection_name,
        n.title node_title,r.content,CASE WHEN cr.revision_id=r.id THEN 'Current' ELSE 'Historical' END temporal
        FROM knowledge_revisions r JOIN knowledge_nodes n ON n.id=r.node_id
        JOIN knowledge_collections c ON c.id=n.collection_id JOIN knowledge_spaces s ON s.id=n.space_id
        JOIN projects p ON p.id=r.project_id LEFT JOIN current_revisions cr
        ON cr.project_id=r.project_id AND cr.node_id=r.node_id AND cr.scope=r.scope
        WHERE r.id=? AND r.project_id=?`)
      .get(selectedRevisionId, frozenBinding.projectId) as Row;
    const path: NavigationPath = freeze({
      segments: freeze([
        freeze({
          kind: "Project" as const,
          id: frozenBinding.projectId,
          label: String(row.project_name),
        }),
        freeze({ kind: "Space" as const, id: String(row.space_id), label: String(row.space_name) }),
        freeze({
          kind: "Collection" as const,
          id: String(row.collection_id),
          label: String(row.collection_name),
        }),
        freeze({ kind: "Node" as const, id: frozenBinding.nodeId, label: String(row.node_title) }),
        freeze({ kind: "Revision" as const, id: selectedRevisionId, label: String(row.temporal) }),
      ]),
      temporalView: row.temporal as "Current" | "Historical",
    });
    return freeze({
      projectId: frozenBinding.projectId,
      inaccessibleReferenceId: null,
      nodeId: frozenBinding.nodeId,
      revisionId: selectedRevisionId,
      temporalClassification: row.temporal as "Current" | "Historical",
      path,
      content: String(row.content),
      inaccessible: false,
    });
  }

  private applicableAssessment(
    relationshipId: CrossProjectRelationshipId,
    providerRevisionId: RevisionId,
    consumerRevisionId: RevisionId,
    preferredId?: ImpactAssessmentId,
  ): ImpactAssessment | null {
    const rows = this.database
      .prepare(`SELECT * FROM impact_assessments WHERE relationship_id=?
        AND provider_revision_id=? AND consumer_revision_id=?
        ORDER BY assessed_at DESC,id ASC`)
      .all(relationshipId, providerRevisionId, consumerRevisionId) as Row[];
    if (preferredId) {
      const preferred = rows.find((row) => row.id === preferredId);
      if (preferred) return this.mapAssessment(preferred);
    }
    const mapped = rows.map((row) => this.mapAssessment(row));
    mapped.sort((left, right) => {
      const lf = this.assessmentFreshnessByIds(left) === "Fresh" ? 0 : 1;
      const rf = this.assessmentFreshnessByIds(right) === "Fresh" ? 0 : 1;
      return (
        lf - rf ||
        right.assessedAt.localeCompare(left.assessedAt) ||
        left.id.localeCompare(right.id)
      );
    });
    return mapped[0] ?? null;
  }

  private bindingFreshness(relationship: CrossProjectRelationship): RelationshipBindingFreshness {
    return this.currentRevision(
      relationship.source.projectId,
      relationship.source.nodeId,
      relationship.scope,
    ) === relationship.source.revisionId &&
      this.currentRevision(
        relationship.target.projectId,
        relationship.target.nodeId,
        relationship.scope,
      ) === relationship.target.revisionId
      ? "Fresh"
      : "Stale";
  }

  private assessmentFreshness(
    assessment: ImpactAssessment,
    relationship: CrossProjectRelationship,
  ): AssessmentFreshness {
    return this.currentRevision(
      relationship.target.projectId,
      relationship.target.nodeId,
      relationship.scope,
    ) === assessment.providerRevisionId &&
      this.currentRevision(
        relationship.source.projectId,
        relationship.source.nodeId,
        relationship.scope,
      ) === assessment.consumerRevisionId
      ? "Fresh"
      : "Stale";
  }

  private assessmentFreshnessByIds(assessment: ImpactAssessment): AssessmentFreshness {
    const row = this.database
      .prepare("SELECT * FROM cross_project_relationships WHERE id=?")
      .get(assessment.relationshipId) as Row;
    return this.assessmentFreshness(assessment, this.mapRelationship(row));
  }

  private mapProposal(row: Row): CrossProjectRelationshipProposal {
    const evidence = this.qualifiedEvidence(
      "cross_project_relationship_proposal_evidence",
      "proposal_id",
      String(row.id),
    );
    return freeze({
      id: row.id as CrossProjectRelationshipProposalId,
      source: freeze({
        projectId: row.source_project_id as ProjectId,
        nodeId: row.source_node_id as NodeId,
        revisionId: row.source_revision_id as RevisionId,
      }),
      target: freeze({
        projectId: row.target_project_id as ProjectId,
        nodeId: row.target_node_id as NodeId,
        revisionId: row.target_revision_id as RevisionId,
      }),
      scope: row.scope as Scope,
      type: "DependsOn",
      evidence,
      confidence: row.confidence as CrossProjectRelationshipProposal["confidence"],
      reason: String(row.reason),
      visibility: row.visibility as CrossProjectRelationshipProposal["visibility"],
      proposerId: String(row.proposer_id),
      proposedAt: String(row.proposed_at),
      status: row.status as CrossProjectRelationshipProposal["status"],
      correlationId: row.correlation_id as CrossProjectRelationshipProposal["correlationId"],
    });
  }

  private mapRelationship(row: Row): CrossProjectRelationship {
    return freeze({
      id: row.id as CrossProjectRelationshipId,
      proposalId: row.proposal_id as CrossProjectRelationshipProposalId,
      reviewDecisionId: row.review_decision_id as CrossProjectRelationship["reviewDecisionId"],
      source: freeze({
        projectId: row.source_project_id as ProjectId,
        nodeId: row.source_node_id as NodeId,
        revisionId: row.source_revision_id as RevisionId,
      }),
      target: freeze({
        projectId: row.target_project_id as ProjectId,
        nodeId: row.target_node_id as NodeId,
        revisionId: row.target_revision_id as RevisionId,
      }),
      scope: row.scope as Scope,
      type: "DependsOn",
      evidence: this.qualifiedEvidence(
        "cross_project_relationship_evidence",
        "relationship_id",
        String(row.id),
      ),
      confidence: row.confidence as CrossProjectRelationship["confidence"],
      reason: String(row.reason),
      visibility: row.visibility as CrossProjectRelationship["visibility"],
      acceptedAt: String(row.accepted_at),
      reviewerId: String(row.reviewer_id),
      correlationId: row.correlation_id as CrossProjectRelationship["correlationId"],
    });
  }

  private mapAssessment(row: Row): ImpactAssessment {
    return freeze({
      id: row.id as ImpactAssessmentId,
      relationshipId: row.relationship_id as CrossProjectRelationshipId,
      providerRevisionId: row.provider_revision_id as RevisionId,
      consumerRevisionId: row.consumer_revision_id as RevisionId,
      evidence: this.qualifiedEvidence(
        "impact_assessment_evidence",
        "assessment_id",
        String(row.id),
      ),
      facts: freeze({
        changeCompatibility:
          row.change_compatibility as ImpactAssessment["facts"]["changeCompatibility"],
        consumerRequirement:
          row.consumer_requirement as ImpactAssessment["facts"]["consumerRequirement"],
        operationalCriticality:
          row.operational_criticality as ImpactAssessment["facts"]["operationalCriticality"],
        observedFailure: row.observed_failure === 1,
        changeSummary: String(row.change_summary),
        consumerConstraint: String(row.consumer_constraint),
        consequence: String(row.consequence),
      }),
      severity: row.severity as ImpactAssessment["severity"],
      confidence: row.confidence as ImpactAssessment["confidence"],
      severityEvaluatorVersion:
        row.severity_evaluator_version as ImpactAssessment["severityEvaluatorVersion"],
      basisFingerprintVersion:
        row.basis_fingerprint_version as ImpactAssessment["basisFingerprintVersion"],
      basisFingerprint: String(row.basis_fingerprint),
      requestingActorId: String(row.requesting_actor_id),
      assessedAt: String(row.assessed_at),
      correlationId: row.correlation_id as ImpactAssessment["correlationId"],
    });
  }

  private proposalRow(id: CrossProjectRelationshipProposalId): Row | undefined {
    return this.database
      .prepare("SELECT * FROM cross_project_relationship_proposals WHERE id=?")
      .get(id) as Row | undefined;
  }

  private assertEndpointCurrent(endpoint: CrossProjectEndpointBinding, scope: Scope): void {
    const actual = this.currentRevision(endpoint.projectId, endpoint.nodeId, scope);
    if (actual !== endpoint.revisionId)
      throw new CurrentRevisionMismatchError(endpoint.revisionId, actual);
  }

  private assertRevision(
    revisionId: RevisionId,
    projectId: ProjectId,
    nodeId: NodeId,
    scope: Scope,
  ): void {
    if (
      !this.database
        .prepare(
          "SELECT 1 FROM knowledge_revisions WHERE id=? AND project_id=? AND node_id=? AND scope=?",
        )
        .get(revisionId, projectId, nodeId, scope)
    )
      throw new IntegrityError("Revision does not belong to the expected Project, Node, and scope");
  }

  private currentRevision(projectId: ProjectId, nodeId: NodeId, scope: Scope): RevisionId | null {
    const row = this.database
      .prepare(
        "SELECT revision_id FROM current_revisions WHERE project_id=? AND node_id=? AND scope=?",
      )
      .get(projectId, nodeId, scope) as Row | undefined;
    return (row?.revision_id as RevisionId | undefined) ?? null;
  }

  private assertEvidence(
    evidence: readonly ProjectQualifiedEvidenceId[],
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
  ): void {
    for (const item of evidence) {
      if (item.projectId !== sourceProjectId && item.projectId !== targetProjectId)
        throw new IntegrityError("Evidence must belong to an endpoint Project");
      if (
        !this.database
          .prepare("SELECT 1 FROM evidence_references WHERE id=? AND project_id=?")
          .get(item.evidenceReferenceId, item.projectId)
      )
        throw new IntegrityError("Project-qualified Evidence was not found");
    }
  }

  private insertQualifiedEvidence(
    table: string,
    ownerColumn: string,
    ownerId: string,
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
    evidence: readonly ProjectQualifiedEvidenceId[],
  ): void {
    const statement = this.database.prepare(
      `INSERT INTO ${table} (${ownerColumn},source_project_id,target_project_id,evidence_project_id,evidence_reference_id) VALUES (?,?,?,?,?)`,
    );
    for (const item of evidence)
      statement.run(
        ownerId,
        sourceProjectId,
        targetProjectId,
        item.projectId,
        item.evidenceReferenceId,
      );
  }

  private qualifiedEvidence(
    table: string,
    ownerColumn: string,
    ownerId: string,
  ): readonly ProjectQualifiedEvidenceId[] {
    return freeze(
      (
        this.database
          .prepare(
            `SELECT evidence_project_id,evidence_reference_id FROM ${table} WHERE ${ownerColumn}=? ORDER BY evidence_project_id,evidence_reference_id`,
          )
          .all(ownerId) as Row[]
      ).map((row) =>
        freeze({
          projectId: row.evidence_project_id as ProjectId,
          evidenceReferenceId:
            row.evidence_reference_id as ProjectQualifiedEvidenceId["evidenceReferenceId"],
        }),
      ),
    );
  }

  private evidenceForRelationship(id: CrossProjectRelationshipId): EvidenceReference[] {
    return (
      this.database
        .prepare(`SELECT e.* FROM cross_project_relationship_evidence x JOIN evidence_references e
        ON e.id=x.evidence_reference_id AND e.project_id=x.evidence_project_id
        WHERE x.relationship_id=? ORDER BY e.project_id,e.id`)
        .all(id) as Row[]
    ).map((row) =>
      freeze({
        id: row.id as EvidenceReference["id"],
        projectId: row.project_id as ProjectId,
        sourceReferenceId: row.source_reference_id as EvidenceReference["sourceReferenceId"],
        summary: String(row.summary),
        locator: String(row.locator),
        createdAt: String(row.created_at),
      }),
    );
  }

  private sourceForEvidence(evidence: EvidenceReference): SourceReference | null {
    const row = this.database
      .prepare("SELECT * FROM source_references WHERE id=? AND project_id=?")
      .get(evidence.sourceReferenceId, evidence.projectId) as Row | undefined;
    return row
      ? freeze({
          id: row.id as SourceReference["id"],
          projectId: row.project_id as ProjectId,
          kind: String(row.kind),
          locator: String(row.locator),
          title: String(row.title),
          createdAt: String(row.created_at),
        })
      : null;
  }

  private insertEndpointAudits(
    ids: readonly string[],
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    actorId: string,
    occurredAt: string,
    correlationId: string,
    payload: object,
  ): void {
    const statement = this.database.prepare(`INSERT INTO audit_events
      (id,project_id,event_type,aggregate_type,aggregate_id,actor_id,occurred_at,correlation_id,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const projects = [sourceProjectId, targetProjectId];
    projects.forEach((projectId, index) => {
      const id = ids[index];
      if (!id) throw new IntegrityError("Missing endpoint Audit Event ID");
      statement.run(
        id,
        projectId,
        eventType,
        aggregateType,
        aggregateId,
        actorId,
        occurredAt,
        correlationId,
        JSON.stringify(payload),
      );
    });
  }

  private transaction(operation: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function mergeEvidence(
  left: readonly ProjectQualifiedEvidenceId[],
  right: readonly ProjectQualifiedEvidenceId[],
): readonly ProjectQualifiedEvidenceId[] {
  const values = new Map(
    [...left, ...right].map((item) => [`${item.projectId}:${item.evidenceReferenceId}`, item]),
  );
  return freeze(
    [...values.values()].sort(
      (a, b) =>
        a.projectId.localeCompare(b.projectId) ||
        a.evidenceReferenceId.localeCompare(b.evidenceReferenceId),
    ),
  );
}

function uniqueSources(values: readonly SourceReference[]): SourceReference[] {
  return [...new Map(values.map((value) => [`${value.projectId}:${value.id}`, value])).values()];
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

function createOpaqueReference(projectId: ProjectId): string {
  let hash = 2166136261;
  for (const char of projectId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);
