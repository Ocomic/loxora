import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  LifecycleService,
  MISSION_STATES,
  MISSION_TRANSITIONS,
  MissionService,
  NavigationService,
  PlannedKnowledgeService,
  ValidationError,
  parseLogReference,
  parseWorkspaceExport,
  serializeWorkspaceExport,
  type MissionId,
} from "@loxora/core";
import { openSqliteStore } from "../src/index.js";

async function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "loxora-missions-"));
  const path = join(directory, "missions.sqlite");
  const store = await openSqliteStore(path);
  t.after(async () => {
    await store.close().catch(() => undefined);
    rmSync(directory, { recursive: true, force: true });
  });
  let tick = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 9, 3, 12, 0, 0, ++tick)).toISOString() };
  const lifecycle = new LifecycleService(store);
  const missions = new MissionService(store, undefined, clock);
  const project = await lifecycle.createProject({ name: "Game", actorId: "owner" });
  const provider = await lifecycle.createProject({ name: "Assets", actorId: "owner" });
  const space = await lifecycle.createKnowledgeSpace({
    projectId: project.id,
    name: "Decisions",
    actorId: "owner",
  });
  const collection = await lifecycle.createKnowledgeCollection({
    projectId: project.id,
    spaceId: space.id,
    name: "Log",
    actorId: "owner",
  });
  const source = await lifecycle.registerSourceReference({
    projectId: project.id,
    kind: "document",
    locator: "git:o/r@abc:docs/D.md",
    title: "Decisions",
    actorId: "owner",
  });
  const evidence = await lifecycle.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: "D-001",
    locator: "#D-001",
    actorId: "owner",
  });
  const proposal = await lifecycle.submitKnowledgeProposal({
    projectId: project.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: "GLB contract",
    proposedContent: "GLB with embedded textures",
    sourceReferenceIds: [source.id],
    evidenceReferenceIds: [evidence.id],
    proposerId: "agent:codex",
  });
  const plan = await new PlannedKnowledgeService(store).createPlannedKnowledge({
    ownerProjectId: project.id,
    relatedNodes: [],
    title: "Phase 3",
    description: "Game-ready pipeline",
    status: "InProgress",
    reason: "Roadmap",
    blockingCondition: "None",
    evidence: [],
    authorId: "owner",
  });
  return { store, path, lifecycle, missions, project, provider, proposal, plan, evidence };
}

test("a mission runs, pauses for a provider limit, needs input, and completes with an outcome", async (t) => {
  const { store, missions, project, provider, proposal, plan, evidence } = await fixture(t);
  const created = await missions.createMission({
    ownerProjectId: project.id,
    title: "Export GLB LODs",
    goal: "Produce LOD0-LOD2 GLBs for the barrel",
    referencedProjectIds: [provider.id],
    plans: [{ projectId: project.id, plannedKnowledgeId: plan.id }],
    workerRole: "Asset Worker",
    actorId: "agent:codex",
  });
  assert.equal(created.state, "queued");
  assert.equal(created.sequence, 1);
  assert.deepEqual(created.references.projectIds, [provider.id]);
  const running = await missions.startMission({
    missionId: created.id,
    actorId: "agent:codex",
    activity: "Decimating LOD1",
  });
  assert.equal(running.state, "running");
  assert.equal(running.currentActivity, "Decimating LOD1");
  const limited = await missions.waitMission({
    missionId: created.id,
    actorId: "agent:codex",
    reason: "provider_limit",
    detail: "Usage limit reached",
    limitedCapability: "coding agent",
    expectedResumeAt: "2026-10-03T18:00:00.000Z",
  });
  assert.equal(limited.state, "waiting");
  assert.equal(limited.waitReason, "provider_limit");
  assert.equal(limited.attentionRequest, null);
  await missions.resumeMission({ missionId: created.id, actorId: "agent:codex" });
  const waiting = await missions.waitMission({
    missionId: created.id,
    actorId: "agent:codex",
    reason: "needs_input",
    question: "Which texture size for LOD2?",
    rationale: "The budget allows either",
    options: [
      { option: "512", consequence: "smaller download" },
      { option: "1024", consequence: null },
    ],
  });
  assert.equal(waiting.attentionRequest?.question, "Which texture size for LOD2?");
  await assert.rejects(
    () => missions.resumeMission({ missionId: created.id, actorId: "agent:codex" }),
    /answer the Attention Request first/,
  );
  await assert.rejects(
    () =>
      missions.answerAttentionRequest({
        missionId: created.id,
        actorId: "agent:codex",
        response: "512",
      }),
    /Only a human/,
  );
  const answered = await missions.answerAttentionRequest({
    missionId: created.id,
    actorId: "ocomic",
    response: "512",
    evidence: [{ projectId: project.id, evidenceReferenceId: evidence.id }],
  });
  assert.equal(answered.state, "waiting");
  assert.equal(answered.attentionRequest?.response, "512");
  await assert.rejects(
    () =>
      missions.answerAttentionRequest({
        missionId: created.id,
        actorId: "ocomic",
        response: "1024",
      }),
    /already answered/,
  );
  await missions.resumeMission({ missionId: created.id, actorId: "agent:codex" });
  const completed = await missions.completeMission({
    missionId: created.id,
    actorId: "agent:codex",
    summary: "Three LODs exported",
    outputs: ["barrel_lod0.glb", "barrel_lod1.glb", "barrel_lod2.glb"],
    validations: ["inspect-glb passes"],
    decisions: ["LOD2 uses 512 textures"],
    proposalIds: [proposal.id],
    logReferences: ["workspace:logs/run-1.txt", "external:C:/agent/log.txt"],
  });
  assert.equal(completed.state, "completed");
  assert.equal(completed.outcome?.proposals[0]?.status, "Submitted");
  assert.deepEqual(
    completed.outcome?.logReferences.map((entry) => entry.portable),
    [true, false],
  );
  const events = await missions.getMissionEvents({ missionId: created.id });
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "Created",
      "Started",
      "Waiting",
      "Resumed",
      "Waiting",
      "AttentionAnswered",
      "Resumed",
      "Completed",
    ],
  );
  assert.equal(completed.sequence, 8);
  assert.equal(completed.lastActivityAt, events.at(-1)?.occurredAt);
  assert.equal(events[5]?.evidence.length, 1);
  await assert.rejects(
    () => missions.startMission({ missionId: created.id, actorId: "agent:codex" }),
    /cannot go from completed/,
  );
  const raw = store as unknown as { unsafeGetForTest(sql: string): unknown };
  assert.equal(
    (
      raw.unsafeGetForTest(
        "SELECT COUNT(*) count FROM audit_events WHERE aggregate_type LIKE 'Mission%'",
      ) as { count: number }
    ).count,
    0,
  );
});

test("the transition table matches RFC-009 and terminal states are final", () => {
  assert.deepEqual(MISSION_STATES, [
    "queued",
    "running",
    "waiting",
    "paused",
    "completed",
    "failed",
    "cancelled",
  ]);
  for (const terminal of ["completed", "failed", "cancelled"] as const) {
    assert.deepEqual(MISSION_TRANSITIONS[terminal], []);
  }
  assert.deepEqual(MISSION_TRANSITIONS.queued, ["running", "cancelled"]);
  assert.deepEqual(MISSION_TRANSITIONS.paused, ["running", "cancelled"]);
});

test("human-only operations, approval decisions, and reserved reasons are enforced", async (t) => {
  const { missions, project } = await fixture(t);
  const mission = await missions.createMission({
    ownerProjectId: project.id,
    title: "Merge",
    goal: "Merge the PR",
    actorId: "agent:claude-code",
  });
  await missions.startMission({ missionId: mission.id, actorId: "agent:claude-code" });
  await assert.rejects(
    () =>
      missions.waitMission({
        missionId: mission.id,
        actorId: "agent:claude-code",
        reason: "needs_budget",
      }),
    /reserved/,
  );
  await assert.rejects(
    () =>
      missions.waitMission({
        missionId: mission.id,
        actorId: "agent:claude-code",
        reason: "needs_approval",
        question: "Merge?",
      }),
    /rationale/,
  );
  await assert.rejects(
    () =>
      missions.waitMission({
        missionId: mission.id,
        actorId: "agent:claude-code",
        reason: "provider_limit",
      }),
    /detail/,
  );
  await assert.rejects(
    () => missions.pauseMission({ missionId: mission.id, actorId: "agent:claude-code" }),
    /Only a human/,
  );
  await assert.rejects(
    () =>
      missions.cancelMission({ missionId: mission.id, actorId: "agent:claude-code", reason: "x" }),
    /Only a human/,
  );
  await missions.waitMission({
    missionId: mission.id,
    actorId: "agent:claude-code",
    reason: "needs_approval",
    question: "Merge PR 21?",
    rationale: "Agents never merge their own pull requests",
  });
  await assert.rejects(
    () =>
      missions.answerAttentionRequest({ missionId: mission.id, actorId: "ocomic", response: "ok" }),
    /requires a decision/,
  );
  await missions.answerAttentionRequest({
    missionId: mission.id,
    actorId: "ocomic",
    response: "merged",
    decision: "approve",
  });
  const paused = await missions.pauseMission({ missionId: mission.id, actorId: "ocomic" });
  assert.equal(paused.state, "paused");
  assert.equal(paused.waitReason, null);
  await assert.rejects(
    () => missions.resumeMission({ missionId: mission.id, actorId: "agent:claude-code" }),
    /Only a human/,
  );
  await missions.resumeMission({ missionId: mission.id, actorId: "ocomic" });
  const failed = await missions.failMission({
    missionId: mission.id,
    actorId: "agent:claude-code",
    summary: "CI failed",
  });
  assert.equal(failed.outcome?.kind, "Failed");
  await assert.rejects(
    () =>
      missions.createMission({
        ownerProjectId: project.id,
        title: "Retry",
        goal: "Retry",
        predecessorMissionId: "missing" as MissionId,
        actorId: "agent:claude-code",
      }),
    /not found/,
  );
  const retry = await missions.createMission({
    ownerProjectId: project.id,
    title: "Retry merge",
    goal: "Retry after CI fix",
    predecessorMissionId: mission.id,
    actorId: "agent:claude-code",
  });
  assert.equal(retry.predecessorMissionId, mission.id);
  await assert.rejects(
    () =>
      missions.createMission({
        ownerProjectId: project.id,
        title: "Bad",
        goal: "Bad",
        predecessorMissionId: retry.id,
        actorId: "agent:claude-code",
      }),
    /must be completed, failed, or cancelled/,
  );
  const cancelled = await missions.cancelMission({
    missionId: retry.id,
    actorId: "ocomic",
    reason: "Not needed",
  });
  assert.equal(cancelled.state, "cancelled");
});

test("stale writes are refused and the schema guards history", async (t) => {
  const { store, path, missions, project } = await fixture(t);
  const mission = await missions.createMission({
    ownerProjectId: project.id,
    title: "Race",
    goal: "Race",
    actorId: "agent:a",
  });
  await store.applyMissionChange({
    missionId: mission.id,
    expectedSequence: 1,
    change: {
      state: "running",
      waitReason: null,
      waitDetail: null,
      limitedCapability: null,
      expectedResumeAt: null,
      currentActivity: null,
      updatedAt: "2026-10-03T12:00:01.000Z",
    },
    event: {
      id: "e2" as never,
      missionId: mission.id,
      sequence: 2,
      type: "Started",
      previousState: "queued",
      newState: "running",
      waitReason: null,
      actorId: "agent:b",
      occurredAt: "2026-10-03T12:00:01.000Z",
      reason: null,
      payload: {},
      evidence: [],
    },
  });
  await assert.rejects(
    () =>
      store.applyMissionChange({
        missionId: mission.id,
        expectedSequence: 1,
        change: {
          state: "cancelled",
          waitReason: null,
          waitDetail: null,
          limitedCapability: null,
          expectedResumeAt: null,
          currentActivity: null,
          updatedAt: "2026-10-03T12:00:02.000Z",
        },
        event: {
          id: "e3" as never,
          missionId: mission.id,
          sequence: 2,
          type: "Cancelled",
          previousState: "queued",
          newState: "cancelled",
          waitReason: null,
          actorId: "ocomic",
          occurredAt: "2026-10-03T12:00:02.000Z",
          reason: "x",
          payload: {},
          evidence: [],
        },
      }),
    ValidationError,
  );
  assert.equal((await missions.getMission({ missionId: mission.id }))?.state, "running");
  await store.close();
  const db = new DatabaseSync(path);
  try {
    assert.throws(() => db.prepare("DELETE FROM mission_events").run(), /append-only/);
    assert.throws(
      () => db.prepare("UPDATE missions SET state='completed' WHERE id=?").run(mission.id),
      /every change appends one event/,
    );
    assert.throws(() => db.prepare("DELETE FROM missions").run(), /never deleted/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("missions stay out of navigation and Context and survive export and restore", async (t) => {
  const { store, missions, project } = await fixture(t);
  const before = await new NavigationService(store).rebuildNavigationProjection({
    projectId: project.id,
    actorId: "owner",
  });
  const mission = await missions.createMission({
    ownerProjectId: project.id,
    title: "Invisible to knowledge",
    goal: "Check separation",
    actorId: "agent:a",
  });
  await missions.startMission({ missionId: mission.id, actorId: "agent:a" });
  await missions.waitMission({
    missionId: mission.id,
    actorId: "agent:a",
    reason: "needs_manual_action",
    question: "Sign in to the asset store",
    rationale: "The download needs your account",
  });
  const after = await new NavigationService(store).rebuildNavigationProjection({
    projectId: project.id,
    actorId: "owner",
  });
  assert.equal(after.projectMap.lastRelevantActivityAt, before.projectMap.lastRelevantActivityAt);
  assert.deepEqual(after.projectMap.spaces, before.projectMap.spaces);
  assert.equal(after.projectMap.plannedKnowledgeCount, before.projectMap.plannedKnowledgeCount);
  const text = serializeWorkspaceExport(await store.readWorkspaceExport());
  assert.match(text, /"formatVersion": 3/);
  assert.match(text, /"missionAttentionRequests"/);
  const directory = mkdtempSync(join(tmpdir(), "loxora-missions-restore-"));
  const target = await openSqliteStore(join(directory, "target.sqlite"));
  t.after(async () => {
    await target.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await target.restoreWorkspaceExport(parseWorkspaceExport(text));
  assert.equal(serializeWorkspaceExport(await target.readWorkspaceExport()), text);
  const restored = await new MissionService(target).getMission({ missionId: mission.id });
  assert.equal(restored?.waitReason, "needs_manual_action");
  assert.equal(restored?.attentionRequest?.question, "Sign in to the asset store");
});

test("log references are portable only inside the workspace", () => {
  assert.equal(parseLogReference("workspace:logs/a.txt").portable, true);
  assert.equal(parseLogReference("external:/home/me/log.txt").portable, false);
  assert.throws(() => parseLogReference("workspace:../secret.txt"), /without/);
  assert.throws(() => parseLogReference("workspace:C:/abs/log.txt"), /without/);
  assert.throws(() => parseLogReference("/tmp/log.txt"), ValidationError);
  assert.throws(() => parseLogReference("workspace:"), ValidationError);
});
