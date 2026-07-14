#!/usr/bin/env node
import { ContextPackageService } from "@loxora/core";
import { openSqliteReadOnlyContextStore } from "@loxora/sqlite";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadMcpConfiguration } from "./config.js";
import { createContextToolHandler } from "./handler.js";
import { createLoxoraMcpServer } from "./server-factory.js";

async function main(): Promise<void> {
  const configuration = loadMcpConfiguration();
  const store = await openSqliteReadOnlyContextStore(configuration.databasePath);
  const handler = createContextToolHandler(
    new ContextPackageService(store),
    configuration.allowedProjectIds,
  );
  const server = createLoxoraMcpServer(handler);
  const close = async () => {
    await server.close();
    await store.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  process.stderr.write("Loxora MCP failed to start\n");
  process.exitCode = 1;
});
