#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolveWorkspaceDirectory } from "@loxora/cli";
import { ActorRejected, startAppServer } from "./server.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    port: { type: "string" },
    actor: { type: "string" },
  },
});
const workspaceDirectory = resolveWorkspaceDirectory(values.workspace, process.env);
const port = Number(values.port ?? "4180");
if (!Number.isInteger(port) || port < 0) {
  process.stderr.write("--port must be a non-negative integer\n");
  process.exit(2);
}
let server: Awaited<ReturnType<typeof startAppServer>>;
try {
  server = await startAppServer({
    workspaceDirectory,
    port,
    ...(values.actor !== undefined ? { actor: values.actor } : {}),
  });
} catch (error) {
  if (!(error instanceof ActorRejected)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}
const mode = values.actor === undefined ? "read-only" : `acting as ${values.actor.trim()}`;
process.stdout.write(
  `Loxora Mission Control (${mode}): ${server.url}\nWorkspace: ${workspaceDirectory}\n`,
);
