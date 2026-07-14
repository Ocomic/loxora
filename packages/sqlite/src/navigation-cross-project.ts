import type { DatabaseSync } from "node:sqlite";
import type {
  CrossProjectDependencySummary,
  CrossProjectRelationshipId,
  NavigationPath,
  ProjectId,
  Scope,
} from "@loxora/core";

type Row = Record<string, string | null>;

export interface CrossProjectProjectMapProjection {
  readonly outgoingDependencies: readonly CrossProjectDependencySummary[];
  readonly incomingDependents: readonly CrossProjectDependencySummary[];
  readonly relatedProjectIds: readonly ProjectId[];
  readonly fingerprintContent: readonly unknown[];
  readonly fingerprintActivity: readonly unknown[];
}

/** Shared builder used by canonical fallback and persisted Project Map generation. */
export function buildCrossProjectProjectMapProjection(
  database: DatabaseSync,
  projectId: ProjectId,
  scope: Scope,
): CrossProjectProjectMapProjection {
  const rows = database
    .prepare(`SELECT r.*,
      src_current.revision_id source_current_revision_id,
      target_current.revision_id target_current_revision_id
      FROM cross_project_relationships r
      LEFT JOIN current_revisions src_current ON src_current.project_id=r.source_project_id
        AND src_current.node_id=r.source_node_id AND src_current.scope=r.scope
      LEFT JOIN current_revisions target_current ON target_current.project_id=r.target_project_id
        AND target_current.node_id=r.target_node_id AND target_current.scope=r.scope
      WHERE r.scope=? AND (r.source_project_id=? OR r.target_project_id=?) ORDER BY r.id`)
    .all(scope, projectId, projectId) as Row[];
  const outgoing: CrossProjectDependencySummary[] = [];
  const incoming: CrossProjectDependencySummary[] = [];
  const related = new Set<ProjectId>();
  const content: unknown[] = [];
  const activity: unknown[] = [];
  for (const row of rows) {
    const isOutgoing = row.source_project_id === projectId;
    const relatedProjectId = (
      isOutgoing ? row.target_project_id : row.source_project_id
    ) as ProjectId;
    related.add(relatedProjectId);
    const relationshipFresh =
      row.source_revision_id === row.source_current_revision_id &&
      row.target_revision_id === row.target_current_revision_id
        ? "Fresh"
        : "Stale";
    const assessment = database
      .prepare(`SELECT * FROM impact_assessments WHERE relationship_id=?
        AND provider_revision_id=? AND consumer_revision_id=?
        ORDER BY assessed_at DESC,id ASC LIMIT 1`)
      .get(
        String(row.id),
        row.target_current_revision_id ?? null,
        row.source_current_revision_id ?? null,
      ) as Row | undefined;
    const assessmentFreshness = assessment ? "Fresh" : null;
    const restricted = row.visibility === "Restricted";
    const warnings: string[] = [];
    if (relationshipFresh === "Stale") warnings.push("StaleRelationshipBinding");
    if (!assessment) warnings.push("NoApplicableImpactAssessment");
    if (restricted) warnings.push("InaccessibleEndpoint");
    const summary = Object.freeze({
      relationshipId: row.id as CrossProjectRelationshipId,
      direction: isOutgoing ? ("DependsOn" as const) : ("DependedOnBy" as const),
      relatedProjectId: restricted ? null : relatedProjectId,
      inaccessibleReferenceId: restricted ? `restricted:${opaque(relatedProjectId)}` : null,
      relationshipBindingFreshness: relationshipFresh,
      assessmentFreshness,
      latestSeverity:
        (assessment?.severity as CrossProjectDependencySummary["latestSeverity"]) ?? null,
      visibility: row.visibility as CrossProjectDependencySummary["visibility"],
      endpointPath: restricted
        ? null
        : endpointPath(
            database,
            relatedProjectId,
            String(isOutgoing ? row.target_node_id : row.source_node_id),
          ),
      warnings: Object.freeze(warnings),
    });
    (isOutgoing ? outgoing : incoming).push(summary);
    content.push({
      id: row.id,
      sourceProjectId: row.source_project_id,
      sourceNodeId: row.source_node_id,
      sourceRevisionId: row.source_revision_id,
      targetProjectId: row.target_project_id,
      targetNodeId: row.target_node_id,
      targetRevisionId: row.target_revision_id,
      sourceCurrentRevisionId: row.source_current_revision_id,
      targetCurrentRevisionId: row.target_current_revision_id,
      confidence: row.confidence,
      visibility: row.visibility,
    });
    if (assessment)
      activity.push({
        id: assessment.id,
        relationshipId: assessment.relationship_id,
        providerRevisionId: assessment.provider_revision_id,
        consumerRevisionId: assessment.consumer_revision_id,
        severity: assessment.severity,
        assessedAt: assessment.assessed_at,
      });
  }
  return Object.freeze({
    outgoingDependencies: Object.freeze(outgoing),
    incomingDependents: Object.freeze(incoming),
    relatedProjectIds: Object.freeze([...related].sort()),
    fingerprintContent: Object.freeze(content),
    fingerprintActivity: Object.freeze(activity),
  });
}

function endpointPath(
  database: DatabaseSync,
  projectId: ProjectId,
  nodeId: string,
): NavigationPath | null {
  const row = database
    .prepare(`SELECT p.name project_name,s.id space_id,s.name space_name,c.id collection_id,
      c.name collection_name,n.title node_title FROM knowledge_nodes n
      JOIN projects p ON p.id=n.project_id JOIN knowledge_spaces s ON s.id=n.space_id
      JOIN knowledge_collections c ON c.id=n.collection_id WHERE n.project_id=? AND n.id=?`)
    .get(projectId, nodeId) as Row | undefined;
  if (!row) return null;
  return Object.freeze({
    segments: Object.freeze([
      Object.freeze({ kind: "Project" as const, id: projectId, label: String(row.project_name) }),
      Object.freeze({
        kind: "Space" as const,
        id: String(row.space_id),
        label: String(row.space_name),
      }),
      Object.freeze({
        kind: "Collection" as const,
        id: String(row.collection_id),
        label: String(row.collection_name),
      }),
      Object.freeze({ kind: "Node" as const, id: nodeId, label: String(row.node_title) }),
    ]),
    temporalView: "Current" as const,
  });
}

function opaque(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
