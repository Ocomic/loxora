import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  isLoopbackUrl,
  readSettings,
  runCli,
  SettingsUnreadable,
  writeSettings,
} from "@loxora/cli";
import { startAppServer } from "../src/index.js";
import { type AssistantInput, ModelAssistant, ScriptedAssistant } from "../src/server/assistant.js";
import {
  limitWords,
  type ModelRequest,
  ModelUnavailable,
  parseCompletion,
} from "../src/server/model.js";
import { XoraRuntime } from "../src/server/runtime.js";
import type { XoraSource } from "../src/server/server.js";

/** Xora with a local model (Milestone 16, delivery 1), against a fake runtime. */

type Body = Record<string, unknown>;

function temp(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "loxora-xora-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** A local HTTP server that answers like `llama-server`: health, then scripted answers. */
async function fakeRuntime(
  t: test.TestContext,
  answers: Body[] = [],
  options: { readyAfter?: number } = {},
) {
  const requests: Body[] = [];
  let health = 0;
  const server: Server = createServer(async (request: IncomingMessage, response) => {
    if (request.url === "/health") {
      health += 1;
      response.writeHead(health > (options.readyAfter ?? 0) ? 200 : 503).end("{}");
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw) as Body);
    const message = answers.shift() ?? { content: "" };
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ choices: [{ message }] }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, requests, answers };
}

function call(name: string, args: Body) {
  return { type: "function", function: { name, arguments: JSON.stringify(args) } };
}

/** A model source with a fixed address, recording failures. */
function source(url: string | null) {
  const failures: string[] = [];
  return {
    failures,
    url: () => url,
    fail: (reason: "timeout" | "exited") => {
      failures.push(reason);
    },
    status: () => ({
      state: url ? ("ready" as const) : ("scriptMode" as const),
      modelLabel: "Gemma 4 E2B",
    }),
  } satisfies XoraSource & { failures: string[] };
}

test("settings version 2 reads version 1, keeps no unknown field, and refuses keys", (t) => {
  const path = join(temp(t), "settings.json");
  writeFileSync(
    path,
    JSON.stringify({ configVersion: 1, captain: "alex", xora: { state: "not_installed" } }),
  );
  assert.deepEqual(readSettings(path), { configVersion: 2, captain: "alex" });
  writeSettings(path, {
    configVersion: 2,
    xora: {
      enabled: true,
      provider: "local",
      local: { mode: "attached", url: "http://127.0.0.1:8080", modelLabel: "Gemma 4 E2B" },
      lastStart: { at: "2026-11-02T10:00:00.000Z", result: "ready", seconds: 17.5 },
    },
  });
  assert.equal(JSON.parse(readFileSync(path, "utf8")).configVersion, 2);
  for (const xora of [
    { apiKey: "secret" },
    { local: { mode: "attached", url: "https://api.example.com", modelLabel: "x" } },
    {
      local: {
        mode: "managed",
        runtimePath: "/a/llama-server",
        modelPath: "/a/model.bin",
        modelLabel: "x",
      },
    },
    {
      local: { mode: "managed", runtimePath: "relative", modelPath: "/a/m.gguf", modelLabel: "x" },
    },
    { local: { mode: "attached", url: "http://127.0.0.1:8080", modelLabel: "x", key: "k" } },
    { lastStart: { at: "now", result: "ready" } },
    { provider: "openai" },
  ]) {
    writeFileSync(path, JSON.stringify({ configVersion: 2, xora }));
    assert.throws(() => readSettings(path), SettingsUnreadable, JSON.stringify(xora));
  }
  writeFileSync(path, JSON.stringify({ configVersion: 3 }));
  assert.throws(() => readSettings(path), SettingsUnreadable);
});

test("only http addresses on this computer count as local", () => {
  for (const url of ["http://127.0.0.1:8080", "http://localhost:8080/", "http://[::1]:8080"]) {
    assert.equal(isLoopbackUrl(url), true, url);
  }
  for (const url of [
    "https://127.0.0.1:8080",
    "http://192.168.1.5:8080",
    "http://127.0.0.1.example.com",
    "http://user:pw@127.0.0.1:8080",
    "http://127.0.0.1:8080/v1",
    "not a url",
  ]) {
    assert.equal(isLoopbackUrl(url), false, url);
  }
});

test("a model answer has at most one text and one action", () => {
  assert.deepEqual(
    parseCompletion({
      choices: [
        {
          message: {
            content: "<think>hm</think> Gern.",
            tool_calls: [
              call("place_answer", { choice: "fits" }),
              call("place_answer", { choice: "fits" }),
            ],
          },
        },
      ],
    }),
    { text: "Gern.", call: { name: "place_answer", arguments: { choice: "fits" } } },
    "identical calls count once",
  );
  assert.deepEqual(
    parseCompletion({
      choices: [{ message: { content: "", tool_calls: [call("a", {}), call("b", {})] } }],
    }),
    {},
    "different calls are dropped",
  );
  assert.deepEqual(
    parseCompletion({
      choices: [{ message: { tool_calls: [{ function: { name: "x", arguments: "{" } }] } }],
    }),
    {},
  );
  assert.deepEqual(parseCompletion({}), {});
  const long = Array.from({ length: 80 }, (_, index) => `w${index}`).join(" ");
  assert.equal(limitWords(long).split(" ").length, 61);
});

test("a tapped button and a placed keyword never reach the model", async () => {
  const asked: ModelRequest[] = [];
  const assistant = new ModelAssistant(
    source("http://127.0.0.1:1"),
    new ScriptedAssistant(),
    async (_url, request) => {
      asked.push(request);
      return {};
    },
  );
  assert.deepEqual(
    await assistant.respond({ kind: "setup", prompt: "logbook", choice: "fits" }, "de"),
    {
      answer: { choice: "fits" },
      by: "button",
    },
  );
  assert.deepEqual(
    await assistant.respond({ kind: "setup", prompt: "logbook", text: "Ja, passt" }, "de"),
    {
      answer: { choice: "fits" },
      by: "keywords",
    },
  );
  for (const prompt of ["name", "ship", "folder", "purpose", "rename"] as const) {
    const turn = await assistant.respond({ kind: "setup", prompt, text: "Sternenwind 7" }, "de");
    assert.equal(turn.answer?.value, "Sternenwind 7", `${prompt} is stored as typed`);
  }
  assert.equal(asked.length, 0);
});

test("a typed answer the keywords cannot place goes to the model, limited to the buttons", async () => {
  const answers = [
    { call: { name: "place_answer", arguments: { choice: "look" } } },
    {
      text: "Meinst du ein neues Projekt?",
      call: { name: "place_answer", arguments: { choice: "unclear" } },
    },
    { call: { name: "place_answer", arguments: { choice: "launch" } } },
  ];
  const asked: ModelRequest[] = [];
  const assistant = new ModelAssistant(
    source("http://127.0.0.1:1"),
    new ScriptedAssistant(),
    async (_url, request) => {
      asked.push(request);
      return answers.shift() ?? {};
    },
  );
  const input: AssistantInput = {
    kind: "setup",
    prompt: "project",
    text: "erstmal gucken was es gibt",
  };
  assert.deepEqual(await assistant.respond(input, "de", { captain: "Alex", ship: "Nova" }), {
    answer: { choice: "look" },
    by: "model",
  });
  const tool = asked[0]?.tools[0];
  assert.equal(tool?.name, "place_answer");
  assert.deepEqual(((tool?.parameters.properties as Body).choice as Body).enum, [
    "new",
    "existing",
    "look",
    "unclear",
  ]);
  assert.match(asked[0]?.system ?? "", /Alex ist der Kapitän des Schiffs „Nova“/);
  assert.deepEqual(await assistant.respond(input, "de"), {
    reply: "notUnderstood",
    text: "Meinst du ein neues Projekt?",
  });
  assert.deepEqual(await assistant.respond(input, "de"), { reply: "notUnderstood" });
});

test("the plan description gets a project name from the model; the purpose stays as typed", async () => {
  const answers = [
    {
      text: "Klingt gut!",
      call: {
        name: "propose_project",
        arguments: { name: "Gartenplan", goal: "other", purpose: "anders" },
      },
    },
    {
      call: {
        name: "propose_project",
        arguments: { name: "Ein viel zu langer Projektname hier", goal: "game" },
      },
    },
    { call: { name: "propose_project", arguments: { name: "Hüpfer", goal: "space" } } },
  ];
  const assistant = new ModelAssistant(
    source("http://127.0.0.1:1"),
    new ScriptedAssistant(),
    async () => answers.shift() ?? {},
  );
  const text = "Ich will meinen Garten planen.";
  assert.deepEqual(await assistant.respond({ kind: "setup", prompt: "describe", text }, "de"), {
    answer: { value: text, goal: "other", projectName: "Gartenplan" },
    by: "model",
    text: "Klingt gut!",
  });
  for (let index = 0; index < 2; index += 1) {
    const turn = await assistant.respond({ kind: "setup", prompt: "describe", text }, "de");
    assert.equal(turn.by, "keywords", "an invalid proposal falls back to the templates");
    assert.equal(turn.answer?.projectName, undefined);
  }
});

test("a model failure falls back to script mode and is reported", async () => {
  const model = source("http://127.0.0.1:1");
  const assistant = new ModelAssistant(model, new ScriptedAssistant(), async () => {
    throw new ModelUnavailable("timeout");
  });
  assert.deepEqual(await assistant.respond({ kind: "message", text: "Hallo" }, "de"), {
    reply: "notOnBoard",
  });
  assert.deepEqual(model.failures, ["timeout"]);
  const offline = new ModelAssistant(source(null), new ScriptedAssistant(), async () => {
    throw new Error("must not be called");
  });
  assert.deepEqual(
    await offline.respond({ kind: "setup", prompt: "project", text: "Banane" }, "de"),
    {
      reply: "notUnderstood",
    },
  );
});

test("attached: Xora is ready once the runtime answers its health route", async (t) => {
  const runtime = await fakeRuntime(t, [], { readyAfter: 2 });
  const xora = new XoraRuntime({ settingsPath: null, attachUrl: runtime.url, pollMs: 5 });
  const status = await xora.start();
  assert.deepEqual(status, { state: "ready", modelLabel: "Gemma 4 E2B", mode: "attached" });
  assert.equal(xora.url(), runtime.url);
  xora.fail("exited");
  assert.equal(xora.status().state, "scriptMode");
  assert.equal(xora.url(), null);
});

test("attached: a runtime that never gets ready leaves Xora in script mode", async (t) => {
  const runtime = await fakeRuntime(t, [], { readyAfter: 1_000_000 });
  const xora = new XoraRuntime({
    settingsPath: null,
    attachUrl: runtime.url,
    pollMs: 5,
    readyTimeoutMs: 50,
  });
  assert.equal((await xora.start()).reason, "timeout");
  const remote = new XoraRuntime({ settingsPath: null, attachUrl: "http://192.168.1.5:8080" });
  assert.equal((await remote.start()).reason, "notLocal");
});

test("from the settings: no model, no retry after a failure, and the start result is recorded", async (t) => {
  const root = temp(t);
  const path = join(root, "settings.json");
  assert.equal((await new XoraRuntime({ settingsPath: path }).start()).reason, "notConfigured");
  const runtime = await fakeRuntime(t);
  writeSettings(path, {
    configVersion: 2,
    xora: { local: { mode: "attached", url: runtime.url, modelLabel: "Gemma 4 E2B" } },
  });
  assert.equal((await new XoraRuntime({ settingsPath: path, pollMs: 5 }).start()).state, "ready");
  assert.equal(readSettings(path)?.xora?.lastStart?.result, "ready");
  writeSettings(path, {
    configVersion: 2,
    xora: {
      local: { mode: "attached", url: runtime.url, modelLabel: "Gemma 4 E2B" },
      lastStart: { at: "2026-11-02T10:00:00.000Z", result: "timeout" },
    },
  });
  assert.equal((await new XoraRuntime({ settingsPath: path }).start()).reason, "failedBefore");
  writeSettings(path, { configVersion: 2, xora: { enabled: false } });
  assert.equal((await new XoraRuntime({ settingsPath: path }).start()).reason, "declined");
});

test("managed: Loxora starts the runtime with the model file and stops it again", async (t) => {
  const root = temp(t);
  const path = join(root, "settings.json");
  const runtimePath = join(root, "llama-server.exe");
  const modelPath = join(root, "gemma.gguf");
  writeFileSync(runtimePath, "");
  writeFileSync(modelPath, "");
  const script = join(root, "fake-server.mjs");
  writeFileSync(
    script,
    [
      'import { createServer } from "node:http";',
      'const port = Number(process.argv[process.argv.indexOf("--port") + 1]);',
      'process.stdout.write(JSON.stringify(process.argv.slice(2)) + "\\n");',
      'createServer((q, r) => r.writeHead(200).end("{}")).listen(port, "127.0.0.1");',
    ].join("\n"),
  );
  writeSettings(path, {
    configVersion: 2,
    xora: { local: { mode: "managed", runtimePath, modelPath, modelLabel: "Gemma 4 E2B" } },
  });
  let started: { command: string; args: readonly string[] } | null = null;
  const xora = new XoraRuntime({
    settingsPath: path,
    pollMs: 10,
    readyTimeoutMs: 10_000,
    freeMemory: () => 8 * 1024 ** 3,
    spawn: ((command: string, args: readonly string[], options: object) => {
      started = { command, args };
      return spawn(process.execPath, [script, ...args], options);
    }) as typeof spawn,
  });
  t.after(() => xora.stop());
  const status = await xora.start();
  assert.equal(status.state, "ready");
  assert.ok(started);
  const { command, args } = started as { command: string; args: readonly string[] };
  assert.equal(command, runtimePath);
  assert.deepEqual(
    args.filter((arg) => !/^\d+$/.test(arg)),
    ["-m", modelPath, "--host", "127.0.0.1", "--port", "--jinja", "-c", "--no-mmproj"],
  );
  assert.equal(args.includes("-hf"), false, "Loxora never downloads a model");
  const url = xora.url() ?? "";
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.match(readFileSync(join(root, "xora-runtime.log"), "utf8"), /--jinja/);
  xora.stop();
  await new Promise((done) => setTimeout(done, 300));
  await assert.rejects(fetch(`${url}/health`), "the runtime is stopped");

  const low = new XoraRuntime({ settingsPath: path, freeMemory: () => 1024 });
  writeSettings(path, {
    configVersion: 2,
    xora: { local: { mode: "managed", runtimePath, modelPath, modelLabel: "Gemma 4 E2B" } },
  });
  assert.equal((await low.start()).reason, "lowMemory");
  assert.equal(readSettings(path)?.xora?.lastStart?.result, "lowMemory");
  writeSettings(path, {
    configVersion: 2,
    xora: {
      local: {
        mode: "managed",
        runtimePath,
        modelPath: join(root, "missing.gguf"),
        modelLabel: "x",
      },
    },
  });
  assert.equal((await new XoraRuntime({ settingsPath: path }).start()).reason, "missingFile");
});

async function cli(workspace: string, ...argv: string[]) {
  const code = await runCli([...argv, "--workspace", workspace], {
    env: {},
    cwd: workspace,
    stdout: () => undefined,
    stderr: () => undefined,
  });
  assert.equal(code, 0, argv.join(" "));
}

async function send(url: string, path: string, body: Body) {
  const response = await fetch(new URL(path, url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Body };
}

test("the server: Xora's state, a typed setup answer by the model, and her chat reply", async (t) => {
  const root = temp(t);
  const workspace = join(root, "ws");
  mkdirSync(workspace);
  await cli(workspace, "workspace", "init", "--reviewer", "Ocomic", "--name", "Nova");
  const runtime = await fakeRuntime(t, [
    { content: "", tool_calls: [call("place_answer", { choice: "look" })] },
    { content: "Gern, ich erkläre dir die Brücke." },
    { content: "Die Crew kommt später an Bord." },
  ]);
  const server = await startAppServer({
    port: 0,
    workspaceDirectory: workspace,
    actor: "Ocomic",
    xora: source(runtime.url),
  });
  t.after(() => server.close());
  const state = (await fetch(`${server.url}/api/xora`).then((response) => response.json())) as Body;
  assert.deepEqual(state, {
    state: "ready",
    provider: "local",
    modelLabel: "Gemma 4 E2B",
    // A fixed workspace has no settings file: the model cannot be changed there.
    canChange: false,
    picker: false,
    cloudAvailable: false,
  });

  const typed = await send(server.url, "/api/assistant/message", {
    prompt: "project",
    text: "erstmal gucken was es gibt",
    language: "de",
  });
  assert.equal(typed.body.choice, "look");
  assert.equal(typed.body.by, "model");

  const first = await send(server.url, "/api/chats/direct:xora/messages", {
    text: "Was ist die Brücke?",
    language: "de",
  });
  assert.equal((first.body.reply as Body).body, "Gern, ich erkläre dir die Brücke.");
  const root2 = (first.body.message as Body).id;
  const second = await send(server.url, "/api/chats/direct:xora/messages", {
    text: "Und die Crew?",
    threadRoot: `message:${root2}`,
    language: "de",
  });
  assert.equal((second.body.reply as Body).body, "Die Crew kommt später an Bord.");
  const last = runtime.requests.at(-1) as {
    messages: { role: string; content: string }[];
    tools?: unknown;
  };
  assert.deepEqual(
    last.messages.slice(1).map((message) => [message.role, message.content]),
    [
      ["user", "Was ist die Brücke?"],
      ["assistant", "Gern, ich erkläre dir die Brücke."],
      ["user", "Und die Crew?"],
    ],
    "the model sees the thread so far",
  );
  assert.equal(last.tools, undefined, "on the bridge Xora answers with text only");
  assert.match(last.messages[0]?.content ?? "", /Ocomic ist der Kapitän des Schiffs „Nova“/);
  const stored = readFileSync(join(workspace, "workspace.sqlite")).toString("latin1");
  assert.equal(stored.includes("Erfinde nichts"), false, "the prompt is never stored");
});
