import {
  MISSION_TRANSITIONS,
  type Mission,
  type MissionEvent,
  missionNeedsHuman,
  type WorkspaceExportRecord,
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

/**
 * The export sections the labels read. Reading only these keeps Mission Control working on a
 * workspace that has `007_missions` but not a later migration (Milestone 15 section 1).
 */
export const LABEL_SECTIONS = [
  "projects",
  "knowledgeNodes",
  "knowledgeNodeKeys",
  "plannedKnowledgeItems",
  "plannedKnowledgeRevisions",
] as const;

type Sections = Readonly<Record<string, readonly WorkspaceExportRecord[]>>;

/** Name lookups built from one workspace read; values are display labels only. */
export class Labels {
  public static async read(store: {
    readWorkspaceSections(names: readonly string[]): Promise<Sections>;
  }): Promise<Labels> {
    return new Labels(await store.readWorkspaceSections(LABEL_SECTIONS));
  }

  private readonly projects: Map<unknown, string>;
  private readonly nodes: Map<unknown, WorkspaceExportRecord>;
  private readonly keys: Map<unknown, string>;
  private readonly plans: Map<unknown, { title: string; status: string }>;

  public constructor(sections: Sections) {
    const records = (name: (typeof LABEL_SECTIONS)[number]) => sections[name] ?? [];
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

/** Write actions of Mission Control (RFC-010, section 9; Milestone 12). */
export const MISSION_ACTIONS = ["answer", "pause", "cancel", "resume"] as const;
export type MissionAction = (typeof MISSION_ACTIONS)[number];

/**
 * The actions the configured human actor may offer for a Mission. A display aid only:
 * Core validates every mutation again when it runs.
 */
export function availableActions(mission: Mission, actor: string | null): MissionAction[] {
  if (!actor) return [];
  const next = MISSION_TRANSITIONS[mission.state];
  const request = mission.attentionRequest;
  const actions: MissionAction[] = [];
  if (mission.state === "waiting" && request && request.answeredAt === null) {
    actions.push("answer");
  }
  if (next.includes("paused")) actions.push("pause");
  if (next.includes("cancelled")) actions.push("cancel");
  if (
    mission.state === "paused" ||
    (mission.state === "waiting" &&
      (mission.waitReason === "provider_limit" || request?.answeredAt != null))
  ) {
    actions.push("resume");
  }
  return actions;
}

export function missionDetail(
  mission: Mission,
  events: readonly MissionEvent[],
  labels: Labels,
  actor: string | null = null,
) {
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
    availableActions: availableActions(mission, actor),
  };
}
