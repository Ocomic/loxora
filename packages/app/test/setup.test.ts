import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runCli } from "@loxora/cli";
import { WORKSPACE_EXPORT_SECTIONS, workspaceExportRecords } from "@loxora/core";
import { openSqliteReadOnlyStore } from "@loxora/sqlite";
import { startAppServer } from "../src/index.js";
import { captainId, type FolderPicker, isOneDrivePath } from "../src/server/setup.js";
import {
  goalOf,
  interpret,
  looksLikePath,
  PROMPT_KEYS,
  PROMPTS,
} from "../src/shared/conversation.js";

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
  setup: { env?: Record<string, string>; pickFolder?: FolderPicker } = {},
) {
  const server = await startAppServer({
    port: 0,
    ...extra,
    settings: {
      path: place.settingsPath,
      defaultWorkspace: place.defaultWorkspace,
      documents: () => place.documents,
      env: setup.env ?? {},
      home: place.root,
      ...(setup.pickFolder ? { pickFolder: setup.pickFolder } : {}),
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
    reviewers: [],
    places: null,
    picker: false,
  });
  assert.deepEqual(first.body.xora, { state: "not_installed" });
  assert.equal(first.body.step, "name");
  assert.deepEqual(first.body.boot, {
    shipComputer: "ready",
    logbook: "notCreated",
    xora: "scriptMode",
  });
  assert.equal((await get(`${server.url}/api/workspace`)).status, 503);
  assert.equal((await get(`${server.url}/api/missions`)).status, 503);
  assert.equal(existsSync(place.settingsPath), false, "reading never creates the settings file");

  const unusable = await post(server.url, "/api/setup/answers", { name: "!!!" });
  assert.equal(unusable.status, 400);
  assert.equal(unusable.body.error, "CaptainNeeded");
  const named = await post(server.url, "/api/setup/answers", { name: "Alex Müller" });
  assert.equal(named.status, 200);
  assert.deepEqual((named.body.answers as Record<string, unknown>).captain, "alex-mueller");
  assert.equal((named.body as { step: string }).step, "ship");
  const removed = await post(server.url, "/api/setup/intro", {});
  assert.equal(removed.status, 405, "the intro route of Milestone 13 is removed");
  const early = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(early.body.error, "Incomplete");
  await post(server.url, "/api/setup/answers", { shipName: "Nova" });

  const created = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body, { mode: "ready", step: "project" });
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

  assert.deepEqual((await get(`${server.url}/api/setup`)).body, {
    mode: "ready",
    step: "project",
    answers: {
      name: "Alex Müller",
      captain: "alex-mueller",
      shipName: "Nova",
      logbookPath: logbook,
    },
    boot: { shipComputer: "ready", logbook: "found", xora: "scriptMode" },
    firstSteps: {
      pending: false,
      stage: "goal",
      projectId: null,
      purpose: null,
      missionId: null,
      answer: null,
    },
  });
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
  assert.deepEqual((hint.body.logbook as { reviewers: string[] }).reviewers, ["alex"]);
  const exists = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(exists.status, 409);
  assert.equal(exists.body.error, "WorkspaceExists");
  const relative = await post(server.url, "/api/setup/answers", { logbookPath: "Loxora" });
  assert.equal(relative.status, 400);
});

test("another logbook folder is chosen in the folder window, on this PC or in OneDrive", async (t) => {
  const place = home(t);
  const oneDrive = join(place.root, "OneDrive");
  const projects = join(place.root, "Projekte");
  mkdirSync(projects);
  const calls: [string, string][] = [];
  let answer: string | null = projects;
  const server = await serve(
    t,
    place,
    {},
    {
      env: { OneDrive: oneDrive },
      pickFolder: async (start, title) => {
        calls.push([start, title]);
        return answer;
      },
    },
  );
  await post(server.url, "/api/setup/answers", { name: "Alex", shipName: "Nova" });
  const state = await get(`${server.url}/api/setup`);
  assert.deepEqual((state.body.logbook as { places: unknown }).places, {
    local: place.root,
    oneDrive,
  });
  assert.equal((state.body.logbook as { picker: boolean }).picker, true);

  const local = await post(server.url, "/api/setup/folder", { place: "local", title: "Wähle" });
  assert.equal(local.status, 200);
  assert.equal(local.body.picked, true);
  assert.deepEqual(calls, [[place.root, "Wähle"]]);
  // A "Loxora" folder goes inside the chosen folder; the conversation checks it again.
  assert.equal((local.body.logbook as { path: string }).path, join(projects, "Loxora"));
  assert.equal((local.body.logbook as { oneDrive: boolean }).oneDrive, false);

  answer = join(oneDrive, "Loxora");
  const cloud = await post(server.url, "/api/setup/folder", { place: "oneDrive" });
  assert.equal(calls[1]?.[0], oneDrive);
  assert.equal((cloud.body.logbook as { path: string }).path, answer);
  assert.equal((cloud.body.logbook as { oneDrive: boolean }).oneDrive, true);

  // Closing the window keeps the folder chosen before.
  answer = null;
  const closed = await post(server.url, "/api/setup/folder", { place: "local" });
  assert.equal(closed.body.picked, false);
  assert.equal((closed.body.logbook as { path: string }).path, join(oneDrive, "Loxora"));

  const invalid = await post(server.url, "/api/setup/folder", { place: "desktop" });
  assert.equal(invalid.status, 400);
});

test("without OneDrive and a folder window, another folder is typed", async (t) => {
  const place = home(t);
  const server = await serve(t, place);
  await post(server.url, "/api/setup/answers", { name: "Alex", shipName: "Nova" });
  const state = await get(`${server.url}/api/setup`);
  assert.equal((state.body.logbook as { places: unknown }).places, null);
  assert.equal((state.body.logbook as { picker: boolean }).picker, false);
  const refused = await post(server.url, "/api/setup/folder", { place: "documents" });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, "NoPicker");
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
  assert.deepEqual(opened.body, { mode: "ready", step: "project" });
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
  assert.deepEqual(opened.body, { mode: "ready", step: "project" });
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

/** A set-up logbook with the captain "alex", ready for the first steps (parts D and E). */
async function setUp(t: test.TestContext) {
  const place = home(t);
  const server = await serve(t, place);
  await post(server.url, "/api/setup/answers", { name: "Alex", shipName: "Nova" });
  await post(server.url, "/api/setup/workspace", { action: "create" });
  return { place, server, logbook: join(place.documents, "Loxora") };
}

async function records(logbook: string, name: string) {
  const store = await openSqliteReadOnlyStore(join(logbook, "workspace.sqlite"), "007_missions");
  try {
    const spec = WORKSPACE_EXPORT_SECTIONS.find((entry) => entry.name === name);
    assert.ok(spec, name);
    return workspaceExportRecords(await store.readWorkspaceExport(), spec) as readonly Record<
      string,
      unknown
    >[];
  } finally {
    await store.close();
  }
}

async function propose(url: string, body: Record<string, unknown>) {
  const reply = await post(url, "/api/assistant/message", { language: "en", ...body });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  const action = reply.body.action as Record<string, unknown>;
  assert.equal(typeof action.id, "string");
  return action;
}

async function confirm(url: string, actionId: unknown, yes = true) {
  return post(url, "/api/assistant/confirm", { actionId, confirm: yes });
}

test("the first steps write the project, the Mission, and accepted knowledge after confirmation", async (t) => {
  const { server, logbook, place } = await setUp(t);
  const goal = { choice: "goal", goal: "game", projectName: "My game" };
  const declined = await propose(server.url, goal);
  assert.deepEqual(
    { ...declined, id: "" },
    {
      id: "",
      kind: "createProject",
      name: "My game",
      purpose: "Develop a game of my own.",
      spaces: ["Ideas", "Tasks", "Decisions"],
      collection: "Project goal",
    },
  );
  assert.equal((await records(logbook, "projects")).length, 0, "a proposal never writes");
  assert.equal((await confirm(server.url, declined.id, false)).body.confirmed, false);
  assert.equal((await records(logbook, "projects")).length, 0, "declined");
  assert.equal((await confirm(server.url, declined.id)).body.error, "UnknownAction");

  const project = await propose(server.url, goal);
  const created = await confirm(server.url, project.id);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal((created.body.firstSteps as Record<string, unknown>).stage, "mission");
  assert.equal((await confirm(server.url, project.id)).body.error, "UnknownAction", "only once");
  const again = await confirm(server.url, (await propose(server.url, goal)).id);
  assert.equal(again.status, 409);
  assert.equal(again.body.error, "WrongStep");

  // The conversation ends on the bridge, where the first Mission is offered.
  const before = (await get(`${server.url}/api/setup`)).body;
  assert.equal(before.step, "bridge");
  assert.equal((before.firstSteps as Record<string, unknown>).pending, false);
  const finish = await post(server.url, "/api/setup/finish", {});
  assert.deepEqual(finish.body, { mode: "ready", setupComplete: true });
  const bridge = (await get(`${server.url}/api/setup`)).body;
  assert.equal(bridge.step, null);
  assert.deepEqual(bridge.firstSteps, {
    pending: true,
    stage: "mission",
    projectId: (settingsOf(place).setup as Record<string, unknown>).projectId,
    purpose: "Develop a game of my own.",
    missionId: null,
    answer: null,
  });
  assert.equal((await get(`${server.url}/api/workspace`)).body.setupComplete, true);
  const late = await confirm(server.url, (await propose(server.url, goal)).id);
  assert.equal(late.body.error, "SetupFinished", "the project belongs to the conversation");

  const mission = await propose(server.url, { choice: "firstMission" });
  assert.equal(mission.question, "Who is the project for?");
  assert.equal(mission.goal, "Record the goal of the project in a few sentences.");
  assert.equal(mission.rationale, "Scope and style depend on it.");
  const started = await confirm(server.url, mission.id);
  const steps = started.body.firstSteps as Record<string, unknown>;
  assert.equal(steps.stage, "answer");
  const missionId = String(steps.missionId);
  const detail = (await get(`${server.url}/api/missions/${missionId}`)).body;
  assert.equal(detail.state, "waiting");
  const answered = await post(server.url, `/api/missions/${missionId}/answer`, {
    sequence: detail.sequence,
    response: "For myself",
  });
  assert.equal(answered.status, 200, JSON.stringify(answered.body));
  const ready = (await get(`${server.url}/api/setup`)).body.firstSteps as Record<string, unknown>;
  assert.equal(ready.stage, "record");
  assert.equal(ready.answer, "For myself");
  assert.equal(ready.purpose, "Develop a game of my own.");

  const text = "A small game for myself.";
  const recorded = await confirm(
    server.url,
    (await propose(server.url, { choice: "goalText", text })).id,
  );
  assert.equal(recorded.status, 200, JSON.stringify(recorded.body));
  assert.equal((recorded.body.firstSteps as Record<string, unknown>).stage, "hints");

  const projects = await records(logbook, "projects");
  assert.deepEqual(
    projects.map((entry) => [entry.name, entry.purpose]),
    [["My game", "Develop a game of my own."]],
  );
  const spaces = await records(logbook, "knowledgeSpaces");
  assert.deepEqual(spaces.map((entry) => entry.name).sort(), ["Decisions", "Ideas", "Tasks"]);
  const collections = await records(logbook, "knowledgeCollections");
  assert.equal(collections.length, 1);
  assert.equal(
    spaces.find((entry) => entry.id === collections[0]?.spaceId)?.name,
    "Ideas",
    "the collection lies in the first space",
  );
  const sources = await records(logbook, "sourceReferences");
  assert.deepEqual(
    sources.map((entry) => [entry.kind, entry.title]),
    [["setup", "Setup conversation"]],
  );
  const evidence = await records(logbook, "evidenceReferences");
  assert.deepEqual(
    evidence.map((entry) => [entry.summary, entry.locator]),
    [["Answer to “Who is the project for?”: For myself", `mission:${missionId}`]],
  );
  const proposals = await records(logbook, "knowledgeProposals");
  assert.deepEqual(
    proposals.map((entry) => [entry.proposedNodeTitle, entry.proposedContent, entry.proposerId]),
    [["Project goal", text, "agent:xora"]],
  );
  const reviews = await records(logbook, "reviewDecisions");
  assert.deepEqual(
    reviews.map((entry) => [entry.decision, entry.reviewerId]),
    [["Accepted", "alex"]],
  );
  assert.equal((await records(logbook, "knowledgeRevisions")).length, 1);
  const audit = await records(logbook, "auditEvents");
  assert.deepEqual(
    [...new Set(audit.map((entry) => entry.actorId))].sort(),
    ["agent:xora", "alex"],
    "every write is attributed to Xora or the captain",
  );
  const finished = (await get(`${server.url}/api/missions/${missionId}`)).body;
  assert.equal(finished.state, "completed");
  const events = (await get(`${server.url}/api/missions/${missionId}/events`)).body as unknown as {
    type: string;
    actorId: string;
  }[];
  assert.deepEqual(
    events.map((event) => `${event.type}:${event.actorId}`),
    [
      "Created:agent:xora",
      "Started:agent:xora",
      "Waiting:agent:xora",
      "AttentionAnswered:alex",
      "Resumed:agent:xora",
      "Completed:agent:xora",
    ],
  );

  assert.equal(
    ((await get(`${server.url}/api/setup`)).body.firstSteps as Record<string, unknown>).pending,
    false,
    "the offer is gone once the first Mission is finished",
  );
  const twice = await confirm(
    server.url,
    (await propose(server.url, { choice: "goalText", text })).id,
  );
  assert.equal(twice.body.error, "WrongStep");
});

test("a repeated first step continues from the ids it already wrote", async (t) => {
  const { server, logbook, place } = await setUp(t);
  const goal = { choice: "goal", goal: "other", purpose: "Plan a garden.", projectName: "Garden" };
  assert.equal((await confirm(server.url, (await propose(server.url, goal)).id)).status, 200);
  // Simulate a failure after the second space: forget the last space and the collection.
  const settings = settingsOf(place);
  const setup = settings.setup as Record<string, unknown>;
  const spaceIds = setup.spaceIds as string[];
  writeFileSync(
    place.settingsPath,
    JSON.stringify({
      ...settings,
      setup: { ...setup, spaceIds: spaceIds.slice(0, 2), collectionId: undefined },
    }),
  );
  assert.equal(
    ((await get(`${server.url}/api/setup`)).body.firstSteps as Record<string, unknown>).stage,
    "goal",
  );
  const repeated = await confirm(server.url, (await propose(server.url, goal)).id);
  assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
  assert.equal((await records(logbook, "projects")).length, 1, "no second project");
  assert.equal((await records(logbook, "knowledgeSpaces")).length, 4, "only the missing space");
  assert.equal((await records(logbook, "knowledgeCollections")).length, 2);
  assert.equal(
    ((await records(logbook, "projects"))[0] as Record<string, unknown>).purpose,
    "Plan a garden.",
  );
});

test("two confirmations of the same step at once write the project only once", async (t) => {
  const { server, logbook } = await setUp(t);
  const goal = { choice: "goal", goal: "writing", projectName: "Book" };
  const first = await propose(server.url, goal);
  const second = await propose(server.url, goal);
  const results = await Promise.all([
    confirm(server.url, first.id),
    confirm(server.url, second.id),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await records(logbook, "projects")).length, 1);
  assert.equal((await records(logbook, "knowledgeSpaces")).length, 3);
  assert.equal((await records(logbook, "knowledgeCollections")).length, 1);
});

test("the first steps need a human captain, a set-up logbook, and valid choices", async (t) => {
  const place = home(t);
  const server = await serve(t, place);
  const early = await post(server.url, "/api/assistant/message", { choice: "firstMission" });
  assert.equal(early.status, 409);
  assert.equal(early.body.error, "NotReady");
  const bar = await post(server.url, "/api/assistant/message", { text: "Hello Xora" });
  assert.deepEqual(bar.body, { reply: "notOnBoard" });
  const topic = await post(server.url, "/api/assistant/message", {
    text: "What are missions?",
    topic: "missions",
  });
  assert.deepEqual(topic.body, { reply: "missions" });
  assert.equal(
    (await post(server.url, "/api/assistant/message", { choice: "launch" })).body.error,
    "Invalid",
  );
  assert.equal(
    (await post(server.url, "/api/assistant/message", { text: "x" }, "http://evil.example")).status,
    403,
  );
  assert.equal((await post(server.url, "/api/setup/finish", {})).body.error, "NotReady");

  const workspace = join(place.root, "ws");
  await cli(workspace, "workspace", "init", "--reviewer", "Ocomic", "--name", "lab");
  mkdirSync(join(place.root, ".loxora"), { recursive: true });
  writeFileSync(
    place.settingsPath,
    JSON.stringify({ configVersion: 1, captain: "Someone", workspacePath: workspace }),
  );
  const refused = await post(server.url, "/api/assistant/message", {
    choice: "goal",
    goal: "website",
    projectName: "Site",
  });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, "ReadOnly");
  assert.equal((await confirm(server.url, "unknown")).body.error, "ReadOnly");
  assert.equal(
    (
      await post(server.url, "/api/assistant/message", {
        choice: "goal",
        goal: "other",
        projectName: "X",
      })
    ).body.error,
    "Invalid",
    "something else needs a purpose",
  );
});

test("the keyword list places typed setup answers in both languages", () => {
  const cases: [Parameters<typeof interpret>[0], string, "de" | "en", unknown][] = [
    ["logbook", "Ja, passt so!", "de", { choice: "fits" }],
    ["logbook", "Lieber einen anderen Ordner", "de", { choice: "other" }],
    ["logbook", "D:\\Logbuch", "de", { choice: "path", value: "D:\\Logbuch" }],
    ["logbook", "/home/alex/logbook", "en", { choice: "path", value: "/home/alex/logbook" }],
    ["logbook", "Yes, that's fine", "en", { choice: "fits" }],
    ["logbook", "another folder please", "en", { choice: "other" }],
    ["logbook", "Auswahl ändern", "de", { choice: "other" }],
    ["place", "Auf diesem PC", "de", { choice: "local" }],
    ["place", "Lieber in OneDrive", "de", { choice: "oneDrive" }],
    ["place", "On this PC", "en", { choice: "local" }],
    ["place", "in OneDrive", "en", { choice: "oneDrive" }],
    ["logbook", "Ordner", "de", { choice: "other" }],
    ["logbook", "folder", "en", { choice: "other" }],
    ["project", "Ein neues Projekt anlegen", "de", { choice: "new" }],
    ["project", "Ich möchte ein bestehendes hinzufügen", "de", { choice: "existing" }],
    ["project", "Ich schau mich erst mal um", "de", { choice: "look" }],
    ["project", "Start a new project", "en", { choice: "new" }],
    ["project", "Add an existing project", "en", { choice: "existing" }],
    ["project", "I'll look around first", "en", { choice: "look" }],
    ["existing", "Ja, öffnen", "de", { choice: "open" }],
    ["existing", "Neues Schiff", "de", { choice: "new" }],
    ["confirm", "Ja, anlegen", "de", { choice: "create" }],
    ["confirm", "Namen ändern", "de", { choice: "rename" }],
    ["confirm", "yes", "en", { choice: "create" }],
    ["confirm", "change the name", "en", { choice: "rename" }],
    ["bridge", "Auf zur Brücke!", "de", { choice: "toBridge" }],
    ["bridge", "to the bridge", "en", { choice: "toBridge" }],
    ["describe", "Etwas anderes", "de", { choice: "other" }],
    ["describe", "Something else", "en", { choice: "other" }],
    ["ship", "Sternenfalke", "de", { value: "Sternenfalke" }],
  ];
  for (const [prompt, text, language, expected] of cases) {
    assert.deepEqual(interpret(prompt, text, language), expected, `${prompt}: ${text}`);
  }
  // Unplaceable answers and answers matching two buttons are not understood.
  assert.equal(interpret("logbook", "Banane", "de"), null);
  assert.equal(interpret("project", "banana", "en"), null);
  assert.equal(interpret("confirm", "Ja, aber anderer Name", "de"), null);
  assert.equal(interpret("bridge", "vielleicht", "de"), null);
  // Free-text prompts never reject an answer.
  for (const prompt of PROMPT_KEYS.filter((key) => PROMPTS[key].accepts === "text")) {
    for (const text of ["?!", "Banane", "C:\\Logbuch", "x"]) {
      assert.deepEqual(interpret(prompt, text, "de"), { value: text }, prompt);
      assert.deepEqual(interpret(prompt, text, "en"), { value: text }, prompt);
    }
  }
  assert.deepEqual(interpret("describe", "Ich will ein Jump'n'Run-Spiel bauen.", "de"), {
    value: "Ich will ein Jump'n'Run-Spiel bauen.",
    goal: "game",
  });
  assert.equal(goalOf("Eine Homepage für meinen Verein", "de"), "website");
  assert.equal(goalOf("Einen Roman über Piraten schreiben", "de"), "writing");
  assert.equal(goalOf("Plan my garden", "en"), "other");
  assert.equal(goalOf("A game website", "en"), "other", "two templates fit: none is guessed");
  assert.equal(goalOf("A novel about pirates", "en"), "writing");
  assert.equal(looksLikePath("\\\\server\\share"), true);
  assert.equal(looksLikePath("Loxora"), false);
});

test("setup answers go through the assistant and write nothing", async (t) => {
  const place = home(t);
  const server = await serve(t, place);
  const typed = await post(server.url, "/api/assistant/message", {
    prompt: "logbook",
    text: "Ja, passt so",
    language: "de",
  });
  assert.deepEqual(typed.body, {
    prompt: "logbook",
    choice: "fits",
    choices: ["fits", "other", "open"],
    terms: ["logbook"],
  });
  const unknown = await post(server.url, "/api/assistant/message", {
    prompt: "project",
    text: "Banane",
    language: "de",
  });
  assert.deepEqual(unknown.body, {
    reply: "notUnderstood",
    prompt: "project",
    choices: ["new", "existing", "look"],
    terms: ["project"],
  });
  const tapped = await post(server.url, "/api/assistant/message", {
    prompt: "ship",
    choice: "aurora",
  });
  assert.equal(tapped.body.choice, "aurora");
  for (const body of [
    { prompt: "launch", text: "x" },
    { prompt: "ship", choice: "enterprise" },
    { prompt: "ship", choice: "nova", text: "Nova" },
    { prompt: "name", text: "  " },
  ]) {
    const refused = await post(server.url, "/api/assistant/message", body);
    assert.equal(refused.status, 400, JSON.stringify(body));
  }
  // "Add an existing project" is an answer only: no folder is read, nothing is written.
  const existing = await post(server.url, "/api/assistant/message", {
    prompt: "project",
    choice: "existing",
  });
  assert.equal(existing.body.choice, "existing");
  assert.equal(existsSync(place.settingsPath), false);
  assert.equal(existsSync(join(place.documents, "Loxora")), false);
});

test("a typed plan description is the project purpose", async (t) => {
  const { server, logbook } = await setUp(t);
  const description = "A small platform game for my kids.";
  const project = await propose(server.url, {
    choice: "goal",
    goal: "game",
    projectName: "Jumper",
    purpose: description,
  });
  assert.equal(project.purpose, description);
  assert.deepEqual(project.spaces, ["Ideas", "Tasks", "Decisions"]);
  assert.equal((await confirm(server.url, project.id)).status, 200);
  assert.deepEqual(
    (await records(logbook, "projects")).map((entry) => [entry.name, entry.purpose]),
    [["Jumper", description]],
  );
});

test("looking around first ends the setup without a project and without an offer", async (t) => {
  const { server, place } = await setUp(t);
  const finish = await post(server.url, "/api/setup/finish", {});
  assert.equal(finish.status, 200);
  const state = (await get(`${server.url}/api/setup`)).body;
  assert.equal(state.step, null);
  assert.equal((state.firstSteps as Record<string, unknown>).pending, false);
  assert.equal((settingsOf(place).setup as Record<string, unknown>).projectId, undefined);
});

test("the first Mission offer can be dismissed; its steps are then closed", async (t) => {
  const { server, place } = await setUp(t);
  const goal = { choice: "goal", goal: "writing", projectName: "Book" };
  assert.equal((await confirm(server.url, (await propose(server.url, goal)).id)).status, 200);
  await post(server.url, "/api/setup/finish", {});
  const completedAt = (settingsOf(place).setup as Record<string, unknown>).completedAt;
  const offered = (await get(`${server.url}/api/setup`)).body.firstSteps as Record<string, unknown>;
  assert.equal(offered.pending, true);
  const mission = await propose(server.url, { choice: "firstMission" });
  const dismissed = await post(server.url, "/api/setup/finish", { skipped: true });
  assert.equal(dismissed.status, 200);
  const setup = settingsOf(place).setup as Record<string, unknown>;
  assert.match(String(setup.firstMissionDismissedAt), /^\d{4}-/);
  assert.equal(setup.completedAt, completedAt, "the end of the setup is kept");
  const after = (await get(`${server.url}/api/setup`)).body.firstSteps as Record<string, unknown>;
  assert.equal(after.pending, false);
  assert.equal((await confirm(server.url, mission.id)).body.error, "SetupFinished");
  assert.equal((await post(server.url, "/api/setup/finish", { skipped: "yes" })).status, 400);
});

test("a settings file with the Milestone 13 intro flag still loads", async (t) => {
  const place = home(t);
  const workspace = join(place.root, "ws");
  await cli(workspace, "workspace", "init", "--reviewer", "alex", "--name", "Nova");
  mkdirSync(join(place.root, ".loxora"), { recursive: true });
  writeFileSync(
    place.settingsPath,
    JSON.stringify({
      configVersion: 1,
      displayName: "Alex",
      captain: "alex",
      workspacePath: workspace,
      setup: { introducedAt: "2026-10-05T10:00:00.000Z" },
    }),
  );
  const server = await serve(t, place);
  const state = (await get(`${server.url}/api/setup`)).body;
  assert.equal(state.mode, "ready");
  assert.equal(state.step, "project", "the conversation continues with the project");
  assert.equal("introPending" in state, false);
  assert.equal((await get(`${server.url}/api/workspace`)).body.actor, "alex");
});

test("the start screen reports a logbook found when a workspace exists", async (t) => {
  const place = home(t);
  await cli(place.defaultWorkspace, "workspace", "init", "--reviewer", "alex", "--name", "Old");
  const server = await serve(t, place);
  const state = (await get(`${server.url}/api/setup`)).body;
  assert.deepEqual(state.boot, { shipComputer: "ready", logbook: "found", xora: "scriptMode" });
});
