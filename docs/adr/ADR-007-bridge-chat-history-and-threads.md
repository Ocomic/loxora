# ADR-007 — Bridge Chat History and Threads

**Status:** Proposed
**Date:** October 10, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (schema migration, export format version, new HTTP routes; see RFC-008)

## Context

RFC-011 Amendment 2 (October 6, 2026) turns the bridge into the ship's chat: a ship channel, one channel per project in which its Missions run as cards, and a direct chat with Xora. It authorizes no code by itself. Before the milestone document for the chat, an ADR must decide where chat history lives, how it relates to Missions and the export format, how long it is kept, and how the person deletes it (Amendment 2, "Limits"; RFC-011 open question 10).

What exists today:

- The Xora input bar sits at the bottom of every Mission Control screen (Milestone 13). Its messages are not stored; in script mode Xora answers with fixed replies.
- The setup conversation is rebuilt from stored answers, not from a transcript (Milestone 14).
- Missions, Mission Events, Attention Requests, and Outcomes are stored in the workspace database (ADR-005). No prompts, tool calls, or raw model output are stored.
- Knowledge changes are recorded as Audit Events (ADR-002).

On October 10, 2026 the decision owner added a requirement: the conversations of the models must be visible as individual threads, so that the captain can follow every conversation about one topic, the way one follows a channel in a team messenger.

## Decision

### 1. Chat history lives in the workspace

Chats and messages are stored in the workspace database, in new tables of their own, next to Missions.

- Channels belong to the ship and its projects, so they belong in the logbook, not in one person's app data. Team support stays possible: several people can later read the same channels.
- Backing up or moving the logbook folder moves the chat with it.
- The app settings file (Milestone 13) keeps holding only per-person settings. It holds no messages.

### 2. Chats, threads, and messages

| Concept | Meaning |
|---|---|
| **Chat** | A place for messages. Kinds: `ship` (exactly one per workspace), `project` (exactly one per project), `direct` (one per assistant or agent; in this ADR only Xora). |
| **Message** | Text written by the captain or by Xora in a chat. Fields: id, chat, author actor id, body, created time, optional thread root, references. |
| **Thread** | A root and its replies. The root is either a stored message or a Mission: a reply names a root message id or a Mission id, never both. Threads have one level; replies to replies stay in the same thread. |
| **Reference** | A typed link from a message to a Mission, a Proposal, a Node, or another message or chat. |

- **One thread per Mission.** In a project channel every Mission has its own thread. Its root is the Mission itself, shown as the Mission card; replies name the Mission id as their root, so no root message is stored and nothing is duplicated (section 3). Core checks that the Mission belongs to the channel's project. Everything about that Mission appears in this thread: its Mission Events, its Attention Requests (answered in place), its Outcome, and the messages the captain and Xora write about it. This is how one topic is followed from start to result.
- **Conversations of the models.** Whatever an assistant or agent reports while it works on a Mission appears in that Mission's thread. Today agents report through Mission Events (ADR-005), so their work is visible without storing anything new. When an assistant gets a direct chat, each topic it is asked about starts a thread there, so the captain can open one conversation at a time.
- **Chats exist without rows.** The ship chat and the project chats are derived from the workspace and its projects, and the direct chat with Xora always exists. A `chats` row is written only with the first stored message in a chat. So existing workspaces, new projects, and restored older exports have every channel without a migration step or a bootstrap.
- **The side list** shows the chats, and the threads that need the captain, with the counter of Missions that need input (RFC-011 Amendment 2: attention stays outside the chat flow).

### 3. What is stored and what is derived

| Shown in the chat | Source | Stored as a message |
|---|---|---|
| Captain's messages | the input bar | yes |
| Xora's replies | the assistant | yes, the final text only |
| Ship computer reports in the ship channel (project created, Mission started or finished, knowledge accepted) | Audit Events and Mission Events | **no**, derived at read time |
| Mission cards, Mission Events, Attention Requests, Outcomes in a Mission thread | Mission tables (ADR-005) | **no**, derived at read time |

- **Only real events.** Ship computer reports are views of existing events, so they cannot report something that did not happen, and nothing is stored twice.
- **No prompts, tool calls, or raw model output** are stored, as in ADR-005. Xora's message is the text the captain saw.
- **The chat is not the logbook.** A message never becomes knowledge by itself. It can be referenced as a Source or as Evidence (locator: the message id), and knowledge still enters the logbook only through a proposal and a human review (RFC-011 section 7, RFC-003).

### 4. Who writes

- Only the captain (a human actor) and Xora (`agent:xora`) write messages. Group chats with several agents need a multi-agent RFC (RFC-011 Amendment 2) and are rejected by Core until then.
- The browser never sends an actor id. The server uses the configured captain for the person's messages and `agent:xora` for Xora's, as in Milestone 13.
- Xora can be addressed in the ship and project channels by mentioning her. In script mode she answers with fixed replies, as the input bar does today.

### 5. Retention and deletion

- Messages are kept until the captain deletes them. There is no automatic expiry.
- The captain can delete a message, a thread, or the whole direct chat with Xora. Deleting removes the body and keeps a marker with who deleted it and when, so threads and references do not break. The marker says "deleted"; the text is gone from the database and from later exports.
- Deleting a message that a Source or Evidence references does not change the knowledge. The reference then shows that the message was deleted.
- Messages are not edited in the first slice.
- Derived reports and Mission threads cannot be deleted from the chat; they are views of Mission and Audit history.

### 6. Core and storage

- A Core module defines the chat types and a `ChatService` over a `ChatStore` port, following `MissionService` (ADR-005). All rules live in Core: chat kinds, who may write, one-level threads, reference checks, deletion.
- A new SQLite migration adds `chats` (written with a chat's first message), `chat_messages` (with either a root message id or a root Mission id), and `chat_message_references`, as `STRICT` tables with `CHECK` constraints. Deletion is the only update of a message row.
- Chat messages do not write knowledge Audit Events, as Missions do not (ADR-005).
- Chats are never part of Context Packages, navigation projections, or knowledge maps.

### 7. Export

- The workspace export gets format version 4 with sections for chats, messages, and message references (ADR-003 rules unchanged). Derived reports are not exported, because they are rebuilt from the exported events.
- Deleted messages are exported as markers without text.
- The reader keeps accepting versions 1 to 3; an older document restores with no stored messages. Its channels still appear, because they are derived (section 2).

### 8. Server and UI

- New routes in normal mode only: list chats, read a chat or a thread (messages and derived entries merged by time), post a message, delete a message, thread, or direct chat. Exact routes and payloads are fixed in the milestone document.
- The client polls, as Mission Control does (RFC-010 section 6). No push.
- No CLI command and no MCP tool are part of this decision.

## Alternatives

### Store chat history in the app data folder

Rejected. It ties shared channels to one person's computer account, is lost when the logbook moves, and would need a second export. Per-person settings stay in the app settings file.

### Store ship computer reports and Mission cards as messages

Rejected. It would copy Mission and Audit history into a second place that can drift from it, and it would make "only real events" depend on discipline instead of structure.

### Store full model transcripts, including prompts and tool calls

Rejected, as in ADR-005. It risks secrets in the workspace and raises retention questions. The captain sees the final messages and the Mission Events.

### One flat stream per channel without threads

Rejected. Following one Mission or one topic would mean scrolling through every other conversation in the channel, which is the problem the decision owner asked to avoid.

### Keep chat out of the export

Rejected for the first slice. The export is the workspace's portability contract (ADR-003); leaving out stored data would make it lossy. An export without chat can be added as an option if a real need appears (open question 1).

## Consequences

- The bridge can show channels, threads, and the direct chat with Xora on stored, portable data.
- One Mission is one thread, so a person can follow one topic from start to result.
- The schema, the export format (version 4), and the HTTP routes change. ADR-003's rule applies: the migration, exporter, restorer, and round-trip tests change together.
- Later agents and a live Xora fit without a model change: their messages are messages, their work is Mission Events.
- Group chats, voice, and search stay out of scope and gated.

## Implementation (after acceptance)

Acceptance authorizes a milestone document (Milestone 15, "Bridge as the ship's chat", RFC-011 milestone 4) that covers:

- the Core module, migration, export version 4, and tests for each rule above;
- the bridge layout of RFC-011 Amendment 2: side list, ship channel, project channels with one thread per Mission, the direct chat with Xora, and the details panel;
- the Xora input bar as the input of the open chat or thread;
- moving the first Mission offer (Milestone 14 section 4) into Xora's direct chat, with the Mission running in its thread in the project channel;
- Playwright tests in script mode.

## Open questions

1. Should the export offer a variant without chat history, for example when a workspace export is shared?
2. With several people on one ship: are direct chats with Xora per person or shared?
3. Can a person start a thread on a topic without a Mission, and when does such a thread become a Mission?
4. Should the captain be able to delete derived reports from view (hide), separate from deleting stored messages?

## Related documents

- `docs/rfcs/RFC-011-first-launch-setup-and-xora.md` (Amendment 2)
- `docs/rfcs/RFC-009-mission-concept-and-state-model.md`
- `docs/rfcs/RFC-010-product-ui-shell-and-mission-control-mvp.md`
- `docs/adr/ADR-003-deterministic-workspace-export.md`
- `docs/adr/ADR-005-mission-storage-and-reporting-interface.md`
- `docs/planning/UI-VISION.md` ("The bridge as the ship's chat")
