import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { LifecycleService, PlannedKnowledgeService } from "@loxora/core";
import { openSqliteStore } from "../src/index.js";

test("Planned Knowledge stays separate, durable, and append-only", async () => {
  const directory = mkdtempSync(join(tmpdir(), "loxora-plan-"));
  const path = join(directory, "plan.sqlite");
  const store = await openSqliteStore(path);
  const lifecycle = new LifecycleService(store);
  const plans = new PlannedKnowledgeService(store);
  const project = await lifecycle.createProject({
    name: "Owner",
    purpose: "Plan",
    actorId: "owner",
  });
  const space = await lifecycle.createKnowledgeSpace({
    projectId: project.id,
    name: "Space",
    actorId: "owner",
  });
  const collection = await lifecycle.createKnowledgeCollection({
    projectId: project.id,
    spaceId: space.id,
    name: "Collection",
    actorId: "owner",
  });
  const source = await lifecycle.registerSourceReference({
    projectId: project.id,
    kind: "doc",
    locator: "fixture://plan",
    title: "Plan",
    actorId: "owner",
  });
  const evidence = await lifecycle.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: "Plan evidence",
    locator: "fixture://plan",
    actorId: "owner",
  });
  const proposal = await lifecycle.submitKnowledgeProposal({
    projectId: project.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: "Node",
    proposedContent: "Current",
    sourceReferenceIds: [source.id],
    evidenceReferenceIds: [evidence.id],
    proposerId: "owner",
  });
  const accepted = await lifecycle.reviewKnowledgeProposal({
    projectId: project.id,
    proposalId: proposal.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "accepted",
    evidenceReferenceIds: [evidence.id],
  });
  assert(accepted.revision);
  const plan = await plans.createPlannedKnowledge({
    ownerProjectId: project.id,
    relatedNodes: [{ projectId: project.id, nodeId: proposal.proposedNodeId }],
    title: "Later",
    description: "A future change",
    status: "Deferred",
    reason: "Not compatible",
    blockingCondition: "Compatibility tests pass",
    evidence: [{ projectId: project.id, evidenceReferenceId: evidence.id }],
    authorId: "owner",
    relatedRevision: { projectId: project.id, revisionId: accepted.revision.id },
  });
  assert.equal(
    (
      await plans.getProjectPlans({
        projectId: project.id,
        nodeId: proposal.proposedNodeId,
        statuses: ["Deferred"],
      })
    )[0]?.id,
    plan.id,
  );
  assert.equal(
    (
      await lifecycle.getCurrentKnowledge({
        projectId: project.id,
        nodeId: proposal.proposedNodeId,
      })
    )?.revision.content,
    "Current",
  );
  await store.close();
  const db = new DatabaseSync(path);
  assert.throws(
    () => db.prepare("UPDATE planned_knowledge_items SET title='changed' WHERE id=?").run(plan.id),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM planned_knowledge_items WHERE id=?").run(plan.id),
    /append-only/,
  );
  assert.equal(
    (
      db.prepare("SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1").get() as {
        id: string;
      }
    ).id,
    "005_planned_knowledge",
  );
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("Planned Knowledge rejects an unrelated Project Node", async () => {
  const store = await openSqliteStore(":memory:");
  const lifecycle = new LifecycleService(store);
  const plans = new PlannedKnowledgeService(store);
  const owner = await lifecycle.createProject({ name: "Owner", actorId: "owner" });
  const unrelated = await lifecycle.createProject({ name: "Unrelated", actorId: "owner" });
  const space = await lifecycle.createKnowledgeSpace({
    projectId: unrelated.id,
    name: "Space",
    actorId: "owner",
  });
  const collection = await lifecycle.createKnowledgeCollection({
    projectId: unrelated.id,
    spaceId: space.id,
    name: "Collection",
    actorId: "owner",
  });
  const source = await lifecycle.registerSourceReference({
    projectId: unrelated.id,
    kind: "doc",
    locator: "x",
    title: "x",
    actorId: "owner",
  });
  const evidence = await lifecycle.registerEvidenceReference({
    projectId: unrelated.id,
    sourceReferenceId: source.id,
    summary: "x",
    locator: "x",
    actorId: "owner",
  });
  const proposal = await lifecycle.submitKnowledgeProposal({
    projectId: unrelated.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: "Node",
    proposedContent: "x",
    sourceReferenceIds: [source.id],
    evidenceReferenceIds: [evidence.id],
    proposerId: "owner",
  });
  await lifecycle.reviewKnowledgeProposal({
    projectId: unrelated.id,
    proposalId: proposal.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "x",
    evidenceReferenceIds: [evidence.id],
  });
  await assert.rejects(() =>
    plans.createPlannedKnowledge({
      ownerProjectId: owner.id,
      relatedNodes: [{ projectId: unrelated.id, nodeId: proposal.proposedNodeId }],
      title: "Bad",
      description: "Bad",
      status: "Deferred",
      reason: "Bad",
      blockingCondition: "Bad",
      evidence: [{ projectId: unrelated.id, evidenceReferenceId: evidence.id }],
      authorId: "owner",
    }),
  );
  await store.close();
});
