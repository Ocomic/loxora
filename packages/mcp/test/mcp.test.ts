import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ContextPackageService, LifecycleService } from "@loxora/core";
import { openSqliteReadOnlyContextStore, openSqliteStore } from "@loxora/sqlite";
import {
  McpConfigurationError,
  createContextToolHandler,
  loadMcpConfiguration,
} from "../src/index.js";

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "loxora-mcp-"));
  const databasePath = join(directory, "loxora.sqlite");
  const store = await openSqliteStore(databasePath);
  const lifecycle = new LifecycleService(store);
  const project = await lifecycle.createProject({
    name: "MCP Project",
    purpose: "MCP parity",
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
    name: "Context",
    description: "Context",
    actorId: "owner",
  });
  const source = await lifecycle.registerSourceReference({
    projectId: project.id,
    kind: "document",
    locator: "Z:/must-not-be-opened/secret.md",
    title: "Registered source only",
    actorId: "owner",
  });
  const evidence = await lifecycle.registerEvidenceReference({
    projectId: project.id,
    sourceReferenceId: source.id,
    summary: "Persisted Evidence",
    locator: "line:1",
    actorId: "owner",
  });
  const proposal = await lifecycle.submitKnowledgeProposal({
    projectId: project.id,
    spaceId: space.id,
    collectionId: collection.id,
    proposedNodeTitle: "Context contract",
    proposedContent: "Current MCP-visible context",
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
  return { directory, databasePath, store, project, proposal, evidence };
}

function input(value: Awaited<ReturnType<typeof fixture>>) {
  return {
    projectId: value.project.id,
    focusNodeIds: [value.proposal.proposedNodeId],
    temporalViews: ["Current"] as const,
    includeRelatedProjects: false,
    relationshipTypes: [] as const,
    maxDependencyDepth: 0 as const,
    taskLabel: "MCP parity",
    estimatedTokenBudget: 10_000,
    explicitEvidenceReferenceIds: [value.evidence.id],
  };
}

test("configuration contains real paths and rejects traversal and symlink escape", async () => {
  const value = await fixture();
  const external = mkdtempSync(join(tmpdir(), "loxora-mcp-external-"));
  const externalDatabase = join(external, "outside.sqlite");
  const externalStore = await openSqliteStore(externalDatabase);
  await externalStore.close();
  try {
    const configuration = loadMcpConfiguration({
      LOXORA_DATA_ROOT: value.directory,
      LOXORA_DB_PATH: "loxora.sqlite",
      LOXORA_ALLOWED_PROJECT_IDS: value.project.id,
    });
    assert.equal(configuration.databasePath, resolve(value.databasePath));
    assert.throws(
      () =>
        loadMcpConfiguration({
          LOXORA_DATA_ROOT: value.directory,
          LOXORA_DB_PATH: externalDatabase,
          LOXORA_ALLOWED_PROJECT_IDS: value.project.id,
        }),
      McpConfigurationError,
    );
    const link = join(value.directory, "escape");
    symlinkSync(external, link, "junction");
    assert.throws(
      () =>
        loadMcpConfiguration({
          LOXORA_DATA_ROOT: value.directory,
          LOXORA_DB_PATH: join("escape", "outside.sqlite"),
          LOXORA_ALLOWED_PROJECT_IDS: value.project.id,
        }),
      /escapes/,
    );
  } finally {
    await value.store.close();
    rmSync(value.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    rmSync(external, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("handler delegates to Core and preserves normalized parity", async () => {
  const value = await fixture();
  try {
    const service = new ContextPackageService(value.store);
    const handler = createContextToolHandler(service, [value.project.id]);
    const direct = await service.buildContextPackage({
      ...input(value),
      visibility: { readableProjectIds: [value.project.id] },
    });
    const throughHandler = await handler.handle(input(value));
    assert.equal(throughHandler.fingerprint, direct.fingerprint);
    assert.deepEqual(
      throughHandler.entries.map((entry) => entry.id),
      direct.entries.map((entry) => entry.id),
    );
    assert.deepEqual(throughHandler.includedRevisionIds, direct.includedRevisionIds);
    await assert.rejects(
      handler.handle({ ...input(value), projectId: "not-allowed" }),
      /not allowed/,
    );
  } finally {
    await value.store.close();
    rmSync(value.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("real stdio server exposes only loxora_get_context and returns sanitized errors", async () => {
  const value = await fixture();
  const direct = await new ContextPackageService(value.store).buildContextPackage({
    ...input(value),
    visibility: { readableProjectIds: [value.project.id] },
  });
  await value.store.close();
  const serverPath = resolve("packages/mcp/dist/src/server.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: resolve("."),
    env: {
      LOXORA_DATA_ROOT: value.directory,
      LOXORA_DB_PATH: "loxora.sqlite",
      LOXORA_ALLOWED_PROJECT_IDS: value.project.id,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "loxora-test", version: "0.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      ["loxora_get_context"],
    );
    const called = (await client.callTool({
      name: "loxora_get_context",
      arguments: input(value),
    })) as { isError?: boolean; content: { type: string; text?: string }[] };
    assert.equal(called.isError, undefined);
    const text = called.content.find((item) => item.type === "text");
    assert(text && text.type === "text");
    const parsed = JSON.parse(text.text ?? "") as {
      fingerprint: string;
      entries: { id: string }[];
    };
    assert.equal(parsed.fingerprint, direct.fingerprint);
    assert.deepEqual(
      parsed.entries.map((entry) => entry.id),
      direct.entries.map((entry) => entry.id),
    );

    const invalid = await client.callTool({
      name: "loxora_get_context",
      arguments: { ...input(value), projectId: "not-allowed" },
    });
    assert.equal(invalid.isError, true);
    const serialized = JSON.stringify(invalid);
    assert(!serialized.includes(value.directory));
    assert(!serialized.includes("SELECT"));
    assert(!serialized.includes("stack"));
  } finally {
    await client.close();
    rmSync(value.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("read-only factory requires migration 004 and never runs migrations", async () => {
  const value = await fixture();
  await value.store.close();
  try {
    const readOnly = await openSqliteReadOnlyContextStore(value.databasePath);
    await readOnly.close();
    const emptyDirectory = mkdtempSync(join(tmpdir(), "loxora-mcp-empty-"));
    mkdirSync(join(emptyDirectory, "nested"));
    const missingPath = join(emptyDirectory, "nested", "missing.sqlite");
    await assert.rejects(openSqliteReadOnlyContextStore(missingPath));
    rmSync(emptyDirectory, { recursive: true, force: true });
  } finally {
    rmSync(value.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("MCP package contains transport and safety logic but no Core selection logic", () => {
  const directory = resolve("packages/mcp/src");
  const source = readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(directory, name), "utf8"))
    .join("\n");
  for (const forbidden of [
    "node:sqlite",
    "DatabaseSync",
    "SELECT ",
    "getKnowledgeHistory",
    "getProjectDependencies",
    "ImpactAssessmentBuilder",
    "createHash",
  ]) {
    assert.equal(source.includes(forbidden), false, `MCP must not contain ${forbidden}`);
  }
});
