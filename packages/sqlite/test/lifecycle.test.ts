import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  IntegrityError,
  LifecycleService,
  ProposalNotReviewableError,
  type Clock,
  type IdGenerator,
  type ProjectId,
  type Scope,
} from "@loxora/core";
import { SqliteLifecycleStore, type SqliteFaults } from "../src/adapter.js";
import { type Migration, runMigrations } from "../src/migrations.js";

class SequenceIds implements IdGenerator {
  private nextValue = 0;

  public next(): string {
    this.nextValue += 1;
    return `00000000-0000-4000-8000-${this.nextValue.toString().padStart(12, "0")}`;
  }
}

class FixedClock implements Clock {
  public now(): string {
    return "2026-07-13T12:00:00.000Z";
  }
}

interface Harness {
  readonly directory: string;
  readonly databasePath: string;
  readonly store: SqliteLifecycleStore;
  readonly service: LifecycleService;
}

interface BaseFixture {
  readonly project: Awaited<ReturnType<LifecycleService["createProject"]>>;
  readonly space: Awaited<ReturnType<LifecycleService["createKnowledgeSpace"]>>;
  readonly collection: Awaited<ReturnType<LifecycleService["createKnowledgeCollection"]>>;
  readonly source: Awaited<ReturnType<LifecycleService["registerSourceReference"]>>;
  readonly evidence: Awaited<ReturnType<LifecycleService["registerEvidenceReference"]>>;
  readonly proposal: Awaited<ReturnType<LifecycleService["submitKnowledgeProposal"]>>;
}

function harness(faults: SqliteFaults = {}): Harness {
  const directory = mkdtempSync(join(tmpdir(), "loxora-m1-"));
  const databasePath = join(directory, "lifecycle.sqlite");
  const store = new SqliteLifecycleStore(databasePath, faults);
  return {
    directory,
    databasePath,
    store,
    service: new LifecycleService(store, new SequenceIds(), new FixedClock()),
  };
}

async function cleanup(value: Harness): Promise<void> {
  try {
    await value.service.close();
  } catch {
    // Some tests close the original connection before reopening it.
  }
  rmSync(value.directory, { recursive: true, force: true });
}

async function createBase(
  service: LifecycleService,
  suffix = "alpha",
  explicitProjectId?: ProjectId,
): Promise<BaseFixture> {
  const project = await service.createProject({
    ...(explicitProjectId ? { id: explicitProjectId } : {}),
    name: `Project ${suffix}`,
    actorId: `owner-${suffix}`,
  });
  const space = await service.createKnowledgeSpace({
    projectId: project.id,
    name: `Space ${suffix}`,
    actorId: `owner-${suffix}`,
  });
  const collection = await service.createKnowledgeCollection({
    projectId: project.id,
    spaceId: space.id,
    name: `Collection ${suffix}`,
    actorId: `owner-${suffix}`,
  });
  const source = await service.registerSourceReference({
    projectId: project.id,
    kind: "document",
    locator: `docs/${suffix}.md`,
    title: `Source ${suffix}`,
    actorId: `owner-${suffix}`,
  });
  const evidence = await service.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: `Evidence ${suffix}`,
    locator: "line:1",
    actorId: `owner-${suffix}`,
  });
  const proposal = await service.submitKnowledgeProposal({
    projectId: project.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: `Node ${suffix}`,
    proposedContent: `Canonical content ${suffix}`,
    sourceReferenceIds: [source.id],
    evidenceReferenceIds: [evidence.id],
    proposerId: `proposer-${suffix}`,
  });
  return { project, space, collection, source, evidence, proposal };
}

async function accept(service: LifecycleService, fixture: BaseFixture) {
  return service.reviewKnowledgeProposal({
    proposalId: fixture.proposal.id,
    projectId: fixture.project.id,
    reviewerId: "reviewer-1",
    decision: "Accepted",
    reason: "Evidence supports acceptance",
    evidenceReferenceIds: [fixture.evidence.id],
  });
}

function count(store: SqliteLifecycleStore, table: string): number {
  const row = store.unsafeGetForTest(`SELECT COUNT(*) AS count FROM ${table}`) as { count: number };
  return row.count;
}

test("creates Project, Space, Collection and submits a non-canonical Proposal", async () => {
  const value = harness();
  try {
    const fixture = await createBase(value.service);
    assert.equal(count(value.store, "projects"), 1);
    assert.equal(count(value.store, "knowledge_spaces"), 1);
    assert.equal(count(value.store, "knowledge_collections"), 1);
    assert.equal(count(value.store, "knowledge_proposals"), 1);
    assert.equal(count(value.store, "knowledge_nodes"), 0);
    assert.equal(count(value.store, "knowledge_revisions"), 0);
    assert.equal(count(value.store, "current_revisions"), 0);
    assert.equal(
      await value.service.getCurrentKnowledge({
        projectId: fixture.project.id,
        nodeId: fixture.proposal.proposedNodeId,
      }),
      null,
    );
  } finally {
    await cleanup(value);
  }
});

test("accepts exactly once and returns traceable Current Knowledge", async () => {
  const value = harness();
  try {
    const fixture = await createBase(value.service);
    const outcome = await accept(value.service, fixture);
    assert.notEqual(outcome.revision, null);
    assert.equal(count(value.store, "review_decisions"), 1);
    assert.equal(count(value.store, "knowledge_nodes"), 1);
    assert.equal(count(value.store, "knowledge_revisions"), 1);
    assert.equal(count(value.store, "current_revisions"), 1);

    const current = await value.service.getCurrentKnowledge({
      projectId: fixture.project.id,
      nodeId: fixture.proposal.proposedNodeId,
    });
    assert.ok(current);
    assert.equal(current.project.id, fixture.project.id);
    assert.equal(current.space.id, fixture.space.id);
    assert.equal(current.collection.id, fixture.collection.id);
    assert.equal(current.node.id, fixture.proposal.proposedNodeId);
    assert.equal(current.revision.content, fixture.proposal.proposedContent);
    assert.equal(current.lifecycleState, "Canonical");
    assert.equal(current.temporalClassification, "Current");
    assert.deepEqual(
      current.evidence.map((item) => item.id),
      [fixture.evidence.id],
    );
    assert.deepEqual(
      current.sources.map((item) => item.id),
      [fixture.source.id],
    );
    assert.equal(current.proposal.proposerId, "proposer-alpha");
    assert.equal(current.reviewDecision.reviewerId, "reviewer-1");
    assert.equal(current.revision.reviewDecisionId, current.reviewDecision.id);
    assert.deepEqual(current.reviewDecision.evidenceReferenceIds, [fixture.evidence.id]);
    assert.deepEqual(current.revision.evidenceReferenceIds, [fixture.evidence.id]);
    assert.equal(current.evidence[0]?.sourceReferenceId, fixture.source.id);
    assert.equal(Object.isFrozen(current.revision), true);

    await assert.rejects(() => accept(value.service, fixture), ProposalNotReviewableError);
    assert.equal(count(value.store, "review_decisions"), 1);
    assert.equal(count(value.store, "knowledge_revisions"), 1);
  } finally {
    await cleanup(value);
  }
});

test("rejects a Proposal without creating accepted knowledge", async () => {
  const value = harness();
  try {
    const fixture = await createBase(value.service);
    const outcome = await value.service.reviewKnowledgeProposal({
      proposalId: fixture.proposal.id,
      projectId: fixture.project.id,
      reviewerId: "reviewer-1",
      decision: "Rejected",
      reason: "Evidence is insufficient",
      evidenceReferenceIds: [fixture.evidence.id],
    });
    assert.equal(outcome.revision, null);
    assert.equal(outcome.proposal.status, "Rejected");
    assert.equal(outcome.auditEvents.length, 2);
    assert.deepEqual(
      new Set(outcome.auditEvents.map((item) => item.correlationId)),
      new Set([outcome.correlationId]),
    );
    assert.equal(count(value.store, "review_decisions"), 1);
    assert.equal(count(value.store, "knowledge_nodes"), 0);
    assert.equal(count(value.store, "knowledge_revisions"), 0);
    assert.equal(count(value.store, "current_revisions"), 0);
    await assert.rejects(
      () =>
        value.service.reviewKnowledgeProposal({
          proposalId: fixture.proposal.id,
          projectId: fixture.project.id,
          reviewerId: "reviewer-2",
          decision: "Accepted",
          reason: "Changed mind",
          evidenceReferenceIds: [fixture.evidence.id],
        }),
      ProposalNotReviewableError,
    );
    await assert.rejects(
      () =>
        value.service.reviewKnowledgeProposal({
          proposalId: fixture.proposal.id,
          projectId: fixture.project.id,
          reviewerId: "reviewer-3",
          decision: "Rejected",
          reason: "Still rejected",
          evidenceReferenceIds: [fixture.evidence.id],
        }),
      ProposalNotReviewableError,
    );
    assert.equal(count(value.store, "review_decisions"), 1);
    assert.equal(count(value.store, "audit_events"), 8);
  } finally {
    await cleanup(value);
  }
});

test("rolls back every acceptance effect after an injected failure", async () => {
  const value = harness({
    afterReviewDecisionRecorded: () => {
      throw new Error("injected acceptance failure");
    },
  });
  try {
    const fixture = await createBase(value.service);
    const auditBefore = count(value.store, "audit_events");
    await assert.rejects(() => accept(value.service, fixture), /injected acceptance failure/);
    assert.equal(count(value.store, "review_decisions"), 0);
    assert.equal(count(value.store, "knowledge_nodes"), 0);
    assert.equal(count(value.store, "knowledge_revisions"), 0);
    assert.equal(count(value.store, "current_revisions"), 0);
    assert.equal(count(value.store, "audit_events"), auditBefore);
    const proposal = value.store.unsafeGetForTest(
      "SELECT status FROM knowledge_proposals WHERE id = ?",
      fixture.proposal.id,
    ) as { status: string };
    assert.equal(proposal.status, "Submitted");
  } finally {
    await cleanup(value);
  }
});

test("persists Current Knowledge across close and reopen", async () => {
  const value = harness();
  const fixture = await createBase(value.service);
  await accept(value.service, fixture);
  const before = await value.service.getCurrentKnowledge({
    projectId: fixture.project.id,
    nodeId: fixture.proposal.proposedNodeId,
  });
  await value.service.close();

  const reopenedStore = new SqliteLifecycleStore(value.databasePath);
  const reopenedService = new LifecycleService(reopenedStore, new SequenceIds(), new FixedClock());
  try {
    const after = await reopenedService.getCurrentKnowledge({
      projectId: fixture.project.id,
      nodeId: fixture.proposal.proposedNodeId,
    });
    assert.deepEqual(after, before);
  } finally {
    await reopenedService.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("enforces Revision and Audit Event immutability and correlation", async () => {
  const value = harness();
  try {
    const fixture = await createBase(value.service);
    const outcome = await accept(value.service, fixture);
    assert.ok(outcome.revision);

    assert.throws(
      () =>
        value.store.unsafeExecForTest(
          `UPDATE knowledge_revisions SET content = 'changed' WHERE id = '${outcome.revision?.id}'`,
        ),
      /immutable/,
    );
    assert.throws(
      () =>
        value.store.unsafeExecForTest(
          `DELETE FROM knowledge_revisions WHERE id = '${outcome.revision?.id}'`,
        ),
      /immutable/,
    );

    const events = value.store.unsafeGetForTest(
      "SELECT COUNT(*) AS count, COUNT(DISTINCT correlation_id) AS correlations FROM audit_events WHERE correlation_id = ?",
      outcome.correlationId,
    ) as { count: number; correlations: number };
    assert.equal(events.count, 5);
    assert.equal(events.correlations, 1);
    assert.equal(outcome.auditEvents.length, 5);
    assert.equal(Object.isFrozen(outcome.auditEvents), true);
    assert.deepEqual(
      new Set(outcome.auditEvents.map((item) => item.correlationId)),
      new Set([outcome.correlationId]),
    );

    const event = value.store.unsafeGetForTest(
      "SELECT id FROM audit_events WHERE correlation_id = ? LIMIT 1",
      outcome.correlationId,
    ) as { id: string };
    assert.throws(
      () =>
        value.store.unsafeExecForTest(
          `UPDATE audit_events SET actor_id = 'changed' WHERE id = '${event.id}'`,
        ),
      /append-only/,
    );
    assert.throws(
      () => value.store.unsafeExecForTest(`DELETE FROM audit_events WHERE id = '${event.id}'`),
      /append-only/,
    );

    const correlated = value.store.unsafeGetForTest(
      `SELECT
        (SELECT correlation_id FROM review_decisions WHERE id = '${outcome.reviewDecision.id}') AS decision_id,
        (SELECT correlation_id FROM knowledge_revisions WHERE id = '${outcome.revision.id}') AS revision_id,
        (SELECT correlation_id FROM current_revisions WHERE revision_id = '${outcome.revision.id}') AS current_id`,
    ) as { decision_id: string; revision_id: string; current_id: string };
    assert.deepEqual(new Set(Object.values(correlated)), new Set([outcome.correlationId]));
  } finally {
    await cleanup(value);
  }
});

test("prevents Review Evidence from crossing Project boundaries", async () => {
  const value = harness();
  try {
    const first = await createBase(value.service, "first");
    const second = await createBase(value.service, "second");
    await assert.rejects(
      () =>
        value.service.reviewKnowledgeProposal({
          proposalId: first.proposal.id,
          projectId: first.project.id,
          reviewerId: "reviewer",
          decision: "Accepted",
          reason: "invalid cross-project evidence",
          evidenceReferenceIds: [second.evidence.id],
        }),
      IntegrityError,
    );
    assert.equal(count(value.store, "review_decisions"), 0);
    assert.equal(count(value.store, "knowledge_revisions"), 0);
  } finally {
    await cleanup(value);
  }
});

test("prevents Current pointers from crossing Project or Node boundaries", async () => {
  const value = harness();
  try {
    const first = await createBase(value.service, "first");
    const firstOutcome = await accept(value.service, first);
    const second = await createBase(value.service, "second");
    await accept(value.service, second);
    assert.ok(firstOutcome.revision);

    value.store.unsafeExecForTest(
      `DELETE FROM current_revisions WHERE project_id = '${second.project.id}'`,
    );
    assert.throws(
      () =>
        value.store.unsafeExecForTest(
          `INSERT INTO current_revisions
            (project_id, node_id, scope, revision_id, assigned_at, correlation_id)
           VALUES ('${second.project.id}', '${second.proposal.proposedNodeId}', 'project',
                   '${firstOutcome.revision?.id}', '2026-07-13T12:00:00.000Z', 'invalid-project')`,
        ),
      /FOREIGN KEY constraint failed/,
    );

    const thirdSource = await value.service.registerSourceReference({
      projectId: first.project.id,
      kind: "document",
      locator: "docs/third.md",
      title: "Third source",
      actorId: "owner",
    });
    const thirdEvidence = await value.service.registerEvidenceReference({
      projectId: first.project.id,
      sourceReferenceId: thirdSource.id,
      summary: "Third evidence",
      locator: "line:1",
      actorId: "owner",
    });
    const thirdProposal = await value.service.submitKnowledgeProposal({
      projectId: first.project.id,
      spaceId: first.space.id,
      collectionId: first.collection.id,
      proposedNodeTitle: "Third node",
      proposedContent: "Third content",
      sourceReferenceIds: [thirdSource.id],
      evidenceReferenceIds: [thirdEvidence.id],
      proposerId: "owner",
    });
    const thirdOutcome = await value.service.reviewKnowledgeProposal({
      proposalId: thirdProposal.id,
      projectId: first.project.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "valid third node",
      evidenceReferenceIds: [thirdEvidence.id],
    });
    assert.ok(thirdOutcome.revision);
    value.store.unsafeExecForTest(
      `DELETE FROM current_revisions WHERE node_id = '${thirdProposal.proposedNodeId}'`,
    );
    assert.throws(
      () =>
        value.store.unsafeExecForTest(
          `INSERT INTO current_revisions
            (project_id, node_id, scope, revision_id, assigned_at, correlation_id)
           VALUES ('${first.project.id}', '${thirdProposal.proposedNodeId}', 'project',
                   '${firstOutcome.revision?.id}', '2026-07-13T12:00:00.000Z', 'invalid-node')`,
        ),
      /FOREIGN KEY constraint failed/,
    );
  } finally {
    await cleanup(value);
  }
});

test("failed migrations remain unrecorded and leave no partial schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "loxora-migration-"));
  const path = join(directory, "migration.sqlite");
  let database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  const broken: Migration = {
    id: "broken_migration",
    sql: "CREATE TABLE partially_created (id TEXT PRIMARY KEY) STRICT; INVALID SQL;",
  };
  try {
    assert.throws(() => runMigrations(database, [broken]));
    const migration = database
      .prepare("SELECT id FROM schema_migrations WHERE id = ?")
      .get(broken.id);
    const partial = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("partially_created");
    assert.equal(migration, undefined);
    assert.equal(partial, undefined);
    database.close();
    database = new DatabaseSync(path);
    database.exec("PRAGMA foreign_keys = ON");
    assert.throws(() => runMigrations(database, [broken]));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration is idempotent and alternate identifiers are data-driven", async () => {
  const value = harness();
  const memoryDatabase = new DatabaseSync(":memory:");
  try {
    runMigrations(memoryDatabase);
    runMigrations(memoryDatabase);
    const applied = memoryDatabase
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };
    assert.equal(applied.count, 1);
    const fixture = await createBase(
      value.service,
      "unrelated-language",
      "10000000-0000-4000-8000-000000000001" as ProjectId,
    );
    await accept(value.service, fixture);
    const current = await value.service.getCurrentKnowledge({
      projectId: fixture.project.id,
      nodeId: fixture.proposal.proposedNodeId,
      scope: "project" as Scope,
    });
    assert.equal(current?.project.id, "10000000-0000-4000-8000-000000000001");
    assert.equal(current?.revision.content, "Canonical content unrelated-language");
  } finally {
    memoryDatabase.close();
    await cleanup(value);
  }
});
