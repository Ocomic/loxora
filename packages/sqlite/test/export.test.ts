import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  IntegrityError,
  LifecycleService,
  ValidationError,
  WORKSPACE_EXPORT_DERIVED_SECTIONS,
  WORKSPACE_EXPORT_SECTIONS,
  parseWorkspaceExport,
  serializeWorkspaceExport,
  workspaceExportRecords,
  type WorkspaceExport,
} from "@loxora/core";
import { DatabaseSync } from "node:sqlite";
import { SqliteLifecycleStore } from "../src/adapter.js";

const cleanups = new WeakMap<test.TestContext, (() => unknown)[]>();

// t.after hooks run in registration order, so a temp directory registered
// first would be removed while its database is still open. Windows refuses
// that (EPERM); run cleanups in reverse order instead.
function defer(t: test.TestContext, cleanup: () => unknown): void {
  let stack = cleanups.get(t);
  if (!stack) {
    const created: (() => unknown)[] = [];
    cleanups.set(t, created);
    t.after(async () => {
      for (const run of created.reverse()) await run();
    });
    stack = created;
  }
  stack.push(cleanup);
}

function tempDirectory(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "loxora-export-"));
  defer(t, () => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function seededStore(path: string): Promise<SqliteLifecycleStore> {
  const store = new SqliteLifecycleStore(path);
  const lifecycle = new LifecycleService(store);
  const project = await lifecycle.createProject({
    name: "export-project",
    purpose: "export round trip",
    actorId: "owner",
  });
  const space = await lifecycle.createKnowledgeSpace({
    projectId: project.id,
    name: "Architecture",
    description: "Architecture",
    actorId: "owner",
  });
  const collection = await lifecycle.createKnowledgeCollection({
    projectId: project.id,
    spaceId: space.id,
    name: "Decisions",
    description: "Decisions",
    actorId: "owner",
  });
  const source = await lifecycle.registerSourceReference({
    projectId: project.id,
    kind: "document",
    locator: "docs/decision.md",
    title: "Decision record",
    actorId: "owner",
  });
  const evidence = await lifecycle.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: "Ünïcödé evidence 🧠",
    locator: "line:1",
    actorId: "owner",
  });
  const proposal = await lifecycle.submitKnowledgeProposal({
    projectId: project.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: "Export decision",
    proposedContent: "Exports are canonical JSON",
    sourceReferenceIds: [source.id],
    evidenceReferenceIds: [evidence.id],
    proposerId: "author",
  });
  await lifecycle.reviewKnowledgeProposal({
    projectId: project.id,
    proposalId: proposal.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "accepted",
    evidenceReferenceIds: [evidence.id],
  });
  return store;
}

function withSection(
  document: WorkspaceExport,
  name: string,
  records: WorkspaceExport["sections"][string],
): WorkspaceExport {
  return { ...document, sections: { ...document.sections, [name]: records } };
}

test("the export format covers every persisted table and column", async (t) => {
  const store = new SqliteLifecycleStore(join(tempDirectory(t), "schema.sqlite"));
  defer(t, () => store.close());
  const document = await store.readWorkspaceExport();
  for (const spec of WORKSPACE_EXPORT_SECTIONS)
    assert.deepEqual(workspaceExportRecords(document, spec), []);
  for (const spec of WORKSPACE_EXPORT_DERIVED_SECTIONS)
    assert.deepEqual(workspaceExportRecords(document, spec, true), []);
  assert.equal(document.sourceSchema.at(-1), "007_missions");
});

test("exporting the same workspace twice yields identical canonical bytes", async (t) => {
  const store = await seededStore(join(tempDirectory(t), "source.sqlite"));
  defer(t, () => store.close());
  const first = serializeWorkspaceExport(await store.readWorkspaceExport());
  const second = serializeWorkspaceExport(await store.readWorkspaceExport());
  assert.equal(first, second);
  assert.ok(first.endsWith("}\n"));
  assert.ok(!first.includes("\r"));
  assert.ok(first.includes("Ünïcödé evidence 🧠"));
});

test("export, restore, and export again is byte-identical", async (t) => {
  const directory = tempDirectory(t);
  const source = await seededStore(join(directory, "source.sqlite"));
  const original = serializeWorkspaceExport(await source.readWorkspaceExport());
  await source.close();
  const target = new SqliteLifecycleStore(join(directory, "target.sqlite"));
  defer(t, () => target.close());
  await target.restoreWorkspaceExport(parseWorkspaceExport(original));
  assert.equal(serializeWorkspaceExport(await target.readWorkspaceExport()), original);
});

test("serialization does not depend on record order in the input", async (t) => {
  const store = await seededStore(join(tempDirectory(t), "source.sqlite"));
  defer(t, () => store.close());
  const document = await store.readWorkspaceExport();
  const spec = WORKSPACE_EXPORT_SECTIONS.find((entry) => entry.name === "auditEvents");
  assert.ok(spec);
  const reversed = withSection(
    document,
    "auditEvents",
    [...workspaceExportRecords(document, spec)].reverse(),
  );
  assert.equal(serializeWorkspaceExport(reversed), serializeWorkspaceExport(document));
});

test("restore rejects a non-empty target without writing", async (t) => {
  const directory = tempDirectory(t);
  const source = await seededStore(join(directory, "source.sqlite"));
  defer(t, () => source.close());
  const document = await source.readWorkspaceExport();
  const before = serializeWorkspaceExport(document);
  await assert.rejects(() => source.restoreWorkspaceExport(document), ValidationError);
  assert.equal(serializeWorkspaceExport(await source.readWorkspaceExport()), before);
});

test("parsing rejects unknown versions, unknown fields, and duplicate keys", async (t) => {
  const store = await seededStore(join(tempDirectory(t), "source.sqlite"));
  defer(t, () => store.close());
  const document = await store.readWorkspaceExport();
  const text = serializeWorkspaceExport(document);
  assert.throws(
    () => parseWorkspaceExport(text.replace('"formatVersion": 3', '"formatVersion": 4')),
    ValidationError,
  );
  assert.throws(
    () =>
      parseWorkspaceExport(text.replace('"format": "loxora.workspace-export"', '"format": "x"')),
    ValidationError,
  );
  assert.throws(() => parseWorkspaceExport("{"), ValidationError);
  const [project] = document.sections.projects as readonly Record<string, unknown>[];
  assert.ok(project);
  assert.throws(
    () =>
      serializeWorkspaceExport(
        withSection(document, "projects", [{ ...project, extra: "x" }] as never),
      ),
    ValidationError,
  );
  assert.throws(
    () => serializeWorkspaceExport(withSection(document, "projects", [project, project] as never)),
    ValidationError,
  );
  const { derived: _derived, ...withoutDerived } = document.sections;
  assert.throws(
    () => serializeWorkspaceExport({ ...document, sections: withoutDerived as never }),
    ValidationError,
  );
});

test("a restore that violates integrity leaves the target empty", async (t) => {
  const directory = tempDirectory(t);
  const source = await seededStore(join(directory, "source.sqlite"));
  const document = await source.readWorkspaceExport();
  await source.close();
  const evidence = document.sections.evidenceReferences as readonly Record<string, unknown>[];
  const broken = withSection(
    document,
    "evidenceReferences",
    evidence.map((record) => ({ ...record, sourceReferenceId: "missing-source" })) as never,
  );
  const targetPath = join(directory, "target.sqlite");
  const target = new SqliteLifecycleStore(targetPath);
  await assert.rejects(() => target.restoreWorkspaceExport(broken), IntegrityError);
  const after = await target.readWorkspaceExport();
  for (const spec of WORKSPACE_EXPORT_SECTIONS)
    assert.equal(workspaceExportRecords(after, spec).length, 0, spec.name);
  await target.restoreWorkspaceExport(document);
  await target.close();
});

test("export refuses a schema that drifted from the export format", async (t) => {
  const path = join(tempDirectory(t), "drift.sqlite");
  const store = new SqliteLifecycleStore(path);
  await store.close();
  const database = new DatabaseSync(path);
  database.exec("ALTER TABLE projects ADD COLUMN unexported TEXT");
  database.close();
  const drifted = new SqliteLifecycleStore(path);
  defer(t, () => drifted.close());
  await assert.rejects(() => drifted.readWorkspaceExport(), IntegrityError);
});
