import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "./errors.js";
import type { MissionId } from "./mission.js";
import { isAgentActorId } from "./mission.js";
import type { Clock, IdGenerator } from "./ports.js";
import type { Brand, ProjectId } from "./types.js";

/**
 * The bridge chat (ADR-007 with Amendment 1). A chat id is its address: `ship`,
 * `project:<projectId>`, `direct:<agent name>`, or `topic:<id>` for a task channel. The
 * ship chat, the project chats, and the direct chat with Xora exist without a stored row;
 * a row is written with a chat's first message. Messages are conversation, never knowledge.
 */
export type ChatId = Brand<string, "ChatId">;
export type ChatMessageId = Brand<string, "ChatMessageId">;
export type ChatKind = "ship" | "project" | "direct" | "topic";

/** Xora, the only assistant that writes until a multi-agent RFC is accepted (ADR-007 section 4). */
export const XORA_ACTOR_ID = "agent:xora";
export const SHIP_CHAT_ID = "ship" as ChatId;
export const XORA_CHAT_ID = "direct:xora" as ChatId;
export const CHAT_MESSAGE_MAX_LENGTH = 4000;
export const CHAT_NAME_MAX_LENGTH = 80;

export interface Chat {
  readonly id: ChatId;
  readonly kind: ChatKind;
  readonly projectId: ProjectId | null;
  /** The agent's name for a direct chat, for example `xora` (actor `agent:xora`). */
  readonly agentId: string | null;
  /** The name of a task channel. */
  readonly name: string | null;
  /** Null while the chat has no row (no stored message yet). */
  readonly createdBy: string | null;
  readonly createdAt: string | null;
  readonly archivedBy: string | null;
  readonly archivedAt: string | null;
}

export type StoredChat = Chat & { readonly createdBy: string; readonly createdAt: string };

/** A thread hangs on a stored message or on a Mission (ADR-007 section 2). */
export type ThreadRoot =
  | { readonly kind: "message"; readonly messageId: ChatMessageId }
  | { readonly kind: "mission"; readonly missionId: MissionId };

export type ChatReferenceKind = "mention" | "message" | "chat" | "mission" | "proposal" | "node";

export interface ChatReference {
  readonly kind: ChatReferenceKind;
  /** Required for `proposal` and `node`, otherwise null. */
  readonly projectId: ProjectId | null;
  /** An actor id for `mention`, otherwise the id of the linked item. */
  readonly targetId: string;
}

export interface ChatMessage {
  readonly id: ChatMessageId;
  readonly chatId: ChatId;
  readonly authorId: string;
  /** Null once the message is deleted; the marker stays. */
  readonly body: string | null;
  readonly threadRoot: ThreadRoot | null;
  readonly createdAt: string;
  readonly deletedBy: string | null;
  readonly deletedAt: string | null;
  readonly references: readonly ChatReference[];
}

/** Who the captain is; the adapter reads it from the workspace (its reviewers). */
export interface ChatPolicy {
  isCaptain(actorId: string): boolean;
}

export interface ChatStore {
  getStoredChat(input: { chatId: ChatId }): Promise<StoredChat | null>;
  listStoredChats(): Promise<readonly StoredChat[]>;
  insertChat(input: { chat: StoredChat }): Promise<void>;
  updateChat(input: {
    chatId: ChatId;
    name?: string;
    archivedBy?: string;
    archivedAt?: string;
  }): Promise<void>;
  /**
   * Inserts the message, and `chat` first when the chat has no row yet, in one transaction.
   * Fails with ValidationError when the chat was archived meanwhile.
   */
  insertChatMessage(input: { chat?: StoredChat; message: ChatMessage }): Promise<void>;
  getChatMessage(input: { messageId: ChatMessageId }): Promise<ChatMessage | null>;
  /**
   * Messages in creation order. With `threadRoot` only the replies of that thread; with
   * `topLevelOnly` only the messages outside threads.
   */
  listChatMessages(input: {
    chatId?: ChatId;
    threadRoot?: ThreadRoot;
    topLevelOnly?: boolean;
  }): Promise<readonly ChatMessage[]>;
  /** Removes the bodies and records the deletion, in one transaction. */
  deleteChatMessages(input: {
    messageIds: readonly ChatMessageId[];
    deletedBy: string;
    deletedAt: string;
  }): Promise<void>;
  projectExists(input: { projectId: ProjectId }): Promise<boolean>;
  /** The owning Project of a Mission, or null when there is no such Mission. */
  missionProject(input: { missionId: MissionId }): Promise<ProjectId | null>;
  /** References whose target does not exist (messages, Missions, Proposals, Nodes). */
  missingChatReferences(input: {
    references: readonly ChatReference[];
  }): Promise<readonly string[]>;
}

export interface PostChatMessageInput {
  readonly chatId: ChatId;
  readonly actorId: string;
  readonly body: string;
  readonly threadRoot?: ThreadRoot;
  readonly references?: readonly ChatReference[];
}

const defaultIds: IdGenerator = { next: () => randomUUID() };
const defaultClock: Clock = { now: () => new Date().toISOString() };

/**
 * Chat operations (ADR-007). Core enforces who writes, the chat kinds, one-level threads,
 * references, and deletion; adapters only call these operations. Chat messages write no
 * knowledge Audit Events.
 */
export class ChatService {
  public constructor(
    private readonly store: ChatStore,
    private readonly policy: ChatPolicy,
    private readonly ids: IdGenerator = defaultIds,
    private readonly clock: Clock = defaultClock,
  ) {}

  /** Resolves an address to its chat, stored or not; throws NotFoundError for none. */
  public async getChat(input: { chatId: string }): Promise<Chat> {
    const id = text(input.chatId, "Chat") as ChatId;
    const stored = await this.store.getStoredChat({ chatId: id });
    if (stored) return stored;
    if (id === SHIP_CHAT_ID) return virtualChat(id, "ship");
    if (id === XORA_CHAT_ID) return virtualChat(id, "direct", { agentId: "xora" });
    if (id.startsWith("project:")) {
      const projectId = id.slice("project:".length) as ProjectId;
      if (projectId && (await this.store.projectExists({ projectId }))) {
        return virtualChat(id, "project", { projectId });
      }
    }
    throw new NotFoundError(`Chat ${id} was not found`);
  }

  public listStoredChats(): Promise<readonly StoredChat[]> {
    return this.store.listStoredChats();
  }

  /** Creates a task channel (ADR-007 Amendment 1). Captain only. */
  public async createChannel(input: {
    name: string;
    projectId?: ProjectId;
    actorId: string;
  }): Promise<StoredChat> {
    const actorId = this.requireCaptain(input.actorId, "create a channel");
    const name = channelName(input.name);
    if (input.projectId && !(await this.store.projectExists({ projectId: input.projectId }))) {
      throw new NotFoundError(`Project ${input.projectId} was not found`);
    }
    const chat: StoredChat = Object.freeze({
      id: `topic:${this.ids.next()}` as ChatId,
      kind: "topic" as const,
      projectId: input.projectId ?? null,
      agentId: null,
      name,
      createdBy: actorId,
      createdAt: this.clock.now(),
      archivedBy: null,
      archivedAt: null,
    });
    await this.store.insertChat({ chat });
    return chat;
  }

  public async renameChannel(input: {
    chatId: ChatId;
    name: string;
    actorId: string;
  }): Promise<StoredChat> {
    this.requireCaptain(input.actorId, "rename a channel");
    const chat = await this.openChannel(input.chatId);
    await this.store.updateChat({ chatId: chat.id, name: channelName(input.name) });
    return this.requireStored(chat.id);
  }

  /** Archives a task channel: it becomes read-only and leaves the side list. */
  public async archiveChannel(input: { chatId: ChatId; actorId: string }): Promise<StoredChat> {
    const actorId = this.requireCaptain(input.actorId, "archive a channel");
    const chat = await this.openChannel(input.chatId);
    await this.store.updateChat({
      chatId: chat.id,
      archivedBy: actorId,
      archivedAt: this.clock.now(),
    });
    return this.requireStored(chat.id);
  }

  public async postMessage(input: PostChatMessageInput): Promise<ChatMessage> {
    const authorId = this.requireWriter(input.actorId);
    const chat = await this.getChat({ chatId: input.chatId });
    if (chat.archivedAt) throw new ValidationError(`Channel "${chat.name}" is archived`);
    const body = input.body.trim();
    if (!body) throw new ValidationError("A message must not be empty");
    if (body.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new ValidationError(
        `A message has at most ${CHAT_MESSAGE_MAX_LENGTH} characters (has ${body.length})`,
      );
    }
    const threadRoot = input.threadRoot ? await this.threadRoot(chat, input.threadRoot) : null;
    const references = await this.references(input.references ?? []);
    const createdAt = this.clock.now();
    const message: ChatMessage = Object.freeze({
      id: this.ids.next() as ChatMessageId,
      chatId: chat.id,
      authorId,
      body,
      threadRoot,
      createdAt,
      deletedBy: null,
      deletedAt: null,
      references,
    });
    await this.store.insertChatMessage({
      ...(chat.createdAt ? {} : { chat: { ...chat, createdBy: authorId, createdAt } }),
      message,
    });
    return message;
  }

  /** Deletes a message, or with `thread` a thread root and all its replies. Captain only. */
  public async deleteMessage(input: {
    messageId: ChatMessageId;
    actorId: string;
    thread?: boolean;
  }): Promise<readonly ChatMessageId[]> {
    const actorId = this.requireCaptain(input.actorId, "delete a message");
    const message = await this.store.getChatMessage({ messageId: input.messageId });
    if (!message) throw new NotFoundError(`Message ${input.messageId} was not found`);
    let ids: ChatMessageId[];
    if (input.thread) {
      if (message.threadRoot) {
        throw new ValidationError("Only a message that starts a thread can delete its thread");
      }
      const replies = await this.store.listChatMessages({
        threadRoot: { kind: "message", messageId: message.id },
      });
      ids = [message, ...replies].filter((entry) => !entry.deletedAt).map((entry) => entry.id);
    } else {
      if (message.deletedAt) throw new ValidationError("The message was already deleted");
      ids = [message.id];
    }
    if (ids.length > 0) {
      await this.store.deleteChatMessages({
        messageIds: ids,
        deletedBy: actorId,
        deletedAt: this.clock.now(),
      });
    }
    return Object.freeze(ids);
  }

  /** Deletes every message of a direct chat ("Clear chat"). Captain only. */
  public async clearDirectChat(input: {
    chatId: ChatId;
    actorId: string;
  }): Promise<readonly ChatMessageId[]> {
    const actorId = this.requireCaptain(input.actorId, "clear a chat");
    const chat = await this.getChat({ chatId: input.chatId });
    if (chat.kind !== "direct") throw new ValidationError("Only a direct chat can be cleared");
    const ids = (await this.store.listChatMessages({ chatId: chat.id }))
      .filter((entry) => !entry.deletedAt)
      .map((entry) => entry.id);
    if (ids.length > 0) {
      await this.store.deleteChatMessages({
        messageIds: ids,
        deletedBy: actorId,
        deletedAt: this.clock.now(),
      });
    }
    return Object.freeze(ids);
  }

  public getMessage(input: { messageId: ChatMessageId }): Promise<ChatMessage | null> {
    return this.store.getChatMessage(input);
  }

  /** The messages of a chat outside threads, in creation order. */
  public async listMessages(input: { chatId: ChatId }): Promise<readonly ChatMessage[]> {
    const chat = await this.getChat(input);
    return this.store.listChatMessages({ chatId: chat.id, topLevelOnly: true });
  }

  /** The replies of a thread, in creation order. */
  public listThread(input: { threadRoot: ThreadRoot }): Promise<readonly ChatMessage[]> {
    return this.store.listChatMessages({ threadRoot: input.threadRoot });
  }

  /** A reply to a reply belongs to the same thread; a Mission root stays in its project. */
  private async threadRoot(chat: Chat, root: ThreadRoot): Promise<ThreadRoot> {
    if (root.kind === "mission") {
      if (chat.kind !== "project") {
        throw new ValidationError("A Mission thread belongs to its project channel");
      }
      const projectId = await this.store.missionProject({ missionId: root.missionId });
      if (!projectId) throw new NotFoundError(`Mission ${root.missionId} was not found`);
      if (projectId !== chat.projectId) {
        throw new ValidationError("The Mission belongs to another project's channel");
      }
      return Object.freeze({ kind: "mission", missionId: root.missionId });
    }
    const parent = await this.store.getChatMessage({ messageId: root.messageId });
    if (!parent || parent.chatId !== chat.id) {
      throw new NotFoundError(`Message ${root.messageId} was not found in ${chat.id}`);
    }
    if (parent.threadRoot) return parent.threadRoot;
    if (chat.kind !== "direct" && chat.kind !== "topic") {
      throw new ValidationError(
        "Topic threads exist in task channels and direct chats; in a project channel a thread belongs to a Mission",
      );
    }
    return Object.freeze({ kind: "message", messageId: parent.id });
  }

  private async references(input: readonly ChatReference[]): Promise<readonly ChatReference[]> {
    const references = input.map((entry): ChatReference => {
      const targetId = text(entry.targetId, "Reference target");
      const needsProject = entry.kind === "proposal" || entry.kind === "node";
      if (needsProject !== Boolean(entry.projectId)) {
        throw new ValidationError(
          needsProject
            ? `A ${entry.kind} reference needs its project`
            : `A ${entry.kind} reference has no project`,
        );
      }
      if (entry.kind === "mention" && !this.mayWrite(targetId)) {
        throw new ValidationError(`@${targetId} is not on board`);
      }
      return Object.freeze({ kind: entry.kind, projectId: entry.projectId ?? null, targetId });
    });
    for (const entry of references) {
      if (entry.kind === "chat") await this.getChat({ chatId: entry.targetId });
    }
    const missing = await this.store.missingChatReferences({
      references: references.filter((entry) => entry.kind !== "mention" && entry.kind !== "chat"),
    });
    if (missing.length > 0) {
      throw new ValidationError(`Unknown references: ${missing.join(", ")}`);
    }
    return Object.freeze(references);
  }

  private async openChannel(chatId: ChatId): Promise<StoredChat> {
    const chat = await this.requireStored(chatId);
    if (chat.kind !== "topic") throw new ValidationError("Only a task channel can be changed");
    if (chat.archivedAt) throw new ValidationError(`Channel "${chat.name}" is archived`);
    return chat;
  }

  private async requireStored(chatId: ChatId): Promise<StoredChat> {
    const chat = await this.store.getStoredChat({ chatId });
    if (!chat) throw new NotFoundError(`Chat ${chatId} was not found`);
    return chat;
  }

  private mayWrite(actorId: string): boolean {
    return (
      actorId === XORA_ACTOR_ID || (!isAgentActorId(actorId) && this.policy.isCaptain(actorId))
    );
  }

  /** Only the captain and Xora write; group chats need a multi-agent RFC (ADR-007 section 4). */
  private requireWriter(actorIdInput: string): string {
    const actorId = text(actorIdInput, "Actor");
    if (this.mayWrite(actorId)) return actorId;
    throw new ValidationError(
      isAgentActorId(actorId)
        ? `Only Xora writes in the chat for now; "${actorId}" needs the multi-agent RFC`
        : `"${actorId}" is not the captain of this ship`,
    );
  }

  private requireCaptain(actorIdInput: string, action: string): string {
    const actorId = text(actorIdInput, "Actor");
    if (!isAgentActorId(actorId) && this.policy.isCaptain(actorId)) return actorId;
    throw new ValidationError(`Only the captain may ${action}; "${actorId}" may not`);
  }
}

function virtualChat(
  id: ChatId,
  kind: ChatKind,
  fields: { projectId?: ProjectId; agentId?: string } = {},
): Chat {
  return Object.freeze({
    id,
    kind,
    projectId: fields.projectId ?? null,
    agentId: fields.agentId ?? null,
    name: null,
    createdBy: null,
    createdAt: null,
    archivedBy: null,
    archivedAt: null,
  });
}

function channelName(value: string): string {
  const name = text(value, "Channel name");
  if (name.length > CHAT_NAME_MAX_LENGTH) {
    throw new ValidationError(`A channel name has at most ${CHAT_NAME_MAX_LENGTH} characters`);
  }
  return name;
}

function text(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new ValidationError(`${field} must not be empty`);
  return result;
}
