#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolveWorkspaceDirectory } from "@loxora/cli";
import { startAppServer } from "./server.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    port: { type: "string" },
    actor: { type: "string" },
  },
});
if (values.actor !== undefined) {
  process.stderr.write(
    "--actor enables UI writes, which come in the next milestone (RFC-010, section 9). The Mission Control MVP is read-only.\n",
  );
  process.exit(2);
}
const workspaceDirectory = resolveWorkspaceDirectory(values.workspace, process.env);
const port = Number(values.port ?? "4180");
if (!Number.isInteger(port) || port < 0) {
  process.stderr.write("--port must be a non-negative integer\n");
  process.exit(2);
}
const server = await startAppServer({ workspaceDirectory, port });
process.stdout.write(
  `Loxora Mission Control (read-only): ${server.url}\nWorkspace: ${workspaceDirectory}\n`,
);
