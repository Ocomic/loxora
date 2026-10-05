import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runCli } from "@loxora/cli";
import { startAppServer } from "../src/index.js";
import { captainId, isOneDrivePath } from "../src/server/setup.js";

/** A temporary home with a settings file location, a Documents folder, and a CLI default. */
function home(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "loxora-setup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const documents = join(root, "Documents");
  mkdirSync(documents);
  return {
    root,
    documents,
    settingsPath: join(root, ".loxora", "settings.json"),
    defaultWorkspace: join(root, ".loxora", "workspaces", "default"),
  };
}

async function serve(
  t: test.TestContext,
  place: ReturnType<typeof home>,
  extra: { workspaceDirectory?: string; actor?: string } = {},
) {
  const server = await startAppServer({
    port: 0,
    ...extra,
    settings: {
      path: place.settingsPath,
      defaultWorkspace: place.defaultWorkspace,
      documents: () => place.documents,
      env: {},
    },
  });
  t.after(() => server.close());
  return server;
}

async function get(url: string) {
  const response = await fetch(url);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function post(baseUrl: string, path: string, body: unknown, origin = baseUrl) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function settingsOf(place: ReturnType<typeof home>): Record<string, unknown> {
  return JSON.parse(readFileSync(place.settingsPath, "utf8")) as Record<string, unknown>;
}

async function cli(workspace: string, ...argv: string[]) {
  let stderr = "";
  const code = await runCli([...argv, "--workspace", workspace], {
    env: {},
    cwd: workspace,
    stdout: () => undefined,
    stderr: (text) => {
      stderr += text;
    },
  });
  assert.equal(code, 0, stderr);
}

test("the captain id is derived from the name", () => {
  assert.equal(captainId("Alex"), "alex");
  assert.equal(captainId("Alex Müller"), "alex-mueller");
  assert.equal(captainId("  Jürgen Groß "), "juergen-gross");
  assert.equal(captainId("Zoë O'Neil"), "zoe-o-neil");
  assert.equal(captainId("!!!"), null);
  assert.equal(captainId("Agent Smith"), null);
  assert.equal(captainId("a".repeat(60))?.length, 40);
});

test("OneDrive folders are recognized", () => {
  assert.equal(isOneDrivePath("C:\\Users\\alex\\OneDrive\\Dokumente\\Loxora", {}), true);
  assert.equal(isOneDrivePath("C:\\Users\\alex\\OneDrive - Firma\\Documents\\Loxora", {}), true);
  assert.equal(isOneDrivePath("/home/alex/Documents/Loxora", {}), false);
  assert.equal(isOneDrivePath("/sync/cloud/Documents/Loxora", { OneDrive: "/sync/cloud" }), true);
});

test("without a workspace the app runs the setup, then Mission Control with the captain", async (t) => {
  const place = home(t);
  const server = await serve(t, place);
  const first = await get(`${server.url}/api/setup`);
  assert.equal(first.body.mode, "setup");
  assert.equal(first.body.existing, null);
  assert.deepEqual(first.body.logbook, {
    path: join(place.documents, "Loxora"),
    isDefault: true,
    documentsPath: ["Loxora"],
    inRepository: false,
    oneDrive: false,
    hasWorkspace: false,
  });
  assert.deepEqual(first.body.xora, { state: "not_installed" });
  assert.equal((await get(`${server.url}/api/workspace`)).status, 503);
  assert.equal((await get(`${server.url}/api/missions`)).status, 503);
  assert.equal(existsSync(place.settingsPath), false, "reading never creates the settings file");

  const unusable = await post(server.url, "/api/setup/answers", { name: "!!!" });
  assert.equal(unusable.status, 400);
  assert.equal(unusable.body.error, "CaptainNeeded");
  const named = await post(server.url, "/api/setup/answers", { name: "Alex Müller" });
  assert.equal(named.status, 200);
  assert.deepEqual((named.body.answers as Record<string, unknown>).captain, "alex-mueller");
  const early = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(early.body.error, "Incomplete");
  await post(server.url, "/api/setup/answers", { shipName: "Nova" });

  const created = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body, { mode: "ready" });
  const logbook = join(place.documents, "Loxora");
  assert.deepEqual(JSON.parse(readFileSync(join(logbook, "workspace.json"), "utf8")), {
    configVersion: 1,
    name: "Nova",
    reviewers: ["alex-mueller"],
  });
  assert.equal(existsSync(join(logbook, "workspace.sqlite")), true);
  assert.deepEqual(settingsOf(place), {
    configVersion: 1,
    displayName: "Alex Müller",
    captain: "alex-mueller",
    workspacePath: logbook,
    xora: { state: "not_installed" },
    setup: {},
  });

  assert.equal((await get(`${server.url}/api/setup`)).body.mode, "ready");
  assert.deepEqual((await get(`${server.url}/api/workspace`)).body, {
    name: "Nova",
    reviewers: ["alex-mueller"],
    actor: "alex-mueller",
    actorSource: "settings",
    readOnly: false,
    setupComplete: false,
  });
  assert.equal((await get(`${server.url}/api/missions`)).status, 200);
  const again = await post(server.url, "/api/setup/answers", { name: "Other" });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, "NotInSetup");
});

test("the setup refuses a logbook inside a code project or an existing logbook", async (t) => {
  const place = home(t);
  const repository = join(place.root, "code");
  mkdirSync(join(repository, ".git"), { recursive: true });
  const server = await serve(t, place);
  await post(server.url, "/api/setup/answers", {
    name: "Alex",
    shipName: "Nova",
    logbookPath: join(repository, "logbook"),
  });
  const state = await get(`${server.url}/api/setup`);
  assert.equal((state.body.logbook as { inRepository: boolean }).inRepository, true);
  assert.equal((state.body.logbook as { documentsPath: unknown }).documentsPath, null);
  const refused = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, "InRepository");
  assert.equal(existsSync(join(repository, "logbook")), false);

  const taken = join(place.root, "taken");
  await cli(taken, "workspace", "init", "--reviewer", "alex", "--name", "Old");
  await post(server.url, "/api/setup/answers", { logbookPath: taken });
  const hint = await get(`${server.url}/api/setup`);
  assert.equal((hint.body.logbook as { hasWorkspace: boolean }).hasWorkspace, true);
  const exists = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(exists.status, 409);
  assert.equal(exists.body.error, "WorkspaceExists");
  const relative = await post(server.url, "/api/setup/answers", { logbookPath: "Loxora" });
  assert.equal(relative.status, 400);
});

test("an existing workspace is offered and opened in place, never migrated", async (t) => {
  const place = home(t);
  await cli(
    place.defaultWorkspace,
    "workspace",
    "init",
    "--reviewer",
    "Ocomic",
    "--reviewer",
    "Petra",
    "--name",
    "Ocomic",
  );
  const before = readFileSync(join(place.defaultWorkspace, "workspace.sqlite"));
  const server = await serve(t, place);
  const state = await get(`${server.url}/api/setup`);
  assert.deepEqual(state.body.existing, {
    path: place.defaultWorkspace,
    name: "Ocomic",
    reviewers: ["Ocomic", "Petra"],
  });
  const ambiguous = await post(server.url, "/api/setup/workspace", {
    action: "open",
    path: place.defaultWorkspace,
  });
  assert.equal(ambiguous.body.error, "CaptainNeeded");
  const stranger = await post(server.url, "/api/setup/workspace", {
    action: "open",
    path: place.defaultWorkspace,
    captain: "agent:codex",
  });
  assert.equal(stranger.body.error, "CaptainNeeded");
  const opened = await post(server.url, "/api/setup/workspace", {
    action: "open",
    path: place.defaultWorkspace,
    captain: "Ocomic",
  });
  assert.deepEqual(opened.body, { mode: "ready" });
  assert.deepEqual(settingsOf(place), {
    configVersion: 1,
    displayName: "Ocomic",
    captain: "Ocomic",
    workspacePath: place.defaultWorkspace,
    xora: { state: "not_installed" },
    setup: {},
  });
  assert.equal((await get(`${server.url}/api/workspace`)).body.actor, "Ocomic");
  assert.deepEqual(readFileSync(join(place.defaultWorkspace, "workspace.sqlite")), before);
});

test("an outdated workspace opened by the setup still answers 503 and stays untouched", async (t) => {
  const place = home(t);
  const outdated = join(place.root, "outdated");
  mkdirSync(outdated);
  writeFileSync(
    join(outdated, "workspace.json"),
    JSON.stringify({ configVersion: 1, name: "old", reviewers: ["Ocomic"] }),
  );
  new DatabaseSync(join(outdated, "workspace.sqlite")).close();
  const server = await serve(t, place);
  const opened = await post(server.url, "/api/setup/workspace", { action: "open", path: outdated });
  assert.deepEqual(opened.body, { mode: "ready" });
  const missions = await get(`${server.url}/api/missions`);
  assert.equal(missions.status, 503);
  assert.match(String(missions.body.message), /never migrates/);
  const database = new DatabaseSync(join(outdated, "workspace.sqlite"));
  try {
    const { count } = database.prepare("SELECT COUNT(*) count FROM sqlite_master").get() as {
      count: number;
    };
    assert.equal(count, 0);
  } finally {
    database.close();
  }
});

test("an invalid captain in the settings file leaves the app read-only", async (t) => {
  const place = home(t);
  const workspace = join(place.root, "ws");
  await cli(workspace, "workspace", "init", "--reviewer", "Ocomic", "--name", "lab");
  mkdirSync(join(place.root, ".loxora"), { recursive: true });
  for (const captain of ["agent:codex", "Someone"]) {
    writeFileSync(
      place.settingsPath,
      JSON.stringify({ configVersion: 1, captain, workspacePath: workspace }),
    );
    const server = await serve(t, place);
    const info = (await get(`${server.url}/api/workspace`)).body;
    assert.equal(info.actor, null, captain);
    assert.equal(info.readOnly, true);
  }
  const server = await serve(t, place, { actor: "Ocomic" });
  const info = (await get(`${server.url}/api/workspace`)).body;
  assert.equal(info.actor, "Ocomic");
  assert.equal(info.actorSource, "flag");
});

test("an unreadable settings file is reported and never overwritten", async (t) => {
  const place = home(t);
  mkdirSync(join(place.root, ".loxora"), { recursive: true });
  writeFileSync(place.settingsPath, '{"configVersion": 9}');
  const server = await serve(t, place);
  const state = await get(`${server.url}/api/setup`);
  assert.equal(state.body.mode, "settingsError");
  assert.match(String(state.body.settingsError), /configVersion/);
  const write = await post(server.url, "/api/settings/language", { language: "de" });
  assert.equal(write.status, 503);
  assert.equal(write.body.error, "SettingsUnreadable");
  const answers = await post(server.url, "/api/setup/answers", { name: "Alex" });
  assert.equal(answers.status, 503);
  assert.equal(readFileSync(place.settingsPath, "utf8"), '{"configVersion": 9}');
});

test("the language is stored in the settings file", async (t) => {
  const place = home(t);
  const server = await serve(t, place);
  assert.deepEqual((await get(`${server.url}/api/settings`)).body, {
    available: true,
    language: null,
  });
  assert.deepEqual((await post(server.url, "/api/settings/language", { language: "en" })).body, {
    language: "en",
  });
  assert.equal(settingsOf(place).language, "en");
  assert.equal((await get(`${server.url}/api/settings`)).body.language, "en");
  assert.equal((await post(server.url, "/api/settings/language", { language: "fr" })).status, 400);
  await post(server.url, "/api/settings/language", { language: null });
  assert.equal("language" in settingsOf(place), false);
  const fixed = await startAppServer({ workspaceDirectory: place.root, port: 0 });
  t.after(() => fixed.close());
  assert.deepEqual((await get(`${fixed.url}/api/settings`)).body, {
    available: false,
    language: null,
  });
  assert.equal((await post(fixed.url, "/api/settings/language", { language: "de" })).status, 503);
});

test("a fixed workspace never runs the setup, and setup writes keep the request guards", async (t) => {
  const place = home(t);
  const workspace = join(place.root, "ws");
  await cli(workspace, "workspace", "init", "--reviewer", "Ocomic", "--name", "lab");
  const fixed = await serve(t, place, { workspaceDirectory: workspace });
  assert.equal((await get(`${fixed.url}/api/setup`)).body.mode, "fixed");
  const refused = await post(fixed.url, "/api/setup/answers", { name: "Alex" });
  assert.equal(refused.status, 409);
  const server = await serve(t, place);
  const foreign = await post(
    server.url,
    "/api/setup/answers",
    { name: "Alex" },
    "https://evil.example",
  );
  assert.equal(foreign.status, 403);
  assert.equal(existsSync(place.settingsPath), false);
});
