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
    reviewers: [],
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
  const notReady = await post(server.url, "/api/setup/intro", {});
  assert.equal(notReady.body.error, "NotReady");
  const early = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(early.body.error, "Incomplete");
  await post(server.url, "/api/setup/answers", { shipName: "Nova" });

  const created = await post(server.url, "/api/setup/workspace", { action: "create" });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body, { mode: "ready", introPending: true });
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
    introPending: true,
    firstSteps: {
      pending: true,
      stage: "goal",
      projectId: null,
      purpose: null,
      missionId: null,
      answer: null,
    },
  });
  const intro = await post(server.url, "/api/setup/intro", {});
  assert.deepEqual(intro.body, { mode: "ready", introPending: false });
  assert.deepEqual((await get(`${server.url}/api/setup`)).body, {
    mode: "ready",
    introPending: false,
    firstSteps: {
      pending: true,
      stage: "goal",
      projectId: null,
      purpose: null,
      missionId: null,
      answer: null,
    },
  });
  assert.match(
    String((settingsOf(place).setup as { introducedAt?: string }).introducedAt),
    /^\d{4}-\d\d-\d\dT/,
  );
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
  assert.deepEqual(opened.body, { mode: "ready", introPending: true });
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
  assert.deepEqual(opened.body, { mode: "ready", introPending: true });
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
  await post(server.url, "/api/setup/intro", {});
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

  const mission = await propose(server.url, { choice: "firstMission" });
  assert.equal(mission.question, "Who is the project for?");
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

  const finish = await post(server.url, "/api/setup/finish", {});
  assert.deepEqual(finish.body, { mode: "ready", setupComplete: true });
  assert.equal((await get(`${server.url}/api/workspace`)).body.setupComplete, true);
  const late = await confirm(
    server.url,
    (await propose(server.url, { choice: "goalText", text })).id,
  );
  assert.equal(late.body.error, "SetupFinished");
  assert.match(String((settingsOf(place).setup as Record<string, unknown>).completedAt), /^\d{4}-/);
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
