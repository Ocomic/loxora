import type { DatabaseSync } from "node:sqlite";
import type {
  ChatId,
  ChatKind,
  ChatMessage,
  ChatMessageId,
  ChatReference,
  ChatReferenceKind,
  ChatStore,
  MissionId,
  ProjectId,
  StoredChat,
  ThreadRoot,
} from "@loxora/core";

type Row = Record<string, string | number | null>;
const frozen = <T>(value: T): T => Object.freeze(value);

/** ADR-007: chats and messages; rows change only by renaming, archiving, or deleting a body. */
export class SqliteChatStore implements ChatStore {
  public constructor(private readonly database: DatabaseSync) {}

  public async getStoredChat(input: { chatId: ChatId }): Promise<StoredChat | null> {
    const row = this.database.prepare("SELECT * FROM chats WHERE id=?").get(input.chatId) as
      | Row
      | undefined;
    return row ? chat(row) : null;
  }

  public async listStoredChats(): Promise<readonly StoredChat[]> {
    const rows = this.database
      .prepare("SELECT * FROM chats ORDER BY created_at, id")
      .all() as Row[];
    return frozen(rows.map(chat));
  }

  public async insertChat(input: { chat: StoredChat }): Promise<void> {
    this.transaction(() => this.writeChat(input.chat));
  }

  public async updateChat(input: Parameters<ChatStore["updateChat"]>[0]): Promise<void> {
    this.transaction(() => {
      if (input.name !== undefined) {
        this.database.prepare("UPDATE chats SET name=? WHERE id=?").run(input.name, input.chatId);
      }
      if (input.archivedAt !== undefined) {
        this.database
          .prepare("UPDATE chats SET archived_by=?,archived_at=? WHERE id=?")
          .run(input.archivedBy ?? null, input.archivedAt, input.chatId);
      }
    });
  }

  public async insertChatMessage(input: {
    chat?: StoredChat;
    message: ChatMessage;
  }): Promise<void> {
    const { message } = input;
    this.transaction(() => {
      if (input.chat) this.writeChat(input.chat);
      this.database
        .prepare(
          `INSERT INTO chat_messages (id,chat_id,author_id,body,thread_root_message_id,thread_root_mission_id,
           created_at,deleted_by,deleted_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          message.id,
          message.chatId,
          message.authorId,
          message.body,
          message.threadRoot?.kind === "message" ? message.threadRoot.messageId : null,
          message.threadRoot?.kind === "mission" ? message.threadRoot.missionId : null,
          message.createdAt,
          message.deletedBy,
          message.deletedAt,
        );
      const reference = this.database.prepare(
        "INSERT INTO chat_message_references (message_id,position,kind,project_id,target_id) VALUES (?,?,?,?,?)",
      );
      for (const [index, entry] of message.references.entries()) {
        reference.run(message.id, index + 1, entry.kind, entry.projectId, entry.targetId);
      }
    });
  }

  public async getChatMessage(input: { messageId: ChatMessageId }): Promise<ChatMessage | null> {
    const row = this.database
      .prepare("SELECT * FROM chat_messages WHERE id=?")
      .get(input.messageId) as Row | undefined;
    return row ? this.message(row) : null;
  }

  public async listChatMessages(
    input: Parameters<ChatStore["listChatMessages"]>[0],
  ): Promise<readonly ChatMessage[]> {
    const conditions: string[] = [];
    const values: string[] = [];
    if (input.chatId) {
      conditions.push("chat_id=?");
      values.push(input.chatId);
    }
    if (input.threadRoot?.kind === "message") {
      conditions.push("thread_root_message_id=?");
      values.push(input.threadRoot.messageId);
    } else if (input.threadRoot?.kind === "mission") {
      conditions.push("thread_root_mission_id=?");
      values.push(input.threadRoot.missionId);
    }
    if (input.topLevelOnly) {
      conditions.push("thread_root_message_id IS NULL AND thread_root_mission_id IS NULL");
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      .prepare(`SELECT * FROM chat_messages ${where} ORDER BY created_at, id`)
      .all(...values) as Row[];
    return frozen(rows.map((row) => this.message(row)));
  }

  public async deleteChatMessages(
    input: Parameters<ChatStore["deleteChatMessages"]>[0],
  ): Promise<void> {
    this.transaction(() => {
      const statement = this.database.prepare(
        "UPDATE chat_messages SET body=NULL,deleted_by=?,deleted_at=? WHERE id=? AND deleted_at IS NULL",
      );
      for (const id of input.messageIds) statement.run(input.deletedBy, input.deletedAt, id);
    });
  }

  public async projectExists(input: { projectId: ProjectId }): Promise<boolean> {
    return this.exists("SELECT 1 FROM projects WHERE id=?", input.projectId);
  }

  public async missionProject(input: { missionId: MissionId }): Promise<ProjectId | null> {
    const row = this.database
      .prepare("SELECT owner_project_id FROM missions WHERE id=?")
      .get(input.missionId) as Row | undefined;
    return (row?.owner_project_id as ProjectId | undefined) ?? null;
  }

  public async missingChatReferences(input: {
    references: readonly ChatReference[];
  }): Promise<readonly string[]> {
    const missing: string[] = [];
    for (const entry of input.references) {
      const found =
        entry.kind === "message"
          ? this.exists("SELECT 1 FROM chat_messages WHERE id=?", entry.targetId)
          : entry.kind === "mission"
            ? this.exists("SELECT 1 FROM missions WHERE id=?", entry.targetId)
            : entry.kind === "proposal"
              ? this.exists(
                  "SELECT 1 FROM knowledge_proposals WHERE id=? AND project_id=?",
                  entry.targetId,
                  entry.projectId ?? "",
                )
              : entry.kind === "node"
                ? this.exists(
                    "SELECT 1 FROM knowledge_nodes WHERE id=? AND project_id=?",
                    entry.targetId,
                    entry.projectId ?? "",
                  )
                : true;
      if (!found) missing.push(`${entry.kind} ${entry.targetId}`);
    }
    return frozen(missing);
  }

  private writeChat(value: StoredChat): void {
    this.database
      .prepare(
        `INSERT INTO chats (id,kind,project_id,agent_id,name,created_by,created_at,archived_by,archived_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        value.id,
        value.kind,
        value.projectId,
        value.agentId,
        value.name,
        value.createdBy,
        value.createdAt,
        value.archivedBy,
        value.archivedAt,
      );
  }

  private message(row: Row): ChatMessage {
    const references = (
      this.database
        .prepare(
          "SELECT kind,project_id,target_id FROM chat_message_references WHERE message_id=? ORDER BY position",
        )
        .all(row.id as string) as Row[]
    ).map(
      (entry): ChatReference =>
        frozen({
          kind: entry.kind as ChatReferenceKind,
          projectId: (entry.project_id as ProjectId | null) ?? null,
          targetId: entry.target_id as string,
        }),
    );
    const threadRoot: ThreadRoot | null = row.thread_root_message_id
      ? frozen({ kind: "message", messageId: row.thread_root_message_id as ChatMessageId })
      : row.thread_root_mission_id
        ? frozen({ kind: "mission", missionId: row.thread_root_mission_id as MissionId })
        : null;
    return frozen({
      id: row.id as ChatMessageId,
      chatId: row.chat_id as ChatId,
      authorId: row.author_id as string,
      body: (row.body as string | null) ?? null,
      threadRoot,
      createdAt: row.created_at as string,
      deletedBy: (row.deleted_by as string | null) ?? null,
      deletedAt: (row.deleted_at as string | null) ?? null,
      references: frozen(references),
    });
  }

  private exists(sql: string, ...values: string[]): boolean {
    return this.database.prepare(sql).get(...values) !== undefined;
  }

  private transaction(work: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      work();
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function chat(row: Row): StoredChat {
  return frozen({
    id: row.id as ChatId,
    kind: row.kind as ChatKind,
    projectId: (row.project_id as ProjectId | null) ?? null,
    agentId: (row.agent_id as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    archivedBy: (row.archived_by as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
  });
}
