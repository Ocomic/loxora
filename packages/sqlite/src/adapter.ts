import {
  IntegrityError,
  CurrentRevisionMismatchError,
  InvalidLineageError,
  InvalidRestorationError,
  NotFoundError,
  ProposalNotReviewableError,
  type AuditEvent,
  type CollectionId,
  type CorrelationId,
  type CurrentKnowledge,
  type EvidenceReference,
  type EvidenceReferenceId,
  type KnowledgeCollection,
  type KnowledgeHistory,
  type KnowledgeHistoryEntry,
  type HistoryClassification,
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
  type RevisionRelationship,
  type RevisionRelationshipId,
  type RevisionRelationshipType,
  type RevisionId,
  type RollbackEvent,
  type RollbackEventId,
  type RecordRollbackResult,
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
  proposal_kind: "Initial" | "Successor" | "Restoration";
  change_reason: string | null;
  expected_predecessor_revision_id: string | null;
  rollback_event_id: string | null;
  restoration_source_revision_id: string | null;
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
  proposal_kind: "Initial" | "Successor" | "Restoration";
  change_reason: string | null;
  expected_predecessor_revision_id: string | null;
  rollback_event_id: string | null;
  restoration_source_revision_id: string | null;
}

interface RollbackRow {
  id: string;
  project_id: string;
  node_id: string;
  scope: string;
  reverted_revision_id: string;
  semantic_source_revision_id: string;
  actor_id: string;
  reason: string;
  recorded_at: string;
  correlation_id: string;
}

interface RelationshipRow {
  id: string;
  project_id: string;
  node_id: string;
  scope: string;
  source_revision_id: string;
  target_revision_id: string;
  relationship_type: RevisionRelationshipType;
  rollback_event_id: string | null;
  created_at: string;
  correlation_id: string;
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

interface RevisionRow {
  id: string;
  project_id: string;
  node_id: string;
  scope: string;
  content: string;
  proposal_id: string;
  review_decision_id: string;
  proposer_id: string;
  reviewer_id: string;
  accepted_at: string;
  correlation_id: string;
}

interface ReviewRow {
  id: string;
  proposal_id: string;
  project_id: string;
  reviewer_id: string;
  decision: "Accepted" | "Rejected";
  reason: string;
  decided_at: string;
  scope: string;
  correlation_id: string;
}

export interface SqliteFaults {
  readonly afterReviewDecisionRecorded?: () => void;
  readonly afterCurrentPointerChanged?: () => void;
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
      if (proposal.kind !== "Initial") {
        this.assertCurrent(
          proposal.projectId,
          proposal.proposedNodeId,
          proposal.scope,
          proposal.expectedPredecessorRevisionId as RevisionId,
        );
        if (proposal.kind === "Restoration") {
          this.assertRestorationProposal(proposal);
        }
      }
      this.database
        .prepare(
          `INSERT INTO knowledge_proposals
            (id, project_id, space_id, collection_id, proposed_node_id, proposed_node_title,
             proposed_content, proposer_id, created_at, scope, status, proposal_kind, change_reason,
             expected_predecessor_revision_id, rollback_event_id, restoration_source_revision_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          proposal.kind,
          proposal.changeReason,
          proposal.expectedPredecessorRevisionId,
          proposal.rollbackEventId,
          proposal.restorationSourceRevisionId,
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
      if (input.decision === "Accepted" && row.proposal_kind !== "Initial") {
        this.assertCurrent(
          input.projectId,
          row.proposed_node_id as NodeId,
          input.scope,
          row.expected_predecessor_revision_id as RevisionId,
        );
        if (row.proposal_kind === "Restoration") {
          this.assertRestorationRow(row);
        }
      }

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
        const auditEvents = this.insertReviewAudits(input, row, null);
        this.database.exec("COMMIT");
        return Object.freeze({
          proposal: Object.freeze({ ...proposal, status: "Rejected" as const }),
          reviewDecision,
          revision: null,
          correlationId: input.correlationId,
          auditEvents,
          relationships: Object.freeze([]),
        });
      }

      if (input.revisionId === null) {
        throw new IntegrityError("Accepted review requires a Revision ID");
      }

      if (row.proposal_kind === "Initial") {
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
      }

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

      const relationships = this.insertLineage(row, input, revisionEvidenceIds);

      if (row.proposal_kind === "Initial") {
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
      } else {
        const result = this.database
          .prepare(
            `UPDATE current_revisions
             SET revision_id = ?, assigned_at = ?, correlation_id = ?
             WHERE project_id = ? AND node_id = ? AND scope = ? AND revision_id = ?`,
          )
          .run(
            input.revisionId,
            input.decidedAt,
            input.correlationId,
            input.projectId,
            row.proposed_node_id,
            input.scope,
            row.expected_predecessor_revision_id,
          );
        if (result.changes !== 1) {
          throw new CurrentRevisionMismatchError(
            row.expected_predecessor_revision_id as RevisionId,
            this.currentRevisionId(input.projectId, row.proposed_node_id as NodeId, input.scope),
          );
        }
      }
      this.faults.afterCurrentPointerChanged?.();
      this.database
        .prepare("UPDATE knowledge_proposals SET status = 'Accepted' WHERE id = ?")
        .run(input.proposalId);

      const auditEvents = this.insertReviewAudits(input, row, input.revisionId);
      this.database.exec("COMMIT");

      return Object.freeze({
        proposal: Object.freeze({ ...proposal, status: "Accepted" as const }),
        reviewDecision,
        revision: this.makeRevision(row, input, revisionEvidenceIds),
        correlationId: input.correlationId,
        auditEvents,
        relationships,
      });
    } catch (error) {
      if (this.database.isTransaction) {
        this.database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  public async recordRollback(
    event: RollbackEvent,
    auditEvent: AuditEvent,
  ): Promise<RecordRollbackResult> {
    this.transaction(() => {
      this.assertCurrent(event.projectId, event.nodeId, event.scope, event.revertedRevisionId);
      if (event.revertedRevisionId === event.semanticSourceRevisionId) {
        throw new InvalidRestorationError("Rollback source must differ from reverted Revision");
      }
      if (!this.isAncestor(event.semanticSourceRevisionId, event.revertedRevisionId)) {
        throw new InvalidRestorationError("Rollback semantic source is not an ancestor");
      }
      this.assertEvidenceOwnership(event.projectId, event.evidenceReferenceIds);
      this.database
        .prepare(
          `INSERT INTO rollback_events
            (id, project_id, node_id, scope, reverted_revision_id,
             semantic_source_revision_id, actor_id, reason, recorded_at, correlation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.projectId,
          event.nodeId,
          event.scope,
          event.revertedRevisionId,
          event.semanticSourceRevisionId,
          event.actorId,
          event.reason,
          event.recordedAt,
          event.correlationId,
        );
      const evidence = this.database.prepare(
        `INSERT INTO rollback_event_evidence
          (rollback_event_id, project_id, evidence_reference_id) VALUES (?, ?, ?)`,
      );
      for (const evidenceId of event.evidenceReferenceIds) {
        evidence.run(event.id, event.projectId, evidenceId);
      }
      this.insertAudit(auditEvent);
    });
    return Object.freeze({ rollbackEvent: event, auditEvent, correlationId: event.correlationId });
  }

  public async getRollbackEvent(input: {
    readonly projectId: ProjectId;
    readonly rollbackEventId: RollbackEventId;
  }): Promise<RollbackEvent | null> {
    const row = this.database
      .prepare("SELECT * FROM rollback_events WHERE id = ? AND project_id = ?")
      .get(input.rollbackEventId, input.projectId) as RollbackRow | undefined;
    return row ? this.mapRollback(row) : null;
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
           kp.status AS proposal_status, kp.proposal_kind, kp.change_reason,
           kp.expected_predecessor_revision_id, kp.rollback_event_id,
           kp.restoration_source_revision_id,
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
      kind: row.proposal_kind,
      changeReason: row.change_reason,
      expectedPredecessorRevisionId: row.expected_predecessor_revision_id as RevisionId | null,
      rollbackEventId: row.rollback_event_id as RollbackEventId | null,
      restorationSourceRevisionId: row.restoration_source_revision_id as RevisionId | null,
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
      revisionRole: proposal.kind,
      incomingRelationships: Object.freeze(this.relationshipsFor(row.revision_id, "target")),
      outgoingRelationships: Object.freeze(this.relationshipsFor(row.revision_id, "source")),
      rollbackEvent: proposal.rollbackEventId
        ? await this.getRollbackEvent({
            projectId: project.id,
            rollbackEventId: proposal.rollbackEventId,
          })
        : null,
    });
  }

  public async close(): Promise<void> {
    this.database.close();
  }

  public async getKnowledgeHistory(input: {
    readonly projectId: ProjectId;
    readonly nodeId: NodeId;
    readonly scope: Scope;
  }): Promise<KnowledgeHistory | null> {
    const current = await this.getCurrentKnowledge(input);
    if (!current) {
      return null;
    }
    const acceptedIds = (
      this.database
        .prepare(
          `SELECT id FROM knowledge_revisions
           WHERE project_id = ? AND node_id = ? AND scope = ? ORDER BY id`,
        )
        .all(input.projectId, input.nodeId, input.scope) as { id: string }[]
    ).map((row) => row.id as RevisionId);
    const newestToOldest: RevisionId[] = [];
    const seen = new Set<string>();
    let cursor: RevisionId | null = current.revision.id;
    while (cursor) {
      if (seen.has(cursor)) {
        throw new InvalidLineageError("Revision lineage contains a cycle");
      }
      seen.add(cursor);
      newestToOldest.push(cursor);
      const predecessors: RevisionRelationship[] = this.relationshipsFor(cursor, "source").filter(
        (item) => item.type === "DirectPredecessor",
      );
      if (predecessors.length > 1) {
        throw new InvalidLineageError("Revision has multiple direct predecessors");
      }
      cursor = predecessors[0]?.targetRevisionId ?? null;
    }
    if (seen.size !== acceptedIds.length || acceptedIds.some((id) => !seen.has(id))) {
      throw new InvalidLineageError("Accepted Revisions do not form one complete lineage");
    }
    const ordered = newestToOldest.reverse();
    const entries: KnowledgeHistoryEntry[] = [];
    for (const revisionId of ordered) {
      entries.push(await this.historyEntry(revisionId, current));
    }
    return Object.freeze({
      project: current.project,
      space: current.space,
      collection: current.collection,
      node: current.node,
      scope: input.scope,
      currentRevisionId: current.revision.id,
      entries: Object.freeze(entries),
    });
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
    const evidence = this.database.prepare(
      `INSERT INTO audit_event_evidence
        (audit_event_id, project_id, evidence_reference_id) VALUES (?, ?, ?)`,
    );
    for (const evidenceId of event.evidenceReferenceIds) {
      evidence.run(event.id, event.projectId, evidenceId);
    }
  }

  private insertReviewAudits(
    input: ReviewTransactionInput,
    proposal: ProposalRow,
    revisionId: RevisionId | null,
  ): readonly AuditEvent[] {
    const nodeId = proposal.proposed_node_id;
    let definitions: readonly [AuditEvent["type"], string, string][];
    if (input.decision === "Rejected") {
      const rejectedType =
        proposal.proposal_kind === "Successor"
          ? "SuccessorProposalRejected"
          : proposal.proposal_kind === "Restoration"
            ? "RestorationProposalRejected"
            : "ProposalRejected";
      definitions = [
        ["ReviewDecisionRecorded", "ReviewDecision", input.reviewDecisionId],
        [rejectedType, "KnowledgeProposal", input.proposalId],
      ];
    } else if (proposal.proposal_kind === "Initial") {
      definitions = [
        ["ReviewDecisionRecorded", "ReviewDecision", input.reviewDecisionId],
        ["KnowledgeNodeCreated", "KnowledgeNode", nodeId],
        ["KnowledgeRevisionCreated", "KnowledgeRevision", revisionId ?? ""],
        ["CurrentRevisionAssigned", "KnowledgeNode", nodeId],
        ["ProposalAccepted", "KnowledgeProposal", input.proposalId],
      ];
    } else if (proposal.proposal_kind === "Successor") {
      definitions = [
        ["ReviewDecisionRecorded", "ReviewDecision", input.reviewDecisionId],
        ["KnowledgeRevisionCreated", "KnowledgeRevision", revisionId ?? ""],
        [
          "RevisionSuperseded",
          "KnowledgeRevision",
          proposal.expected_predecessor_revision_id ?? "",
        ],
        ["CurrentRevisionChanged", "KnowledgeNode", nodeId],
        ["SuccessorProposalAccepted", "KnowledgeProposal", input.proposalId],
      ];
    } else {
      definitions = [
        ["ReviewDecisionRecorded", "ReviewDecision", input.reviewDecisionId],
        ["RestorationRevisionCreated", "KnowledgeRevision", revisionId ?? ""],
        [
          "RevisionSuperseded",
          "KnowledgeRevision",
          proposal.expected_predecessor_revision_id ?? "",
        ],
        ["CurrentRevisionChanged", "KnowledgeNode", nodeId],
        ["RestorationProposalAccepted", "KnowledgeProposal", input.proposalId],
      ];
    }

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
        payload: Object.freeze({
          proposalId: input.proposalId,
          revisionId,
          predecessorRevisionId: proposal.expected_predecessor_revision_id,
          rollbackEventId: proposal.rollback_event_id,
          reason: proposal.change_reason ?? input.reason,
        }),
        evidenceReferenceIds: Object.freeze([...input.evidenceReferenceIds]),
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

  private currentRevisionId(projectId: ProjectId, nodeId: NodeId, scope: Scope): RevisionId | null {
    const row = this.database
      .prepare(
        `SELECT revision_id FROM current_revisions
         WHERE project_id = ? AND node_id = ? AND scope = ?`,
      )
      .get(projectId, nodeId, scope) as { revision_id: string } | undefined;
    return (row?.revision_id as RevisionId | undefined) ?? null;
  }

  private assertCurrent(
    projectId: ProjectId,
    nodeId: NodeId,
    scope: Scope,
    expected: RevisionId,
  ): void {
    const actual = this.currentRevisionId(projectId, nodeId, scope);
    if (actual !== expected) {
      throw new CurrentRevisionMismatchError(expected, actual);
    }
  }

  private assertRestorationProposal(proposal: KnowledgeProposal): void {
    const row = this.database
      .prepare("SELECT * FROM rollback_events WHERE id = ? AND project_id = ?")
      .get(proposal.rollbackEventId, proposal.projectId) as RollbackRow | undefined;
    if (
      !row ||
      row.node_id !== proposal.proposedNodeId ||
      row.scope !== proposal.scope ||
      row.reverted_revision_id !== proposal.expectedPredecessorRevisionId ||
      row.semantic_source_revision_id !== proposal.restorationSourceRevisionId
    ) {
      throw new InvalidRestorationError("Restoration Proposal does not match Rollback Event");
    }
  }

  private assertRestorationRow(proposal: ProposalRow): void {
    const row = this.database
      .prepare("SELECT * FROM rollback_events WHERE id = ? AND project_id = ?")
      .get(proposal.rollback_event_id, proposal.project_id) as RollbackRow | undefined;
    if (
      !row ||
      row.node_id !== proposal.proposed_node_id ||
      row.scope !== proposal.scope ||
      row.reverted_revision_id !== proposal.expected_predecessor_revision_id ||
      row.semantic_source_revision_id !== proposal.restoration_source_revision_id ||
      !this.isAncestor(
        row.semantic_source_revision_id as RevisionId,
        row.reverted_revision_id as RevisionId,
      )
    ) {
      throw new InvalidRestorationError("Restoration lineage is invalid");
    }
  }

  private isAncestor(ancestor: RevisionId, descendant: RevisionId): boolean {
    let cursor: RevisionId | null = descendant;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === ancestor) {
        return true;
      }
      seen.add(cursor);
      const row = this.database
        .prepare(
          `SELECT target_revision_id FROM revision_relationships
           WHERE source_revision_id = ? AND relationship_type = 'DirectPredecessor'`,
        )
        .get(cursor) as { target_revision_id: string } | undefined;
      cursor = (row?.target_revision_id as RevisionId | undefined) ?? null;
    }
    return false;
  }

  private insertLineage(
    proposal: ProposalRow,
    input: ReviewTransactionInput,
    evidenceIds: readonly EvidenceReferenceId[],
  ): readonly RevisionRelationship[] {
    if (proposal.proposal_kind === "Initial" || input.revisionId === null) {
      return Object.freeze([]);
    }
    const predecessor = proposal.expected_predecessor_revision_id as RevisionId;
    const definitions: readonly [RevisionRelationshipType, RevisionId, RollbackEventId | null][] =
      proposal.proposal_kind === "Successor"
        ? [
            ["DirectPredecessor", predecessor, null],
            ["Supersedes", predecessor, null],
          ]
        : [
            ["DirectPredecessor", predecessor, null],
            ["Supersedes", predecessor, null],
            ["Reverts", predecessor, proposal.rollback_event_id as RollbackEventId],
            [
              "RestoredFrom",
              proposal.restoration_source_revision_id as RevisionId,
              proposal.rollback_event_id as RollbackEventId,
            ],
          ];
    const insert = this.database.prepare(
      `INSERT INTO revision_relationships
        (id, project_id, node_id, scope, source_revision_id, target_revision_id,
         relationship_type, rollback_event_id, created_at, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const linkEvidence = this.database.prepare(
      `INSERT INTO revision_relationship_evidence
        (revision_relationship_id, project_id, evidence_reference_id) VALUES (?, ?, ?)`,
    );
    const relationships = definitions.map(([type, target, rollbackEventId], index) => {
      const id = input.relationshipIds[index];
      if (!id) {
        throw new IntegrityError("Missing Revision Relationship ID");
      }
      insert.run(
        id,
        input.projectId,
        proposal.proposed_node_id,
        input.scope,
        input.revisionId,
        target,
        type,
        rollbackEventId,
        input.decidedAt,
        input.correlationId,
      );
      for (const evidenceId of evidenceIds) {
        linkEvidence.run(id, input.projectId, evidenceId);
      }
      return Object.freeze({
        id,
        projectId: input.projectId,
        nodeId: proposal.proposed_node_id as NodeId,
        scope: input.scope,
        sourceRevisionId: input.revisionId as RevisionId,
        targetRevisionId: target,
        type,
        evidenceReferenceIds: Object.freeze([...evidenceIds]),
        rollbackEventId,
        createdAt: input.decidedAt,
        correlationId: input.correlationId,
      });
    });
    return Object.freeze(relationships);
  }

  private relationshipsFor(
    revisionId: string,
    direction: "source" | "target",
  ): RevisionRelationship[] {
    const column = direction === "source" ? "source_revision_id" : "target_revision_id";
    const rows = this.database
      .prepare(
        `SELECT * FROM revision_relationships WHERE ${column} = ?
         ORDER BY relationship_type, target_revision_id, id`,
      )
      .all(revisionId) as unknown as RelationshipRow[];
    return rows.map((row) =>
      Object.freeze({
        id: row.id as RevisionRelationshipId,
        projectId: row.project_id as ProjectId,
        nodeId: row.node_id as NodeId,
        scope: row.scope as Scope,
        sourceRevisionId: row.source_revision_id as RevisionId,
        targetRevisionId: row.target_revision_id as RevisionId,
        type: row.relationship_type,
        evidenceReferenceIds: Object.freeze(
          this.idsFor(
            `SELECT evidence_reference_id AS id FROM revision_relationship_evidence
             WHERE revision_relationship_id = ? ORDER BY evidence_reference_id`,
            row.id,
          ) as EvidenceReferenceId[],
        ),
        rollbackEventId: row.rollback_event_id as RollbackEventId | null,
        createdAt: row.created_at,
        correlationId: row.correlation_id as CorrelationId,
      }),
    );
  }

  private mapRollback(row: RollbackRow): RollbackEvent {
    return Object.freeze({
      id: row.id as RollbackEventId,
      projectId: row.project_id as ProjectId,
      nodeId: row.node_id as NodeId,
      scope: row.scope as Scope,
      revertedRevisionId: row.reverted_revision_id as RevisionId,
      semanticSourceRevisionId: row.semantic_source_revision_id as RevisionId,
      actorId: row.actor_id,
      reason: row.reason,
      evidenceReferenceIds: Object.freeze(
        this.idsFor(
          `SELECT evidence_reference_id AS id FROM rollback_event_evidence
           WHERE rollback_event_id = ? ORDER BY evidence_reference_id`,
          row.id,
        ) as EvidenceReferenceId[],
      ),
      recordedAt: row.recorded_at,
      correlationId: row.correlation_id as CorrelationId,
    });
  }

  private async historyEntry(
    revisionId: RevisionId,
    current: CurrentKnowledge,
  ): Promise<KnowledgeHistoryEntry> {
    const revisionRow = this.database
      .prepare("SELECT * FROM knowledge_revisions WHERE id = ?")
      .get(revisionId) as unknown as RevisionRow;
    const proposalRow = this.database
      .prepare("SELECT * FROM knowledge_proposals WHERE id = ?")
      .get(revisionRow.proposal_id) as unknown as ProposalRow;
    const proposal = this.mapProposal(proposalRow);
    const reviewRow = this.database
      .prepare("SELECT * FROM review_decisions WHERE id = ?")
      .get(revisionRow.review_decision_id) as unknown as ReviewRow;
    const reviewEvidence = this.idsFor(
      `SELECT evidence_reference_id AS id FROM review_decision_evidence
       WHERE review_decision_id = ? ORDER BY evidence_reference_id`,
      reviewRow.id,
    ) as EvidenceReferenceId[];
    const reviewDecision = Object.freeze({
      id: reviewRow.id as ReviewDecision["id"],
      proposalId: reviewRow.proposal_id as ProposalId,
      projectId: reviewRow.project_id as ProjectId,
      reviewerId: reviewRow.reviewer_id,
      decision: reviewRow.decision,
      reason: reviewRow.reason,
      decidedAt: reviewRow.decided_at,
      scope: reviewRow.scope as Scope,
      evidenceReferenceIds: Object.freeze(reviewEvidence),
      correlationId: reviewRow.correlation_id as CorrelationId,
    });
    const evidence = this.evidenceForRevision(revisionId);
    const incoming = this.relationshipsFor(revisionId, "target");
    const outgoing = this.relationshipsFor(revisionId, "source");
    const classifications: HistoryClassification[] =
      revisionId === current.revision.id ? ["CurrentCanonical"] : ["Historical"];
    if (incoming.some((item) => item.type === "Supersedes")) classifications.push("Superseded");
    if (incoming.some((item) => item.type === "Reverts")) classifications.push("Reverted");
    if (incoming.some((item) => item.type === "RestoredFrom"))
      classifications.push("RestorationSource");
    const rollback = proposal.rollbackEventId
      ? await this.getRollbackEvent({
          projectId: proposal.projectId,
          rollbackEventId: proposal.rollbackEventId,
        })
      : null;
    const revision = Object.freeze({
      id: revisionRow.id as RevisionId,
      projectId: revisionRow.project_id as ProjectId,
      nodeId: revisionRow.node_id as NodeId,
      scope: revisionRow.scope as Scope,
      content: revisionRow.content,
      proposalId: revisionRow.proposal_id as ProposalId,
      reviewDecisionId: revisionRow.review_decision_id as ReviewDecision["id"],
      proposerId: revisionRow.proposer_id,
      reviewerId: revisionRow.reviewer_id,
      acceptedAt: revisionRow.accepted_at,
      evidenceReferenceIds: Object.freeze(evidence.map((item) => item.id)),
      correlationId: revisionRow.correlation_id as CorrelationId,
    });
    return Object.freeze({
      revision,
      revisionRole: proposal.kind,
      classifications: Object.freeze(classifications),
      isCurrent: revisionId === current.revision.id,
      proposal,
      changeReason: proposal.changeReason ?? reviewDecision.reason,
      reviewDecision,
      evidence: Object.freeze(evidence),
      sources: Object.freeze(this.sourcesForEvidence(evidence)),
      incomingRelationships: Object.freeze(incoming),
      outgoingRelationships: Object.freeze(outgoing),
      directPredecessorRevisionId:
        outgoing.find((item) => item.type === "DirectPredecessor")?.targetRevisionId ?? null,
      rollbackEvent: rollback,
    });
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
      kind: row.proposal_kind,
      changeReason: row.change_reason,
      expectedPredecessorRevisionId: row.expected_predecessor_revision_id as RevisionId | null,
      rollbackEventId: row.rollback_event_id as RollbackEventId | null,
      restorationSourceRevisionId: row.restoration_source_revision_id as RevisionId | null,
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
