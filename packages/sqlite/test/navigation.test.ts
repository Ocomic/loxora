import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LifecycleService, NavigationService } from "@loxora/core";
import { SqliteLifecycleStore } from "../src/adapter.js";

async function fixture(emptyMetadata = false, fault?: () => void) {
  const directory = mkdtempSync(join(tmpdir(), "loxora-navigation-"));
  const store = new SqliteLifecycleStore(
    join(directory, "test.sqlite"),
    fault ? { afterNavigationGenerationWritten: fault } : {},
  );
  const lifecycle = new LifecycleService(store);
  const navigation = new NavigationService(store);
  const project = await lifecycle.createProject({
    name: "Generic Project",
    purpose: emptyMetadata ? "" : "Navigation verification",
    actorId: "author",
  });
  const space = await lifecycle.createKnowledgeSpace({
    projectId: project.id,
    name: "Architecture",
    description: emptyMetadata ? "" : "System knowledge",
    actorId: "author",
  });
  const collection = await lifecycle.createKnowledgeCollection({
    projectId: project.id,
    spaceId: space.id,
    name: "Contracts",
    description: emptyMetadata ? "" : "Shared contracts",
    actorId: "author",
  });
  const source = await lifecycle.registerSourceReference({
    projectId: project.id,
    kind: "document",
    locator: "docs/contract.md",
    title: "Contract",
    actorId: "author",
  });
  const evidence = await lifecycle.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: "Contract evidence",
    locator: "line 1",
    actorId: "author",
  });
  const proposal = await lifecycle.submitKnowledgeProposal({
    projectId: project.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: "Token contract",
    proposedContent: ` ${"a".repeat(170)} `,
    sourceReferenceIds: [source.id],
    evidenceReferenceIds: [evidence.id],
    proposerId: "author",
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
  return {
    directory,
    store,
    lifecycle,
    navigation,
    project,
    space,
    collection,
    source,
    evidence,
    proposal,
    revision: accepted.revision,
  };
}

async function cleanup(value: Awaited<ReturnType<typeof fixture>>) {
  await value.lifecycle.close();
  rmSync(value.directory, { recursive: true, force: true });
}

test("navigates Project Map to Current Node with deterministic counts and preview", async () => {
  const value = await fixture();
  try {
    const map = await value.navigation.getProjectMap({ projectId: value.project.id });
    assert(map);
    assert.deepEqual(
      [
        map.freshness.content,
        map.nodeCount,
        map.currentNodeCount,
        map.acceptedRevisionCount,
        map.historicalRevisionCount,
      ],
      ["Missing", 1, 1, 1, 0],
    );
    const collection = await value.navigation.getCollectionNavigation({
      projectId: value.project.id,
      collectionId: value.collection.id,
    });
    assert.equal(collection?.nodes[0]?.path.segments.length, 4);
    assert.equal(collection?.nodes[0]?.currentPreview?.length, 160);
    assert.equal(collection?.nodes[0]?.currentPreview.endsWith("..."), true);
    const current = await value.lifecycle.getCurrentKnowledge({
      projectId: value.project.id,
      nodeId: value.proposal.proposedNodeId,
    });
    assert.equal(current?.navigationPath.temporalView, "Current");
    assert.equal(current?.navigationPath.segments.length, 5);
  } finally {
    await cleanup(value);
  }
});

test("persists projections and reports metadata quality without orphaning", async () => {
  const value = await fixture(true);
  try {
    const rebuilt = await value.navigation.rebuildNavigationProjection({
      projectId: value.project.id,
      actorId: "operator",
    });
    assert.equal(rebuilt.projectMap.freshness.content, "Fresh");
    assert.equal(rebuilt.projectMap.orphanCount, 0);
    assert.deepEqual(
      new Set(rebuilt.projectMap.warnings.map((item) => item.code)),
      new Set(["MissingProjectPurpose", "MissingSpaceDescription", "MissingCollectionDescription"]),
    );
    const evidence = await value.navigation.getEvidenceNavigation({
      projectId: value.project.id,
      evidenceReferenceId: value.evidence.id,
    });
    assert.equal(evidence?.source.id, value.source.id);
    assert(evidence?.backlinks.some((item) => item.revisionId === value.revision.id));
    value.store.unsafeExecForTest(
      `DELETE FROM navigation_projection_entries WHERE entity_kind='Node' AND entity_id='${value.proposal.proposedNodeId}'`,
    );
    const unhealthy = await value.navigation.getNavigationHealth({ projectId: value.project.id });
    assert.equal(unhealthy?.freshness.content, "Stale");
    assert(unhealthy?.warnings.some((item) => item.code === "NodeMissingFromProjection"));
    const repaired = await value.navigation.rebuildNavigationProjection({
      projectId: value.project.id,
      actorId: "operator",
    });
    assert.equal(repaired.projectMap.orphanCount, 0);
  } finally {
    await cleanup(value);
  }
});

test("successor stales content while rejected work does not", async () => {
  const value = await fixture();
  try {
    await value.navigation.rebuildNavigationProjection({
      projectId: value.project.id,
      actorId: "operator",
    });
    const rejected = await value.lifecycle.submitSuccessorProposal({
      projectId: value.project.id,
      nodeId: value.proposal.proposedNodeId,
      expectedCurrentRevisionId: value.revision.id,
      proposedContent: "rejected",
      sourceReferenceIds: [value.source.id],
      evidenceReferenceIds: [value.evidence.id],
      proposerId: "author",
      changeReason: "test",
    });
    await value.lifecycle.reviewKnowledgeProposal({
      projectId: value.project.id,
      proposalId: rejected.id,
      reviewerId: "reviewer",
      decision: "Rejected",
      reason: "no",
      evidenceReferenceIds: [value.evidence.id],
    });
    assert.equal(
      (await value.navigation.getProjectMap({ projectId: value.project.id }))?.freshness.content,
      "Fresh",
    );
    const successor = await value.lifecycle.submitSuccessorProposal({
      projectId: value.project.id,
      nodeId: value.proposal.proposedNodeId,
      expectedCurrentRevisionId: value.revision.id,
      proposedContent: "V2",
      sourceReferenceIds: [value.source.id],
      evidenceReferenceIds: [value.evidence.id],
      proposerId: "author",
      changeReason: "change",
    });
    const accepted = await value.lifecycle.reviewKnowledgeProposal({
      projectId: value.project.id,
      proposalId: successor.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "yes",
      evidenceReferenceIds: [value.evidence.id],
    });
    assert(accepted.revision);
    const map = await value.navigation.getProjectMap({ projectId: value.project.id });
    const node = await value.navigation.getNodeNavigation({
      projectId: value.project.id,
      nodeId: value.proposal.proposedNodeId,
    });
    assert.equal(map?.freshness.content, "Stale");
    assert.equal(node?.summary.currentPreview, "V2");
    assert.equal(node?.summary.historicalRevisionCount, 1);
    await value.navigation.rebuildNavigationProjection({
      projectId: value.project.id,
      actorId: "operator",
    });
    await value.lifecycle.recordRollback({
      projectId: value.project.id,
      nodeId: value.proposal.proposedNodeId,
      revertedRevisionId: accepted.revision.id,
      semanticSourceRevisionId: value.revision.id,
      actorId: "operator",
      reason: "rollback",
      evidenceReferenceIds: [value.evidence.id],
    });
    const afterRollback = await value.navigation.getProjectMap({ projectId: value.project.id });
    const afterRollbackNode = await value.navigation.getNodeNavigation({
      projectId: value.project.id,
      nodeId: value.proposal.proposedNodeId,
    });
    assert.equal(afterRollback?.freshness.content, "Fresh");
    assert.equal(afterRollback?.freshness.activity, "Stale");
    assert.equal(afterRollbackNode?.summary.currentPreview, "V2");
  } finally {
    await cleanup(value);
  }
});

test("failed rebuild preserves Current and previous projection", async () => {
  let fail = false;
  const value = await fixture(false, () => {
    if (fail) throw new Error("fault");
  });
  try {
    await value.navigation.rebuildNavigationProjection({
      projectId: value.project.id,
      actorId: "operator",
    });
    fail = true;
    await assert.rejects(
      value.navigation.rebuildNavigationProjection({
        projectId: value.project.id,
        actorId: "operator",
      }),
    );
    assert(
      await value.lifecycle.getCurrentKnowledge({
        projectId: value.project.id,
        nodeId: value.proposal.proposedNodeId,
      }),
    );
    const map = await value.navigation.getProjectMap({ projectId: value.project.id });
    assert.equal(map?.freshness.content, "Fresh");
    assert.equal(map?.freshness.lastFailure, "Projection rebuild failed");
  } finally {
    await cleanup(value);
  }
});
