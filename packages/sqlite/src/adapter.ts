import {
  IntegrityError,
  NotFoundError,
  ProposalNotReviewableError,
  type AuditEvent,
  type CollectionId,
  type CorrelationId,
  type CurrentKnowledge,
  type EvidenceReference,
  type EvidenceReferenceId,
  type KnowledgeCollection,
  type KnowledgeProposal,
  type KnowledgeRevision,
  type KnowledgeSpace,
  type LifecycleStore,
  type NodeId,
  type Project,
  type ProjectId,
  type ProposalId,
  type ReviewDecision,
  type ReviewKnowledgeProposalResult,
  type ReviewTransactionInput,
  type RevisionId,
  type Scope,
  type SourceReference,
  type SourceReferenceId,
  type SpaceId,
} from "@loxora/core";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations.js";

interface ProposalRow {
  id: string;
  project_id: string;
  space_id: string;
  collection_id: string;
  proposed_node_id: string;
  proposed_node_title: string;
  proposed_content: string;
  proposer_id: string;
  created_at: string;
  scope: string;
  status: "Submitted" | "Accepted" | "Rejected";
}

interface CurrentRow {
  project_id: string;
  project_name: string;
  project_created_at: string;
  space_id: string;
  space_name: string;
  space_created_at: string;
  collection_id: string;
  collection_name: string;
  collection_created_at: string;
  node_id: string;
  node_title: string;
  node_created_at: string;
  revision_id: string;
  content: string;
  proposal_id: string;
  review_decision_id: string;
  proposer_id: string;
  reviewer_id: string;
  accepted_at: string;
  correlation_id: string;
  proposed_node_title: string;
  proposed_content: string;
  proposal_created_at: string;
  proposal_status: "Submitted" | "Accepted" | "Rejected";
  decision: "Accepted" | "Rejected";
  reason: string;
  decided_at: string;
}

interface EvidenceRow {
  id: string;
  project_id: string;
  source_reference_id: string;
  summary: string;
  locator: string;
  created_at: string;
}

interface SourceRow {
  id: string;
  project_id: string;
  kind: string;
  locator: string;
  title: string;
  created_at: string;
}

export interface SqliteFaults {
  readonly afterReviewDecisionRecorded?: () => void;
}

export class SqliteLifecycleStore implements LifecycleStore {
  private readonly database: DatabaseSync;

  public constructor(
    path: string,
    private readonly faults: SqliteFaults = {},
  ) {
    this.database = new DatabaseSync(path, { timeout: 5_000 });
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA busy_timeout = 5000");
    if (path !== ":memory:") {
      this.database.exec("PRAGMA journal_mode = WAL");
    }
    runMigrations(this.database);
  }

  public async createProject(project: Project, auditEvent: AuditEvent): Promise<void> {
    this.transaction(() => {
      this.database
        .prepare("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)")
        .run(project.id, project.name, project.createdAt);
      this.insertAudit(auditEvent);
    });
  }

  public async createKnowledgeSpace(space: KnowledgeSpace, auditEvent: AuditEvent): Promise<void> {
    this.transaction(() => {
      this.database
        .prepare(
          "INSERT INTO knowledge_spaces (id, project_id, name, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(space.id, space.projectId, space.name, space.createdAt);
      this.insertAudit(auditEvent);
    });
  }

  public async createKnowledgeCollection(
    collection: KnowledgeCollection,
    auditEvent: AuditEvent,
  ): Promise<void> {
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO knowledge_collections
            (id, project_id, space_id, name, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          collection.id,
          collection.projectId,
          collection.spaceId,
          collection.name,
          collection.createdAt,
        );
      this.insertAudit(auditEvent);
    });
  }

  public async registerSourceReference(
    source: SourceReference,
    auditEvent: AuditEvent,
  ): Promise<void> {
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO source_references
            (id, project_id, kind, locator, title, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          source.id,
          source.projectId,
          source.kind,
          source.locator,
          source.title,
          source.createdAt,
        );
      this.insertAudit(auditEvent);
    });
  }

  public async registerEvidenceReference(
    evidence: EvidenceReference,
    auditEvent: AuditEvent,
  ): Promise<void> {
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO evidence_references
            (id, project_id, source_reference_id, summary, locator, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evidence.id,
          evidence.projectId,
          evidence.sourceReferenceId,
          evidence.summary,
          evidence.locator,
          evidence.createdAt,
        );
      this.insertAudit(auditEvent);
    });
  }

  public async submitProposal(proposal: KnowledgeProposal, auditEvent: AuditEvent): Promise<void> {
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO knowledge_proposals
            (id, project_id, space_id, collection_id, proposed_node_id, proposed_node_title,
             proposed_content, proposer_id, created_at, scope, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          proposal.id,
          proposal.projectId,
          proposal.spaceId,
          proposal.collectionId,
          proposal.proposedNodeId,
          proposal.proposedNodeTitle,
          proposal.proposedContent,
          proposal.proposerId,
          proposal.createdAt,
          proposal.scope,
          proposal.status,
        );

      const sourceStatement = this.database.prepare(
        `INSERT INTO proposal_sources
          (proposal_id, project_id, source_reference_id) VALUES (?, ?, ?)`,
      );
      for (const sourceId of proposal.sourceReferenceIds) {
        sourceStatement.run(proposal.id, proposal.projectId, sourceId);
      }

      const evidenceStatement = this.database.prepare(
        `INSERT INTO proposal_evidence
          (proposal_id, project_id, evidence_reference_id) VALUES (?, ?, ?)`,
      );
      for (const evidenceId of proposal.evidenceReferenceIds) {
        evidenceStatement.run(proposal.id, proposal.projectId, evidenceId);
      }
      this.insertAudit(auditEvent);
    });
  }

  public async reviewProposal(
    input: ReviewTransactionInput,
  ): Promise<ReviewKnowledgeProposalResult> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT * FROM knowledge_proposals WHERE id = ? AND project_id = ?")
        .get(input.proposalId, input.projectId) as ProposalRow | undefined;
      if (!row) {
        throw new NotFoundError(`Proposal ${input.proposalId} was not found`);
      }
      if (row.status !== "Submitted") {
        throw new ProposalNotReviewableError(
          `Proposal ${input.proposalId} is already ${row.status}`,
        );
      }
      if (row.scope !== input.scope) {
        throw new IntegrityError("Review scope must match Proposal scope");
      }
      this.assertEvidenceOwnership(input.projectId, input.evidenceReferenceIds);

      this.database
        .prepare(
          `INSERT INTO review_decisions
            (id, proposal_id, project_id, reviewer_id, decision, reason, decided_at, scope,
             correlation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.reviewDecisionId,
          input.proposalId,
          input.projectId,
          input.reviewerId,
          input.decision,
          input.reason,
          input.decidedAt,
          input.scope,
          input.correlationId,
        );

      const reviewEvidence = this.database.prepare(
        `INSERT INTO review_decision_evidence
          (review_decision_id, project_id, evidence_reference_id) VALUES (?, ?, ?)`,
      );
      for (const evidenceId of input.evidenceReferenceIds) {
        reviewEvidence.run(input.reviewDecisionId, input.projectId, evidenceId);
      }

      this.faults.afterReviewDecisionRecorded?.();

      const proposal = this.mapProposal(row);
      const reviewDecision = this.makeReviewDecision(input);
      if (input.decision === "Rejected") {
        this.database
          .prepare("UPDATE knowledge_proposals SET status = 'Rejected' WHERE id = ?")
          .run(input.proposalId);
        const auditEvents = this.insertReviewAudits(input, row.proposed_node_id, null);
        this.database.exec("COMMIT");
        return Object.freeze({
          proposal: Object.freeze({ ...proposal, status: "Rejected" as const }),
          reviewDecision,
          revision: null,
          correlationId: input.correlationId,
          auditEvents,
        });
      }

      if (input.revisionId === null) {
        throw new IntegrityError("Accepted review requires a Revision ID");
      }

      this.database
        .prepare(
          `INSERT INTO knowledge_nodes
            (id, project_id, space_id, collection_id, title, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.proposed_node_id,
          row.project_id,
          row.space_id,
          row.collection_id,
          row.proposed_node_title,
          input.decidedAt,
        );

      this.database
        .prepare(
          `INSERT INTO knowledge_revisions
            (id, project_id, node_id, scope, content, proposal_id, review_decision_id,
             proposer_id, reviewer_id, accepted_at, correlation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.revisionId,
          row.project_id,
          row.proposed_node_id,
          row.scope,
          row.proposed_content,
          row.id,
          input.reviewDecisionId,
          row.proposer_id,
          input.reviewerId,
          input.decidedAt,
          input.correlationId,
        );

      const revisionEvidenceIds = this.proposalAndReviewEvidence(
        input.proposalId,
        input.evidenceReferenceIds,
      );
      const revisionEvidence = this.database.prepare(
        `INSERT INTO revision_evidence
          (revision_id, project_id, evidence_reference_id) VALUES (?, ?, ?)`,
      );
      for (const evidenceId of revisionEvidenceIds) {
        revisionEvidence.run(input.revisionId, input.projectId, evidenceId);
      }

      this.database
        .prepare(
          `INSERT INTO current_revisions
            (project_id, node_id, scope, revision_id, assigned_at, correlation_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.projectId,
          row.proposed_node_id,
          input.scope,
          input.revisionId,
          input.decidedAt,
          input.correlationId,
        );
      this.database
        .prepare("UPDATE knowledge_proposals SET status = 'Accepted' WHERE id = ?")
        .run(input.proposalId);

      const auditEvents = this.insertReviewAudits(input, row.proposed_node_id, input.revisionId);
      this.database.exec("COMMIT");

      return Object.freeze({
        proposal: Object.freeze({ ...proposal, status: "Accepted" as const }),
        reviewDecision,
        revision: this.makeRevision(row, input, revisionEvidenceIds),
        correlationId: input.correlationId,
        auditEvents,
      });
    } catch (error) {
      if (this.database.isTransaction) {
        this.database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  public async getCurrentKnowledge(input: {
    readonly projectId: ProjectId;
    readonly nodeId: NodeId;
    readonly scope: Scope;
  }): Promise<CurrentKnowledge | null> {
    const row = this.database
      .prepare(
        `SELECT
           p.id AS project_id, p.name AS project_name, p.created_at AS project_created_at,
           s.id AS space_id, s.name AS space_name, s.created_at AS space_created_at,
           c.id AS collection_id, c.name AS collection_name, c.created_at AS collection_created_at,
           n.id AS node_id, n.title AS node_title, n.created_at AS node_created_at,
           r.id AS revision_id, r.content, r.proposal_id, r.review_decision_id,
           r.proposer_id, r.reviewer_id, r.accepted_at, r.correlation_id,
           kp.proposed_node_title, kp.proposed_content, kp.created_at AS proposal_created_at,
           kp.status AS proposal_status,
           rd.decision, rd.reason, rd.decided_at
         FROM current_revisions cr
         JOIN knowledge_revisions r ON r.id = cr.revision_id
         JOIN knowledge_nodes n ON n.id = cr.node_id
         JOIN projects p ON p.id = cr.project_id
         JOIN knowledge_spaces s ON s.id = n.space_id
         JOIN knowledge_collections c ON c.id = n.collection_id
         JOIN knowledge_proposals kp ON kp.id = r.proposal_id
         JOIN review_decisions rd ON rd.id = r.review_decision_id
         WHERE cr.project_id = ? AND cr.node_id = ? AND cr.scope = ?`,
      )
      .get(input.projectId, input.nodeId, input.scope) as CurrentRow | undefined;
    if (!row) {
      return null;
    }

    const evidence = this.evidenceForRevision(row.revision_id as RevisionId);
    const sources = this.sourcesForEvidence(evidence);
    const proposalSources = this.idsFor(
      "SELECT source_reference_id AS id FROM proposal_sources WHERE proposal_id = ? ORDER BY source_reference_id",
      row.proposal_id,
    ) as SourceReferenceId[];
    const proposalEvidence = this.idsFor(
      "SELECT evidence_reference_id AS id FROM proposal_evidence WHERE proposal_id = ? ORDER BY evidence_reference_id",
      row.proposal_id,
    ) as EvidenceReferenceId[];
    const reviewEvidence = this.idsFor(
      `SELECT evidence_reference_id AS id FROM review_decision_evidence
       WHERE review_decision_id = ? ORDER BY evidence_reference_id`,
      row.review_decision_id,
    ) as EvidenceReferenceId[];

    const project = Object.freeze({
      id: row.project_id as ProjectId,
      name: row.project_name,
      createdAt: row.project_created_at,
    });
    const space = Object.freeze({
      id: row.space_id as SpaceId,
      projectId: project.id,
      name: row.space_name,
      createdAt: row.space_created_at,
    });
    const collection = Object.freeze({
      id: row.collection_id as CollectionId,
      projectId: project.id,
      spaceId: space.id,
      name: row.collection_name,
      createdAt: row.collection_created_at,
    });
    const node = Object.freeze({
      id: row.node_id as NodeId,
      projectId: project.id,
      spaceId: space.id,
      collectionId: collection.id,
      title: row.node_title,
      createdAt: row.node_created_at,
    });
    const proposal = Object.freeze({
      id: row.proposal_id as ProposalId,
      projectId: project.id,
      spaceId: space.id,
      collectionId: collection.id,
      proposedNodeId: node.id,
      proposedNodeTitle: row.proposed_node_title,
      proposedContent: row.proposed_content,
      sourceReferenceIds: Object.freeze(proposalSources),
      evidenceReferenceIds: Object.freeze(proposalEvidence),
      proposerId: row.proposer_id,
      createdAt: row.proposal_created_at,
      scope: input.scope,
      status: row.proposal_status as KnowledgeProposal["status"],
    });
    const reviewDecision = Object.freeze({
      id: row.review_decision_id as ReviewDecision["id"],
      proposalId: proposal.id,
      projectId: project.id,
      reviewerId: row.reviewer_id,
      decision: row.decision as ReviewDecision["decision"],
      reason: row.reason,
      decidedAt: row.decided_at,
      scope: input.scope,
      evidenceReferenceIds: Object.freeze(reviewEvidence),
      correlationId: row.correlation_id as CorrelationId,
    });
    const revision = Object.freeze({
      id: row.revision_id as RevisionId,
      projectId: project.id,
      nodeId: node.id,
      scope: input.scope,
      content: row.content,
      proposalId: proposal.id,
      reviewDecisionId: reviewDecision.id,
      proposerId: row.proposer_id,
      reviewerId: row.reviewer_id,
      acceptedAt: row.accepted_at,
      evidenceReferenceIds: Object.freeze(evidence.map((item) => item.id)),
      correlationId: row.correlation_id as CorrelationId,
    });

    return Object.freeze({
      project,
      space,
      collection,
      node,
      revision,
      lifecycleState: "Canonical" as const,
      temporalClassification: "Current" as const,
      sources: Object.freeze(sources),
      evidence: Object.freeze(evidence),
      proposal,
      reviewDecision,
    });
  }

  public async close(): Promise<void> {
    this.database.close();
  }

  /** Test-only integrity access. This class is not exported from the package root. */
  public unsafeExecForTest(sql: string): void {
    this.database.exec(sql);
  }

  /** Test-only inspection. This class is not exported from the package root. */
  public unsafeGetForTest(sql: string, ...params: (string | number | null)[]): unknown {
    return this.database.prepare(sql).get(...params);
  }

  private transaction(operation: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) {
        this.database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  private insertAudit(event: AuditEvent): void {
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, project_id, event_type, aggregate_type, aggregate_id, actor_id, occurred_at,
           correlation_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.projectId,
        event.type,
        event.aggregateType,
        event.aggregateId,
        event.actorId,
        event.occurredAt,
        event.correlationId,
        JSON.stringify(event.payload),
      );
  }

  private insertReviewAudits(
    input: ReviewTransactionInput,
    nodeId: string,
    revisionId: RevisionId | null,
  ): readonly AuditEvent[] {
    const definitions: readonly [AuditEvent["type"], string, string][] =
      input.decision === "Accepted"
        ? [
            ["ReviewDecisionRecorded", "ReviewDecision", input.reviewDecisionId],
            ["KnowledgeNodeCreated", "KnowledgeNode", nodeId],
            ["KnowledgeRevisionCreated", "KnowledgeRevision", revisionId ?? ""],
            ["CurrentRevisionAssigned", "KnowledgeNode", nodeId],
            ["ProposalAccepted", "KnowledgeProposal", input.proposalId],
          ]
        : [
            ["ReviewDecisionRecorded", "ReviewDecision", input.reviewDecisionId],
            ["ProposalRejected", "KnowledgeProposal", input.proposalId],
          ];

    const events = definitions.map(([type, aggregateType, aggregateId], index) => {
      const id = input.auditEventIds[index];
      if (!id) {
        throw new IntegrityError("Missing Audit Event ID for review transaction");
      }
      const event = Object.freeze({
        id,
        projectId: input.projectId,
        type,
        aggregateType,
        aggregateId,
        actorId: input.reviewerId,
        occurredAt: input.decidedAt,
        correlationId: input.correlationId,
        payload: Object.freeze({ proposalId: input.proposalId, revisionId }),
      });
      this.insertAudit(event);
      return event;
    });
    return Object.freeze(events);
  }

  private assertEvidenceOwnership(
    projectId: ProjectId,
    evidenceIds: readonly EvidenceReferenceId[],
  ): void {
    const statement = this.database.prepare(
      "SELECT 1 FROM evidence_references WHERE id = ? AND project_id = ?",
    );
    for (const evidenceId of evidenceIds) {
      if (statement.get(evidenceId, projectId) === undefined) {
        throw new IntegrityError(`Evidence ${evidenceId} does not belong to Project ${projectId}`);
      }
    }
  }

  private proposalAndReviewEvidence(
    proposalId: ProposalId,
    reviewEvidence: readonly EvidenceReferenceId[],
  ): readonly EvidenceReferenceId[] {
    const proposalEvidence = this.idsFor(
      "SELECT evidence_reference_id AS id FROM proposal_evidence WHERE proposal_id = ?",
      proposalId,
    ) as EvidenceReferenceId[];
    return Object.freeze([...new Set([...proposalEvidence, ...reviewEvidence])]);
  }

  private idsFor(sql: string, parameter: string): string[] {
    return (this.database.prepare(sql).all(parameter) as { id: string }[]).map((row) => row.id);
  }

  private evidenceForRevision(revisionId: RevisionId): EvidenceReference[] {
    const rows = this.database
      .prepare(
        `SELECT e.* FROM evidence_references e
         JOIN revision_evidence re ON re.evidence_reference_id = e.id
         WHERE re.revision_id = ? ORDER BY e.id`,
      )
      .all(revisionId) as unknown as EvidenceRow[];
    return rows.map((row) =>
      Object.freeze({
        id: row.id as EvidenceReferenceId,
        projectId: row.project_id as ProjectId,
        sourceReferenceId: row.source_reference_id as SourceReferenceId,
        summary: row.summary,
        locator: row.locator,
        createdAt: row.created_at,
      }),
    );
  }

  private sourcesForEvidence(evidence: readonly EvidenceReference[]): SourceReference[] {
    const ids = [...new Set(evidence.map((item) => item.sourceReferenceId))];
    const statement = this.database.prepare("SELECT * FROM source_references WHERE id = ?");
    return ids.map((id) => {
      const row = statement.get(id) as unknown as SourceRow;
      return Object.freeze({
        id: row.id as SourceReferenceId,
        projectId: row.project_id as ProjectId,
        kind: row.kind,
        locator: row.locator,
        title: row.title,
        createdAt: row.created_at,
      });
    });
  }

  private mapProposal(row: ProposalRow): KnowledgeProposal {
    const sourceReferenceIds = this.idsFor(
      "SELECT source_reference_id AS id FROM proposal_sources WHERE proposal_id = ? ORDER BY source_reference_id",
      row.id,
    ) as SourceReferenceId[];
    const evidenceReferenceIds = this.idsFor(
      "SELECT evidence_reference_id AS id FROM proposal_evidence WHERE proposal_id = ? ORDER BY evidence_reference_id",
      row.id,
    ) as EvidenceReferenceId[];
    return Object.freeze({
      id: row.id as ProposalId,
      projectId: row.project_id as ProjectId,
      spaceId: row.space_id as SpaceId,
      collectionId: row.collection_id as CollectionId,
      proposedNodeId: row.proposed_node_id as NodeId,
      proposedNodeTitle: row.proposed_node_title,
      proposedContent: row.proposed_content,
      sourceReferenceIds: Object.freeze(sourceReferenceIds),
      evidenceReferenceIds: Object.freeze(evidenceReferenceIds),
      proposerId: row.proposer_id,
      createdAt: row.created_at,
      scope: row.scope as Scope,
      status: row.status,
    });
  }

  private makeReviewDecision(input: ReviewTransactionInput): ReviewDecision {
    return Object.freeze({
      id: input.reviewDecisionId,
      proposalId: input.proposalId,
      projectId: input.projectId,
      reviewerId: input.reviewerId,
      decision: input.decision,
      reason: input.reason,
      decidedAt: input.decidedAt,
      scope: input.scope,
      evidenceReferenceIds: Object.freeze([...input.evidenceReferenceIds]),
      correlationId: input.correlationId,
    });
  }

  private makeRevision(
    row: ProposalRow,
    input: ReviewTransactionInput,
    evidenceReferenceIds: readonly EvidenceReferenceId[],
  ): KnowledgeRevision {
    return Object.freeze({
      id: input.revisionId as RevisionId,
      projectId: input.projectId,
      nodeId: row.proposed_node_id as NodeId,
      scope: input.scope,
      content: row.proposed_content,
      proposalId: input.proposalId,
      reviewDecisionId: input.reviewDecisionId,
      proposerId: row.proposer_id,
      reviewerId: input.reviewerId,
      acceptedAt: input.decidedAt,
      evidenceReferenceIds: Object.freeze([...evidenceReferenceIds]),
      correlationId: input.correlationId,
    });
  }
}
