#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  defaultWorkspaceDirectory,
  isLoopbackUrl,
  resolveWorkspaceDirectory,
  settingsPath,
} from "@loxora/cli";
import { XoraRuntime } from "./runtime.js";
import { ActorRejected, startAppServer } from "./server.js";
import {
  defaultHome,
  documentsDirectory,
  windowsFilePicker,
  windowsFolderPicker,
} from "./setup.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    port: { type: "string" },
    actor: { type: "string" },
    "xora-url": { type: "string" },
  },
});
const attachUrl = values["xora-url"];
if (attachUrl !== undefined && !isLoopbackUrl(attachUrl)) {
  process.stderr.write(
    "--xora-url must be an http address on this computer, for example http://127.0.0.1:8080\n",
  );
  process.exit(2);
}
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
// Xora's runtime (Milestone 16): attached with --xora-url, otherwise from the settings file.
// It starts in the background, so the setup never waits for the model.
const xora = new XoraRuntime({
  settingsPath: fixed ? null : settingsPath(process.env),
  ...(attachUrl !== undefined ? { attachUrl } : {}),
});
const stopXora = () => xora.stop();
process.on("exit", stopXora);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    stopXora();
    process.exit(0);
  });
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
      home: defaultHome(process.env),
      ...(process.platform === "win32"
        ? { pickFolder: windowsFolderPicker, pickFile: windowsFilePicker }
        : {}),
    },
    port,
    xora,
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
void xora.start().then(
  (status) => {
    const label = status.modelLabel ? ` (${status.modelLabel})` : "";
    process.stdout.write(
      status.state === "ready"
        ? `Xora is online${label}.\n`
        : `Xora runs in script mode${label}: ${status.reason ?? "unknown"}.\n`,
    );
  },
  (error: unknown) => {
    process.stderr.write(
      `Xora could not start: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  },
);
