import { type AppSettings, writeSettings } from "@loxora/cli";
import {
  type CollectionId,
  type EvidenceReferenceId,
  LifecycleService,
  type Mission,
  type MissionId,
  MissionService,
  NavigationService,
  type ProjectId,
  type ProposalId,
  type SourceReferenceId,
  type SpaceId,
} from "@loxora/core";
import type { openSqliteReadOnlyStore, openSqliteWritableStore } from "@loxora/sqlite";
import type { ActionPayload, RecordGoalAction } from "./assistant.js";
import { loadSettings, SetupRejected } from "./setup.js";

/**
 * The first steps of the setup (RFC-011 parts D and E, Milestone 13 section 7): the project,
 * the first Mission, and the first accepted knowledge. Every write goes through existing Core
 * operations, after the person confirmed the action. The ids already written are kept in
 * the settings file, so a step repeated after a failure continues instead of duplicating.
 * Since Milestone 14 the project is created in the setup conversation, and the first Mission
 * is offered on the bridge after the setup ended (section 4).
 */

/** Xora's actor id; used in script mode too, so the audit trail does not change later. */
export const XORA = "agent:xora";

type ReadStore = Awaited<ReturnType<typeof openSqliteReadOnlyStore>>;
type WriteStore = Awaited<ReturnType<typeof openSqliteWritableStore>>;
type Setup = NonNullable<AppSettings["setup"]>;

export type FirstStepsStage = "goal" | "mission" | "answer" | "record" | "hints";

export interface FirstStepsState {
  /** The first Mission is offered on the bridge (Milestone 14 section 4). */
  readonly pending: boolean;
  readonly stage: FirstStepsStage;
  readonly projectId: string | null;
  readonly purpose: string | null;
  readonly missionId: string | null;
  /** The answer to the first Mission's question, once given. */
  readonly answer: string | null;
}

/** The latest answer recorded on the Mission, from its events. */
async function latestAnswer(missions: MissionService, mission: Mission): Promise<string | null> {
  if (mission.attentionRequest?.response) return mission.attentionRequest.response;
  const events = await missions.getMissionEvents({ missionId: mission.id });
  const answered = events.filter((event) => event.type === "AttentionAnswered").at(-1);
  const response = answered?.payload.response;
  return typeof response === "string" ? response : null;
}

function projectDone(setup: Setup): boolean {
  return Boolean(setup.projectId && setup.spaceIds?.length === 3 && setup.collectionId);
}

/**
 * The step of the setup conversation once the logbook exists (Milestone 14): the project,
 * then the closing message on the way to the bridge; null after the setup ended.
 */
export function conversationStep(settings: AppSettings): "project" | "bridge" | null {
  const setup = settings.setup ?? {};
  if (setup.completedAt) return null;
  return projectDone(setup) ? "bridge" : "project";
}

const OFFERED: ReadonlySet<FirstStepsStage> = new Set(["mission", "answer", "record"]);

async function stage(
  store: ReadStore | WriteStore,
  setup: Setup,
): Promise<{ stage: FirstStepsStage; mission: Mission | null; answer: string | null }> {
  if (!projectDone(setup)) return { stage: "goal", mission: null, answer: null };
  const missions = new MissionService(store);
  const mission = setup.missionId
    ? await missions.getMission({ missionId: setup.missionId as MissionId })
    : null;
  if (!mission || mission.state === "cancelled" || mission.state === "failed") {
    return { stage: "mission", mission: null, answer: null };
  }
  const answer = await latestAnswer(missions, mission);
  if (mission.state === "completed") {
    const status = mission.outcome?.proposals[0]?.status;
    return { stage: status === "Submitted" ? "record" : "hints", mission, answer };
  }
  if (mission.state === "waiting" && mission.attentionRequest && !answer) {
    return { stage: "answer", mission, answer };
  }
  if (mission.state === "paused") return { stage: "answer", mission, answer };
  if (!answer) return { stage: "mission", mission, answer };
  return { stage: "record", mission, answer };
}

export async function firstStepsState(
  store: ReadStore,
  settings: AppSettings,
): Promise<FirstStepsState> {
  const setup = settings.setup ?? {};
  const current = await stage(store, setup);
  return {
    pending: Boolean(
      setup.completedAt && !setup.firstMissionDismissedAt && OFFERED.has(current.stage),
    ),
    stage: current.stage,
    projectId: setup.projectId ?? null,
    purpose: setup.purpose ?? null,
    missionId: current.mission?.id ?? null,
    answer: current.answer,
  };
}

/** The stage an action belongs to; any other stage refuses it. */
const ACTION_STAGE: Record<ActionPayload["kind"], FirstStepsStage> = {
  createProject: "goal",
  startFirstMission: "mission",
  recordGoal: "record",
};

/**
 * Executes one confirmed action. `captain` is the human who confirmed it; the writes are
 * attributed as in Milestone 13 section 7.
 */
export async function executeAction(
  store: WriteStore,
  settingsPath: string,
  action: ActionPayload,
  captain: string,
): Promise<void> {
  const settings = loadSettings(settingsPath);
  // The project belongs to the setup conversation; the first Mission to the bridge offer.
  const closed =
    action.kind === "createProject"
      ? settings.setup?.completedAt
      : settings.setup?.firstMissionDismissedAt;
  if (closed) {
    throw new SetupRejected(409, "SetupFinished", "This step of the setup is already closed");
  }
  const current = await stage(store, settings.setup ?? {});
  if (current.stage !== ACTION_STAGE[action.kind]) {
    throw new SetupRejected(409, "WrongStep", `This step is not due now (now: ${current.stage})`);
  }
  const save = (change: Partial<Setup>) => {
    const latest = loadSettings(settingsPath);
    writeSettings(settingsPath, { ...latest, setup: { ...latest.setup, ...change } });
  };
  const setup = () => loadSettings(settingsPath).setup ?? {};
  const lifecycle = new LifecycleService(store);
  const missions = new MissionService(store);
  switch (action.kind) {
    case "createProject": {
      let projectId = setup().projectId as ProjectId | undefined;
      if (!projectId) {
        const project = await lifecycle.createProject({
          name: action.name,
          purpose: action.purpose,
          actorId: XORA,
        });
        projectId = project.id;
        save({ projectId, purpose: action.purpose, spaceIds: [] });
      }
      const spaceIds = [...(setup().spaceIds ?? [])];
      for (const name of action.spaces.slice(spaceIds.length)) {
        const space = await lifecycle.createKnowledgeSpace({ projectId, name, actorId: XORA });
        spaceIds.push(space.id);
        save({ spaceIds });
      }
      if (!setup().collectionId) {
        const collection = await lifecycle.createKnowledgeCollection({
          projectId,
          spaceId: spaceIds[0] as SpaceId,
          name: action.collection,
          actorId: XORA,
        });
        save({ collectionId: collection.id });
      }
      await rebuild(store, projectId, XORA);
      return;
    }
    case "startFirstMission": {
      let mission = current.mission;
      if (!mission) {
        mission = await missions.createMission({
          ownerProjectId: setup().projectId as ProjectId,
          title: action.title,
          goal: action.goal,
          actorId: XORA,
        });
        save({ missionId: mission.id });
      }
      if (mission.state === "queued") {
        mission = await missions.startMission({ missionId: mission.id, actorId: XORA });
      }
      if (mission.state === "running") {
        await missions.waitMission({
          missionId: mission.id,
          reason: "needs_input",
          actorId: XORA,
          question: action.question,
          rationale: action.rationale,
          options: action.options,
        });
      }
      return;
    }
    case "recordGoal":
      return recordGoal(store, action, captain, current, setup, save);
  }
}

async function recordGoal(
  store: WriteStore,
  action: RecordGoalAction,
  captain: string,
  current: { mission: Mission | null; answer: string | null },
  setup: () => Setup,
  save: (change: Partial<Setup>) => void,
): Promise<void> {
  const lifecycle = new LifecycleService(store);
  const missions = new MissionService(store);
  let mission = current.mission;
  if (!mission || !current.answer) {
    throw new SetupRejected(409, "WrongStep", "The first Mission has no answer yet");
  }
  const projectId = setup().projectId as ProjectId;
  let sourceId = setup().sourceId as SourceReferenceId | undefined;
  if (!sourceId) {
    sourceId = (
      await lifecycle.registerSourceReference({
        projectId,
        kind: "setup",
        locator: "loxora:setup",
        title: action.sourceTitle,
        actorId: XORA,
      })
    ).id;
    save({ sourceId });
  }
  let evidenceId = setup().evidenceId as EvidenceReferenceId | undefined;
  if (!evidenceId) {
    evidenceId = (
      await lifecycle.registerEvidenceReference({
        projectId,
        sourceReferenceId: sourceId,
        summary: action.evidenceSummary(current.answer),
        locator: `mission:${mission.id}`,
        actorId: XORA,
      })
    ).id;
    save({ evidenceId });
  }
  if (mission.state === "waiting") {
    mission = await missions.resumeMission({ missionId: mission.id, actorId: XORA });
  }
  let proposalId = setup().proposalId as ProposalId | undefined;
  if (!proposalId) {
    proposalId = (
      await lifecycle.submitKnowledgeProposal({
        projectId,
        spaceId: setup().spaceIds?.[0] as SpaceId,
        collectionId: setup().collectionId as CollectionId,
        proposedNodeTitle: action.title,
        proposedContent: action.content,
        sourceReferenceIds: [sourceId],
        evidenceReferenceIds: [evidenceId],
        proposerId: XORA,
      })
    ).id;
    save({ proposalId });
  }
  if (mission.state === "running") {
    mission = await missions.completeMission({
      missionId: mission.id,
      actorId: XORA,
      summary: action.outcome,
      proposalIds: [proposalId],
    });
  }
  if (mission.outcome?.proposals[0]?.status === "Submitted") {
    await lifecycle.reviewKnowledgeProposal({
      projectId,
      proposalId,
      reviewerId: captain,
      decision: "Accepted",
      reason: action.reviewReason,
      evidenceReferenceIds: [evidenceId],
    });
  }
  await rebuild(store, projectId, captain);
}

function rebuild(store: WriteStore, projectId: ProjectId, actorId: string) {
  return new NavigationService(store).rebuildNavigationProjection({ projectId, actorId });
}

/**
 * `POST /api/setup/finish`: the setup conversation ends on the bridge (Milestone 14). With
 * `skipped: true` the first Mission offer is dismissed as well; the setup stays ended.
 */
export function finishFirstSteps(
  settingsPath: string,
  body: Record<string, unknown>,
  now = new Date(),
): void {
  if (body.skipped !== undefined && typeof body.skipped !== "boolean") {
    throw new SetupRejected(400, "Invalid", "skipped must be true or false");
  }
  const settings = loadSettings(settingsPath);
  const at = now.toISOString();
  writeSettings(settingsPath, {
    ...settings,
    setup: {
      ...settings.setup,
      completedAt: settings.setup?.completedAt ?? at,
      ...(body.skipped ? { firstMissionDismissedAt: at } : {}),
    },
  });
}
