import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readSettings, runCli, writeSettings, type XoraLocalModel } from "@loxora/cli";
import { startAppServer } from "../src/index.js";
import { ModelAssistant, ScriptedAssistant } from "../src/server/assistant.js";
import type { ModelRequest, ModelTurn } from "../src/server/model.js";
import { labelFromFile, proposeModelChange } from "../src/server/model-choice.js";
import { XoraRuntime, type XoraStatus } from "../src/server/runtime.js";
import type { XoraSource } from "../src/server/server.js";
import { chatPrompt } from "../src/server/xora-prompt.js";
import {
  asksForModelChange,
  asksWhatNow,
  carriesDescription,
  interpret,
  PROMPTS,
  SETUP_STEPS,
} from "../src/shared/conversation.js";

/** Milestone 16 delivery 2: the step "Xora", choosing another model, and the project name. */

type Body = Record<string, unknown>;

function temp(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "loxora-model-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

async function healthy(t: test.TestContext) {
  const server: Server = createServer((_request, response) => response.writeHead(200).end("{}"));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

/** A runtime that answers its health route only after `count` calls. */
async function healthyAfter(t: test.TestContext, count: number) {
  let calls = 0;
  const server: Server = createServer((_request, response) => {
    calls += 1;
    response.writeHead(calls > count ? 200 : 503).end("{}");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

async function send(url: string, path: string, body: Body) {
  const response = await fetch(new URL(path, url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Body };
}

test("the setup has six steps; the new prompts are placed by their keywords", () => {
  assert.deepEqual(SETUP_STEPS, ["name", "xora", "ship", "logbook", "project", "bridge"]);
  assert.deepEqual(PROMPTS.xora.terms, ["model"]);
  const cases: [keyof typeof PROMPTS, string, "de" | "en", string | undefined][] = [
    ["xora", "passt so", "de", "keep"],
    ["xora", "Ich will ein besseres", "de", "change"],
    ["xora", "Was heißt das?", "de", "explain"],
    ["xora", "keep it", "en", "keep"],
    ["xora", "switch please", "en", "change"],
    ["model", "eine gguf Datei", "de", "localFile"],
    ["model", "das Programm läuft schon", "de", "attached"],
    ["model", "lieber Claude", "de", "cloud"],
    ["model", "later", "en", "later"],
    ["restart", "nochmal versuchen", "de", "again"],
    ["restart", "ohne Xora", "de", "without"],
    ["modelConfirm", "ja", "de", "switch"],
    ["modelConfirm", "stay", "en", "stay"],
    ["projectName", "mach du einen Vorschlag", "de", "suggest"],
  ];
  for (const [prompt, text, language, choice] of cases) {
    assert.equal(interpret(prompt, text, language)?.choice, choice, `${prompt}: ${text}`);
  }
  // A typed project name is stored as typed; it never counts as a button.
  assert.deepEqual(interpret("projectName", "Sternenfalke", "de"), { value: "Sternenfalke" });
  assert.deepEqual(interpret("modelUrl", "http://localhost:9000", "en"), {
    value: "http://localhost:9000",
  });
  assert.equal(interpret("xora", "Banane", "de"), null);
});

test("asking Xora for another model gets the fixed answer, with or without a model", async () => {
  assert.equal(asksForModelChange("Kannst du ein besseres Modell nehmen?", "de"), true);
  assert.equal(asksForModelChange("Can you switch to a stronger model?", "en"), true);
  assert.equal(asksForModelChange("Was ist ein Modell?", "de"), false);
  assert.deepEqual(
    await new ScriptedAssistant().respond(
      { kind: "message", text: "Kannst du ein anderes Modell nehmen?" },
      "de",
    ),
    { reply: "model" },
  );
  const asked: ModelRequest[] = [];
  const assistant = new ModelAssistant(
    { url: () => "http://127.0.0.1:1", fail: () => undefined },
    new ScriptedAssistant(),
    async (_base, request) => {
      asked.push(request);
      return { text: "nein" };
    },
  );
  assert.deepEqual(
    await assistant.respond({ kind: "message", text: "Wechsel bitte dein Modell" }, "de"),
    { reply: "model" },
  );
  assert.equal(asked.length, 0, "the model is not asked");
});

test('Check A: "What now?" points to the first Mission while it waits', async () => {
  assert.equal(asksWhatNow("Was soll ich jetzt tun?", "de"), true);
  assert.equal(asksWhatNow("Wie geht es weiter?", "de"), true);
  assert.equal(asksWhatNow("What should I do now?", "en"), true);
  assert.equal(asksWhatNow("Was kannst du?", "de"), false);
  assert.equal(asksWhatNow("Was ist ein Logbuch?", "de"), false);
  const asked: ModelRequest[] = [];
  const assistant = new ModelAssistant(
    { url: () => "http://127.0.0.1:1", fail: () => undefined },
    new ScriptedAssistant(),
    async (_base, request) => {
      asked.push(request);
      return { text: "Schau dich um." };
    },
  );
  const message = { kind: "message", text: "Was soll ich jetzt tun?" } as const;
  assert.deepEqual(
    await assistant.respond(message, "de", { captain: "Alex", firstMission: true }),
    {
      reply: "firstMission",
    },
  );
  assert.equal(asked.length, 0, "the model is not asked while the first Mission waits");
  assert.deepEqual(await assistant.respond(message, "de", { captain: "Alex" }), {
    text: "Schau dich um.",
  });
  assert.deepEqual(
    await new ScriptedAssistant().respond(message, "de", { captain: "Alex", firstMission: true }),
    { reply: "firstMission" },
  );
  assert.deepEqual(await new ScriptedAssistant().respond(message, "de"), { reply: "notOnBoard" });
});

test('Check A: a typed answer to "Which project?" can already be the description', () => {
  assert.equal(
    carriesDescription("Ein mobile Webgame online RPG mit Soulslike Elementen erstellen.", "de"),
    true,
  );
  assert.equal(carriesDescription("Ich möchte gerne ein neues Projekt anlegen", "de"), false);
  assert.equal(carriesDescription("neu", "de"), false);
  assert.equal(carriesDescription("Start a new project", "en"), false);
  assert.equal(carriesDescription("Create a website for my bakery", "en"), true);
});

test("Xora knows on the bridge where the first Mission waits and where her model changes", () => {
  const without = chatPrompt("de", { captain: "Alex" });
  assert.match(without, /Modell wechseln/);
  assert.equal(without.includes("erste Mission"), false);
  assert.match(chatPrompt("de", { captain: "Alex", firstMission: true }), /erste Mission/);
  assert.match(chatPrompt("en", { captain: "Alex", firstMission: true }), /first Mission/);
});

test("the plan description: a second, name-only question when the action is missing", async () => {
  const answers: ModelTurn[] = [
    { text: "Schön, dann schauen wir uns um." },
    { text: "„Erkundungsflug“" },
    {},
    { text: "Das ist ein Satz mit viel zu vielen Wörtern für einen Namen" },
  ];
  const asked: ModelRequest[] = [];
  const assistant = new ModelAssistant(
    { url: () => "http://127.0.0.1:1", fail: () => undefined },
    new ScriptedAssistant(),
    async (_base, request) => {
      asked.push(request);
      return answers.shift() ?? {};
    },
  );
  const text = "erstmal gucken was es gibt";
  const named = await assistant.respond({ kind: "setup", prompt: "describe", text }, "de");
  assert.equal(named.by, "model");
  assert.deepEqual(named.answer, { value: text, goal: "other", projectName: "Erkundungsflug" });
  assert.equal(asked[1]?.tools.length, 0);
  assert.match(asked[1]?.system ?? "", /Antworte nur mit dem Namen/);
  const unnamed = await assistant.respond({ kind: "setup", prompt: "describe", text }, "de");
  assert.equal(unnamed.by, "keywords", "an unusable name falls back to the template");
  assert.equal(unnamed.answer?.projectName, undefined);
});

test("a model choice is checked before the card; nothing is written", (t) => {
  const root = temp(t);
  const runtimePath = join(root, "llama-server.exe");
  const modelPath = join(root, "gemma-4-E2B-it-Q4_K_M.gguf");
  writeFileSync(runtimePath, "");
  writeFileSync(modelPath, "");
  assert.deepEqual(proposeModelChange({ mode: "managed", runtimePath, modelPath }), {
    kind: "changeModel",
    writes: {
      provider: "local",
      local: { mode: "managed", runtimePath, modelPath, modelLabel: "gemma-4-E2B-it-Q4_K_M" },
    },
  });
  assert.equal(
    proposeModelChange({ mode: "managed", runtimePath: `"${runtimePath}"`, modelPath }).writes.local
      .mode,
    "managed",
    "Windows copies a path with quotes",
  );
  const refused = (body: Body) => {
    try {
      proposeModelChange(body);
    } catch (error) {
      return (error as { kind: string }).kind;
    }
    return "accepted";
  };
  assert.equal(
    refused({ mode: "managed", runtimePath, modelPath: join(root, "x.gguf") }),
    "MissingFile",
  );
  assert.equal(refused({ mode: "managed", runtimePath, modelPath: runtimePath }), "NotGguf");
  assert.equal(
    refused({ mode: "managed", runtimePath: "llama-server.exe", modelPath }),
    "NotFullPath",
  );
  assert.equal(
    refused({ mode: "attached", url: "http://192.168.1.5:8080", modelLabel: "x" }),
    "NotLocal",
  );
  assert.equal(refused({ mode: "attached", url: "http://127.0.0.1:8080" }), "Invalid");
  assert.equal(refused({ provider: "anthropic" }), "CloudUnavailable");
  assert.equal(labelFromFile(`/models/${"a".repeat(80)}.gguf`).length, 60);
});

test("switching: a model that starts is kept; one that does not start goes back", async (t) => {
  const root = temp(t);
  const path = join(root, "settings.json");
  const good = await healthy(t);
  const previous: XoraLocalModel = { mode: "attached", url: good, modelLabel: "Gemma 4 E2B" };
  writeSettings(path, { configVersion: 2, captain: "alex", xora: { local: previous } });
  const xora = new XoraRuntime({ settingsPath: path, pollMs: 5, readyTimeoutMs: 100 });
  assert.equal((await xora.start()).state, "ready");

  const other: XoraLocalModel = { mode: "attached", url: good, modelLabel: "Qwen" };
  const switched = await xora.switchTo(other);
  assert.deepEqual(switched, { state: "ready", modelLabel: "Qwen", mode: "attached" });
  assert.deepEqual(readSettings(path)?.xora?.local, other);
  assert.equal(readSettings(path)?.captain, "alex", "the rest of the settings stays");

  const broken: XoraLocalModel = {
    mode: "attached",
    url: "http://127.0.0.1:9",
    modelLabel: "Kaputt",
  };
  const back = await xora.switchTo(broken);
  assert.equal(back.state, "ready");
  assert.equal(back.modelLabel, "Qwen");
  assert.equal(back.failedChange, "Kaputt");
  assert.deepEqual(readSettings(path)?.xora?.local, other, "the previous model is written back");

  // Two switches in a row: the newer choice wins, the older one never rolls it back.
  const slow = await healthyAfter(t, 5);
  const first: XoraLocalModel = { mode: "attached", url: slow, modelLabel: "A" };
  const second: XoraLocalModel = {
    mode: "attached",
    url: await healthyAfter(t, 3),
    modelLabel: "B",
  };
  const pending = xora.switchTo(first);
  await new Promise((done) => setTimeout(done, 10));
  await xora.switchTo(second);
  await pending;
  assert.equal(xora.status().modelLabel, "B");
  assert.deepEqual(readSettings(path)?.xora?.local, second);

  // A failed start blocks the next start until the captain restarts Xora.
  writeSettings(path, {
    configVersion: 2,
    xora: {
      local: other,
      enabled: false,
      lastStart: { at: "2026-11-02T10:00:00.000Z", result: "timeout" },
    },
  });
  const blocked = new XoraRuntime({ settingsPath: path, pollMs: 5 });
  assert.equal((await blocked.start()).reason, "declined");
  assert.equal((await blocked.restart()).state, "ready");
  assert.equal(readSettings(path)?.xora?.enabled, undefined);
  assert.equal(readSettings(path)?.xora?.lastStart?.result, "ready");
});

/** A runtime double for the server: records switches and restarts. */
function fakeSource() {
  const switched: XoraLocalModel[] = [];
  let restarts = 0;
  let status: XoraStatus = { state: "scriptMode", reason: "notConfigured" };
  const source: XoraSource = {
    url: () => null,
    fail: () => undefined,
    status: () => status,
    canChange: () => true,
    restart: async () => {
      restarts += 1;
      return status;
    },
    switchTo: async (local) => {
      switched.push(local);
      status = { state: "ready", modelLabel: local.modelLabel, mode: local.mode };
      return status;
    },
  };
  return { source, switched, restarts: () => restarts };
}

test("the server: a model change is written only after the card is confirmed", async (t) => {
  const root = temp(t);
  const settingsPath = join(root, ".loxora", "settings.json");
  const documents = join(root, "Documents");
  mkdirSync(documents, { recursive: true });
  const fake = fakeSource();
  const picked: string[] = [];
  const server = await startAppServer({
    port: 0,
    settings: {
      path: settingsPath,
      defaultWorkspace: join(root, ".loxora", "workspaces", "default"),
      documents: () => documents,
      env: {},
      pickFile: async (kind) => {
        picked.push(kind);
        return kind === "runtime" ? join(root, "llama-server.exe") : null;
      },
    },
    xora: fake.source,
  });
  t.after(() => server.close());
  const info = (await fetch(`${server.url}/api/xora`).then((response) => response.json())) as Body;
  assert.equal(info.canChange, true);
  assert.equal(info.picker, true);

  await send(server.url, "/api/setup/answers", { name: "Alex" });
  assert.deepEqual((await send(server.url, "/api/xora/pick", { kind: "runtime" })).body, {
    path: join(root, "llama-server.exe"),
  });
  assert.deepEqual((await send(server.url, "/api/xora/pick", { kind: "model" })).body, {
    cancelled: true,
  });
  assert.equal((await send(server.url, "/api/xora/pick", { kind: "other" })).status, 400);

  const proposed = await send(server.url, "/api/xora/model", {
    provider: "local",
    mode: "attached",
    url: "http://127.0.0.1:8080",
    modelLabel: "Gemma 4 E2B",
  });
  assert.equal(proposed.status, 200);
  const action = proposed.body.action as Body;
  assert.equal(action.kind, "changeModel");
  assert.deepEqual(action.writes, {
    provider: "local",
    local: { mode: "attached", url: "http://127.0.0.1:8080", modelLabel: "Gemma 4 E2B" },
  });
  assert.equal(fake.switched.length, 0, "a proposal changes nothing");
  assert.equal(
    (await send(server.url, "/api/xora/model", { mode: "attached", url: "http://example.com" }))
      .status,
    400,
  );

  const declined = await send(server.url, "/api/xora/model", {
    mode: "attached",
    url: "http://localhost:8081",
    modelLabel: "Anders",
  });
  const no = await send(server.url, "/api/assistant/confirm", {
    actionId: (declined.body.action as Body).id,
    confirm: false,
  });
  assert.equal(no.body.confirmed, false);
  assert.equal(fake.switched.length, 0);

  const yes = await send(server.url, "/api/assistant/confirm", {
    actionId: action.id,
    confirm: true,
  });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.confirmed, true);
  assert.deepEqual(fake.switched, [
    { mode: "attached", url: "http://127.0.0.1:8080", modelLabel: "Gemma 4 E2B" },
  ]);
  const again = await send(server.url, "/api/assistant/confirm", {
    actionId: action.id,
    confirm: true,
  });
  assert.equal(again.status, 404, "a card is confirmed once");

  const restarted = await send(server.url, "/api/xora/restart", {});
  assert.equal(restarted.status, 200);
  assert.equal(fake.restarts(), 1);
  assert.equal((await send(server.url, "/api/xora/model", { mode: "attached" })).status, 400);
  const written = JSON.parse(readFileSync(settingsPath, "utf8")) as Body;
  assert.equal(
    written.xora,
    undefined,
    "the server itself never writes the model; the runtime does",
  );
});

test("the server: with a fixed workspace or on the bridge without the captain, no model changes", async (t) => {
  const root = temp(t);
  const workspace = join(root, "ws");
  mkdirSync(workspace);
  const code = await runCli(["workspace", "init", "--reviewer", "alex", "--workspace", workspace], {
    env: {},
    cwd: workspace,
    stdout: () => undefined,
    stderr: () => undefined,
  });
  assert.equal(code, 0);
  const server = await startAppServer({
    port: 0,
    workspaceDirectory: workspace,
    xora: fakeSource().source,
  });
  t.after(() => server.close());
  const refused = await send(server.url, "/api/xora/model", {
    mode: "attached",
    url: "http://127.0.0.1:8080",
    modelLabel: "x",
  });
  assert.equal(refused.status, 503);
  assert.equal((await send(server.url, "/api/xora/restart", {})).status, 503);
});
