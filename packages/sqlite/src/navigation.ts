import type { DatabaseSync } from "node:sqlite";
import {
  NAVIGATION_FINGERPRINT_VERSION,
  NAVIGATION_PROJECTION_VERSION,
  NavigationProjectionBuilder,
  type CollectionNavigation,
  type CollectionNavigationSummary,
  type CollectionId,
  type CorrelationId,
  type EvidenceBacklink,
  type EvidenceNavigation,
  type EvidenceReference,
  type EvidenceReferenceId,
  type NavigationFreshness,
  type NavigationHealth,
  type NavigationSegment,
  type NavigationPath,
  type NavigationStore,
  type NavigationWarning,
  type NodeNavigation,
  type NodeNavigationSummary,
  type NodeId,
  type Project,
  type ProjectId,
  type ProjectMap,
  type RebuildNavigationProjectionResult,
  type RevisionId,
  type Scope,
  type SourceNavigation,
  type SourceReference,
  type SourceReferenceId,
  type SpaceNavigation,
  type SpaceNavigationSummary,
  type SpaceId,
} from "@loxora/core";
import { buildCrossProjectProjectMapProjection } from "./navigation-cross-project.js";

interface BuiltProjection {
  readonly projectMap: ProjectMap;
  readonly collections: readonly CollectionNavigation[];
  readonly nodes: readonly NodeNavigation[];
  readonly contentFingerprint: string;
  readonly activityFingerprint: string;
}

interface GenerationRow {
  id: string;
  fingerprint_version: string;
  content_fingerprint: string;
  activity_fingerprint: string;
  projection_json: string;
  rebuilt_at: string;
  last_failure: string | null;
}

type SqlRow = Record<
  | "id"
  | "project_id"
  | "name"
  | "purpose"
  | "created_at"
  | "description"
  | "space_id"
  | "collection_id"
  | "node_id"
  | "title"
  | "content"
  | "accepted_at"
  | "current_id"
  | "source_reference_id"
  | "summary"
  | "locator"
  | "kind"
  | "source_kind"
  | "source_locator"
  | "source_title"
  | "source_created_at"
  | "revision_id"
  | "scope"
  | "temporal_view"
  | "proposal_id"
  | "project_name"
  | "space_name"
  | "collection_name"
  | "node_title"
  | "reverted_revision_id"
  | "semantic_source_revision_id"
  | "recorded_at"
  | "node_project_id"
  | "planned_id",
  string
>;

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);
const normalized = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("en");
const compare = (left: { name: string; id: string }, right: { name: string; id: string }) =>
  normalized(left.name).localeCompare(normalized(right.name), "en") ||
  left.id.localeCompare(right.id);

export class SqliteNavigationProjectionStore implements NavigationStore {
  private readonly builder = new NavigationProjectionBuilder();

  public constructor(
    private readonly database: DatabaseSync,
    private readonly afterGenerationWritten?: () => void,
  ) {}

  public async getProjectMap(input: {
    projectId: ProjectId;
    scope: Scope;
  }): Promise<ProjectMap | null> {
    return (await this.resolve(input.projectId, input.scope))?.projectMap ?? null;
  }

  public async getSpaceNavigation(input: {
    projectId: ProjectId;
    spaceId: string;
    scope: Scope;
  }): Promise<SpaceNavigation | null> {
    const projection = await this.resolve(input.projectId, input.scope);
    if (!projection) return null;
    const summary = projection.projectMap.spaces.find((item) => item.space.id === input.spaceId);
    if (!summary) return null;
    return freeze({
      summary,
      collections: freeze(
        projection.collections
          .filter((item) => item.summary.collection.spaceId === input.spaceId)
          .map((item) => item.summary),
      ),
      freshness: projection.projectMap.freshness,
    });
  }

  public async getCollectionNavigation(input: {
    projectId: ProjectId;
    collectionId: string;
    scope: Scope;
  }): Promise<CollectionNavigation | null> {
    const projection = await this.resolve(input.projectId, input.scope);
    return (
      projection?.collections.find((item) => item.summary.collection.id === input.collectionId) ??
      null
    );
  }

  public async getNodeNavigation(input: {
    projectId: ProjectId;
    nodeId: string;
    scope: Scope;
  }): Promise<NodeNavigation | null> {
    const projection = await this.resolve(input.projectId, input.scope);
    return projection?.nodes.find((item) => item.summary.node.id === input.nodeId) ?? null;
  }

  public async getNavigationHealth(input: {
    projectId: ProjectId;
    scope: Scope;
  }): Promise<NavigationHealth | null> {
    const map = await this.getProjectMap(input);
    return map
      ? freeze({
          projectId: input.projectId,
          scope: input.scope,
          warnings: map.warnings,
          orphanCount: map.orphanCount,
          freshness: map.freshness,
        })
      : null;
  }

  public async getEvidenceNavigation(input: {
    projectId: ProjectId;
    evidenceReferenceId: EvidenceReferenceId;
  }): Promise<EvidenceNavigation | null> {
    const row = this.database
      .prepare(`SELECT e.*, s.kind source_kind, s.locator source_locator, s.title source_title, s.created_at source_created_at
      FROM evidence_references e JOIN source_references s ON s.id=e.source_reference_id
      WHERE e.id=? AND e.project_id=?`)
      .get(input.evidenceReferenceId, input.projectId) as SqlRow | undefined;
    if (!row) return null;
    const evidence = this.evidence(row);
    const source = this.source(
      row.source_reference_id,
      row.project_id,
      row.source_kind,
      row.source_locator,
      row.source_title,
      row.source_created_at,
    );
    const revisionRows = this.database
      .prepare(`SELECT DISTINCT r.id revision_id, r.node_id, r.scope,
      CASE WHEN cr.revision_id=r.id THEN 'Current' ELSE 'Historical' END temporal_view
      FROM revision_evidence re JOIN knowledge_revisions r ON r.id=re.revision_id
      LEFT JOIN current_revisions cr ON cr.project_id=r.project_id AND cr.node_id=r.node_id AND cr.scope=r.scope
      WHERE re.evidence_reference_id=? AND re.project_id=? ORDER BY r.id`)
      .all(input.evidenceReferenceId, input.projectId) as SqlRow[];
    const proposalRows = this.database
      .prepare(`SELECT p.id proposal_id, p.proposed_node_id node_id FROM proposal_evidence pe
      JOIN knowledge_proposals p ON p.id=pe.proposal_id WHERE pe.evidence_reference_id=? AND pe.project_id=? ORDER BY p.id`)
      .all(input.evidenceReferenceId, input.projectId) as SqlRow[];
    const plannedRows = this.hasTable("planned_knowledge_evidence")
      ? (this.database
          .prepare(`SELECT p.id planned_id,n.node_project_id,n.node_id FROM planned_knowledge_evidence pe
      JOIN planned_knowledge_items p ON p.id=pe.planned_knowledge_id
      JOIN planned_knowledge_nodes n ON n.planned_knowledge_id=p.id
      WHERE pe.evidence_reference_id=? AND pe.evidence_project_id=?
      ORDER BY p.id,n.node_project_id,n.node_id`)
          .all(input.evidenceReferenceId, input.projectId) as SqlRow[])
      : [];
    const backlinks: EvidenceBacklink[] = [];
    for (const item of revisionRows) {
      const node = await this.nodePath(
        input.projectId,
        item.node_id,
        item.temporal_view as "Current" | "Historical",
        item.revision_id,
      );
      if (node)
        backlinks.push(
          freeze({
            proposalId: null,
            plannedKnowledgeId: null,
            revisionId: item.revision_id as RevisionId,
            temporalView: item.temporal_view as "Current" | "Historical",
            path: node,
          }),
        );
    }
    for (const item of proposalRows) {
      const path = await this.nodePath(input.projectId, item.node_id, null);
      if (path)
        backlinks.push(
          freeze({
            proposalId: item.proposal_id as EvidenceBacklink["proposalId"],
            plannedKnowledgeId: null,
            revisionId: null,
            temporalView: null,
            path,
          }),
        );
    }
    for (const item of plannedRows) {
      const path = await this.nodePath(item.node_project_id as ProjectId, item.node_id, "Planned");
      if (path)
        backlinks.push(
          freeze({
            proposalId: null,
            plannedKnowledgeId: item.planned_id as EvidenceBacklink["plannedKnowledgeId"],
            revisionId: null,
            temporalView: "Planned" as const,
            path,
          }),
        );
    }
    return freeze({ evidence, source, backlinks: freeze(backlinks) });
  }

  public async getSourceNavigation(input: {
    projectId: ProjectId;
    sourceReferenceId: SourceReferenceId;
  }): Promise<SourceNavigation | null> {
    const row = this.database
      .prepare("SELECT * FROM source_references WHERE id=? AND project_id=?")
      .get(input.sourceReferenceId, input.projectId) as SqlRow | undefined;
    if (!row) return null;
    const source = this.source(
      row.id,
      row.project_id,
      row.kind,
      row.locator,
      row.title,
      row.created_at,
    );
    const evidenceRows = this.database
      .prepare(
        "SELECT id FROM evidence_references WHERE source_reference_id=? AND project_id=? ORDER BY id",
      )
      .all(input.sourceReferenceId, input.projectId) as { id: string }[];
    const evidence = [];
    for (const item of evidenceRows) {
      const result = await this.getEvidenceNavigation({
        projectId: input.projectId,
        evidenceReferenceId: item.id as EvidenceReferenceId,
      });
      if (result) evidence.push(result);
    }
    return freeze({ source, evidence: freeze(evidence) });
  }

  public async rebuildNavigationProjection(input: {
    projectId: ProjectId;
    scope: Scope;
    actorId: string;
    generationId: string;
    correlationId: CorrelationId;
    auditEventIds: readonly string[];
    occurredAt: string;
  }): Promise<RebuildNavigationProjectionResult> {
    const before = await this.resolve(input.projectId, input.scope);
    const built = this.build(input.projectId, input.scope, this.missingFreshness());
    if (!built) throw new Error(`Project ${input.projectId} was not found`);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(`INSERT INTO navigation_projection_generations
        (id,project_id,scope,projection_version,fingerprint_version,content_fingerprint,activity_fingerprint,projection_json,rebuilt_at,correlation_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(
          input.generationId,
          input.projectId,
          input.scope,
          NAVIGATION_PROJECTION_VERSION,
          NAVIGATION_FINGERPRINT_VERSION,
          built.contentFingerprint,
          built.activityFingerprint,
          JSON.stringify(built),
          input.occurredAt,
          input.correlationId,
        );
      this.insertEntries(input.generationId, input.projectId, input.scope, built);
      this.insertWarnings(
        input.generationId,
        input.projectId,
        input.scope,
        built.projectMap.warnings,
      );
      this.afterGenerationWritten?.();
      this.database
        .prepare(`INSERT INTO navigation_projection_state
        (project_id,scope,projection_version,active_generation_id,last_attempted_at,last_failure)
        VALUES (?,?,?,?,?,NULL) ON CONFLICT(project_id,scope,projection_version) DO UPDATE SET
        active_generation_id=excluded.active_generation_id,last_attempted_at=excluded.last_attempted_at,last_failure=NULL`)
        .run(
          input.projectId,
          input.scope,
          NAVIGATION_PROJECTION_VERSION,
          input.generationId,
          input.occurredAt,
        );
      this.insertAudit(input.auditEventIds[0], input, "NavigationProjectionRebuilt", {
        generationId: input.generationId,
      });
      const beforeOrphans = before?.projectMap.orphanCount ?? 0;
      if (built.projectMap.orphanCount > beforeOrphans)
        this.insertAudit(input.auditEventIds[1], input, "NavigationOrphansDetected", {
          orphanCount: built.projectMap.orphanCount,
        });
      if (built.projectMap.orphanCount < beforeOrphans)
        this.insertAudit(input.auditEventIds[2], input, "NavigationOrphansResolved", {
          orphanCount: built.projectMap.orphanCount,
        });
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      this.database
        .prepare(`INSERT INTO navigation_projection_state
        (project_id,scope,projection_version,last_attempted_at,last_failure) VALUES (?,?,?,?,?)
        ON CONFLICT(project_id,scope,projection_version) DO UPDATE SET last_attempted_at=excluded.last_attempted_at,last_failure=excluded.last_failure`)
        .run(
          input.projectId,
          input.scope,
          NAVIGATION_PROJECTION_VERSION,
          input.occurredAt,
          "Projection rebuild failed",
        );
      throw error;
    }
    const result = await this.resolve(input.projectId, input.scope);
    if (!result) throw new Error("Projection disappeared after rebuild");
    return freeze({
      projectMap: result.projectMap,
      generationId: input.generationId,
      correlationId: input.correlationId,
    });
  }

  private async resolve(projectId: ProjectId, scope: Scope): Promise<BuiltProjection | null> {
    const canonical = this.build(projectId, scope, this.missingFreshness());
    if (!canonical) return null;
    const generation = this.activeGeneration(projectId, scope);
    if (!generation || generation.fingerprint_version !== NAVIGATION_FINGERPRINT_VERSION)
      return canonical;
    const projectionWarnings = this.projectionWarnings(generation.id, canonical);
    const content =
      generation.content_fingerprint === canonical.contentFingerprint &&
      projectionWarnings.length === 0
        ? "Fresh"
        : "Stale";
    const activity =
      generation.activity_fingerprint === canonical.activityFingerprint ? "Fresh" : "Stale";
    const freshness: NavigationFreshness = freeze({
      content,
      activity,
      fingerprintVersion: NAVIGATION_FINGERPRINT_VERSION,
      projectionVersion: NAVIGATION_PROJECTION_VERSION,
      rebuiltAt: generation.rebuilt_at,
      lastFailure: generation.last_failure,
    });
    if (content === "Fresh") {
      try {
        const persisted = JSON.parse(generation.projection_json) as BuiltProjection;
        return this.withFreshness(
          persisted,
          freshness,
          activity === "Fresh"
            ? persisted.projectMap.lastRelevantActivityAt
            : canonical.projectMap.lastRelevantActivityAt,
        );
      } catch {
        projectionWarnings.push(
          this.warning(
            "ProjectionOrphan",
            "ProjectionUnreadable",
            "Project",
            projectId,
            "Active projection payload is unreadable",
            canonical.projectMap.path,
          ),
        );
        return this.withWarnings(
          canonical,
          freeze({ ...freshness, content: "Stale" }),
          projectionWarnings,
        );
      }
    }
    return this.withWarnings(canonical, freshness, projectionWarnings);
  }

  private build(
    projectId: ProjectId,
    scope: Scope,
    freshness: NavigationFreshness,
  ): BuiltProjection | null {
    const projectRow = this.database.prepare("SELECT * FROM projects WHERE id=?").get(projectId) as
      | SqlRow
      | undefined;
    if (!projectRow) return null;
    const project: Project = freeze({
      id: projectId,
      name: projectRow.name,
      purpose: projectRow.purpose ?? "",
      createdAt: projectRow.created_at,
    });
    const spaces = this.database
      .prepare("SELECT * FROM knowledge_spaces WHERE project_id=? ORDER BY lower(name),id")
      .all(projectId) as SqlRow[];
    const collections = this.database
      .prepare("SELECT * FROM knowledge_collections WHERE project_id=? ORDER BY lower(name),id")
      .all(projectId) as SqlRow[];
    const nodes = this.database
      .prepare("SELECT * FROM knowledge_nodes WHERE project_id=? ORDER BY lower(title),id")
      .all(projectId) as SqlRow[];
    const revisions = this.database
      .prepare(`SELECT r.*, cr.revision_id current_id FROM knowledge_revisions r LEFT JOIN current_revisions cr
      ON cr.project_id=r.project_id AND cr.node_id=r.node_id AND cr.scope=r.scope WHERE r.project_id=? AND r.scope=? ORDER BY r.id`)
      .all(projectId, scope) as SqlRow[];
    const current = new Map(
      revisions.filter((r) => r.current_id === r.id).map((r) => [r.node_id, r]),
    );
    const revByNode = new Map<string, SqlRow[]>();
    for (const revision of revisions)
      revByNode.set(revision.node_id, [...(revByNode.get(revision.node_id) ?? []), revision]);
    const warnings: NavigationWarning[] = [];
    const projectPath = this.path([{ kind: "Project", id: project.id, label: project.name }], null);
    if (!project.purpose)
      warnings.push(
        this.warning(
          "Quality",
          "MissingProjectPurpose",
          "Project",
          project.id,
          "Project purpose is empty",
          projectPath,
        ),
      );
    const nodeSummaries: NodeNavigation[] = nodes.map((row) => {
      const collection = collections.find((item) => item.id === row.collection_id) as SqlRow;
      const space = spaces.find((item) => item.id === row.space_id) as SqlRow;
      const path = this.path(
        [
          { kind: "Project", id: project.id, label: project.name },
          { kind: "Space", id: space.id, label: space.name },
          { kind: "Collection", id: collection.id, label: collection.name },
          { kind: "Node", id: row.id, label: row.title },
        ],
        "Current",
      );
      const accepted = revByNode.get(row.id) ?? [];
      const currentRevision = current.get(row.id);
      const localWarnings: NavigationWarning[] = [];
      if (!currentRevision)
        localWarnings.push(
          this.warning(
            "SemanticOrphan",
            "MissingCurrent",
            "Node",
            row.id,
            "Node has no Current Revision",
            path,
          ),
        );
      warnings.push(...localWarnings);
      const evidenceCount = currentRevision
        ? this.count(
            "SELECT COUNT(*) count FROM revision_evidence WHERE revision_id=?",
            currentRevision.id,
          )
        : 0;
      const sourceCount = currentRevision
        ? this.count(
            `SELECT COUNT(DISTINCT e.source_reference_id) count FROM revision_evidence re JOIN evidence_references e ON e.id=re.evidence_reference_id WHERE re.revision_id=?`,
            currentRevision.id,
          )
        : 0;
      const node = freeze({
        id: row.id as NodeId,
        projectId,
        spaceId: row.space_id as SpaceId,
        collectionId: row.collection_id as CollectionId,
        title: row.title,
        createdAt: row.created_at,
      });
      const summary: NodeNavigationSummary = freeze({
        node,
        path,
        currentPreview: currentRevision ? this.builder.preview(currentRevision.content) : null,
        currentRevisionId: (currentRevision?.id as RevisionId | undefined) ?? null,
        latestAcceptedAt: currentRevision?.accepted_at ?? null,
        acceptedRevisionCount: accepted.length,
        historicalRevisionCount: Math.max(0, accepted.length - (currentRevision ? 1 : 0)),
        hasHistory: accepted.length > 1,
        currentEvidenceCount: evidenceCount,
        currentSourceCount: sourceCount,
        warnings: freeze(localWarnings),
      });
      return freeze({ summary, freshness });
    });
    const collectionNav: CollectionNavigation[] = collections.map((row) => {
      const space = spaces.find((item) => item.id === row.space_id) as SqlRow;
      const children = nodeSummaries.filter((item) => item.summary.node.collectionId === row.id);
      const path = this.path(
        [
          { kind: "Project", id: project.id, label: project.name },
          { kind: "Space", id: space.id, label: space.name },
          { kind: "Collection", id: row.id, label: row.name },
        ],
        null,
      );
      const local: NavigationWarning[] = [];
      if (!(row.description ?? ""))
        local.push(
          this.warning(
            "Quality",
            "MissingCollectionDescription",
            "Collection",
            row.id,
            "Collection description is empty",
            path,
          ),
        );
      warnings.push(...local);
      const counts = this.counts(children.map((item) => item.summary));
      const summary: CollectionNavigationSummary = freeze({
        collection: freeze({
          id: row.id as CollectionId,
          projectId,
          spaceId: row.space_id as SpaceId,
          name: row.name,
          description: row.description ?? "",
          createdAt: row.created_at,
        }),
        path,
        description: row.description ?? "",
        ...counts,
        warnings: freeze(local),
      });
      return freeze({ summary, nodes: freeze(children.map((item) => item.summary)), freshness });
    });
    const spaceSummaries: SpaceNavigationSummary[] = spaces
      .map((row) => {
        const children = collectionNav.filter((item) => item.summary.collection.spaceId === row.id);
        const nodesFor = children.flatMap((item) => item.nodes);
        const path = this.path(
          [
            { kind: "Project", id: project.id, label: project.name },
            { kind: "Space", id: row.id, label: row.name },
          ],
          null,
        );
        const local: NavigationWarning[] = [];
        if (!(row.description ?? ""))
          local.push(
            this.warning(
              "Quality",
              "MissingSpaceDescription",
              "Space",
              row.id,
              "Space description is empty",
              path,
            ),
          );
        warnings.push(...local);
        return freeze({
          space: freeze({
            id: row.id as SpaceId,
            projectId,
            name: row.name,
            description: row.description ?? "",
            createdAt: row.created_at,
          }),
          path,
          description: row.description ?? "",
          ...this.counts(nodesFor),
          warnings: freeze(local),
        });
      })
      .sort((a, b) =>
        compare({ name: a.space.name, id: a.space.id }, { name: b.space.name, id: b.space.id }),
      );
    const sourceRows = this.database
      .prepare("SELECT * FROM source_references WHERE project_id=? ORDER BY id")
      .all(projectId) as SqlRow[];
    const sources = sourceRows.map((row) =>
      this.source(row.id, row.project_id, row.kind, row.locator, row.title, row.created_at),
    );
    const activityRows = this.database
      .prepare(
        "SELECT id,node_id,reverted_revision_id,semantic_source_revision_id,recorded_at FROM rollback_events WHERE project_id=? AND scope=? ORDER BY recorded_at,id",
      )
      .all(projectId, scope);
    const lifecycleActivity = this.database
      .prepare(
        `SELECT id,event_type,aggregate_type,aggregate_id,occurred_at,correlation_id
         FROM audit_events WHERE project_id=? AND event_type NOT LIKE 'Navigation%'
         ORDER BY occurred_at,id`,
      )
      .all(projectId);
    const content = {
      project,
      spaces,
      collections,
      nodes,
      revisions: revisions.map(({ current_id, ...rest }) => ({
        ...rest,
        isCurrent: current_id === rest.id,
      })),
      sources,
      plannedKnowledge: this.database
        .prepare(
          `SELECT p.* FROM planned_knowledge_items p
           WHERE p.scope=? AND (p.owner_project_id=? OR p.related_project_id=?)
           ORDER BY p.owner_project_id,p.id`,
        )
        .all(scope, projectId, projectId),
    };
    const activity = { rollbackEvents: activityRows, lifecycleEvents: lifecycleActivity };
    const crossProject = buildCrossProjectProjectMapProjection(this.database, projectId, scope);
    const contentWithRelationships = {
      ...content,
      crossProject: crossProject.fingerprintContent,
    };
    const activityWithAssessments = {
      ...activity,
      crossProject: crossProject.fingerprintActivity,
    };
    const fingerprints = this.builder.fingerprints({
      content: contentWithRelationships,
      activity: activityWithAssessments,
    });
    const allCounts = this.counts(nodeSummaries.map((item) => item.summary));
    const plannedKnowledgeCount = Number(
      (
        this.database
          .prepare(
            `SELECT COUNT(*) count FROM planned_knowledge_items
             WHERE scope=? AND (owner_project_id=? OR related_project_id=?)`,
          )
          .get(scope, projectId, projectId) as { count: number }
      ).count,
    );
    const lastActivity =
      (
        this.database
          .prepare(
            `SELECT occurred_at FROM audit_events WHERE project_id=? AND event_type NOT LIKE 'Navigation%' ORDER BY occurred_at DESC,id DESC LIMIT 1`,
          )
          .get(projectId) as { occurred_at: string } | undefined
      )?.occurred_at ?? null;
    const map: ProjectMap = freeze({
      project,
      scope,
      path: projectPath,
      purpose: project.purpose,
      spaces: freeze(spaceSummaries),
      externalSources: freeze(sources),
      ...allCounts,
      orphanCount: warnings.filter(
        (item) => item.category === "SemanticOrphan" || item.category === "ProjectionOrphan",
      ).length,
      warnings: freeze(warnings),
      freshness,
      lastRelevantActivityAt: lastActivity,
      outgoingDependencies: crossProject.outgoingDependencies,
      incomingDependents: crossProject.incomingDependents,
      relatedProjectIds: crossProject.relatedProjectIds,
      plannedKnowledgeCount,
    });
    return freeze({
      projectMap: map,
      collections: freeze(collectionNav),
      nodes: freeze(nodeSummaries),
      contentFingerprint: fingerprints.content,
      activityFingerprint: fingerprints.activity,
    });
  }

  private counts(nodes: readonly NodeNavigationSummary[]) {
    return {
      collectionCount: new Set(nodes.map((n) => n.node.collectionId)).size,
      nodeCount: nodes.length,
      currentNodeCount: nodes.filter((n) => n.currentRevisionId).length,
      acceptedRevisionCount: nodes.reduce((n, i) => n + i.acceptedRevisionCount, 0),
      historicalRevisionCount: nodes.reduce((n, i) => n + i.historicalRevisionCount, 0),
      nodesWithHistoryCount: nodes.filter((n) => n.hasHistory).length,
    };
  }
  private missingFreshness(): NavigationFreshness {
    return freeze({
      content: "Missing",
      activity: "Missing",
      fingerprintVersion: NAVIGATION_FINGERPRINT_VERSION,
      projectionVersion: NAVIGATION_PROJECTION_VERSION,
      rebuiltAt: null,
      lastFailure: null,
    });
  }
  private withFreshness(
    built: BuiltProjection,
    freshness: NavigationFreshness,
    last: string | null,
  ): BuiltProjection {
    const nodes = built.nodes.map((n) => freeze({ ...n, freshness }));
    const collections = built.collections.map((c) =>
      freeze({ ...c, freshness, nodes: freeze(c.nodes) }),
    );
    return freeze({
      ...built,
      nodes: freeze(nodes),
      collections: freeze(collections),
      projectMap: freeze({ ...built.projectMap, freshness, lastRelevantActivityAt: last }),
    });
  }
  private withWarnings(
    built: BuiltProjection,
    freshness: NavigationFreshness,
    additional: readonly NavigationWarning[],
  ): BuiltProjection {
    const refreshed = this.withFreshness(built, freshness, built.projectMap.lastRelevantActivityAt);
    const warnings = freeze([...refreshed.projectMap.warnings, ...additional]);
    return freeze({
      ...refreshed,
      projectMap: freeze({
        ...refreshed.projectMap,
        warnings,
        orphanCount: warnings.filter(
          (item) => item.category === "SemanticOrphan" || item.category === "ProjectionOrphan",
        ).length,
      }),
    });
  }
  private projectionWarnings(
    generationId: string,
    canonical: BuiltProjection,
  ): NavigationWarning[] {
    const projected = new Set(
      (
        this.database
          .prepare(
            "SELECT entity_id FROM navigation_projection_entries WHERE generation_id=? AND entity_kind='Node'",
          )
          .all(generationId) as { entity_id: string }[]
      ).map((item) => item.entity_id),
    );
    return canonical.nodes
      .filter((item) => !projected.has(item.summary.node.id))
      .map((item) =>
        this.warning(
          "ProjectionOrphan",
          "NodeMissingFromProjection",
          "Node",
          item.summary.node.id,
          "Canonical Node is missing from the active projection",
          item.summary.path,
        ),
      );
  }
  private activeGeneration(projectId: ProjectId, scope: Scope): GenerationRow | undefined {
    return this.database
      .prepare(
        `SELECT g.*,s.last_failure FROM navigation_projection_state s JOIN navigation_projection_generations g ON g.id=s.active_generation_id WHERE s.project_id=? AND s.scope=? AND s.projection_version=?`,
      )
      .get(projectId, scope, NAVIGATION_PROJECTION_VERSION) as unknown as GenerationRow | undefined;
  }
  private path(
    segments: NavigationPath["segments"],
    temporalView: NavigationPath["temporalView"],
  ): NavigationPath {
    return freeze({ segments: freeze(segments.map((s) => freeze(s))), temporalView });
  }
  private warning(
    category: NavigationWarning["category"],
    code: string,
    entityKind: NavigationWarning["entityKind"],
    entityId: string,
    detail: string,
    path: NavigationPath | null,
  ): NavigationWarning {
    return freeze({ category, code, entityKind, entityId, detail, path });
  }
  private count(sql: string, id: string): number {
    return Number((this.database.prepare(sql).get(id) as { count: number }).count);
  }
  private hasTable(name: string): boolean {
    return (
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(name) !== undefined
    );
  }
  private source(
    id: string,
    projectId: string,
    kind: string,
    locator: string,
    title: string,
    createdAt: string,
  ): SourceReference {
    return freeze({
      id: id as SourceReferenceId,
      projectId: projectId as ProjectId,
      kind,
      locator,
      title,
      createdAt,
    });
  }
  private evidence(row: SqlRow): EvidenceReference {
    return freeze({
      id: row.id as EvidenceReferenceId,
      projectId: row.project_id as ProjectId,
      sourceReferenceId: row.source_reference_id as SourceReferenceId,
      summary: row.summary,
      locator: row.locator,
      createdAt: row.created_at,
    });
  }
  private async nodePath(
    projectId: ProjectId,
    nodeId: string,
    temporal: NavigationPath["temporalView"],
    revisionId?: string,
  ): Promise<NavigationPath | null> {
    const row = this.database
      .prepare(
        `SELECT p.name project_name,s.id space_id,s.name space_name,c.id collection_id,c.name collection_name,n.id node_id,n.title node_title FROM knowledge_nodes n JOIN projects p ON p.id=n.project_id JOIN knowledge_spaces s ON s.id=n.space_id JOIN knowledge_collections c ON c.id=n.collection_id WHERE n.id=? AND n.project_id=?`,
      )
      .get(nodeId, projectId) as SqlRow | undefined;
    if (!row) return null;
    const segments: NavigationSegment[] = [
      { kind: "Project", id: projectId, label: row.project_name },
      { kind: "Space", id: row.space_id, label: row.space_name },
      { kind: "Collection", id: row.collection_id, label: row.collection_name },
      { kind: "Node", id: row.node_id, label: row.node_title },
    ];
    if (revisionId) segments.push({ kind: "Revision", id: revisionId, label: revisionId });
    return this.path(segments, temporal);
  }
  private insertEntries(
    generationId: string,
    projectId: ProjectId,
    scope: Scope,
    built: BuiltProjection,
  ): void {
    const insert = this.database.prepare(
      `INSERT INTO navigation_projection_entries (generation_id,project_id,scope,entity_kind,entity_id,parent_entity_id,project_ref_id,space_ref_id,collection_ref_id,node_ref_id,display_name,preview) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    insert.run(
      generationId,
      projectId,
      scope,
      "Project",
      projectId,
      null,
      projectId,
      null,
      null,
      null,
      built.projectMap.project.name,
      null,
    );
    for (const space of built.projectMap.spaces)
      insert.run(
        generationId,
        projectId,
        scope,
        "Space",
        space.space.id,
        projectId,
        projectId,
        space.space.id,
        null,
        null,
        space.space.name,
        null,
      );
    for (const collection of built.collections)
      insert.run(
        generationId,
        projectId,
        scope,
        "Collection",
        collection.summary.collection.id,
        collection.summary.collection.spaceId,
        projectId,
        collection.summary.collection.spaceId,
        collection.summary.collection.id,
        null,
        collection.summary.collection.name,
        null,
      );
    for (const node of built.nodes)
      insert.run(
        generationId,
        projectId,
        scope,
        "Node",
        node.summary.node.id,
        node.summary.node.collectionId,
        projectId,
        node.summary.node.spaceId,
        node.summary.node.collectionId,
        node.summary.node.id,
        node.summary.node.title,
        node.summary.currentPreview,
      );
  }
  private insertWarnings(
    generationId: string,
    projectId: ProjectId,
    scope: Scope,
    warnings: readonly NavigationWarning[],
  ): void {
    const insert = this.database.prepare(
      `INSERT INTO navigation_projection_warnings (generation_id,project_id,scope,category,code,entity_kind,entity_id,detail,warning_json) VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    for (const warning of warnings)
      insert.run(
        generationId,
        projectId,
        scope,
        warning.category,
        warning.code,
        warning.entityKind,
        warning.entityId,
        warning.detail,
        JSON.stringify(warning),
      );
  }
  private insertAudit(
    id: string | undefined,
    input: {
      projectId: ProjectId;
      actorId: string;
      occurredAt: string;
      correlationId: CorrelationId;
    },
    type: string,
    payload: unknown,
  ): void {
    if (!id) return;
    this.database
      .prepare(
        `INSERT INTO audit_events (id,project_id,event_type,aggregate_type,aggregate_id,actor_id,occurred_at,correlation_id,payload_json) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        type,
        "NavigationProjection",
        input.projectId,
        input.actorId,
        input.occurredAt,
        input.correlationId,
        JSON.stringify(payload),
      );
  }
}
