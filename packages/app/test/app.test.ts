import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runCli } from "@loxora/cli";
import { ActorRejected, startAppServer } from "../src/index.js";
import { LABELS, relativeTime, statusLabel, systemLanguage } from "../src/web/labels.js";

async function cli(workspace: string, ...argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runCli([...argv, "--workspace", workspace, "--json"], {
    env: {},
    cwd: workspace,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  assert.equal(code, 0, `${argv.join(" ")}: ${stderr}`);
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function workspaceWithMissions(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "loxora-app-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, "ws");
  const agent = ["--actor", "agent:codex"];
  await cli(workspace, "workspace", "init", "--reviewer", "Ocomic", "--name", "lab");
  await cli(workspace, "project", "add", "--name", "Game", ...agent);
  const running = await cli(
    workspace,
    "mission",
    "create",
    "--project",
    "Game",
    "--title",
    "Export LODs",
    "--goal",
    "LOD0-LOD2",
    "--role",
    "Asset Worker",
    ...agent,
  );
  await cli(
    workspace,
    "mission",
    "start",
    "--mission",
    String(running.id),
    "--activity",
    "LOD1",
    ...agent,
  );
  const input = await cli(
    workspace,
    "mission",
    "create",
    "--project",
    "Game",
    "--title",
    "Pick texture size",
    "--goal",
    "Decide LOD2 textures",
    ...agent,
  );
  await cli(workspace, "mission", "start", "--mission", String(input.id), ...agent);
  await cli(
    workspace,
    "mission",
    "wait",
    "--mission",
    String(input.id),
    "--reason",
    "needs_input",
    "--question",
    "512 or 1024?",
    "--why",
    "Both fit",
    "--option",
    "512",
    "--consequence",
    "smaller",
    ...agent,
  );
  const limited = await cli(
    workspace,
    "mission",
    "create",
    "--project",
    "Game",
    "--title",
    "Refactor loader",
    "--goal",
    "Cleaner loader",
    ...agent,
  );
  await cli(workspace, "mission", "start", "--mission", String(limited.id), ...agent);
  await cli(
    workspace,
    "mission",
    "wait",
    "--mission",
    String(limited.id),
    "--reason",
    "provider_limit",
    "--detail",
    "Usage limit",
    "--expected-resume",
    "2026-10-04T08:00:00Z",
    ...agent,
  );
  return {
    root,
    workspace,
    running: String(running.id),
    input: String(input.id),
    limited: String(limited.id),
  };
}

async function serve(
  t: test.TestContext,
  workspaceDirectory: string,
  webRoot?: string,
  actor?: string,
) {
  const server = await startAppServer({
    workspaceDirectory,
    port: 0,
    ...(webRoot ? { webRoot } : {}),
    ...(actor !== undefined ? { actor } : {}),
  });
  t.after(() => server.close());
  return server;
}

async function get(url: string) {
  const response = await fetch(url);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("the read API lists missions by attention, with counts per filter", async (t) => {
  const { workspace, input, limited, running } = await workspaceWithMissions(t);
  const server = await serve(t, workspace);
  const info = await get(`${server.url}/api/workspace`);
  assert.deepEqual(info.body, { name: "lab", reviewers: ["Ocomic"], actor: null, readOnly: true });
  const list = await get(`${server.url}/api/missions`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.counts, {
    all: 3,
    running: 1,
    limit: 1,
    input: 1,
    completed: 0,
    failed: 0,
  });
  const missions = list.body.missions as {
    id: string;
    needsHuman: boolean;
    question: string | null;
  }[];
  assert.deepEqual(
    missions.map((mission) => mission.id),
    [input, limited, running],
  );
  assert.equal(missions[0]?.question, "512 or 1024?");
  const filtered = await get(`${server.url}/api/missions?filter=input`);
  assert.deepEqual(
    (filtered.body.missions as { id: string }[]).map((mission) => mission.id),
    [input],
  );
  assert.equal((await get(`${server.url}/api/missions?filter=bogus`)).status, 400);
  const projects = await get(`${server.url}/api/projects`);
  assert.deepEqual(
    (projects.body as unknown as { name: string }[]).map((p) => p.name),
    ["Game"],
  );
});

test("mission detail and events come from Core; writes are refused", async (t) => {
  const { workspace, input, limited } = await workspaceWithMissions(t);
  const server = await serve(t, workspace);
  const detail = await get(`${server.url}/api/missions/${input}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.state, "waiting");
  assert.equal(detail.body.waitReason, "needs_input");
  assert.deepEqual((detail.body.attentionRequest as { options: unknown[] }).options, [
    { option: "512", consequence: "smaller" },
  ]);
  assert.deepEqual(detail.body.availableActions, []);
  assert.equal((detail.body.project as { name: string }).name, "Game");
  const limit = await get(`${server.url}/api/missions/${limited}`);
  assert.equal(limit.body.expectedResumeAt, "2026-10-04T08:00:00Z");
  const events = await fetch(`${server.url}/api/missions/${input}/events`);
  assert.deepEqual(
    ((await events.json()) as { type: string }[]).map((event) => event.type),
    ["Created", "Started", "Waiting"],
  );
  assert.equal((await get(`${server.url}/api/missions/unknown`)).status, 404);
  const write = await fetch(`${server.url}/api/missions/${input}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(write.status, 405);
});

/** Sends a write request with full control over Origin, Host, and content type. */
function send(
  baseUrl: string,
  path: string,
  body: unknown,
  options: { origin?: string | null; host?: string; contentType?: string; raw?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(path, baseUrl);
  const payload = options.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": options.contentType ?? "application/json",
    "content-length": String(Buffer.byteLength(payload)),
    host: options.host ?? url.host,
  };
  const origin = options.origin === undefined ? baseUrl : options.origin;
  if (origin !== null) headers.origin = origin;
  return new Promise((done, fail) => {
    const request = httpRequest(url, { method: "POST", headers }, (response) => {
      let text = "";
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () =>
        done({ status: response.statusCode ?? 0, body: JSON.parse(text || "{}") }),
      );
    });
    request.on("error", (error) => {
      // The server may close the socket after rejecting an oversized body.
      if ((error as NodeJS.ErrnoException).code === "ECONNRESET") done({ status: 0, body: {} });
      else fail(error);
    });
    request.end(payload);
  });
}

async function detailOf(baseUrl: string, id: string) {
  return (await get(`${baseUrl}/api/missions/${id}`)).body as {
    state: string;
    sequence: number;
    availableActions: string[];
    attentionRequest: { answeredAt: string | null; response: string | null } | null;
  };
}

test("write mode needs a human workspace actor", async (t) => {
  const { workspace } = await workspaceWithMissions(t);
  await assert.rejects(
    startAppServer({ workspaceDirectory: workspace, port: 0, actor: "agent:codex" }),
    ActorRejected,
  );
  await assert.rejects(
    startAppServer({ workspaceDirectory: workspace, port: 0, actor: "Someone" }),
    ActorRejected,
  );
  await assert.rejects(
    startAppServer({ workspaceDirectory: join(workspace, "missing"), port: 0, actor: "Ocomic" }),
    ActorRejected,
  );
  const server = await serve(t, workspace, undefined, "Ocomic");
  const info = await get(`${server.url}/api/workspace`);
  assert.deepEqual(info.body, {
    name: "lab",
    reviewers: ["Ocomic"],
    actor: "Ocomic",
    readOnly: false,
  });
});

test("answer, pause, resume, and cancel run through Core with the configured actor", async (t) => {
  const { workspace, input, limited, running } = await workspaceWithMissions(t);
  const server = await serve(t, workspace, undefined, "Ocomic");
  const post = (id: string, action: string, body: Record<string, unknown>) =>
    send(server.url, `/api/missions/${id}/${action}`, body);

  assert.deepEqual((await detailOf(server.url, input)).availableActions, [
    "answer",
    "pause",
    "cancel",
  ]);
  assert.deepEqual((await detailOf(server.url, running)).availableActions, ["pause", "cancel"]);
  assert.deepEqual((await detailOf(server.url, limited)).availableActions, [
    "pause",
    "cancel",
    "resume",
  ]);

  const before = await detailOf(server.url, input);
  const stale = await post(input, "answer", { sequence: before.sequence - 1, response: "512" });
  assert.equal(stale.status, 409);
  assert.equal((await post(input, "answer", { response: "512" })).status, 400);
  assert.equal((await detailOf(server.url, input)).sequence, before.sequence);

  const answered = await post(input, "answer", { sequence: before.sequence, response: "512" });
  assert.equal(answered.status, 200);
  assert.equal((answered.body.attentionRequest as { response: string }).response, "512");
  assert.deepEqual(answered.body.availableActions, ["pause", "cancel", "resume"]);
  const events = await fetch(`${server.url}/api/missions/${input}/events`);
  assert.equal(
    ((await events.json()) as { type: string; actorId: string }[]).at(-1)?.actorId,
    "Ocomic",
  );

  const resumed = await post(input, "resume", { sequence: answered.body.sequence });
  assert.equal(resumed.body.state, "running");
  const paused = await post(input, "pause", { sequence: resumed.body.sequence });
  assert.equal(paused.body.state, "paused");
  assert.deepEqual(paused.body.availableActions, ["cancel", "resume"]);
  assert.equal(
    (await post(input, "answer", { sequence: paused.body.sequence, response: "x" })).status,
    403,
  );
  assert.equal((await post(input, "cancel", { sequence: paused.body.sequence })).status, 400);
  const cancelled = await post(input, "cancel", {
    sequence: paused.body.sequence,
    reason: "Not needed",
  });
  assert.equal(cancelled.body.state, "cancelled");
  assert.deepEqual(cancelled.body.availableActions, []);
  assert.equal((await post(input, "pause", { sequence: cancelled.body.sequence })).status, 403);

  const limit = await detailOf(server.url, limited);
  assert.equal((await post(limited, "resume", { sequence: limit.sequence })).body.state, "running");
});

test("needs_approval answers require approve or reject", async (t) => {
  const { workspace } = await workspaceWithMissions(t);
  const agent = ["--actor", "agent:codex"];
  const mission = await cli(
    workspace,
    "mission",
    "create",
    "--project",
    "Game",
    "--title",
    "Ship it",
    "--goal",
    "Release",
    ...agent,
  );
  const id = String(mission.id);
  await cli(workspace, "mission", "start", "--mission", id, ...agent);
  await cli(
    workspace,
    "mission",
    "wait",
    "--mission",
    id,
    "--reason",
    "needs_approval",
    "--question",
    "Release now?",
    "--why",
    "Tests pass",
    ...agent,
  );
  const server = await serve(t, workspace, undefined, "Ocomic");
  const { sequence } = await detailOf(server.url, id);
  const path = `/api/missions/${id}/answer`;
  assert.equal((await send(server.url, path, { sequence, response: "ok" })).status, 400);
  assert.equal(
    (await send(server.url, path, { sequence, response: "ok", decision: "maybe" })).status,
    400,
  );
  const approved = await send(server.url, path, { sequence, response: "ok", decision: "approve" });
  assert.equal(approved.status, 200);
  assert.equal((approved.body.attentionRequest as { decision: string }).decision, "approve");
});

test("writes are rejected before workspace access without the app's origin, host, or JSON", async (t) => {
  const { workspace, input } = await workspaceWithMissions(t);
  const server = await serve(t, workspace, undefined, "Ocomic");
  const readOnly = await serve(t, workspace);
  const { sequence } = await detailOf(server.url, input);
  const body = { sequence, response: "512" };
  const path = `/api/missions/${input}/answer`;
  assert.equal((await send(server.url, path, body, { origin: "https://example.com" })).status, 403);
  assert.equal((await send(server.url, path, body, { origin: null })).status, 403);
  assert.equal(
    (await send(server.url, path, body, { host: `evil.example:${new URL(server.url).port}` }))
      .status,
    403,
  );
  assert.equal((await send(server.url, path, body, { contentType: "text/plain" })).status, 415);
  const large = await send(server.url, path, null, {
    raw: JSON.stringify({ ...body, response: "x".repeat(20_000) }),
  });
  assert.ok(large.status === 413 || large.status === 0, `status ${large.status}`);
  assert.equal((await send(server.url, path, null, { raw: "{" })).status, 400);
  const readOnlyAnswer = await send(readOnly.url, path, body);
  assert.equal(readOnlyAnswer.status, 403);
  assert.equal(readOnlyAnswer.body.error, "ReadOnly");
  assert.equal((await detailOf(server.url, input)).attentionRequest?.answeredAt, null);
});

test("write mode never migrates either", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "loxora-app-write-old-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const outdated = join(root, "outdated");
  mkdirSync(outdated);
  writeFileSync(
    join(outdated, "workspace.json"),
    JSON.stringify({ configVersion: 1, name: "old", reviewers: ["Ocomic"] }),
  );
  new DatabaseSync(join(outdated, "workspace.sqlite")).close();
  const server = await serve(t, outdated, undefined, "Ocomic");
  const response = await send(server.url, "/api/missions/abc/answer", {
    sequence: 1,
    response: "x",
  });
  assert.equal(response.status, 503);
  const database = new DatabaseSync(join(outdated, "workspace.sqlite"));
  try {
    assert.equal(
      (database.prepare("SELECT COUNT(*) count FROM sqlite_master").get() as { count: number })
        .count,
      0,
    );
  } finally {
    database.close();
  }
});

test("the UI never migrates: a missing or outdated workspace answers 503", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "loxora-app-old-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const missing = await serve(t, join(root, "missing"));
  const absent = await get(`${missing.url}/api/missions`);
  assert.equal(absent.status, 503);
  assert.match(String(absent.body.message), /No workspace found/);
  const outdated = join(root, "outdated");
  mkdirSync(outdated);
  writeFileSync(
    join(outdated, "workspace.json"),
    JSON.stringify({ configVersion: 1, name: "old", reviewers: ["Ocomic"] }),
  );
  new DatabaseSync(join(outdated, "workspace.sqlite")).close();
  const server = await serve(t, outdated);
  const response = await get(`${server.url}/api/missions`);
  assert.equal(response.status, 503);
  assert.match(String(response.body.message), /never migrates/);
  const database = new DatabaseSync(join(outdated, "workspace.sqlite"));
  try {
    assert.equal(
      (database.prepare("SELECT COUNT(*) count FROM sqlite_master").get() as { count: number })
        .count,
      0,
    );
  } finally {
    database.close();
  }
});

test("the web client is served with a single-page fallback and no path traversal", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "loxora-app-web-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const web = join(root, "web");
  mkdirSync(web);
  writeFileSync(join(web, "index.html"), "<!doctype html><title>Loxora Mission Control</title>");
  writeFileSync(join(root, "secret.txt"), "secret");
  const server = await serve(t, join(root, "ws"), web);
  const page = await fetch(`${server.url}/missions/abc`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Loxora Mission Control/);
  const traversal = await fetch(`${server.url}/..%2Fsecret.txt`);
  assert.doesNotMatch(await traversal.text(), /secret/);
});

test("labels have German and English entries for the same keys", () => {
  const keys = (value: object, prefix = ""): string[] =>
    Object.entries(value).flatMap(([key, entry]) =>
      entry !== null && typeof entry === "object"
        ? keys(entry, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );
  assert.deepEqual(keys(LABELS.en).sort(), keys(LABELS.de).sort());
  assert.equal(statusLabel(LABELS.de, "waiting", "needs_input"), "Benötigt Input");
  assert.equal(statusLabel(LABELS.en, "waiting", "needs_input"), "Needs input");
  const now = Date.parse("2026-10-04T12:00:00Z");
  assert.equal(relativeTime(LABELS.de, "2026-10-04T11:55:00Z", now), "vor 5 Min.");
  assert.equal(relativeTime(LABELS.en, "2026-10-01T12:00:00Z", now), "3 days ago");
});

test("the default language follows the system language", () => {
  assert.equal(systemLanguage(["de-DE", "en-US"]), "de");
  assert.equal(systemLanguage(["de-AT"]), "de");
  assert.equal(systemLanguage(["en-US", "de-DE"]), "en");
  assert.equal(systemLanguage(["fr-FR"]), "en");
  assert.equal(systemLanguage([]), "en");
});

test("browser source cannot import server, Core, SQLite, CLI, or Node APIs", () => {
  const rootDirectory = resolve(process.cwd(), "packages", "app", "src", "web");
  for (const file of walk(rootDirectory).filter((path) => /\.tsx?$/.test(path))) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /from\s+["'][^"']*(?:@loxora\/(?:core|sqlite|mcp|cli)|node:|\/server\/)/,
      file,
    );
  }
});

function walk(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)],
  );
}
