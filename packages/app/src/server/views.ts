import {
  type Mission,
  type MissionEvent,
  type WorkspaceExport,
  missionNeedsHuman,
  WORKSPACE_EXPORT_SECTIONS,
  type WorkspaceExportRecord,
  workspaceExportRecords,
} from "@loxora/core";

/** Status filters of the Mission Control sidebar (RFC-010, section 4). */
export const MISSION_FILTERS = ["all", "running", "limit", "input", "completed", "failed"] as const;
export type MissionFilter = (typeof MISSION_FILTERS)[number];

export function matchesFilter(mission: Mission, filter: MissionFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return mission.state === "running";
    case "limit":
      return mission.state === "waiting" && mission.waitReason === "provider_limit";
    case "input":
      return (
        mission.state === "waiting" &&
        mission.waitReason !== null &&
        mission.waitReason !== "provider_limit"
      );
    case "completed":
      return mission.state === "completed";
    case "failed":
      return mission.state === "failed";
  }
}

/** Name lookups built from one workspace read; values are display labels only. */
export class Labels {
  private readonly projects: Map<unknown, string>;
  private readonly nodes: Map<unknown, WorkspaceExportRecord>;
  private readonly keys: Map<unknown, string>;
  private readonly plans: Map<unknown, { title: string; status: string }>;

  public constructor(document: WorkspaceExport) {
    const records = (name: string) => {
      const spec = WORKSPACE_EXPORT_SECTIONS.find((entry) => entry.name === name);
      return spec ? workspaceExportRecords(document, spec) : [];
    };
    this.projects = new Map(records("projects").map((p) => [p.id, String(p.name)]));
    this.nodes = new Map(records("knowledgeNodes").map((n) => [n.id, n]));
    this.keys = new Map(records("knowledgeNodeKeys").map((k) => [k.nodeId, String(k.key)]));
    const latest = new Map<unknown, WorkspaceExportRecord>();
    for (const revision of records("plannedKnowledgeRevisions")) {
      if (revision.kind !== "Revision") continue;
      const known = latest.get(revision.plannedKnowledgeId);
      if (!known || Number(revision.revisionNumber) > Number(known.revisionNumber)) {
        latest.set(revision.plannedKnowledgeId, revision);
      }
    }
    this.plans = new Map(
      records("plannedKnowledgeItems").map((item) => {
        const revision = latest.get(item.id);
        return [
          item.id,
          {
            title: String(revision?.title ?? item.title),
            status: String(revision?.status ?? item.status),
          },
        ];
      }),
    );
  }

  public project(id: unknown) {
    return { id: String(id), name: this.projects.get(id) ?? String(id).slice(0, 8) };
  }

  public projectList() {
    return [...this.projects.entries()].map(([id, name]) => ({ id: String(id), name }));
  }

  public node(projectId: unknown, nodeId: unknown) {
    const node = this.nodes.get(nodeId);
    return {
      projectId: String(projectId),
      nodeId: String(nodeId),
      title: node ? String(node.title) : String(nodeId).slice(0, 8),
      key: this.keys.get(nodeId) ?? null,
    };
  }

  public plan(projectId: unknown, planId: unknown) {
    const plan = this.plans.get(planId);
    return {
      projectId: String(projectId),
      planId: String(planId),
      title: plan?.title ?? String(planId).slice(0, 8),
      status: plan?.status ?? null,
    };
  }
}

export function missionSummary(mission: Mission, labels: Labels) {
  return {
    id: mission.id,
    title: mission.title,
    project: labels.project(mission.ownerProjectId),
    state: mission.state,
    waitReason: mission.waitReason,
    workerRole: mission.workerRole,
    currentActivity: mission.currentActivity,
    createdAt: mission.createdAt,
    lastActivityAt: mission.lastActivityAt,
    needsHuman: missionNeedsHuman(mission),
    question: missionNeedsHuman(mission) ? (mission.attentionRequest?.question ?? null) : null,
  };
}

export function missionDetail(mission: Mission, events: readonly MissionEvent[], labels: Labels) {
  const started = events.find((event) => event.type === "Started");
  return {
    ...missionSummary(mission, labels),
    goal: mission.goal,
    waitDetail: mission.waitDetail,
    limitedCapability: mission.limitedCapability,
    expectedResumeAt: mission.expectedResumeAt,
    predecessorMissionId: mission.predecessorMissionId,
    createdBy: mission.createdBy,
    startedAt: started?.occurredAt ?? null,
    latestActor: events.at(-1)?.actorId ?? mission.createdBy,
    sequence: mission.sequence,
    attentionRequest: mission.attentionRequest,
    outcome: mission.outcome,
    references: {
      projects: mission.references.projectIds.map((id) => labels.project(id)),
      nodes: mission.references.nodes.map((node) => labels.node(node.projectId, node.nodeId)),
      plans: mission.references.plans.map((plan) =>
        labels.plan(plan.projectId, plan.plannedKnowledgeId),
      ),
    },
    /** Write actions need a configured human actor (RFC-010, section 9); the MVP has none. */
    availableActions: [] as const,
  };
}
