import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  CurrentRevisionMismatchError,
  LifecycleService,
  ProposalNotReviewableError,
  type Clock,
  type IdGenerator,
} from "@loxora/core";
import { SqliteLifecycleStore } from "../src/adapter.js";
import { migrationCatalog, runMigrations } from "../src/migrations.js";

class SequenceIds implements IdGenerator {
  private value = 10_000;
  public next(): string {
    this.value += 1;
    return `20000000-0000-4000-8000-${this.value.toString().padStart(12, "0")}`;
  }
}

class FixedClock implements Clock {
  public now(): string {
    return "2026-07-14T12:00:00.000Z";
  }
}

function temporaryPath(prefix = "loxora-m2-") {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  return { directory, path: join(directory, "lifecycle.sqlite") };
}

async function createV1(service: LifecycleService, suffix = "generic") {
  const project = await service.createProject({ name: `Project ${suffix}`, actorId: "owner" });
  const space = await service.createKnowledgeSpace({
    projectId: project.id,
    name: "Space",
    actorId: "owner",
  });
  const collection = await service.createKnowledgeCollection({
    projectId: project.id,
    spaceId: space.id,
    name: "Collection",
    actorId: "owner",
  });
  const source = await service.registerSourceReference({
    projectId: project.id,
    kind: "document",
    locator: `docs/${suffix}.md`,
    title: "Source",
    actorId: "owner",
  });
  const evidence = await service.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: "Evidence V1",
    locator: "line:1",
    actorId: "owner",
  });
  const proposal = await service.submitKnowledgeProposal({
    projectId: project.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: "Contract",
    proposedContent: `compatible-v1-${suffix}`,
    sourceReferenceIds: [source.id],
    evidenceReferenceIds: [evidence.id],
    proposerId: "author",
  });
  const accepted = await service.reviewKnowledgeProposal({
    proposalId: proposal.id,
    projectId: project.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "Accept V1",
    evidenceReferenceIds: [evidence.id],
  });
  assert.ok(accepted.revision);
  return { project, space, collection, source, evidence, proposal, revision: accepted.revision };
}

async function evidence(
  service: LifecycleService,
  projectId: ReturnType<typeof createV1> extends Promise<infer T>
    ? T extends { project: { id: infer I } }
      ? I
      : never
    : never,
  suffix: string,
) {
  const source = await service.registerSourceReference({
    projectId,
    kind: "document",
    locator: `docs/${suffix}.md`,
    title: `Source ${suffix}`,
    actorId: "owner",
  });
  const item = await service.registerEvidenceReference({
    projectId,
    sourceReferenceId: source.id,
    summary: `Evidence ${suffix}`,
    locator: "line:1",
    actorId: "owner",
  });
  return { source, evidence: item };
}

async function createV2(
  service: LifecycleService,
  v1: Awaited<ReturnType<typeof createV1>>,
  suffix = "v2",
) {
  const proof = await evidence(service, v1.project.id, suffix);
  const proposal = await service.submitSuccessorProposal({
    projectId: v1.project.id,
    nodeId: v1.proposal.proposedNodeId,
    expectedCurrentRevisionId: v1.revision.id,
    proposedContent: `replacement-${suffix}`,
    sourceReferenceIds: [proof.source.id],
    evidenceReferenceIds: [proof.evidence.id],
    proposerId: "author",
    changeReason: "Replace the previous contract",
  });
  const accepted = await service.reviewKnowledgeProposal({
    proposalId: proposal.id,
    projectId: v1.project.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "Accept successor",
    evidenceReferenceIds: [proof.evidence.id],
  });
  assert.ok(accepted.revision);
  return { ...proof, proposal, revision: accepted.revision, relationships: accepted.relationships };
}

test("supersedes V1, restores V3, and derives deterministic History", async () => {
  const temp = temporaryPath();
  const store = new SqliteLifecycleStore(temp.path);
  const service = new LifecycleService(store, new SequenceIds(), new FixedClock());
  try {
    const v1 = await createV1(service);
    const before = store.unsafeGetForTest(
      "SELECT * FROM knowledge_revisions WHERE id = ?",
      v1.revision.id,
    );
    const v2Proof = await evidence(service, v1.project.id, "v2");
    const v2Proposal = await service.submitSuccessorProposal({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
      expectedCurrentRevisionId: v1.revision.id,
      proposedContent: "incompatible-v2",
      sourceReferenceIds: [v2Proof.source.id],
      evidenceReferenceIds: [v2Proof.evidence.id],
      proposerId: "author",
      changeReason: "Adopt replacement semantics",
    });
    assert.equal(
      (
        store.unsafeGetForTest("SELECT COUNT(*) count FROM knowledge_revisions") as {
          count: number;
        }
      ).count,
      1,
    );
    const v2Result = await service.reviewKnowledgeProposal({
      proposalId: v2Proposal.id,
      projectId: v1.project.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "Accept V2",
      evidenceReferenceIds: [v2Proof.evidence.id],
    });
    assert.ok(v2Result.revision);
    assert.deepEqual(
      v2Result.relationships.map((item) => item.type),
      ["DirectPredecessor", "Supersedes"],
    );
    assert.equal(
      (
        await service.getCurrentKnowledge({
          projectId: v1.project.id,
          nodeId: v1.proposal.proposedNodeId,
        })
      )?.revision.id,
      v2Result.revision.id,
    );
    assert.deepEqual(
      store.unsafeGetForTest("SELECT * FROM knowledge_revisions WHERE id = ?", v1.revision.id),
      before,
    );

    const incident = await evidence(service, v1.project.id, "rollback");
    const rollback = await service.recordRollback({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
      revertedRevisionId: v2Result.revision.id,
      semanticSourceRevisionId: v1.revision.id,
      actorId: "operator",
      reason: "Compatibility incident",
      evidenceReferenceIds: [incident.evidence.id],
    });
    assert.equal(
      (
        store.unsafeGetForTest("SELECT COUNT(*) count FROM knowledge_revisions") as {
          count: number;
        }
      ).count,
      2,
    );
    const restoration = await service.submitRestorationProposal({
      projectId: v1.project.id,
      rollbackEventId: rollback.rollbackEvent.id,
      proposedContent: "compatible-v3",
      sourceReferenceIds: [incident.source.id],
      evidenceReferenceIds: [incident.evidence.id],
      proposerId: "operator",
      changeReason: "Restore compatible semantics",
    });
    const v3Result = await service.reviewKnowledgeProposal({
      proposalId: restoration.id,
      projectId: v1.project.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "Accept restoration",
      evidenceReferenceIds: [incident.evidence.id],
    });
    assert.ok(v3Result.revision);
    assert.deepEqual(
      v3Result.relationships.map((item) => item.type),
      ["DirectPredecessor", "Supersedes", "Reverts", "RestoredFrom"],
    );
    const current = await service.getCurrentKnowledge({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
    });
    assert.equal(current?.revision.id, v3Result.revision.id);
    assert.equal(current?.revisionRole, "Restoration");
    assert.equal(current?.rollbackEvent?.id, rollback.rollbackEvent.id);
    const history = await service.getKnowledgeHistory({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
    });
    assert.deepEqual(
      history?.entries.map((item) => item.revision.id),
      [v1.revision.id, v2Result.revision.id, v3Result.revision.id],
    );
    assert.deepEqual(
      history?.entries.map((item) => item.revisionRole),
      ["Initial", "Successor", "Restoration"],
    );
    assert.deepEqual(
      history?.entries.map((item) => item.isCurrent),
      [false, false, true],
    );
    assert.ok(history?.entries[0]?.classifications.includes("RestorationSource"));
    assert.ok(history?.entries[1]?.classifications.includes("Reverted"));
  } finally {
    await service.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("rejects stale successors atomically but permits explicit rejection", async () => {
  const temp = temporaryPath();
  const store = new SqliteLifecycleStore(temp.path);
  const service = new LifecycleService(store, new SequenceIds(), new FixedClock());
  try {
    const v1 = await createV1(service, "stale");
    const firstProof = await evidence(service, v1.project.id, "first");
    const secondProof = await evidence(service, v1.project.id, "second");
    const input = (proof: typeof firstProof, content: string) => ({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
      expectedCurrentRevisionId: v1.revision.id,
      proposedContent: content,
      sourceReferenceIds: [proof.source.id],
      evidenceReferenceIds: [proof.evidence.id],
      proposerId: "author",
      changeReason: "Competing change",
    });
    const first = await service.submitSuccessorProposal(input(firstProof, "first"));
    const second = await service.submitSuccessorProposal(input(secondProof, "second"));
    await service.reviewKnowledgeProposal({
      proposalId: first.id,
      projectId: v1.project.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "winner",
      evidenceReferenceIds: [firstProof.evidence.id],
    });
    const before = store.unsafeGetForTest("SELECT COUNT(*) count FROM knowledge_revisions") as {
      count: number;
    };
    await assert.rejects(
      () =>
        service.reviewKnowledgeProposal({
          proposalId: second.id,
          projectId: v1.project.id,
          reviewerId: "reviewer",
          decision: "Accepted",
          reason: "stale",
          evidenceReferenceIds: [secondProof.evidence.id],
        }),
      CurrentRevisionMismatchError,
    );
    assert.equal(
      (
        store.unsafeGetForTest("SELECT COUNT(*) count FROM knowledge_revisions") as {
          count: number;
        }
      ).count,
      before.count,
    );
    await service.reviewKnowledgeProposal({
      proposalId: second.id,
      projectId: v1.project.id,
      reviewerId: "reviewer",
      decision: "Rejected",
      reason: "stale proposal",
      evidenceReferenceIds: [secondProof.evidence.id],
    });
    await assert.rejects(
      () =>
        service.reviewKnowledgeProposal({
          proposalId: second.id,
          projectId: v1.project.id,
          reviewerId: "reviewer",
          decision: "Rejected",
          reason: "duplicate",
          evidenceReferenceIds: [secondProof.evidence.id],
        }),
      ProposalNotReviewableError,
    );
  } finally {
    await service.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("rolls back successor acceptance after Current pointer fault", async () => {
  const temp = temporaryPath();
  let fail = false;
  const store = new SqliteLifecycleStore(temp.path, {
    afterCurrentPointerChanged: () => {
      if (fail) throw new Error("pointer fault");
    },
  });
  const service = new LifecycleService(store, new SequenceIds(), new FixedClock());
  try {
    const v1 = await createV1(service, "fault");
    const proof = await evidence(service, v1.project.id, "fault-v2");
    const proposal = await service.submitSuccessorProposal({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
      expectedCurrentRevisionId: v1.revision.id,
      proposedContent: "faulted",
      sourceReferenceIds: [proof.source.id],
      evidenceReferenceIds: [proof.evidence.id],
      proposerId: "author",
      changeReason: "fault test",
    });
    fail = true;
    await assert.rejects(
      () =>
        service.reviewKnowledgeProposal({
          proposalId: proposal.id,
          projectId: v1.project.id,
          reviewerId: "reviewer",
          decision: "Accepted",
          reason: "fault",
          evidenceReferenceIds: [proof.evidence.id],
        }),
      /pointer fault/,
    );
    assert.equal(
      (
        await service.getCurrentKnowledge({
          projectId: v1.project.id,
          nodeId: v1.proposal.proposedNodeId,
        })
      )?.revision.id,
      v1.revision.id,
    );
    assert.equal(
      (
        store.unsafeGetForTest("SELECT COUNT(*) count FROM revision_relationships") as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(
      (
        store.unsafeGetForTest(
          "SELECT status FROM knowledge_proposals WHERE id = ?",
          proposal.id,
        ) as { status: string }
      ).status,
      "Submitted",
    );
  } finally {
    await service.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("rejects a stale restoration without Decision, lineage, or pointer effects", async () => {
  const temp = temporaryPath();
  const store = new SqliteLifecycleStore(temp.path);
  const service = new LifecycleService(store, new SequenceIds(), new FixedClock());
  try {
    const v1 = await createV1(service, "stale-restoration");
    const v2 = await createV2(service, v1, "v2");
    const incident = await evidence(service, v1.project.id, "incident");
    const rollback = await service.recordRollback({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
      revertedRevisionId: v2.revision.id,
      semanticSourceRevisionId: v1.revision.id,
      actorId: "operator",
      reason: "Rollback requested",
      evidenceReferenceIds: [incident.evidence.id],
    });
    const restoration = await service.submitRestorationProposal({
      projectId: v1.project.id,
      rollbackEventId: rollback.rollbackEvent.id,
      proposedContent: "restoration",
      sourceReferenceIds: [incident.source.id],
      evidenceReferenceIds: [incident.evidence.id],
      proposerId: "operator",
      changeReason: "Restore",
    });
    const competitor = await evidence(service, v1.project.id, "competitor");
    const competingProposal = await service.submitSuccessorProposal({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
      expectedCurrentRevisionId: v2.revision.id,
      proposedContent: "competing-v3",
      sourceReferenceIds: [competitor.source.id],
      evidenceReferenceIds: [competitor.evidence.id],
      proposerId: "author",
      changeReason: "Competing successor",
    });
    await service.reviewKnowledgeProposal({
      proposalId: competingProposal.id,
      projectId: v1.project.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "Accept competitor",
      evidenceReferenceIds: [competitor.evidence.id],
    });
    const decisions = (
      store.unsafeGetForTest("SELECT COUNT(*) count FROM review_decisions") as { count: number }
    ).count;
    await assert.rejects(
      () =>
        service.reviewKnowledgeProposal({
          proposalId: restoration.id,
          projectId: v1.project.id,
          reviewerId: "reviewer",
          decision: "Accepted",
          reason: "now stale",
          evidenceReferenceIds: [incident.evidence.id],
        }),
      CurrentRevisionMismatchError,
    );
    assert.equal(
      (store.unsafeGetForTest("SELECT COUNT(*) count FROM review_decisions") as { count: number })
        .count,
      decisions,
    );
    assert.equal(
      (
        store.unsafeGetForTest(
          "SELECT status FROM knowledge_proposals WHERE id = ?",
          restoration.id,
        ) as { status: string }
      ).status,
      "Submitted",
    );
  } finally {
    await service.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("persists V1/V2/V3 lineage and enforces append-only lineage", async () => {
  const temp = temporaryPath();
  const store = new SqliteLifecycleStore(temp.path);
  const service = new LifecycleService(store, new SequenceIds(), new FixedClock());
  const v1 = await createV1(service, "reopen");
  const v2 = await createV2(service, v1, "reopen-v2");
  const proof = await evidence(service, v1.project.id, "reopen-rollback");
  const rollback = await service.recordRollback({
    projectId: v1.project.id,
    nodeId: v1.proposal.proposedNodeId,
    revertedRevisionId: v2.revision.id,
    semanticSourceRevisionId: v1.revision.id,
    actorId: "operator",
    reason: "restore",
    evidenceReferenceIds: [proof.evidence.id],
  });
  const proposal = await service.submitRestorationProposal({
    projectId: v1.project.id,
    rollbackEventId: rollback.rollbackEvent.id,
    proposedContent: "reopened-v3",
    sourceReferenceIds: [proof.source.id],
    evidenceReferenceIds: [proof.evidence.id],
    proposerId: "operator",
    changeReason: "restore",
  });
  await service.reviewKnowledgeProposal({
    proposalId: proposal.id,
    projectId: v1.project.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "accept",
    evidenceReferenceIds: [proof.evidence.id],
  });
  await service.close();
  const reopened = new SqliteLifecycleStore(temp.path);
  try {
    const history = await reopened.getKnowledgeHistory({
      projectId: v1.project.id,
      nodeId: v1.proposal.proposedNodeId,
      scope: v1.proposal.scope,
    });
    assert.deepEqual(
      history?.entries.map((item) => item.revisionRole),
      ["Initial", "Successor", "Restoration"],
    );
    assert.throws(
      () =>
        reopened.unsafeExecForTest(
          `UPDATE rollback_events SET reason = 'changed' WHERE id = '${rollback.rollbackEvent.id}'`,
        ),
      /append-only/,
    );
    assert.throws(
      () => reopened.unsafeExecForTest("DELETE FROM revision_relationships"),
      /append-only/,
    );
    assert.throws(
      () =>
        reopened.unsafeExecForTest(`INSERT INTO revision_relationships
          (id, project_id, node_id, scope, source_revision_id, target_revision_id,
           relationship_type, rollback_event_id, created_at, correlation_id)
          VALUES ('self','${v1.project.id}','${v1.proposal.proposedNodeId}','project',
            '${v1.revision.id}','${v1.revision.id}','DirectPredecessor',NULL,
            '2026-07-14','self')`),
      /CHECK constraint failed|cycle/,
    );
    assert.throws(
      () =>
        reopened.unsafeExecForTest(`INSERT INTO revision_relationships
        (id, project_id, node_id, scope, source_revision_id, target_revision_id,
         relationship_type, rollback_event_id, created_at, correlation_id)
        VALUES ('cycle','${v1.project.id}','${v1.proposal.proposedNodeId}','project',
          '${v1.revision.id}','${v2.revision.id}','DirectPredecessor',NULL,'2026-07-14','cycle')`),
      /cycle/,
    );
  } finally {
    await reopened.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("failed rebuild migration restores foreign-key enforcement and leaves no partial objects", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  runMigrations(database, [
    migrationCatalog()[0] as NonNullable<ReturnType<typeof migrationCatalog>[number]>,
  ]);
  const broken = {
    id: "002_broken_rebuild",
    rebuildsReferencedTable: true,
    sql: "CREATE TABLE partial_lineage (id TEXT PRIMARY KEY) STRICT; INVALID SQL;",
  };
  assert.throws(() => runMigrations(database, [broken]));
  assert.equal(
    (database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys,
    1,
  );
  assert.equal(
    database.prepare("SELECT name FROM sqlite_master WHERE name = 'partial_lineage'").get(),
    undefined,
  );
  assert.equal(
    database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(broken.id),
    undefined,
  );
  assert.throws(() => runMigrations(database, [broken]));
  database.close();
});

test("upgrades a populated 001 database without changing V1", async () => {
  const temp = temporaryPath("loxora-upgrade-");
  const db = new DatabaseSync(temp.path);
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db, [
    migrationCatalog()[0] as NonNullable<ReturnType<typeof migrationCatalog>[number]>,
  ]);
  db.exec(`
    INSERT INTO projects VALUES ('p','Legacy','2026-07-13');
    INSERT INTO knowledge_spaces VALUES ('s','p','Space','2026-07-13');
    INSERT INTO knowledge_collections VALUES ('c','p','s','Collection','2026-07-13');
    INSERT INTO source_references VALUES ('src','p','doc','legacy.md','Legacy','2026-07-13');
    INSERT INTO evidence_references VALUES ('e','p','src','Legacy evidence','line:1','2026-07-13');
    INSERT INTO knowledge_proposals VALUES ('q','p','s','c','n','Node','legacy-v1','author','2026-07-13','project','Accepted');
    INSERT INTO proposal_sources VALUES ('q','p','src');
    INSERT INTO proposal_evidence VALUES ('q','p','e');
    INSERT INTO review_decisions VALUES ('d','q','p','reviewer','Accepted','legacy reason','2026-07-13','project','corr');
    INSERT INTO review_decision_evidence VALUES ('d','p','e');
    INSERT INTO knowledge_nodes VALUES ('n','p','s','c','Node','2026-07-13');
    INSERT INTO knowledge_revisions VALUES ('r','p','n','project','legacy-v1','q','d','author','reviewer','2026-07-13','corr');
    INSERT INTO revision_evidence VALUES ('r','p','e');
    INSERT INTO current_revisions VALUES ('p','n','project','r','2026-07-13','corr');
  `);
  const before = db.prepare("SELECT * FROM knowledge_revisions WHERE id = 'r'").get();
  db.close();
  const store = new SqliteLifecycleStore(temp.path);
  try {
    assert.deepEqual(
      store.unsafeGetForTest("SELECT * FROM knowledge_revisions WHERE id = 'r'"),
      before,
    );
    assert.equal(
      (store.unsafeGetForTest("SELECT COUNT(*) count FROM schema_migrations") as { count: number })
        .count,
      3,
    );
    const history = await store.getKnowledgeHistory({
      projectId: "p" as never,
      nodeId: "n" as never,
      scope: "project" as never,
    });
    assert.deepEqual(
      history?.entries.map((item) => item.revision.id),
      ["r"],
    );
    assert.equal(history?.entries[0]?.proposal.kind, "Initial");
  } finally {
    await store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});
