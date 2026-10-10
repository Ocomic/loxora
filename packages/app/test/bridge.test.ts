import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runCli } from "@loxora/cli";
import { startAppServer } from "../src/index.js";
import { XORA_REPLIES } from "../src/shared/conversation.js";

/** The bridge chat routes of Milestone 15 (delivery 2), against a real workspace. */

type Body = Record<string, unknown>;
type Entry = Record<string, unknown> & { type: string; id: string };

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
  return JSON.parse(stdout) as Body;
}

async function ship(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "loxora-bridge-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, "ws");
  const agent = ["--actor", "agent:codex"];
  await cli(workspace, "workspace", "init", "--reviewer", "Ocomic", "--name", "lab");
  const project = await cli(workspace, "project", "add", "--name", "Game", ...agent);
  const create = (title: string) =>
    cli(
      workspace,
      "mission",
      "create",
      "--project",
      "Game",
      "--title",
      title,
      "--goal",
      "g",
      ...agent,
    );
  const running = await create("Export LODs");
  await cli(workspace, "mission", "start", "--mission", String(running.id), ...agent);
  const input = await create("Pick texture size");
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
    ...agent,
  );
  const limited = await create("Refactor loader");
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
    ...agent,
  );
  return {
    workspace,
    projectId: String(project.id),
    running: String(running.id),
    input: String(input.id),
    limited: String(limited.id),
  };
}

async function serve(t: test.TestContext, workspaceDirectory: string, actor?: string) {
  const server = await startAppServer({
    workspaceDirectory,
    port: 0,
    ...(actor !== undefined ? { actor } : {}),
  });
  t.after(() => server.close());
  return server;
}

async function get(base: string, path: string) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: (await response.json()) as Body };
}

function send(
  base: string,
  path: string,
  body: unknown,
  origin: string = base,
): Promise<{ status: number; body: Body }> {
  const url = new URL(path, base);
  const payload = JSON.stringify(body);
  return new Promise((done, fail) => {
    const request = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(payload)),
          origin,
        },
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () =>
          done({ status: response.statusCode ?? 0, body: JSON.parse(text) }),
        );
      },
    );
    request.on("error", fail);
    request.end(payload);
  });
}

const enc = encodeURIComponent;
const entries = (body: Body) => body.entries as Entry[];

test("the side list counts what needs the captain; the ship channel is derived from events", async (t) => {
  const { workspace, projectId, input } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const list = await get(server.url, "/api/chats");
  assert.equal(list.status, 200);
  assert.equal(list.body.available, true);
  assert.equal(list.body.writable, true);
  assert.deepEqual(list.body.decisions, { address: "decisions", count: 1 });
  assert.deepEqual(
    (list.body.channels as Body[]).map((chat) => [chat.address, chat.kind, chat.name]),
    [
      ["ship", "ship", null],
      [`project:${projectId}`, "project", "Game"],
    ],
  );
  assert.deepEqual(
    (list.body.direct as Body[]).map((chat) => chat.address),
    ["direct:xora"],
  );

  const shipChannel = await get(server.url, "/api/chats/ship");
  const kinds = entries(shipChannel.body).map((entry) => entry.event);
  assert.equal(kinds[0], "projectCreated");
  assert.equal(kinds.filter((kind) => kind === "missionCreated").length, 3);
  assert.equal(kinds.filter((kind) => kind === "missionStarted").length, 3);
  // A provider limit is not a wait for the captain; it stays out of the ship channel.
  assert.equal(kinds.filter((kind) => kind === "missionWaiting").length, 1);
  for (const entry of entries(shipChannel.body)) {
    assert.equal((entry.author as Body).role, "shipComputer");
    assert.equal(entry.address, `project:${projectId}`);
  }
  const waiting = entries(shipChannel.body).find((entry) => entry.event === "missionWaiting");
  assert.equal(waiting?.thread, `mission:${input}`);

  const decisions = await get(server.url, "/api/chats/decisions");
  assert.equal(decisions.body.chat && (decisions.body.chat as Body).writable, false);
  const [request] = entries(decisions.body);
  assert.equal(request?.type, "attention");
  assert.equal(request?.address, `project:${projectId}`);
  assert.equal(request?.thread, `mission:${input}`);
  assert.equal((request?.mission as Body).question, "512 or 1024?");
});

test("every Mission is a card in its project channel and opens its thread", async (t) => {
  const { workspace, projectId, input } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const address = enc(`project:${projectId}`);
  const channel = await get(server.url, `/api/chats/${address}`);
  assert.equal(channel.status, 200);
  const cards = entries(channel.body).filter((entry) => entry.type === "mission");
  assert.equal(cards.length, 3);
  assert.deepEqual((channel.body.details as Body).missions, 3);

  const thread = await get(server.url, `/api/chats/${address}?thread=${enc(`mission:${input}`)}`);
  const view = thread.body.thread as Body;
  const mission = (view.root as Body).mission as Body;
  assert.equal(mission.title, "Pick texture size");
  assert.deepEqual(mission.availableActions, ["answer", "pause", "cancel"]);
  assert.deepEqual(
    (view.entries as Entry[]).map((entry) => (entry.event as Body).type),
    ["Created", "Started", "Waiting"],
  );

  // Answering in the thread is the Milestone 12 write; the card leaves the decisions channel.
  const answered = await send(server.url, `/api/missions/${input}/answer`, {
    sequence: mission.sequence,
    response: "512",
  });
  assert.equal(answered.status, 200);
  assert.equal(((await get(server.url, "/api/chats")).body.decisions as Body).count, 0);

  // A Mission of this project has no thread in another chat.
  assert.equal(
    (await get(server.url, `/api/chats/ship?thread=${enc(`mission:${input}`)}`)).status,
    400,
  );
});

test("a channel message gets Xora's reply only with @Xora, in the same place", async (t) => {
  const { workspace, projectId, input } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const address = enc(`project:${projectId}`);
  const quiet = await send(server.url, `/api/chats/${address}/messages`, { text: "Status?" });
  assert.equal(quiet.status, 200);
  assert.equal(quiet.body.reply, undefined);
  assert.equal((quiet.body.message as Body).body, "Status?");
  assert.equal(((quiet.body.message as Body).author as Body).role, "captain");

  const asked = await send(server.url, `/api/chats/${address}/messages`, {
    text: "@xora wie geht es?",
    language: "de",
  });
  const reply = asked.body.reply as Body;
  assert.equal(reply.body, XORA_REPLIES.de.notOnBoard);
  assert.equal(reply.thread, null);
  assert.deepEqual(
    ((asked.body.message as Body).mentions as Body[]).map((author) => author.id),
    ["agent:xora"],
  );

  // In a Mission thread the reply stays in the thread.
  const threaded = await send(server.url, `/api/chats/${address}/messages`, {
    text: "@Xora was meinst du?",
    threadRoot: `mission:${input}`,
    language: "en",
  });
  assert.equal((threaded.body.reply as Body).thread, `mission:${input}`);
  assert.equal((threaded.body.reply as Body).body, XORA_REPLIES.en.notOnBoard);
  const channel = await get(server.url, `/api/chats/${address}`);
  const card = entries(channel.body).find((entry) => entry.id === input);
  assert.equal(card?.replies, 2);
  const top = entries(channel.body).filter((entry) => entry.type === "message");
  assert.deepEqual(
    top.map((entry) => entry.body),
    ["Status?", "@xora wie geht es?", XORA_REPLIES.de.notOnBoard],
  );

  // An email address is not a mention.
  const mail = await send(server.url, `/api/chats/${address}/messages`, {
    text: "me@xora.example",
  });
  assert.equal(mail.body.reply, undefined);
  // Topic threads stay out of project channels (ADR-007 open question 3).
  const refused = await send(server.url, `/api/chats/${address}/messages`, {
    text: "a thread",
    threadRoot: `message:${(quiet.body.message as Body).id}`,
  });
  assert.equal(refused.status, 400);
});

test("in Xora's direct chat a message starts a topic thread and she answers inside it", async (t) => {
  const { workspace } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const first = await send(server.url, "/api/chats/direct:xora/messages", {
    text: "Hallo",
    language: "de",
  });
  const root = (first.body.message as Body).id;
  assert.equal(first.body.thread, `message:${root}`);
  assert.equal((first.body.reply as Body).thread, `message:${root}`);
  const again = await send(server.url, "/api/chats/direct:xora/messages", {
    text: "Wie bekomme ich Missionen?",
    threadRoot: `message:${root}`,
    topic: "missions",
    language: "de",
  });
  assert.equal((again.body.reply as Body).body, XORA_REPLIES.de.missions);
  const second = await send(server.url, "/api/chats/direct:xora/messages", { text: "Neues Thema" });

  const chat = await get(server.url, "/api/chats/direct:xora");
  // Topic threads, newest first.
  assert.deepEqual(
    entries(chat.body).map((entry) => [entry.id, entry.replies]),
    [
      [(second.body.message as Body).id, 1],
      [root, 3],
    ],
  );
  const thread = await get(server.url, `/api/chats/direct:xora?thread=${enc(`message:${root}`)}`);
  assert.deepEqual(
    ((thread.body.thread as Body).entries as Entry[]).map((entry) => (entry.author as Body).role),
    ["xora", "captain", "xora"],
  );
});

test("message links are stored as references and show a preview", async (t) => {
  const { workspace } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const posted = await send(server.url, "/api/chats/ship/messages", { text: "Kurs halten" });
  const id = String((posted.body.message as Body).id);
  const linking = await send(server.url, "/api/chats/direct:xora/messages", {
    text: `Siehe ${server.url}/bridge/m/${id} und nochmal ${server.url}/bridge/m/${id}`,
  });
  const [link] = (linking.body.message as Body).links as Body[];
  assert.equal(link?.address, "ship");
  assert.equal(link?.excerpt, "Kurs halten");
  assert.equal(((linking.body.message as Body).links as Body[]).length, 1);

  const preview = await get(server.url, `/api/chats/messages/${id}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.address, "ship");
  assert.equal(preview.body.thread, null);
  const reply = String((linking.body.reply as Body).id);
  const replyPreview = await get(server.url, `/api/chats/messages/${reply}`);
  assert.equal(replyPreview.body.thread, `message:${(linking.body.message as Body).id}`);

  const unknown = await send(server.url, "/api/chats/ship/messages", {
    text: `${server.url}/bridge/m/does-not-exist`,
  });
  assert.equal(unknown.status, 400);
  assert.equal((await get(server.url, "/api/chats/messages/nope")).status, 404);
});

test("task channels are created, renamed, and archived by the captain", async (t) => {
  const { workspace, projectId } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const created = await send(server.url, "/api/chats", { name: "Leveldesign", projectId });
  assert.equal(created.status, 200);
  const address = enc(String(created.body.address));
  const renamed = await send(server.url, `/api/chats/${address}/rename`, { name: "Level" });
  assert.equal(renamed.body.name, "Level");
  const topic = await send(server.url, `/api/chats/${address}/messages`, { text: "Welt 1" });
  const thread = await send(server.url, `/api/chats/${address}/messages`, {
    text: "Antwort",
    threadRoot: `message:${(topic.body.message as Body).id}`,
  });
  assert.equal(thread.status, 200);
  // A link to a topic root opens its thread.
  const rootPreview = await get(
    server.url,
    `/api/chats/messages/${(topic.body.message as Body).id}`,
  );
  assert.equal(rootPreview.body.thread, `message:${(topic.body.message as Body).id}`);
  const list = await get(server.url, "/api/chats");
  assert.ok((list.body.channels as Body[]).some((chat) => chat.name === "Level"));

  assert.equal((await send(server.url, `/api/chats/${address}/archive`, {})).status, 200);
  const after = await get(server.url, "/api/chats");
  assert.ok(!(after.body.channels as Body[]).some((chat) => chat.name === "Level"));
  const archived = await get(server.url, `/api/chats/${address}`);
  assert.equal((archived.body.chat as Body).archived, true);
  assert.equal((archived.body.chat as Body).writable, false);
  assert.equal(entries(archived.body).length, 1);
  const closed = await send(server.url, `/api/chats/${address}/messages`, { text: "noch was" });
  assert.equal(closed.status, 400);
  assert.equal((await send(server.url, "/api/chats/ship/rename", { name: "x" })).status, 404);
  assert.equal((await send(server.url, "/api/chats", { name: " " })).status, 400);
});

test("deleting keeps a marker; clearing the direct chat; only the captain deletes", async (t) => {
  const { workspace } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const posted = await send(server.url, "/api/chats/ship/messages", { text: "Ups" });
  const id = String((posted.body.message as Body).id);
  const deleted = await send(server.url, `/api/chats/messages/${id}/delete`, {});
  assert.deepEqual(deleted.body.deleted, [id]);
  const shipChannel = await get(server.url, "/api/chats/ship");
  const marker = entries(shipChannel.body).find((entry) => entry.id === id);
  assert.equal(marker?.body, null);
  assert.equal((marker?.deleted as Body).by, "Ocomic");
  assert.equal((await send(server.url, `/api/chats/messages/${id}/delete`, {})).status, 400);

  const topic = await send(server.url, "/api/chats/direct:xora/messages", { text: "Thema" });
  const root = String((topic.body.message as Body).id);
  const thread = await send(server.url, `/api/chats/messages/${root}/delete`, { thread: true });
  assert.equal((thread.body.deleted as string[]).length, 2);
  await send(server.url, "/api/chats/direct:xora/messages", { text: "Noch eins" });
  const cleared = await send(server.url, "/api/chats/direct:xora/clear", {});
  assert.equal((cleared.body.deleted as string[]).length, 2);
  assert.equal((await send(server.url, "/api/chats/ship/clear", {})).status, 400);

  const readOnly = await serve(t, workspace);
  const refused = await send(readOnly.url, "/api/chats/ship/messages", { text: "Hallo" });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, "ReadOnly");
  assert.equal((await get(readOnly.url, "/api/chats")).body.writable, false);
});

test("chat writes need the app's origin; the decisions channel takes no messages", async (t) => {
  const { workspace } = await ship(t);
  const server = await serve(t, workspace, "Ocomic");
  const foreign = await send(
    server.url,
    "/api/chats/ship/messages",
    { text: "x" },
    "http://evil.example",
  );
  assert.equal(foreign.status, 403);
  assert.equal(
    (await send(server.url, "/api/chats/decisions/messages", { text: "x" })).status,
    400,
  );
  assert.equal((await send(server.url, "/api/chats/nowhere/messages", { text: "x" })).status, 404);
  assert.equal((await send(server.url, "/api/chats/ship/messages", { text: "" })).status, 400);
  assert.equal(
    (await send(server.url, "/api/chats/ship/messages", { text: "x".repeat(4001) })).status,
    400,
  );
  assert.equal(
    (await fetch(`${server.url}/api/chats/ship/messages`, { method: "PUT" })).status,
    405,
  );
});

test("without 008_chat the bridge is read-only and the workspace is not migrated", async (t) => {
  const { workspace, projectId } = await ship(t);
  const database = new DatabaseSync(join(workspace, "workspace.sqlite"));
  database.exec(`DROP TABLE chat_message_references; DROP TABLE chat_messages;
    DROP TABLE chats; DELETE FROM schema_migrations WHERE id = '008_chat';`);
  database.close();
  const server = await serve(t, workspace, "Ocomic");
  const list = await get(server.url, "/api/chats");
  assert.equal(list.status, 200);
  assert.equal(list.body.available, false);
  assert.equal(list.body.writable, false);
  assert.equal((list.body.decisions as Body).count, 1);
  const shipChannel = await get(server.url, "/api/chats/ship");
  assert.ok(entries(shipChannel.body).length > 0);
  assert.equal((shipChannel.body.chat as Body).writable, false);
  const channel = await get(server.url, `/api/chats/${enc(`project:${projectId}`)}`);
  assert.equal(entries(channel.body).length, 3);
  assert.equal((await get(server.url, "/api/chats/direct:xora")).status, 200);
  const refused = await send(server.url, "/api/chats/ship/messages", { text: "Hallo" });
  assert.equal(refused.status, 503);
  assert.match(String(refused.body.message), /008_chat/);
  const check = new DatabaseSync(join(workspace, "workspace.sqlite"));
  try {
    assert.equal(
      check.prepare("SELECT COUNT(*) count FROM schema_migrations WHERE id = '008_chat'").get()
        ?.count,
      0,
    );
  } finally {
    check.close();
  }
});
