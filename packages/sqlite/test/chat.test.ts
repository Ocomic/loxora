import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ChatService,
  LifecycleService,
  MissionService,
  NotFoundError,
  SHIP_CHAT_ID,
  ValidationError,
  XORA_ACTOR_ID,
  XORA_CHAT_ID,
  parseWorkspaceExport,
  serializeWorkspaceExport,
  type ChatId,
  type ChatMessageId,
} from "@loxora/core";
import { openSqliteStore } from "../src/index.js";

async function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "loxora-chat-"));
  const path = join(directory, "chat.sqlite");
  const store = await openSqliteStore(path);
  t.after(async () => {
    await store.close().catch(() => undefined);
    rmSync(directory, { recursive: true, force: true });
  });
  let tick = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 9, 10, 12, 0, 0, ++tick)).toISOString() };
  const lifecycle = new LifecycleService(store);
  const missions = new MissionService(store, undefined, clock);
  const chat = new ChatService(store, { isCaptain: (id) => id === "alex" }, undefined, clock);
  const project = await lifecycle.createProject({ name: "Game", actorId: "alex" });
  const other = await lifecycle.createProject({ name: "Site", actorId: "alex" });
  const mission = await missions.createMission({
    ownerProjectId: project.id,
    title: "Record the project goal",
    goal: "Write down who the game is for",
    actorId: XORA_ACTOR_ID,
  });
  return { store, path, directory, chat, project, other, mission };
}

const projectChat = (id: string) => `project:${id}` as ChatId;

test("ship, project, and Xora chats exist without a row; a row comes with the first message", async (t) => {
  const { chat, project, store } = await fixture(t);
  assert.equal((await chat.getChat({ chatId: SHIP_CHAT_ID })).kind, "ship");
  assert.equal((await chat.getChat({ chatId: XORA_CHAT_ID })).agentId, "xora");
  const channel = await chat.getChat({ chatId: projectChat(project.id) });
  assert.equal(channel.projectId, project.id);
  assert.equal(channel.createdAt, null);
  await assert.rejects(() => chat.getChat({ chatId: "project:missing" }), NotFoundError);
  await assert.rejects(() => chat.getChat({ chatId: "direct:other" }), NotFoundError);
  await assert.rejects(() => chat.getChat({ chatId: "decisions" }), NotFoundError);
  assert.equal((await store.listStoredChats()).length, 0);

  const message = await chat.postMessage({
    chatId: projectChat(project.id),
    actorId: "alex",
    body: "  Hello crew  ",
  });
  assert.equal(message.body, "Hello crew");
  const stored = await store.listStoredChats();
  assert.deepEqual(
    stored.map((entry) => [entry.id, entry.kind, entry.createdBy]),
    [[projectChat(project.id), "project", "alex"]],
  );
  await chat.postMessage({ chatId: projectChat(project.id), actorId: XORA_ACTOR_ID, body: "Hi" });
  assert.equal((await store.listStoredChats()).length, 1);
  assert.equal((await chat.listMessages({ chatId: projectChat(project.id) })).length, 2);
});

test("only the captain and Xora write; other humans and agents are rejected", async (t) => {
  const { chat } = await fixture(t);
  await chat.postMessage({ chatId: SHIP_CHAT_ID, actorId: "alex", body: "Captain here" });
  await chat.postMessage({ chatId: XORA_CHAT_ID, actorId: XORA_ACTOR_ID, body: "Xora here" });
  await assert.rejects(
    () => chat.postMessage({ chatId: SHIP_CHAT_ID, actorId: "bob", body: "Hi" }),
    /not the captain/,
  );
  await assert.rejects(
    () => chat.postMessage({ chatId: SHIP_CHAT_ID, actorId: "agent:codex", body: "Hi" }),
    /multi-agent RFC/,
  );
  await assert.rejects(
    () => chat.postMessage({ chatId: SHIP_CHAT_ID, actorId: "alex", body: "   " }),
    ValidationError,
  );
  await assert.rejects(
    () => chat.postMessage({ chatId: SHIP_CHAT_ID, actorId: "alex", body: "x".repeat(4001) }),
    /at most 4000/,
  );
});

test("Mission threads stay in their project channel; replies to replies join the root", async (t) => {
  const { chat, project, other, mission } = await fixture(t);
  const missionRoot = { kind: "mission" as const, missionId: mission.id };
  const reply = await chat.postMessage({
    chatId: projectChat(project.id),
    actorId: "alex",
    body: "For young players",
    threadRoot: missionRoot,
  });
  assert.deepEqual(reply.threadRoot, missionRoot);
  const nested = await chat.postMessage({
    chatId: projectChat(project.id),
    actorId: XORA_ACTOR_ID,
    body: "Noted",
    threadRoot: { kind: "message", messageId: reply.id },
  });
  assert.deepEqual(nested.threadRoot, missionRoot);
  assert.deepEqual(
    (await chat.listThread({ threadRoot: missionRoot })).map((entry) => entry.body),
    ["For young players", "Noted"],
  );
  assert.equal((await chat.listMessages({ chatId: projectChat(project.id) })).length, 0);
  await assert.rejects(
    () =>
      chat.postMessage({
        chatId: projectChat(other.id),
        actorId: "alex",
        body: "Wrong place",
        threadRoot: missionRoot,
      }),
    /another project/,
  );
  await assert.rejects(
    () =>
      chat.postMessage({
        chatId: SHIP_CHAT_ID,
        actorId: "alex",
        body: "Wrong place",
        threadRoot: missionRoot,
      }),
    /project channel/,
  );
  await assert.rejects(
    () =>
      chat.postMessage({
        chatId: SHIP_CHAT_ID,
        actorId: "alex",
        body: "Wrong chat",
        threadRoot: { kind: "message", messageId: reply.id },
      }),
    NotFoundError,
  );
});

test("topic threads in Xora's direct chat", async (t) => {
  const { chat } = await fixture(t);
  const topic = await chat.postMessage({
    chatId: XORA_CHAT_ID,
    actorId: "alex",
    body: "How do Missions work?",
  });
  const answer = await chat.postMessage({
    chatId: XORA_CHAT_ID,
    actorId: XORA_ACTOR_ID,
    body: "A Mission is a task on board.",
    threadRoot: { kind: "message", messageId: topic.id },
  });
  assert.deepEqual(answer.threadRoot, { kind: "message", messageId: topic.id });
  assert.deepEqual(
    (await chat.listMessages({ chatId: XORA_CHAT_ID })).map((entry) => entry.id),
    [topic.id],
  );
});

test("task channels: captain creates, renames, archives; archived channels are read-only", async (t) => {
  const { chat, project } = await fixture(t);
  const channel = await chat.createChannel({
    name: " Level design ",
    projectId: project.id,
    actorId: "alex",
  });
  assert.equal(channel.name, "Level design");
  assert.match(channel.id, /^topic:/);
  await chat.postMessage({ chatId: channel.id, actorId: "alex", body: "Ideas here" });
  const renamed = await chat.renameChannel({ chatId: channel.id, name: "Levels", actorId: "alex" });
  assert.equal(renamed.name, "Levels");
  await assert.rejects(
    () => chat.createChannel({ name: "Mine", actorId: XORA_ACTOR_ID }),
    /Only the captain/,
  );
  await assert.rejects(() => chat.createChannel({ name: " ", actorId: "alex" }), ValidationError);
  await assert.rejects(
    () => chat.createChannel({ name: "x".repeat(81), actorId: "alex" }),
    /at most 80/,
  );
  await assert.rejects(
    () => chat.renameChannel({ chatId: SHIP_CHAT_ID, name: "Bridge", actorId: "alex" }),
    NotFoundError,
  );
  const archived = await chat.archiveChannel({ chatId: channel.id, actorId: "alex" });
  assert.equal(archived.archivedBy, "alex");
  await assert.rejects(
    () => chat.postMessage({ chatId: channel.id, actorId: "alex", body: "Late" }),
    /archived/,
  );
  await assert.rejects(
    () => chat.renameChannel({ chatId: channel.id, name: "Again", actorId: "alex" }),
    /archived/,
  );
});

test("mentions and links must point at something on board", async (t) => {
  const { chat, project, mission } = await fixture(t);
  const first = await chat.postMessage({ chatId: SHIP_CHAT_ID, actorId: "alex", body: "First" });
  const linked = await chat.postMessage({
    chatId: projectChat(project.id),
    actorId: "alex",
    body: "@Xora see the first message",
    references: [
      { kind: "mention", projectId: null, targetId: XORA_ACTOR_ID },
      { kind: "message", projectId: null, targetId: first.id },
      { kind: "mission", projectId: null, targetId: mission.id },
      { kind: "chat", projectId: null, targetId: SHIP_CHAT_ID },
    ],
  });
  assert.deepEqual(
    (await chat.getMessage({ messageId: linked.id }))?.references.map((entry) => entry.kind),
    ["mention", "message", "mission", "chat"],
  );
  for (const reference of [
    { kind: "mention" as const, projectId: null, targetId: "agent:codex" },
    { kind: "mention" as const, projectId: null, targetId: "bob" },
    { kind: "message" as const, projectId: null, targetId: "missing" },
    { kind: "proposal" as const, projectId: null, targetId: "p" },
    { kind: "proposal" as const, projectId: project.id, targetId: "missing" },
    { kind: "mission" as const, projectId: project.id, targetId: mission.id },
  ]) {
    await assert.rejects(
      () =>
        chat.postMessage({
          chatId: SHIP_CHAT_ID,
          actorId: "alex",
          body: "Bad",
          references: [reference],
        }),
      ValidationError,
      reference.targetId,
    );
  }
  await assert.rejects(
    () =>
      chat.postMessage({
        chatId: SHIP_CHAT_ID,
        actorId: "alex",
        body: "Bad",
        references: [{ kind: "chat", projectId: null, targetId: "topic:missing" }],
      }),
    NotFoundError,
  );
});

test("deleting keeps a marker; only the captain deletes; threads and Xora's chat can be cleared", async (t) => {
  const { chat, path } = await fixture(t);
  const root = await chat.postMessage({ chatId: XORA_CHAT_ID, actorId: "alex", body: "Topic" });
  const reply = await chat.postMessage({
    chatId: XORA_CHAT_ID,
    actorId: XORA_ACTOR_ID,
    body: "Answer",
    threadRoot: { kind: "message", messageId: root.id },
  });
  await assert.rejects(
    () => chat.deleteMessage({ messageId: reply.id, actorId: XORA_ACTOR_ID }),
    /Only the captain/,
  );
  await chat.deleteMessage({ messageId: reply.id, actorId: "alex" });
  const deleted = await chat.getMessage({ messageId: reply.id });
  assert.equal(deleted?.body, null);
  assert.equal(deleted?.deletedBy, "alex");
  await assert.rejects(
    () => chat.deleteMessage({ messageId: reply.id, actorId: "alex" }),
    /already deleted/,
  );
  await assert.rejects(
    () => chat.deleteMessage({ messageId: reply.id, actorId: "alex", thread: true }),
    /starts a thread/,
  );
  await assert.rejects(
    () => chat.deleteMessage({ messageId: "missing" as ChatMessageId, actorId: "alex" }),
    NotFoundError,
  );
  const second = await chat.postMessage({
    chatId: XORA_CHAT_ID,
    actorId: XORA_ACTOR_ID,
    body: "More",
    threadRoot: { kind: "message", messageId: root.id },
  });
  assert.deepEqual(
    await chat.deleteMessage({ messageId: root.id, actorId: "alex", thread: true }),
    [root.id, second.id],
  );
  await chat.postMessage({ chatId: XORA_CHAT_ID, actorId: "alex", body: "Another topic" });
  assert.equal((await chat.clearDirectChat({ chatId: XORA_CHAT_ID, actorId: "alex" })).length, 1);
  await assert.rejects(
    () => chat.clearDirectChat({ chatId: SHIP_CHAT_ID, actorId: "alex" }),
    /direct chat/,
  );

  const database = new DatabaseSync(path);
  t.after(() => database.close());
  assert.throws(
    () => database.prepare("UPDATE chat_messages SET body='edited' WHERE id=?").run(root.id),
    /never edited/,
  );
  assert.throws(
    () => database.prepare("DELETE FROM chat_messages WHERE id=?").run(root.id),
    /never removed/,
  );
});

test("export version 4 round-trips chats; deleted messages leave no text", async (t) => {
  const { store, chat, project, mission, directory } = await fixture(t);
  await chat.createChannel({ name: "Art", actorId: "alex" });
  const secret = await chat.postMessage({ chatId: XORA_CHAT_ID, actorId: "alex", body: "Secret" });
  await chat.postMessage({
    chatId: projectChat(project.id),
    actorId: "alex",
    body: "On it",
    threadRoot: { kind: "mission", missionId: mission.id },
    references: [{ kind: "mention", projectId: null, targetId: XORA_ACTOR_ID }],
  });
  await chat.deleteMessage({ messageId: secret.id, actorId: "alex" });
  const text = serializeWorkspaceExport(await store.readWorkspaceExport());
  assert.match(text, /"formatVersion": 4/);
  assert.match(text, /"chatMessageReferences"/);
  assert.doesNotMatch(text, /Secret/);
  const target = await openSqliteStore(join(directory, "target.sqlite"));
  t.after(() => target.close());
  await target.restoreWorkspaceExport(parseWorkspaceExport(text));
  assert.equal(serializeWorkspaceExport(await target.readWorkspaceExport()), text);
  const restored = new ChatService(target, { isCaptain: (id) => id === "alex" });
  const thread = await restored.listThread({
    threadRoot: { kind: "mission", missionId: mission.id },
  });
  assert.equal(thread[0]?.body, "On it");

  const legacy = JSON.parse(text) as { formatVersion: number; sections: Record<string, unknown> };
  legacy.formatVersion = 3;
  for (const name of ["chats", "chatMessages", "chatMessageReferences"]) {
    delete legacy.sections[name];
  }
  const upgraded = parseWorkspaceExport(JSON.stringify(legacy));
  assert.equal(upgraded.formatVersion, 4);
  assert.deepEqual(upgraded.sections.chatMessages, []);
});
