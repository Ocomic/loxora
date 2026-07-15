import { ContextPackageService, type ContextPackage, type ProjectId } from "@loxora/core";
import { openSqliteReadOnlyContextStore } from "@loxora/sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DemoCoordinator } from "./coordinator.js";

const demo = new DemoCoordinator();
await demo.open();
try {
  if (!existsSync(demo.contextRequestPath)) await demo.buildContextPackage();
  const request = JSON.parse(readFileSync(demo.contextRequestPath, "utf8"));
  const allowed = Object.values(demo.manifest.projects).map((p) => p.id as ProjectId);
  const directStore = await openSqliteReadOnlyContextStore(demo.databasePath);
  const direct = await new ContextPackageService(directStore).buildContextPackage({
    ...request,
    visibility: { readableProjectIds: allowed },
  });
  await directStore.close();
  const client = new Client({ name: "loxora-demo-proof", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(process.cwd(), "packages", "mcp", "dist", "src", "server.js")],
    env: {
      ...process.env,
      LOXORA_DATA_ROOT: demo.dataDirectory,
      LOXORA_DB_PATH: "loxora-demo.sqlite",
      LOXORA_ALLOWED_PROJECT_IDS: allowed.join(","),
    } as Record<string, string>,
  });
  await client.connect(transport);
  const tools = await client.listTools();
  if (tools.tools.map((t) => t.name).join(",") !== "loxora_get_context")
    throw new Error("Unexpected MCP tool surface");
  const response = await client.callTool({ name: "loxora_get_context", arguments: request });
  await client.close();
  const content = response.content as readonly { type: string; text?: string }[];
  const text = content[0]?.text;
  if (!text) throw new Error("MCP response contained no JSON text");
  const mcp = JSON.parse(text) as ContextPackage;
  const normalized = (value: ContextPackage) => ({
    fingerprint: value.fingerprint,
    entryIds: value.entries.map((entry) => entry.id),
    revisions: value.entries.map((entry) => entry.revisionIds),
    evidence: value.entries.map((entry) => entry.evidence.map((evidence) => evidence.id)),
    paths: value.entries.map((entry) => entry.navigationPaths),
    estimate: value.estimatedUsage,
    warnings: value.warnings,
    budgetStatus: value.budgetStatus,
  });
  const passed = JSON.stringify(normalized(direct)) === JSON.stringify(normalized(mcp));
  const proof = {
    passed,
    fingerprint: direct.fingerprint,
    tool: "loxora_get_context",
    comparedAt: new Date().toISOString(),
    entryCount: direct.entries.length,
  };
  writeFileSync(demo.proofPath, JSON.stringify(proof, null, 2));
  if (!passed) throw new Error("UI/Core/MCP parity failed");
  process.stdout.write(`MCP parity passed: ${direct.fingerprint}\n`);
} finally {
  await demo.close();
}
