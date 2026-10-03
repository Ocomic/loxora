import type { DatabaseSync } from "node:sqlite";
import type {
  EvidenceReference,
  EvidenceReferenceId,
  KnowledgeProposal,
  NavigationPath,
  NodeId,
  PlannedKnowledge,
  PlannedKnowledgeId,
  PlannedKnowledgeStatus,
  PlannedKnowledgeStore,
  ProjectId,
  ReviewInboxItem,
  ReviewInboxStore,
  RevisionId,
  Scope,
  SourceReference,
} from "@loxora/core";
import {
  type AuditEvent,
  NotFoundError,
  PLANNED_KNOWLEDGE_FIELDS,
  type PlannedKnowledgeField,
  type PlannedKnowledgeHistory,
  type PlannedKnowledgeHistoryEntry,
  type PlannedKnowledgeRevision,
  type PlannedKnowledgeRevisionDecision,
  type PlannedKnowledgeRevisionId,
  type PlannedKnowledgeState,
  type ProjectQualifiedNodeId,
  ValidationError,
} from "@loxora/core";

type Row = Record<string, string | null>;
const frozen = <T>(value: T): T => Object.freeze(value);

export class SqlitePlannedKnowledgeStore implements PlannedKnowledgeStore, ReviewInboxStore {
  public constructor(private readonly database: DatabaseSync) {}

  public async createPlannedKnowledge(
    item: PlannedKnowledge,
    audit: AuditEvent,
  ): Promise<PlannedKnowledge> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO planned_knowledge_items
          (id,owner_project_id,related_project_id,title,description,status,reason,blocking_condition,
           author_id,created_at,scope,related_revision_project_id,related_revision_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          item.id,
          item.ownerProjectId,
          item.relatedProjectId,
          item.title,
          item.description,
          item.status,
          item.reason,
          item.blockingCondition,
          item.authorId,
          item.createdAt,
          item.scope,
          item.relatedRevision?.projectId ?? null,
          item.relatedRevision?.revisionId ?? null,
        );
      const nodeInsert = this.database.prepare(
        "INSERT INTO planned_knowledge_nodes (planned_knowledge_id,owner_project_id,node_project_id,node_id) VALUES (?,?,?,?)",
      );
      for (const node of item.relatedNodes)
        nodeInsert.run(item.id, item.ownerProjectId, node.projectId, node.nodeId);
      const evidenceInsert = this.database.prepare(
        "INSERT INTO planned_knowledge_evidence (planned_knowledge_id,owner_project_id,evidence_project_id,evidence_reference_id) VALUES (?,?,?,?)",
      );
      for (const evidence of item.evidence)
        evidenceInsert.run(
          item.id,
          item.ownerProjectId,
          evidence.projectId,
          evidence.evidenceReferenceId,
        );
      this.insertAudit(audit);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return (await this.getPlannedKnowledge({
      ownerProjectId: item.ownerProjectId,
      plannedKnowledgeId: item.id,
    })) as PlannedKnowledge;
  }

  public async getProjectPlans(input: {
    projectId: ProjectId;
    scope: Scope;
    nodeId?: NodeId;
    statuses?: readonly PlannedKnowledgeStatus[];
  }): Promise<readonly PlannedKnowledge[]> {
    const ids = this.database
      .prepare(
        `SELECT DISTINCT p.id,p.owner_project_id,p.created_at
           FROM planned_knowledge_effective p
           LEFT JOIN planned_knowledge_effective_nodes n ON n.planned_knowledge_id=p.id
           WHERE (p.owner_project_id=? OR p.related_project_id=?) AND p.scope=?
             AND (? IS NULL OR (n.node_project_id=? AND n.node_id=?))
           ORDER BY p.created_at,p.id`,
      )
      .all(
        input.projectId,
        input.projectId,
        input.scope,
        input.nodeId ?? null,
        input.projectId,
        input.nodeId ?? null,
      ) as Row[];
    const results: PlannedKnowledge[] = [];
    for (const row of ids) {
      const item = await this.getPlannedKnowledge({
        ownerProjectId: row.owner_project_id as ProjectId,
        plannedKnowledgeId: row.id as PlannedKnowledgeId,
      });
      if (item && (!input.statuses || input.statuses.includes(item.status))) results.push(item);
    }
    return frozen(results);
  }

  public async getPlannedKnowledge(input: {
    ownerProjectId: ProjectId;
    plannedKnowledgeId: PlannedKnowledgeId;
  }): Promise<PlannedKnowledge | null> {
    const row = this.database
      .prepare("SELECT * FROM planned_knowledge_effective WHERE id=? AND owner_project_id=?")
      .get(input.plannedKnowledgeId, input.ownerProjectId) as Row | undefined;
    if (!row) return null;
    const nodes = this.database
      .prepare(
        "SELECT node_project_id,node_id FROM planned_knowledge_effective_nodes WHERE planned_knowledge_id=? ORDER BY node_project_id,node_id",
      )
      .all(row.id as string) as Row[];
    const evidenceRows = this.database
      .prepare(
        `SELECT pe.evidence_project_id,pe.evidence_reference_id,e.source_reference_id,e.summary,e.locator,e.created_at,
                s.kind source_kind,s.locator source_locator,s.title source_title,s.created_at source_created_at
         FROM planned_knowledge_effective_evidence pe
         JOIN evidence_references e ON e.id=pe.evidence_reference_id AND e.project_id=pe.evidence_project_id
         JOIN source_references s ON s.id=e.source_reference_id AND s.project_id=e.project_id
         WHERE pe.planned_knowledge_id=? ORDER BY pe.evidence_project_id,pe.evidence_reference_id`,
      )
      .all(row.id as string) as Row[];
    const evidenceReferences = evidenceRows.map((entry) => this.evidence(entry));
    const sources = new Map<string, SourceReference>();
    for (const entry of evidenceRows)
      sources.set(
        `${entry.evidence_project_id}:${entry.source_reference_id}`,
        frozen({
          id: entry.source_reference_id as SourceReference["id"],
          projectId: entry.evidence_project_id as ProjectId,
          kind: entry.source_kind as string,
          locator: entry.source_locator as string,
          title: entry.source_title as string,
          createdAt: entry.source_created_at as string,
        }),
      );
    const paths: NavigationPath[] = [];
    for (const node of nodes) {
      const path = this.nodePath(node.node_project_id as ProjectId, node.node_id as NodeId, row);
      if (path) paths.push(path);
    }
    return frozen({
      id: row.id as PlannedKnowledgeId,
      ownerProjectId: row.owner_project_id as ProjectId,
      relatedProjectId: (row.related_project_id as ProjectId | null) ?? null,
      relatedNodes: frozen(
        nodes.map((entry) =>
          frozen({
            projectId: entry.node_project_id as ProjectId,
            nodeId: entry.node_id as NodeId,
          }),
        ),
      ),
      title: row.title as string,
      description: row.description as string,
      status: row.status as PlannedKnowledgeStatus,
      reason: row.reason as string,
      blockingCondition: row.blocking_condition as string,
      evidence: frozen(
        evidenceRows.map((entry) =>
          frozen({
            projectId: entry.evidence_project_id as ProjectId,
            evidenceReferenceId: entry.evidence_reference_id as EvidenceReferenceId,
          }),
        ),
      ),
      authorId: row.author_id as string,
      createdAt: row.created_at as string,
      scope: row.scope as Scope,
      revisionNumber: Number(row.revision_number),
      revisedBy: row.revised_by as string,
      revisedAt: row.revised_at as string,
      relatedRevision: row.related_revision_id
        ? frozen({
            projectId: row.related_revision_project_id as ProjectId,
            revisionId: row.related_revision_id as RevisionId,
          })
        : null,
      navigationPaths: frozen(paths),
      evidenceReferences: frozen(evidenceReferences),
      sources: frozen([...sources.values()]),
    });
  }

  public async appendPlannedKnowledgeRevision(input: {
    revision: PlannedKnowledgeRevision;
    expectedEffectiveRevisionNumber: number;
    auditEvent: AuditEvent;
  }): Promise<PlannedKnowledgeRevision> {
    const { revision } = input;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.assertEffectiveRevision(
        revision.plannedKnowledgeId,
        revision.ownerProjectId,
        input.expectedEffectiveRevisionNumber,
      );
      this.insertRevision(revision);
      this.insertAudit(input.auditEvent);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return revision;
  }

  public async recordPlannedKnowledgeRevisionDecision(input: {
    decision: PlannedKnowledgeRevisionDecision;
    revision: PlannedKnowledgeRevision | null;
    expectedEffectiveRevisionNumber: number;
    auditEvent: AuditEvent;
  }): Promise<void> {
    const { decision } = input;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const proposal = this.database
        .prepare(
          "SELECT planned_knowledge_id FROM planned_knowledge_revisions WHERE id=? AND owner_project_id=? AND kind='Proposal'",
        )
        .get(decision.proposalId, decision.ownerProjectId) as Row | undefined;
      if (!proposal) {
        throw new NotFoundError(`Plan revision proposal ${decision.proposalId} was not found`);
      }
      if (
        this.database
          .prepare("SELECT 1 FROM planned_knowledge_revision_decisions WHERE proposal_id=?")
          .get(decision.proposalId) !== undefined
      ) {
        throw new ValidationError(
          `Plan revision proposal ${decision.proposalId} was already reviewed`,
        );
      }
      this.assertEffectiveRevision(
        proposal.planned_knowledge_id as string,
        decision.ownerProjectId,
        input.expectedEffectiveRevisionNumber,
      );
      if (input.revision) this.insertRevision(input.revision);
      this.database
        .prepare(
          `INSERT INTO planned_knowledge_revision_decisions
           (id,proposal_id,owner_project_id,reviewer_id,decision,reason,decided_at,resulting_revision_id)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          decision.id,
          decision.proposalId,
          decision.ownerProjectId,
          decision.reviewerId,
          decision.decision,
          decision.reason,
          decision.decidedAt,
          decision.resultingRevisionId,
        );
      const evidenceInsert = this.database.prepare(
        "INSERT INTO planned_knowledge_revision_decision_evidence (decision_id,owner_project_id,evidence_project_id,evidence_reference_id) VALUES (?,?,?,?)",
      );
      for (const entry of decision.evidence)
        evidenceInsert.run(
          decision.id,
          decision.ownerProjectId,
          entry.projectId,
          entry.evidenceReferenceId,
        );
      this.insertAudit(input.auditEvent);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public async getPlannedKnowledgeHistory(input: {
    ownerProjectId: ProjectId;
    plannedKnowledgeId: PlannedKnowledgeId;
  }): Promise<PlannedKnowledgeHistory | null> {
    const plan = await this.getPlannedKnowledge(input);
    if (!plan) return null;
    const item = this.database
      .prepare("SELECT * FROM planned_knowledge_items WHERE id=? AND owner_project_id=?")
      .get(input.plannedKnowledgeId, input.ownerProjectId) as Row;
    const first: PlannedKnowledgeHistoryEntry = frozen({
      kind: "Revision" as const,
      id: null,
      revisionNumber: 1,
      baseRevisionNumber: null,
      state: this.state(
        item,
        "SELECT node_project_id a,node_id b FROM planned_knowledge_nodes WHERE planned_knowledge_id=? ORDER BY a,b",
        "SELECT evidence_project_id a,evidence_reference_id b FROM planned_knowledge_evidence WHERE planned_knowledge_id=? ORDER BY a,b",
      ),
      changedFields: frozen([]),
      changeReason: null,
      authorId: item.author_id as string,
      createdAt: item.created_at as string,
      sourceProposalId: null,
      isEffective: plan.revisionNumber === 1,
      decision: null,
    });
    const rows = this.database
      .prepare(
        `SELECT * FROM planned_knowledge_revisions WHERE planned_knowledge_id=? AND owner_project_id=?
         ORDER BY created_at, CASE kind WHEN 'Proposal' THEN 0 ELSE 1 END, id`,
      )
      .all(input.plannedKnowledgeId, input.ownerProjectId) as Row[];
    const entries = rows.map((row) => {
      const revision = this.revision(row);
      return frozen({
        kind: revision.kind,
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        baseRevisionNumber: revision.baseRevisionNumber,
        state: revision.state,
        changedFields: revision.changedFields,
        changeReason: revision.changeReason,
        authorId: revision.authorId,
        createdAt: revision.createdAt,
        sourceProposalId: revision.sourceProposalId,
        isEffective:
          revision.kind === "Revision" && revision.revisionNumber === plan.revisionNumber,
        decision: revision.kind === "Proposal" ? this.decision(revision.id) : null,
      });
    });
    return frozen({ plan, entries: frozen([first, ...entries]) });
  }

  public async getPlannedKnowledgeRevision(input: {
    ownerProjectId: ProjectId;
    revisionId: PlannedKnowledgeRevisionId;
  }): Promise<PlannedKnowledgeRevision | null> {
    const row = this.database
      .prepare("SELECT * FROM planned_knowledge_revisions WHERE id=? AND owner_project_id=?")
      .get(input.revisionId, input.ownerProjectId) as Row | undefined;
    return row ? this.revision(row) : null;
  }

  public async nodesWithoutCurrentKnowledge(input: {
    nodes: readonly ProjectQualifiedNodeId[];
    scope: Scope;
  }): Promise<readonly ProjectQualifiedNodeId[]> {
    const current = this.database.prepare(
      "SELECT 1 FROM current_revisions WHERE project_id=? AND node_id=? AND scope=?",
    );
    return frozen(
      input.nodes.filter(
        (node) => current.get(node.projectId, node.nodeId, input.scope) === undefined,
      ),
    );
  }

  private assertEffectiveRevision(planId: string, ownerProjectId: string, expected: number): void {
    const row = this.database
      .prepare(
        "SELECT revision_number FROM planned_knowledge_effective WHERE id=? AND owner_project_id=?",
      )
      .get(planId, ownerProjectId) as { revision_number: number } | undefined;
    if (!row) throw new NotFoundError(`Plan ${planId} was not found`);
    if (Number(row.revision_number) !== expected) {
      throw new ValidationError(
        `Plan ${planId} changed concurrently (effective revision ${row.revision_number}, expected ${expected}); retry`,
      );
    }
  }

  private insertRevision(revision: PlannedKnowledgeRevision): void {
    const { state } = revision;
    this.database
      .prepare(
        `INSERT INTO planned_knowledge_revisions
         (id,planned_knowledge_id,owner_project_id,kind,revision_number,base_revision_number,title,description,
          status,reason,blocking_condition,related_project_id,related_revision_project_id,related_revision_id,
          changed_fields,change_reason,author_id,created_at,source_proposal_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        revision.id,
        revision.plannedKnowledgeId,
        revision.ownerProjectId,
        revision.kind,
        revision.revisionNumber,
        revision.baseRevisionNumber,
        state.title,
        state.description,
        state.status,
        state.reason,
        state.blockingCondition,
        state.relatedProjectId,
        state.relatedRevision?.projectId ?? null,
        state.relatedRevision?.revisionId ?? null,
        revision.changedFields.join(","),
        revision.changeReason,
        revision.authorId,
        revision.createdAt,
        revision.sourceProposalId,
      );
    const nodeInsert = this.database.prepare(
      "INSERT INTO planned_knowledge_revision_nodes (revision_id,owner_project_id,node_project_id,node_id) VALUES (?,?,?,?)",
    );
    for (const node of state.relatedNodes)
      nodeInsert.run(revision.id, revision.ownerProjectId, node.projectId, node.nodeId);
    const evidenceInsert = this.database.prepare(
      "INSERT INTO planned_knowledge_revision_evidence (revision_id,owner_project_id,evidence_project_id,evidence_reference_id) VALUES (?,?,?,?)",
    );
    for (const entry of state.evidence)
      evidenceInsert.run(
        revision.id,
        revision.ownerProjectId,
        entry.projectId,
        entry.evidenceReferenceId,
      );
  }

  private revision(row: Row): PlannedKnowledgeRevision {
    const id = row.id as string;
    return frozen({
      id: id as PlannedKnowledgeRevisionId,
      plannedKnowledgeId: row.planned_knowledge_id as PlannedKnowledgeId,
      ownerProjectId: row.owner_project_id as ProjectId,
      kind: row.kind as PlannedKnowledgeRevision["kind"],
      revisionNumber: row.revision_number === null ? null : Number(row.revision_number),
      baseRevisionNumber: Number(row.base_revision_number),
      state: this.state(
        row,
        "SELECT node_project_id a,node_id b FROM planned_knowledge_revision_nodes WHERE revision_id=? ORDER BY a,b",
        "SELECT evidence_project_id a,evidence_reference_id b FROM planned_knowledge_revision_evidence WHERE revision_id=? ORDER BY a,b",
      ),
      changedFields: frozen(
        (row.changed_fields as string)
          .split(",")
          .filter((field): field is PlannedKnowledgeField =>
            (PLANNED_KNOWLEDGE_FIELDS as readonly string[]).includes(field),
          ),
      ),
      changeReason: row.change_reason as string,
      authorId: row.author_id as string,
      createdAt: row.created_at as string,
      sourceProposalId: (row.source_proposal_id as PlannedKnowledgeRevisionId | null) ?? null,
    });
  }

  private state(row: Row, nodesSql: string, evidenceSql: string): PlannedKnowledgeState {
    const id = row.id as string;
    return frozen({
      title: row.title as string,
      description: row.description as string,
      status: row.status as PlannedKnowledgeStatus,
      reason: row.reason as string,
      blockingCondition: row.blocking_condition as string,
      relatedProjectId: (row.related_project_id as ProjectId | null) ?? null,
      relatedRevision: row.related_revision_id
        ? frozen({
            projectId: row.related_revision_project_id as ProjectId,
            revisionId: row.related_revision_id as RevisionId,
          })
        : null,
      relatedNodes: frozen(
        this.links(nodesSql, id).map(([projectId, nodeId]) =>
          frozen({ projectId: projectId as ProjectId, nodeId: nodeId as NodeId }),
        ),
      ),
      evidence: frozen(
        this.links(evidenceSql, id).map(([projectId, evidenceId]) =>
          frozen({
            projectId: projectId as ProjectId,
            evidenceReferenceId: evidenceId as EvidenceReferenceId,
          }),
        ),
      ),
    });
  }

  private decision(proposalId: string): PlannedKnowledgeRevisionDecision | null {
    const row = this.database
      .prepare("SELECT * FROM planned_knowledge_revision_decisions WHERE proposal_id=?")
      .get(proposalId) as Row | undefined;
    if (!row) return null;
    return frozen({
      id: row.id as PlannedKnowledgeRevisionDecision["id"],
      proposalId: row.proposal_id as PlannedKnowledgeRevisionId,
      ownerProjectId: row.owner_project_id as ProjectId,
      reviewerId: row.reviewer_id as string,
      decision: row.decision as "Accepted" | "Rejected",
      reason: row.reason as string,
      decidedAt: row.decided_at as string,
      resultingRevisionId: (row.resulting_revision_id as PlannedKnowledgeRevisionId | null) ?? null,
      evidence: frozen(
        this.links(
          "SELECT evidence_project_id a,evidence_reference_id b FROM planned_knowledge_revision_decision_evidence WHERE decision_id=? ORDER BY a,b",
          row.id as string,
        ).map(([projectId, id]) =>
          frozen({
            projectId: projectId as ProjectId,
            evidenceReferenceId: id as EvidenceReferenceId,
          }),
        ),
      ),
    });
  }

  private links(sql: string, id: string): [string, string][] {
    return (this.database.prepare(sql).all(id) as { a: string; b: string }[]).map((row) => [
      row.a,
      row.b,
    ]);
  }

  public async getReviewInbox(input: {
    projectIds: readonly ProjectId[];
    scope: Scope;
  }): Promise<readonly ReviewInboxItem[]> {
    if (input.projectIds.length === 0) return frozen([]);
    const allowed = new Set<string>(input.projectIds);
    const items: ReviewInboxItem[] = [];
    const proposals = this.database
      .prepare(
        "SELECT * FROM knowledge_proposals WHERE status='Submitted' AND scope=? ORDER BY created_at,id",
      )
      .all(input.scope) as Row[];
    for (const row of proposals) {
      if (!allowed.has(row.project_id as string)) continue;
      const proposal = this.knowledgeProposal(row);
      items.push(
        frozen({
          kind: "KnowledgeProposal" as const,
          id: proposal.id,
          projectIds: frozen([proposal.projectId]),
          createdAt: proposal.createdAt,
          proposal,
          relationshipProposal: null,
          plannedRevisionProposal: null,
          paths: frozen([this.proposalPath(row)]),
          evidence: frozen(this.proposalEvidence(proposal.id)),
          allowedDecisions: frozen(["Accepted", "Rejected"] as const),
        }),
      );
    }
    const relationships = this.database
      .prepare(
        "SELECT * FROM cross_project_relationship_proposals WHERE status='Submitted' AND scope=? ORDER BY proposed_at,id",
      )
      .all(input.scope) as Row[];
    for (const row of relationships) {
      if (
        !allowed.has(row.source_project_id as string) &&
        !allowed.has(row.target_project_id as string)
      )
        continue;
      const evidence = this.relationshipEvidence(row.id as string);
      const relationshipProposal = frozen({
        id: row.id as never,
        source: frozen({
          projectId: row.source_project_id as ProjectId,
          nodeId: row.source_node_id as NodeId,
          revisionId: row.source_revision_id as RevisionId,
        }),
        target: frozen({
          projectId: row.target_project_id as ProjectId,
          nodeId: row.target_node_id as NodeId,
          revisionId: row.target_revision_id as RevisionId,
        }),
        scope: row.scope as Scope,
        type: "DependsOn" as const,
        evidence: frozen(
          evidence.map((entry) =>
            frozen({ projectId: entry.projectId, evidenceReferenceId: entry.id }),
          ),
        ),
        confidence: row.confidence as "Low" | "Medium" | "High",
        reason: row.reason as string,
        visibility: row.visibility as "SharedBetweenProjects" | "Restricted",
        proposerId: row.proposer_id as string,
        proposedAt: row.proposed_at as string,
        status: "Submitted" as const,
        correlationId: row.correlation_id as never,
      });
      const paths = [
        this.nodePath(row.source_project_id as ProjectId, row.source_node_id as NodeId, null),
        this.nodePath(row.target_project_id as ProjectId, row.target_node_id as NodeId, null),
      ].filter((path): path is NavigationPath => path !== null);
      items.push(
        frozen({
          kind: "CrossProjectRelationshipProposal" as const,
          id: relationshipProposal.id,
          projectIds: frozen([
            relationshipProposal.source.projectId,
            relationshipProposal.target.projectId,
          ]),
          createdAt: relationshipProposal.proposedAt,
          proposal: null,
          relationshipProposal,
          plannedRevisionProposal: null,
          paths: frozen(paths),
          evidence: frozen(evidence),
          allowedDecisions: frozen(["Accepted", "Rejected"] as const),
        }),
      );
    }
    const planProposals = this.database
      .prepare(
        `SELECT r.* FROM planned_knowledge_revisions r
         JOIN planned_knowledge_items p ON p.id=r.planned_knowledge_id
         WHERE r.kind='Proposal' AND p.scope=?
           AND NOT EXISTS (SELECT 1 FROM planned_knowledge_revision_decisions d WHERE d.proposal_id=r.id)
         ORDER BY r.created_at,r.id`,
      )
      .all(input.scope) as Row[];
    for (const row of planProposals) {
      const proposal = this.revision(row);
      const projectIds = [
        proposal.ownerProjectId,
        ...(proposal.state.relatedProjectId ? [proposal.state.relatedProjectId] : []),
      ];
      if (!projectIds.some((id) => allowed.has(id))) continue;
      const effective = this.database
        .prepare("SELECT title,status FROM planned_knowledge_effective WHERE id=?")
        .get(proposal.plannedKnowledgeId) as Row;
      const evidence = proposal.state.evidence
        .map(
          (entry) =>
            this.database
              .prepare("SELECT * FROM evidence_references WHERE id=? AND project_id=?")
              .get(entry.evidenceReferenceId, entry.projectId) as Row | undefined,
        )
        .filter((entry): entry is Row => entry !== undefined)
        .map((entry) => this.evidence(entry));
      items.push(
        frozen({
          kind: "PlannedKnowledgeRevisionProposal" as const,
          id: proposal.id,
          projectIds: frozen(projectIds),
          createdAt: proposal.createdAt,
          proposal: null,
          relationshipProposal: null,
          plannedRevisionProposal: frozen({
            proposal,
            planTitle: effective.title as string,
            effectiveStatus: effective.status as PlannedKnowledgeStatus,
          }),
          paths: frozen([]),
          evidence: frozen(evidence),
          allowedDecisions: frozen(["Accepted", "Rejected"] as const),
        }),
      );
    }
    return frozen(
      items.sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.kind.localeCompare(b.kind) ||
          a.id.localeCompare(b.id),
      ),
    );
  }

  private nodePath(projectId: ProjectId, nodeId: NodeId, plan: Row | null): NavigationPath | null {
    const row = this.database
      .prepare(
        `SELECT p.name project_name,s.id space_id,s.name space_name,c.id collection_id,c.name collection_name,n.title node_title
         FROM knowledge_nodes n JOIN projects p ON p.id=n.project_id
         JOIN knowledge_spaces s ON s.id=n.space_id JOIN knowledge_collections c ON c.id=n.collection_id
         WHERE n.id=? AND n.project_id=?`,
      )
      .get(nodeId, projectId) as Row | undefined;
    if (!row) return null;
    return frozen({
      segments: frozen([
        { kind: "Project" as const, id: projectId, label: row.project_name as string },
        { kind: "Space" as const, id: row.space_id as string, label: row.space_name as string },
        {
          kind: "Collection" as const,
          id: row.collection_id as string,
          label: row.collection_name as string,
        },
        { kind: "Node" as const, id: nodeId, label: row.node_title as string },
        ...(plan
          ? [
              {
                kind: "PlannedKnowledge" as const,
                id: plan.id as string,
                label: plan.title as string,
              },
            ]
          : []),
      ]),
      temporalView: plan ? ("Planned" as const) : null,
    });
  }

  private proposalPath(row: Row): NavigationPath {
    const names = this.database
      .prepare(
        `SELECT p.name project_name,s.name space_name,c.name collection_name FROM projects p
         JOIN knowledge_spaces s ON s.project_id=p.id JOIN knowledge_collections c ON c.space_id=s.id
         WHERE p.id=? AND s.id=? AND c.id=?`,
      )
      .get(row.project_id as string, row.space_id as string, row.collection_id as string) as Row;
    return frozen({
      segments: frozen([
        {
          kind: "Project" as const,
          id: row.project_id as string,
          label: names.project_name as string,
        },
        { kind: "Space" as const, id: row.space_id as string, label: names.space_name as string },
        {
          kind: "Collection" as const,
          id: row.collection_id as string,
          label: names.collection_name as string,
        },
        {
          kind: "Proposal" as const,
          id: row.id as string,
          label: row.proposed_node_title as string,
        },
      ]),
      temporalView: null,
    });
  }

  private knowledgeProposal(row: Row): KnowledgeProposal {
    const sourceIds = (
      this.database
        .prepare(
          "SELECT source_reference_id id FROM proposal_sources WHERE proposal_id=? ORDER BY id",
        )
        .all(row.id as string) as Row[]
    ).map((entry) => entry.id as never);
    const evidenceIds = (
      this.database
        .prepare(
          "SELECT evidence_reference_id id FROM proposal_evidence WHERE proposal_id=? ORDER BY id",
        )
        .all(row.id as string) as Row[]
    ).map((entry) => entry.id as never);
    return frozen({
      id: row.id as KnowledgeProposal["id"],
      projectId: row.project_id as ProjectId,
      spaceId: row.space_id as never,
      collectionId: row.collection_id as never,
      proposedNodeId: row.proposed_node_id as NodeId,
      proposedNodeTitle: row.proposed_node_title as string,
      proposedContent: row.proposed_content as string,
      sourceReferenceIds: frozen(sourceIds),
      evidenceReferenceIds: frozen(evidenceIds),
      proposerId: row.proposer_id as string,
      createdAt: row.created_at as string,
      scope: row.scope as Scope,
      status: "Submitted",
      kind: row.proposal_kind as KnowledgeProposal["kind"],
      changeReason: row.change_reason ?? null,
      expectedPredecessorRevisionId: row.expected_predecessor_revision_id as RevisionId | null,
      rollbackEventId: row.rollback_event_id as never,
      restorationSourceRevisionId: row.restoration_source_revision_id as RevisionId | null,
    });
  }

  private proposalEvidence(id: string): EvidenceReference[] {
    return (
      this.database
        .prepare(
          `SELECT e.* FROM proposal_evidence pe JOIN evidence_references e ON e.id=pe.evidence_reference_id WHERE pe.proposal_id=? ORDER BY e.id`,
        )
        .all(id) as Row[]
    ).map((row) => this.evidence(row));
  }
  private relationshipEvidence(id: string): EvidenceReference[] {
    return (
      this.database
        .prepare(
          `SELECT e.* FROM cross_project_relationship_proposal_evidence pe JOIN evidence_references e ON e.id=pe.evidence_reference_id AND e.project_id=pe.evidence_project_id WHERE pe.proposal_id=? ORDER BY e.project_id,e.id`,
        )
        .all(id) as Row[]
    ).map((row) => this.evidence(row));
  }
  private evidence(row: Row): EvidenceReference {
    return frozen({
      id: row.id as EvidenceReference["id"],
      projectId: row.project_id as ProjectId,
      sourceReferenceId: row.source_reference_id as SourceReference["id"],
      summary: row.summary as string,
      locator: row.locator as string,
      createdAt: row.created_at as string,
    });
  }
  public insertAudit(event: AuditEvent): void {
    this.database
      .prepare(
        `INSERT INTO audit_events (id,project_id,event_type,aggregate_type,aggregate_id,actor_id,occurred_at,correlation_id,payload_json) VALUES (?,?,?,?,?,?,?,?,?)`,
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
    const insert = this.database.prepare(
      "INSERT INTO audit_event_evidence (audit_event_id,project_id,evidence_reference_id) VALUES (?,?,?)",
    );
    for (const id of event.evidenceReferenceIds) insert.run(event.id, event.projectId, id);
  }
}
