#!/usr/bin/env node
import { parseArgs } from "node:util";
import { defaultWorkspaceDirectory, resolveWorkspaceDirectory, settingsPath } from "@loxora/cli";
import { ActorRejected, startAppServer } from "./server.js";
import { defaultHome, documentsDirectory } from "./setup.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    port: { type: "string" },
    actor: { type: "string" },
  },
});
// A workspace given by flag or environment keeps the Milestone 12 behavior; otherwise the
// settings file decides, and the first-launch setup runs while there is no workspace.
const fixed =
  values.workspace !== undefined || process.env.LOXORA_WORKSPACE
    ? resolveWorkspaceDirectory(values.workspace, process.env)
    : undefined;
const port = Number(values.port ?? "4180");
if (!Number.isInteger(port) || port < 0) {
  process.stderr.write("--port must be a non-negative integer\n");
  process.exit(2);
}
let documents: string | undefined;
let server: Awaited<ReturnType<typeof startAppServer>>;
try {
  server = await startAppServer({
    ...(fixed ? { workspaceDirectory: fixed } : {}),
    settings: {
      path: settingsPath(process.env),
      defaultWorkspace: defaultWorkspaceDirectory(process.env),
      documents: () => {
        documents ??= documentsDirectory(defaultHome(process.env));
        return documents;
      },
    },
    port,
    ...(values.actor !== undefined ? { actor: values.actor } : {}),
  });
} catch (error) {
  if (!(error instanceof ActorRejected)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}
const mode = values.actor === undefined ? "" : ` (acting as ${values.actor.trim()})`;
process.stdout.write(
  `Loxora${mode}: ${server.url}\n${fixed ? `Workspace: ${fixed}\n` : `Settings: ${settingsPath(process.env)}\n`}`,
);
