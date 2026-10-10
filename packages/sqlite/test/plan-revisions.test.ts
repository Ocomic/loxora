import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  LifecycleService,
  NodeKeyService,
  NotFoundError,
  PlannedKnowledgeService,
  ReviewInboxService,
  ValidationError,
  parseWorkspaceExport,
  serializeWorkspaceExport,
  type PlannedKnowledgePolicy,
  type ProjectId,
} from "@loxora/core";
import { openSqliteStore } from "../src/index.js";

const reviewers: PlannedKnowledgePolicy = { mayDecide: (actor) => actor === "reviewer" };

async function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "loxora-plan-revisions-"));
  const store = await openSqliteStore(join(directory, "plans.sqlite"));
  t.after(async () => {
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const lifecycle = new LifecycleService(store);
  let tick = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 9, 3, 0, 0, 0, ++tick)).toISOString() };
  const plans = new PlannedKnowledgeService(store, undefined, clock, reviewers);
  const keys = new NodeKeyService(store, undefined, undefined, reviewers);
  const project = await lifecycle.createProject({ name: "Owner", actorId: "owner" });
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
    locator: "git:owner/repo@abc:docs/DECISIONS.md",
    title: "Decision log",
    actorId: "owner",
  });
  const evidence = await lifecycle.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: "D-001",
    locator: "#D-001",
    actorId: "owner",
  });
  const propose = (title: string) =>
    lifecycle.submitKnowledgeProposal({
      projectId: project.id,
      spaceId: space.id,
      collectionId: collection.id,
      proposedNodeTitle: title,
      proposedContent: `${title} content`,
      sourceReferenceIds: [source.id],
      evidenceReferenceIds: [evidence.id],
      proposerId: "agent:test",
    });
  const accept = (proposalId: Awaited<ReturnType<typeof propose>>["id"]) =>
    lifecycle.reviewKnowledgeProposal({
      projectId: project.id,
      proposalId,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "ok",
      evidenceReferenceIds: [evidence.id],
    });
  const plan = await plans.createPlannedKnowledge({
    ownerProjectId: project.id,
    relatedNodes: [],
    title: "Phase 1",
    description: "First phase",
    status: "Ready",
    reason: "Roadmap",
    blockingCondition: "None",
    evidence: [{ projectId: project.id, evidenceReferenceId: evidence.id }],
    authorId: "agent:test",
  });
  return { store, lifecycle, plans, keys, project, evidence, propose, accept, plan };
}

test("plan changes create append-only revisions with history", async (t) => {
  const { store, plans, project, plan, propose, accept } = await fixture(t);
  const decision = await propose("D-001 Decision");
  await accept(decision.id);
  const revised = await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: {
      status: "InProgress",
      addNodes: [{ projectId: project.id, nodeId: decision.proposedNodeId }],
    },
    changeReason: "Work started; link the decision",
    actorId: "agent:test",
  });
  assert.equal(revised.outcome, "Revised");
  assert.equal(revised.outcome === "Revised" && revised.revision.revisionNumber, 2);
  assert.deepEqual(revised.outcome === "Revised" && revised.revision.changedFields, [
    "status",
    "relatedNodes",
  ]);
  const effective = await plans.getPlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
  });
  assert.equal(effective?.status, "InProgress");
  assert.equal(effective?.revisionNumber, 2);
  assert.equal(effective?.title, "Phase 1");
  assert.deepEqual(effective?.relatedNodes, [
    { projectId: project.id, nodeId: decision.proposedNodeId },
  ]);
  assert.equal(
    (await plans.getProjectPlans({ projectId: project.id, nodeId: decision.proposedNodeId }))
      .length,
    1,
  );
  const history = await plans.getPlannedKnowledgeHistory({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
  });
  assert.deepEqual(
    history?.entries.map((entry) => [entry.revisionNumber, entry.state.status, entry.isEffective]),
    [
      [1, "Ready", false],
      [2, "InProgress", true],
    ],
  );
  await assert.rejects(
    () =>
      plans.revisePlannedKnowledge({
        ownerProjectId: project.id,
        plannedKnowledgeId: plan.id,
        changes: { status: "InProgress" },
        changeReason: "No change",
        actorId: "agent:test",
      }),
    ValidationError,
  );
  const audit = store as unknown as { unsafeGetForTest(sql: string): unknown };
  assert.equal(
    (
      audit.unsafeGetForTest(
        "SELECT COUNT(*) count FROM audit_events WHERE event_type='PlannedKnowledgeRevised'",
      ) as { count: number }
    ).count,
    1,
  );
});

test("plans cannot link Nodes that are still pending review", async (t) => {
  const { plans, project, plan, propose } = await fixture(t);
  const pending = await propose("Pending");
  await assert.rejects(
    () =>
      plans.revisePlannedKnowledge({
        ownerProjectId: project.id,
        plannedKnowledgeId: plan.id,
        changes: { addNodes: [{ projectId: project.id, nodeId: pending.proposedNodeId }] },
        changeReason: "Link",
        actorId: "reviewer",
      }),
    /only link Nodes with accepted knowledge/,
  );
});

test("agents propose closing a plan; a reviewer decides through the inbox", async (t) => {
  const { store, plans, project, plan, evidence } = await fixture(t);
  const proposed = await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { status: "Completed" },
    changeReason: "Work done from my side",
    actorId: "agent:test",
  });
  assert.equal(proposed.outcome, "Proposed");
  assert.equal(
    (await plans.getPlannedKnowledge({ ownerProjectId: project.id, plannedKnowledgeId: plan.id }))
      ?.status,
    "Ready",
  );
  const inbox = await new ReviewInboxService(store).getReviewInbox({ projectIds: [project.id] });
  const item = inbox.find((entry) => entry.kind === "PlannedKnowledgeRevisionProposal");
  assert.equal(item?.plannedRevisionProposal?.planTitle, "Phase 1");
  assert.equal(item?.plannedRevisionProposal?.proposal.state.status, "Completed");
  if (proposed.outcome !== "Proposed") throw new Error("expected a proposal");
  await assert.rejects(
    () =>
      plans.reviewPlannedKnowledgeRevisionProposal({
        ownerProjectId: project.id,
        proposalId: proposed.proposal.id,
        reviewerId: "agent:test",
        decision: "Accepted",
        reason: "self",
        evidence: [],
      }),
    /may not review/,
  );
  const reviewed = await plans.reviewPlannedKnowledgeRevisionProposal({
    ownerProjectId: project.id,
    proposalId: proposed.proposal.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "Verified",
    evidence: [{ projectId: project.id, evidenceReferenceId: evidence.id }],
  });
  assert.equal(reviewed.revision?.revisionNumber, 2);
  assert.equal(reviewed.revision?.sourceProposalId, proposed.proposal.id);
  assert.equal(
    (await plans.getPlannedKnowledge({ ownerProjectId: project.id, plannedKnowledgeId: plan.id }))
      ?.status,
    "Completed",
  );
  assert.equal(
    (await new ReviewInboxService(store).getReviewInbox({ projectIds: [project.id] })).length,
    0,
  );
  await assert.rejects(
    () =>
      plans.reviewPlannedKnowledgeRevisionProposal({
        ownerProjectId: project.id,
        proposalId: proposed.proposal.id,
        reviewerId: "reviewer",
        decision: "Rejected",
        reason: "again",
        evidence: [],
      }),
    /already reviewed/,
  );
  const reopened = await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { description: "Needs follow-up" },
    changeReason: "Reopen for follow-up",
    actorId: "agent:test",
  });
  assert.equal(reopened.outcome, "Proposed");
  const direct = await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { status: "InProgress" },
    changeReason: "Reopened by reviewer",
    actorId: "reviewer",
  });
  assert.equal(direct.outcome, "Revised");
  const history = await plans.getPlannedKnowledgeHistory({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
  });
  assert.deepEqual(
    history?.entries.map((entry) => [
      entry.kind,
      entry.revisionNumber,
      entry.decision?.decision ?? null,
    ]),
    [
      ["Revision", 1, null],
      ["Proposal", null, "Accepted"],
      ["Revision", 2, null],
      ["Proposal", null, null],
      ["Revision", 3, null],
    ],
  );
});

test("a plan revision proposal fails when its field changed in between", async (t) => {
  const { plans, project, plan } = await fixture(t);
  const proposed = await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { status: "Cancelled" },
    changeReason: "Not needed",
    actorId: "agent:test",
  });
  if (proposed.outcome !== "Proposed") throw new Error("expected a proposal");
  await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { title: "Phase 1 (renamed)" },
    changeReason: "Unrelated field",
    actorId: "agent:test",
  });
  await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { status: "InProgress" },
    changeReason: "Started after all",
    actorId: "agent:test",
  });
  await assert.rejects(
    () =>
      plans.reviewPlannedKnowledgeRevisionProposal({
        ownerProjectId: project.id,
        proposalId: proposed.proposal.id,
        reviewerId: "reviewer",
        decision: "Accepted",
        reason: "Too late",
        evidence: [],
      }),
    /changed since this proposal \(status\)/,
  );
});

test("Node keys are unique per Project, immutable, never reused, and reviewer-only later", async (t) => {
  const { store, keys, project, propose, accept } = await fixture(t);
  const pending = await propose("Pending decision");
  const reserved = await keys.assignNodeKey({
    projectId: project.id,
    nodeId: pending.proposedNodeId,
    key: "D-001",
    actorId: "agent:test",
  });
  assert.equal(reserved.key, "D-001");
  const other = await propose("Other decision");
  await accept(other.id);
  await assert.rejects(
    () =>
      keys.assignNodeKey({
        projectId: project.id,
        nodeId: other.proposedNodeId,
        key: "d-001",
        actorId: "reviewer",
      }),
    /already used/,
  );
  await assert.rejects(
    () =>
      keys.assignNodeKey({
        projectId: project.id,
        nodeId: other.proposedNodeId,
        key: "D-002",
        actorId: "agent:test",
      }),
    /need a reviewer/,
  );
  await keys.assignNodeKey({
    projectId: project.id,
    nodeId: other.proposedNodeId,
    key: "D-002",
    actorId: "reviewer",
  });
  await assert.rejects(
    () =>
      keys.assignNodeKey({
        projectId: project.id,
        nodeId: other.proposedNodeId,
        key: "D-003",
        actorId: "reviewer",
      }),
    /already has the immutable key/,
  );
  await assert.rejects(
    () =>
      keys.assignNodeKey({
        projectId: project.id,
        nodeId: other.proposedNodeId,
        key: "bad key!",
        actorId: "reviewer",
      }),
    ValidationError,
  );
  await assert.rejects(
    () =>
      keys.assignNodeKey({
        projectId: project.id,
        nodeId: "missing" as never,
        key: "D-009",
        actorId: "reviewer",
      }),
    NotFoundError,
  );
  assert.deepEqual(
    (await keys.getNodeKeys({ projectId: project.id as ProjectId })).map((entry) => entry.key),
    ["D-001", "D-002"],
  );
  const raw = store as unknown as { unsafeGetForTest(sql: string): unknown };
  assert.equal(
    (raw.unsafeGetForTest("SELECT COUNT(*) count FROM knowledge_node_keys") as { count: number })
      .count,
    2,
  );
});

test("revisions, proposals, decisions, and keys survive export and restore", async (t) => {
  const { store, plans, keys, project, plan, propose } = await fixture(t);
  const pending = await propose("Keyed");
  await keys.assignNodeKey({
    projectId: project.id,
    nodeId: pending.proposedNodeId,
    key: "K-1",
    actorId: "agent:test",
  });
  await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { status: "InProgress" },
    changeReason: "Started",
    actorId: "agent:test",
  });
  const proposal = await plans.revisePlannedKnowledge({
    ownerProjectId: project.id,
    plannedKnowledgeId: plan.id,
    changes: { status: "Completed" },
    changeReason: "Done",
    actorId: "agent:test",
  });
  if (proposal.outcome !== "Proposed") throw new Error("expected a proposal");
  await plans.reviewPlannedKnowledgeRevisionProposal({
    ownerProjectId: project.id,
    proposalId: proposal.proposal.id,
    reviewerId: "reviewer",
    decision: "Rejected",
    reason: "Not yet",
    evidence: [],
  });
  const text = serializeWorkspaceExport(await store.readWorkspaceExport());
  assert.match(text, /"formatVersion": 4/);
  const directory = mkdtempSync(join(tmpdir(), "loxora-plan-restore-"));
  const target = await openSqliteStore(join(directory, "target.sqlite"));
  t.after(async () => {
    await target.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await target.restoreWorkspaceExport(parseWorkspaceExport(text));
  assert.equal(serializeWorkspaceExport(await target.readWorkspaceExport()), text);
  const restored = new PlannedKnowledgeService(target);
  assert.equal(
    (
      await restored.getPlannedKnowledge({
        ownerProjectId: project.id,
        plannedKnowledgeId: plan.id,
      })
    )?.status,
    "InProgress",
  );
});

test("a version 1 export is upgraded on parse without changing existing records", async (t) => {
  const { store } = await fixture(t);
  const current = JSON.parse(serializeWorkspaceExport(await store.readWorkspaceExport()));
  const v1 = { ...current, formatVersion: 1, sections: { ...current.sections } };
  for (const name of [
    "plannedKnowledgeRevisions",
    "plannedKnowledgeRevisionNodes",
    "plannedKnowledgeRevisionEvidence",
    "plannedKnowledgeRevisionDecisions",
    "plannedKnowledgeRevisionDecisionEvidence",
    "knowledgeNodeKeys",
    "missions",
    "missionProjectReferences",
    "missionKnowledgeReferences",
    "missionEvents",
    "missionEventEvidence",
    "missionAttentionRequests",
    "missionOutcomes",
    "missionOutcomeProposals",
    "missionLogReferences",
    "chats",
    "chatMessages",
    "chatMessageReferences",
  ]) {
    delete v1.sections[name];
  }
  const upgraded = parseWorkspaceExport(JSON.stringify(v1));
  assert.equal(upgraded.formatVersion, 4);
  assert.equal(serializeWorkspaceExport(upgraded), serializeWorkspaceExport(current));
  const mixed = { ...v1, sections: { ...v1.sections, knowledgeNodeKeys: [] } };
  assert.throws(() => parseWorkspaceExport(JSON.stringify(mixed)), /must not contain section/);
});

test("migration 006 keeps existing plans as revision 1 and guards new tables", async () => {
  const directory = mkdtempSync(join(tmpdir(), "loxora-plan-migration-"));
  try {
    const path = join(directory, "plans.sqlite");
    const store = await openSqliteStore(path);
    const lifecycle = new LifecycleService(store);
    const project = await lifecycle.createProject({ name: "P", actorId: "owner" });
    const plan = await new PlannedKnowledgeService(store).createPlannedKnowledge({
      ownerProjectId: project.id,
      relatedNodes: [],
      title: "Existing",
      description: "Existing plan",
      status: "InProgress",
      reason: "r",
      blockingCondition: "b",
      evidence: [],
      authorId: "owner",
    });
    await store.close();
    const db = new DatabaseSync(path);
    try {
      assert.equal(
        (
          db
            .prepare("SELECT revision_number, status FROM planned_knowledge_effective WHERE id=?")
            .get(plan.id) as { revision_number: number; status: string }
        ).status,
        "InProgress",
      );
      db.prepare(
        "INSERT INTO knowledge_node_keys (project_id,key_normalized,key,node_id,assigned_by,assigned_at) VALUES (?,?,?,?,?,?)",
      ).run(project.id, "x-1", "X-1", "reserved-node", "owner", "2026-10-03T00:00:00.000Z");
      assert.throws(() => db.prepare("DELETE FROM knowledge_node_keys").run(), /never reused/);
      assert.throws(
        () => db.prepare("UPDATE knowledge_node_keys SET key='X-2'").run(),
        /immutable/,
      );
      assert.throws(
        () => db.prepare("UPDATE planned_knowledge_items SET title='x' WHERE id=?").run(plan.id),
        /append-only/,
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
