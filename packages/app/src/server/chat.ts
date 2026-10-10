import {
  type ChatId,
  type ChatMessage,
  type ChatMessageId,
  type ChatReference,
  ChatService,
  type ChatStore,
  type Mission,
  type MissionEvent,
  type MissionId,
  type MissionStore,
  MissionService,
  missionNeedsHuman,
  NotFoundError,
  SHIP_CHAT_ID,
  type StoredChat,
  type ThreadRoot,
  ValidationError,
  type WorkspaceExportRecord,
  XORA_ACTOR_ID,
  XORA_CHAT_ID,
} from "@loxora/core";
import { XORA_REPLIES, type XoraReply } from "../shared/conversation.js";
import type { Assistant, Language } from "./assistant.js";
import { Labels, missionDetail, missionSummary } from "./views.js";

/**
 * The bridge as the ship's chat (RFC-011 Amendment 2, ADR-007, Milestone 15). Stored messages
 * come from `ChatService`; everything the ship computer reports, the Mission cards, and the
 * decisions channel are derived from Mission Events and Audit Events at request time and
 * never stored (ADR-007 section 3).
 */

/** The migration the stored chat needs; without it the bridge is read-only. */
export const CHAT_MIGRATION = "008_chat";

/** The derived channel of everything that waits for the captain (ADR-007 Amendment 1). */
export const DECISIONS_ADDRESS = "decisions";

export type ChatReadStore = ChatStore &
  MissionStore & {
    readWorkspaceSections(
      names: readonly string[],
    ): Promise<Readonly<Record<string, readonly WorkspaceExportRecord[]>>>;
  };

export interface ChatContext {
  /** False on a workspace without `008_chat`: no stored messages, no writes. */
  readonly available: boolean;
  readonly actor: string | null;
  readonly reviewers: readonly string[];
  /** The captain's display name from the settings file, if any. */
  readonly captainName: string | null;
  readonly captainId: string | null;
}

export type AuthorRole = "captain" | "xora" | "shipComputer" | "other";

export interface Author {
  readonly id: string;
  readonly name: string;
  readonly role: AuthorRole;
}

/** What a pasted message link shows (Milestone 15 section 3, "Message links"). */
export interface MessagePreview {
  readonly id: string;
  readonly address: string;
  readonly chat: ChatSummary;
  readonly thread: string | null;
  readonly author: Author;
  readonly excerpt: string | null;
  readonly at: string;
  readonly deleted: boolean;
}

export interface ChatSummary {
  readonly address: string;
  readonly kind: "ship" | "project" | "topic" | "direct" | "decisions";
  /** A project or task channel name; the client labels the others. */
  readonly name: string | null;
  readonly projectId: string | null;
  readonly archived: boolean;
}

/** A message link inside a message body: `<origin>/bridge/m/<message id>`. */
const MESSAGE_LINK = /\/bridge\/m\/([A-Za-z0-9-]{1,80})/g;
/** `@Xora` as a whole word, in any case. */
const XORA_MENTION = /(^|[^\p{L}\p{N}_])@xora(?![\p{L}\p{N}_])/iu;
const EXCERPT_LENGTH = 160;

/** Encodes a thread root for URLs and payloads: `mission:<id>` or `message:<id>`. */
export function threadKey(root: ThreadRoot | null): string | null {
  if (!root) return null;
  return root.kind === "mission" ? `mission:${root.missionId}` : `message:${root.messageId}`;
}

export function parseThreadKey(value: unknown): ThreadRoot | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ValidationError("threadRoot must be a string");
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":");
  if (!id) throw new ValidationError("threadRoot must be mission:<id> or message:<id>");
  if (kind === "mission") return { kind: "mission", missionId: id as MissionId };
  if (kind === "message") return { kind: "message", messageId: id as ChatMessageId };
  throw new ValidationError("threadRoot must be mission:<id> or message:<id>");
}

/** The references a captain's message carries: `@Xora` and pasted message links. */
export function messageReferences(text: string): ChatReference[] {
  const references: ChatReference[] = [];
  if (XORA_MENTION.test(text)) {
    references.push({ kind: "mention", projectId: null, targetId: XORA_ACTOR_ID });
  }
  const seen = new Set<string>();
  for (const match of text.matchAll(MESSAGE_LINK)) {
    const id = match[1] ?? "";
    if (seen.has(id)) continue;
    seen.add(id);
    references.push({ kind: "message", projectId: null, targetId: id });
  }
  return references;
}

export function mentionsXora(references: readonly ChatReference[]): boolean {
  return references.some((entry) => entry.kind === "mention" && entry.targetId === XORA_ACTOR_ID);
}

export function xoraReplyText(reply: XoraReply, language: "de" | "en"): string {
  return XORA_REPLIES[language][reply];
}

export function chatPolicy(reviewers: readonly string[]) {
  return { isCaptain: (actorId: string) => reviewers.includes(actorId) };
}

/** Reads for one request; the store is open only as long as the request runs. */
export class BridgeReader {
  private readonly missions: MissionService;
  private readonly chats: ChatService | null;
  private labels: Labels | null = null;
  private allMissions: readonly Mission[] | null = null;
  private readonly events = new Map<MissionId, readonly MissionEvent[]>();

  public constructor(
    private readonly store: ChatReadStore,
    private readonly context: ChatContext,
  ) {
    this.missions = new MissionService(store);
    this.chats = context.available ? new ChatService(store, chatPolicy(context.reviewers)) : null;
  }

  /** The side list (Milestone 15 section 3) with what needs the captain counted. */
  public async chatList() {
    const labels = await this.readLabels();
    const stored = this.chats ? await this.chats.listStoredChats() : [];
    const projectChannels = labels.projectList().map((project) => ({
      address: `project:${project.id}`,
      kind: "project" as const,
      name: project.name,
      projectId: project.id,
      archived: false,
    }));
    const topics = stored
      .filter((chat) => chat.kind === "topic" && !chat.archivedAt)
      .map((chat) => this.storedSummary(chat));
    return {
      available: this.context.available,
      writable: this.context.available && this.context.actor !== null,
      decisions: { address: DECISIONS_ADDRESS, count: (await this.openRequests()).length },
      channels: [
        {
          address: SHIP_CHAT_ID,
          kind: "ship" as const,
          name: null,
          projectId: null,
          archived: false,
        },
        ...projectChannels,
        ...topics,
      ],
      direct: [
        {
          address: XORA_CHAT_ID,
          kind: "direct" as const,
          name: "Xora",
          projectId: null,
          archived: false,
        },
      ],
      projects: labels.projectList(),
    };
  }

  /** A chat with its entries, and the open thread when `thread` names one. */
  public async chat(address: string, thread: ThreadRoot | undefined) {
    const summary = await this.summary(address);
    const entries = await this.entries(summary);
    return {
      chat: { ...summary, writable: this.writable(summary) },
      details: await this.details(summary),
      entries,
      ...(thread ? { thread: await this.thread(summary, thread) } : {}),
    };
  }

  public async preview(messageId: ChatMessageId): Promise<MessagePreview> {
    const message = this.chats ? await this.chats.getMessage({ messageId }) : null;
    if (!message) throw new NotFoundError(`Message ${messageId} was not found`);
    return this.previewOf(message);
  }

  /** One stored message as the client shows it. */
  public async messageEntry(message: ChatMessage, replies: readonly ChatMessage[] = []) {
    const links: MessagePreview[] = [];
    for (const reference of message.references) {
      if (reference.kind !== "message" || message.deletedAt) continue;
      const target = await this.chats?.getMessage({
        messageId: reference.targetId as ChatMessageId,
      });
      if (target) links.push(await this.previewOf(target));
    }
    const live = replies.filter((reply) => !reply.deletedAt);
    return {
      type: "message" as const,
      id: message.id,
      at: message.createdAt,
      author: this.author(message.authorId),
      body: message.body,
      deleted: message.deletedAt ? { by: message.deletedBy, at: message.deletedAt } : null,
      thread: threadKey(message.threadRoot),
      mentions: message.references
        .filter((entry) => entry.kind === "mention")
        .map((entry) => this.author(entry.targetId)),
      links,
      replies: live.length,
      lastReplyAt: live.at(-1)?.createdAt ?? null,
    };
  }

  private async previewOf(message: ChatMessage): Promise<MessagePreview> {
    const summary = await this.summary(message.chatId);
    return {
      id: message.id,
      address: message.chatId,
      chat: summary,
      thread:
        threadKey(message.threadRoot) ??
        (summary.kind === "direct" ? `message:${message.id}` : null),
      author: this.author(message.authorId),
      excerpt: message.body ? excerpt(message.body) : null,
      at: message.createdAt,
      deleted: message.deletedAt !== null,
    };
  }

  private writable(summary: ChatSummary): boolean {
    return (
      this.context.available &&
      this.context.actor !== null &&
      summary.kind !== "decisions" &&
      !summary.archived
    );
  }

  private async summary(address: string): Promise<ChatSummary> {
    if (address === DECISIONS_ADDRESS) {
      return { address, kind: "decisions", name: null, projectId: null, archived: false };
    }
    const labels = await this.readLabels();
    if (this.chats) {
      const chat = await this.chats.getChat({ chatId: address });
      if (chat.kind === "topic") return this.storedSummary(chat as StoredChat);
      return {
        address: chat.id,
        kind: chat.kind,
        name: chat.projectId
          ? labels.project(chat.projectId).name
          : chat.kind === "direct"
            ? "Xora"
            : null,
        projectId: chat.projectId,
        archived: false,
      };
    }
    // Without 008_chat only the derived chats exist.
    if (address === SHIP_CHAT_ID) {
      return { address, kind: "ship", name: null, projectId: null, archived: false };
    }
    if (address === XORA_CHAT_ID) {
      return { address, kind: "direct", name: "Xora", projectId: null, archived: false };
    }
    const projectId = address.startsWith("project:") ? address.slice("project:".length) : "";
    const project = labels.projectList().find((entry) => entry.id === projectId);
    if (!project) throw new NotFoundError(`Chat ${address} was not found`);
    return { address, kind: "project", name: project.name, projectId, archived: false };
  }

  private storedSummary(chat: StoredChat): ChatSummary {
    return {
      address: chat.id,
      kind: "topic",
      name: chat.name,
      projectId: chat.projectId,
      archived: chat.archivedAt !== null,
    };
  }

  private async details(summary: ChatSummary) {
    const labels = await this.readLabels();
    if (summary.kind === "project" && summary.projectId) {
      const missions = (await this.missionList()).filter(
        (mission) => mission.ownerProjectId === summary.projectId,
      );
      return {
        kind: "project" as const,
        project: {
          ...labels.project(summary.projectId),
          purpose: labels.purpose(summary.projectId),
        },
        missions: missions.length,
        open: missions.filter((mission) => !isTerminal(mission)).length,
      };
    }
    if (summary.kind === "topic") {
      return {
        kind: "topic" as const,
        project: summary.projectId
          ? { ...labels.project(summary.projectId), purpose: labels.purpose(summary.projectId) }
          : null,
      };
    }
    if (summary.kind === "direct") return { kind: "direct" as const, mode: "script" as const };
    return {
      kind: summary.kind,
      crew: [
        ...(this.context.captainId ? [this.author(this.context.captainId)] : []),
        this.author(XORA_ACTOR_ID),
        shipComputer(),
      ],
    };
  }

  /** The entries of a chat outside threads, merged by time (Milestone 15 section 2). */
  private async entries(summary: ChatSummary) {
    switch (summary.kind) {
      case "decisions":
        return this.decisionEntries();
      case "ship":
        return byTime([...(await this.shipEvents()), ...(await this.topLevel(summary.address))]);
      case "project":
        return byTime([
          ...(await this.missionCards(summary.projectId ?? "")),
          ...(await this.topLevel(summary.address)),
        ]);
      case "topic":
        return byTime(await this.topLevel(summary.address));
      case "direct": {
        // The direct chat lists its topic threads, newest first (section 3).
        const roots = await this.topLevel(summary.address);
        return roots
          .slice()
          .sort((a, b) => (b.lastReplyAt ?? b.at).localeCompare(a.lastReplyAt ?? a.at));
      }
    }
  }

  private async topLevel(address: string) {
    const chats = this.chats;
    if (!chats) return [];
    const messages = await chats.listMessages({ chatId: address as ChatId });
    return Promise.all(
      messages.map(async (message) =>
        this.messageEntry(
          message,
          await chats.listThread({ threadRoot: { kind: "message", messageId: message.id } }),
        ),
      ),
    );
  }

  private async thread(summary: ChatSummary, requested: ThreadRoot) {
    let root = requested;
    if (root.kind === "message" && this.chats) {
      // A link to a reply opens the thread it belongs to.
      const linked = await this.chats.getMessage({ messageId: root.messageId });
      if (linked?.threadRoot) root = linked.threadRoot;
    }
    const replies = this.chats ? await this.chats.listThread({ threadRoot: root }) : [];
    const own = replies.filter((reply) => reply.chatId === summary.address);
    const replyEntries = await Promise.all(own.map((reply) => this.messageEntry(reply)));
    if (root.kind === "mission") {
      if (summary.kind !== "project") {
        throw new ValidationError("A Mission thread belongs to its project channel");
      }
      const mission = await this.missions.getMission({ missionId: root.missionId });
      if (!mission || mission.ownerProjectId !== summary.projectId) {
        throw new NotFoundError(`Mission ${root.missionId} has no thread in ${summary.address}`);
      }
      const events = await this.missionEvents(mission.id);
      return {
        key: threadKey(root),
        root: {
          type: "mission" as const,
          mission: missionDetail(mission, events, await this.readLabels(), this.context.actor),
        },
        entries: byTime([
          ...events.map((event) => ({
            type: "missionEvent" as const,
            id: event.id,
            at: event.occurredAt,
            event: {
              type: event.type,
              newState: event.newState,
              waitReason: event.waitReason,
              actorId: event.actorId,
              reason: event.reason,
              payload: event.payload,
            },
          })),
          ...replyEntries,
        ]),
      };
    }
    const message = this.chats ? await this.chats.getMessage({ messageId: root.messageId }) : null;
    if (!message || message.chatId !== summary.address) {
      throw new NotFoundError(`Message ${root.messageId} was not found in ${summary.address}`);
    }
    return {
      key: threadKey(root),
      root: await this.messageEntry(message, own),
      entries: replyEntries,
    };
  }

  /** One card per Mission of the project, at its last activity (section 2). */
  private async missionCards(projectId: string) {
    const labels = await this.readLabels();
    const missions = (await this.missionList()).filter(
      (mission) => mission.ownerProjectId === projectId,
    );
    return Promise.all(
      missions.map(async (mission) => {
        const replies = this.chats
          ? (
              await this.chats.listThread({
                threadRoot: { kind: "mission", missionId: mission.id },
              })
            ).filter((reply) => !reply.deletedAt)
          : [];
        return {
          type: "mission" as const,
          id: mission.id,
          at: mission.lastActivityAt,
          mission: missionSummary(mission, labels),
          thread: `mission:${mission.id}`,
          replies: replies.length,
          lastReplyAt: replies.at(-1)?.createdAt ?? null,
        };
      }),
    );
  }

  /** What the ship computer reports in the ship channel (section 2). */
  private async shipEvents() {
    const labels = await this.readLabels();
    const entries: ShipEvent[] = [];
    const sections = await this.store.readWorkspaceSections(["auditEvents", "knowledgeProposals"]);
    const proposals = new Map(
      (sections.knowledgeProposals ?? []).map((proposal) => [proposal.id, proposal]),
    );
    for (const event of sections.auditEvents ?? []) {
      const project = labels.project(event.projectId);
      if (event.eventType === "ProjectCreated") {
        entries.push(
          shipEvent(String(event.id), String(event.occurredAt), "projectCreated", project),
        );
      } else if (
        event.eventType === "ProposalAccepted" ||
        event.eventType === "SuccessorProposalAccepted"
      ) {
        const proposal = proposals.get(event.aggregateId);
        entries.push({
          ...shipEvent(String(event.id), String(event.occurredAt), "knowledgeAccepted", project),
          title: proposal ? String(proposal.proposedNodeTitle) : null,
        });
      }
    }
    for (const mission of await this.missionList()) {
      const project = labels.project(mission.ownerProjectId);
      for (const event of await this.missionEvents(mission.id)) {
        const kind = SHIP_MISSION_EVENTS[event.type];
        if (!kind) continue;
        if (event.type === "Waiting" && event.waitReason === "provider_limit") continue;
        entries.push({
          ...shipEvent(event.id, event.occurredAt, kind, project),
          mission: { id: mission.id, title: mission.title },
          thread: `mission:${mission.id}`,
        });
      }
    }
    return entries;
  }

  /** Every open Attention Request, linked to its Mission thread (section 2). */
  private async decisionEntries() {
    const labels = await this.readLabels();
    return byTime(
      (await this.openRequests()).map((mission) => ({
        type: "attention" as const,
        id: mission.attentionRequest?.id ?? mission.id,
        at: mission.lastActivityAt,
        mission: missionSummary(mission, labels),
        waitReason: mission.attentionRequest?.waitReason ?? null,
        address: `project:${mission.ownerProjectId}`,
        thread: `mission:${mission.id}`,
      })),
    );
  }

  private async openRequests(): Promise<Mission[]> {
    return (await this.missionList()).filter(
      (mission) =>
        missionNeedsHuman(mission) &&
        mission.attentionRequest !== null &&
        mission.attentionRequest.answeredAt === null,
    );
  }

  private author(id: string): Author {
    if (id === XORA_ACTOR_ID) return { id, name: "Xora", role: "xora" };
    if (this.context.reviewers.includes(id)) {
      return {
        id,
        name:
          id === this.context.captainId && this.context.captainName ? this.context.captainName : id,
        role: "captain",
      };
    }
    return { id, name: id, role: "other" };
  }

  private async readLabels(): Promise<Labels> {
    this.labels ??= await Labels.read(this.store);
    return this.labels;
  }

  private async missionList(): Promise<readonly Mission[]> {
    this.allMissions ??= await this.missions.listMissions({});
    return this.allMissions;
  }

  private async missionEvents(missionId: MissionId): Promise<readonly MissionEvent[]> {
    let events = this.events.get(missionId);
    if (!events) {
      events = await this.missions.getMissionEvents({ missionId });
      this.events.set(missionId, events);
    }
    return events;
  }
}

type ShipEventKind =
  | "projectCreated"
  | "missionCreated"
  | "missionStarted"
  | "missionWaiting"
  | "missionCompleted"
  | "missionFailed"
  | "missionCancelled"
  | "knowledgeAccepted";

const SHIP_MISSION_EVENTS: Partial<Record<MissionEvent["type"], ShipEventKind>> = {
  Created: "missionCreated",
  Started: "missionStarted",
  Waiting: "missionWaiting",
  Completed: "missionCompleted",
  Failed: "missionFailed",
  Cancelled: "missionCancelled",
};

interface ShipEvent {
  readonly type: "event";
  readonly id: string;
  readonly at: string;
  readonly event: ShipEventKind;
  readonly author: Author;
  readonly project: { readonly id: string; readonly name: string };
  readonly address: string;
  readonly mission?: { readonly id: string; readonly title: string };
  readonly thread?: string;
  readonly title?: string | null;
}

function shipEvent(
  id: string,
  at: string,
  event: ShipEventKind,
  project: { id: string; name: string },
): ShipEvent {
  return {
    type: "event",
    id,
    at,
    event,
    author: shipComputer(),
    project,
    address: `project:${project.id}`,
  };
}

function shipComputer(): Author {
  return { id: "ship-computer", name: "", role: "shipComputer" };
}

function isTerminal(mission: Mission): boolean {
  return ["completed", "failed", "cancelled"].includes(mission.state);
}

/** Oldest first; entries at the same time keep their order (derived before stored). */
function byTime<T extends { readonly at: string }>(entries: readonly T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.at.localeCompare(b.entry.at) || a.index - b.index)
    .map(({ entry }) => entry);
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

/**
 * Stores the captain's message and, when Xora is addressed, her script-mode reply in the same
 * place (Milestone 15 sections 3 and 4). In the direct chat every message is addressed to her,
 * and a message outside a thread starts a new topic thread that her reply goes into.
 */
export async function postToChat(
  store: ChatReadStore,
  context: ChatContext & { readonly actor: string },
  assistant: Assistant,
  input: {
    readonly address: string;
    readonly text: string;
    readonly threadRoot?: ThreadRoot;
    readonly language: Language;
    readonly topic?: string;
  },
) {
  if (input.address === DECISIONS_ADDRESS) {
    throw new ValidationError("The decisions channel is filled by the ship; it takes no messages");
  }
  const chats = new ChatService(store, chatPolicy(context.reviewers));
  const references = messageReferences(input.text);
  const message = await chats.postMessage({
    chatId: input.address as ChatId,
    actorId: context.actor,
    body: input.text,
    ...(input.threadRoot ? { threadRoot: input.threadRoot } : {}),
    references,
  });
  const chat = await chats.getChat({ chatId: message.chatId });
  let reply: ChatMessage | null = null;
  if (chat.kind === "direct" || mentionsXora(references)) {
    const turn = await assistant.respond(
      { kind: "message", text: input.text, ...(input.topic ? { topic: input.topic } : {}) },
      input.language,
    );
    const key = (turn.reply ?? "notOnBoard") as XoraReply;
    const threadRoot: ThreadRoot | null =
      message.threadRoot ??
      (chat.kind === "direct" ? { kind: "message", messageId: message.id } : null);
    reply = await chats.postMessage({
      chatId: chat.id,
      actorId: XORA_ACTOR_ID,
      body: turn.text ?? xoraReplyText(key, input.language),
      ...(threadRoot ? { threadRoot } : {}),
    });
  }
  const reader = new BridgeReader(store, context);
  return {
    message: await reader.messageEntry(message),
    ...(reply ? { reply: await reader.messageEntry(reply) } : {}),
    thread:
      threadKey(message.threadRoot) ?? (chat.kind === "direct" ? `message:${message.id}` : null),
  };
}
