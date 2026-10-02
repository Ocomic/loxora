import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ContextPackageService,
  parseWorkspaceExport,
  serializeWorkspaceExport,
  type NodeId,
  type ProjectId,
  type Scope,
} from "@loxora/core";
import { openSqliteStore } from "@loxora/sqlite";
import { seedDemoWorkspace } from "../src/orchestration/coordinator.js";
import { loadManifest } from "../src/orchestration/manifest.js";
import { DEMO_STAGES } from "../src/shared/contracts.js";

type Store = Awaited<ReturnType<typeof openSqliteStore>>;

async function settle<T>(operation: () => Promise<T>): Promise<unknown> {
  try {
    return { value: await operation() };
  } catch (error) {
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

/** Observable read results that must survive export and restore unchanged (ADR-003). */
async function observe(store: Store, manifest: ReturnType<typeof loadManifest>) {
  const scope = manifest.scope as Scope;
  const projects = Object.values(manifest.projects);
  const readableProjectIds = projects.map((project) => project.id as ProjectId);
  const portal = manifest.projects.portal;
  const results: Record<string, unknown> = {};
  for (const project of projects) {
    const projectId = project.id as ProjectId;
    const nodeId = project.nodeId as NodeId;
    results[`${project.name}:map`] = await settle(() => store.getProjectMap({ projectId, scope }));
    results[`${project.name}:health`] = await settle(() =>
      store.getNavigationHealth({ projectId, scope }),
    );
    results[`${project.name}:current`] = await settle(() =>
      store.getCurrentKnowledge({ projectId, nodeId, scope }),
    );
    results[`${project.name}:history`] = await settle(() =>
      store.getKnowledgeHistory({ projectId, nodeId, scope }),
    );
    results[`${project.name}:dependencies`] = await settle(() =>
      store.getProjectDependencies({
        projectId,
        scope,
        direction: "Both",
        access: { readableProjectIds },
      }),
    );
    results[`${project.name}:plans`] = await settle(() =>
      store.getProjectPlans({ projectId, scope }),
    );
  }
  results.contextFingerprint = await settle(async () => {
    const context = await new ContextPackageService(store).buildContextPackage({
      projectId: portal.id as ProjectId,
      focusNodeIds: [portal.nodeId as NodeId],
      temporalViews: ["Current"],
      includeRelatedProjects: true,
      relationshipTypes: ["DependsOn"],
      maxDependencyDepth: 1,
      taskLabel: "Update customer-portal authentication safely",
      estimatedTokenBudget: 12000,
      visibility: { readableProjectIds },
    });
    return context.fingerprint;
  });
  return results;
}

for (const stage of DEMO_STAGES) {
  test(`demo workspace at ${stage} survives export and restore without loss`, async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "loxora-demo-export-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const manifest = loadManifest();

    const source = await openSqliteStore(join(directory, "source.sqlite"));
    await seedDemoWorkspace(source, manifest, stage);
    const first = serializeWorkspaceExport(await source.readWorkspaceExport());
    const second = serializeWorkspaceExport(await source.readWorkspaceExport());
    assert.equal(second, first, "exporting twice must be byte-identical");
    const expected = await observe(source, manifest);
    await source.close();

    const target = await openSqliteStore(join(directory, "target.sqlite"));
    try {
      await target.restoreWorkspaceExport(parseWorkspaceExport(first));
      assert.equal(
        serializeWorkspaceExport(await target.readWorkspaceExport()),
        first,
        "export -> restore -> export must be byte-identical",
      );
      assert.deepEqual(await observe(target, manifest), expected);
    } finally {
      await target.close();
    }
  });
}
