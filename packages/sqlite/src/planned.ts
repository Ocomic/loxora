import type {
  AuditEvent,
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
import type { DatabaseSync } from "node:sqlite";

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
           FROM planned_knowledge_items p
           LEFT JOIN planned_knowledge_nodes n ON n.planned_knowledge_id=p.id
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
      .prepare("SELECT * FROM planned_knowledge_items WHERE id=? AND owner_project_id=?")
      .get(input.plannedKnowledgeId, input.ownerProjectId) as Row | undefined;
    if (!row) return null;
    const nodes = this.database
      .prepare(
        "SELECT node_project_id,node_id FROM planned_knowledge_nodes WHERE planned_knowledge_id=? ORDER BY node_project_id,node_id",
      )
      .all(row.id as string) as Row[];
    const evidenceRows = this.database
      .prepare(
        `SELECT pe.evidence_project_id,pe.evidence_reference_id,e.source_reference_id,e.summary,e.locator,e.created_at,
                s.kind source_kind,s.locator source_locator,s.title source_title,s.created_at source_created_at
         FROM planned_knowledge_evidence pe
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
          paths: frozen(paths),
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
  private insertAudit(event: AuditEvent): void {
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
