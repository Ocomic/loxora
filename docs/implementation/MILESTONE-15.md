# Milestone 15: The bridge as the ship's chat (script mode)

**Status:** Proposed
**Decision Owner:** Ocomic
**Change class:** C2 (RFC-008): schema migration, export format version 4, new HTTP routes, a changed UI surface
**Implements:** RFC-011 Amendment 2 (the bridge as the ship's chat) and [ADR-007](../adr/ADR-007-bridge-chat-history-and-threads.md) with its Amendment 1 (task channels, decisions channel, message links), on top of [Milestone 14](./MILESTONE-14.md)

## Authorization

- RFC-011 Amendment 2 (October 6, 2026) replaces the 2D bridge visualizer with the bridge as the ship's chat and requires an ADR for chat history before this milestone document.
- ADR-007 was accepted by Ocomic on October 10, 2026 (pull request #40). Its acceptance authorizes this milestone document.
- Merging this document authorizes the implementation described here and nothing beyond it. The C3 items of RFC-011 section 11 stay out of scope, and so do group chats with several agents, voice input, and search.

## Goal

After the setup, the captain lands on a bridge that works like a team messenger: a ship channel where the ship computer reports what happened on board, one channel per project in which every Mission is a thread, and a direct chat with Xora. The captain can follow one Mission or one topic from start to result in its thread, answer questions in place, and write to Xora from the input bar of the open chat.

There is still no language model. Xora answers in script mode with fixed replies, as in Milestones 13 and 14.

## Authorized scope

### 1. Core and storage (ADR-007 sections 2 to 6)

- A Core module `packages/core/src/chat.ts` with the chat types and a `ChatService` over a `ChatStore` port, following `MissionService`.
- Chat addresses: `ship`, `project:<projectId>`, `topic:<chatId>` (task channels, ADR-007 Amendment 1), `decisions`, and `direct:xora`. The ship chat and the project chats are derived from the workspace and its projects; a `chats` row is written with a chat's first stored message.
- Operations: `createChannel`, `renameChannel`, and `archiveChannel` for task channels (captain only); `postMessage` (chat, author, body, optional thread root: a message id or a Mission id, optional references), `deleteMessage`, `deleteThread`, `deleteDirectChat`, and reads (`listChats`, `getChat`, `getThread`).
- Rules in Core: only a reviewer of the workspace (the captain) and `agent:xora` write; any other human id and any other `agent:` actor are rejected (group chats are gated). Core reads the reviewers from the workspace, as review operations already do; it does not rely on the server choosing the actor. A Mission thread root must be a Mission of the channel's project. A reply to a reply is stored under the same root. References must exist. A message body is 1 to 4,000 characters. Mentions (`@name`) and message links are stored as references; a mention must name a participant of the chat, a link must name an existing message. An archived channel takes no messages.
- Deletion removes the body and records who deleted it and when. Only a reviewer of the workspace deletes.
- Migration `008_chat` with `chats`, `chat_messages`, and `chat_message_references` (`STRICT`, `CHECK` constraints). The app opens an existing workspace without migrating it (Milestone 13); a workspace without `008_chat` shows the bridge read-only with the existing hint to run any `loxora` CLI command once after a backup copy, and the input bar is disabled. The app's other screens keep requiring only `007_missions`.

### 2. Derived entries

The chat shows stored messages and derived entries merged by time. Derived entries are read at request time and never stored (ADR-007 section 3).

| Chat | Derived entries |
|---|---|
| Ship channel | project created (`ProjectCreated`); Mission created, started, waiting for the captain, completed, failed, cancelled (Mission Events); knowledge accepted (`ProposalAccepted`, `SuccessorProposalAccepted`) |
| Project channel | one Mission card per Mission, sorted by its last activity |
| Decisions channel | one entry per open Attention Request, and per unread message in which Xora mentions the captain, each with a preview of and a link to its thread |
| Mission thread | the Mission's events, its open Attention Request with the answer controls of Milestone 12, its Outcome with live Proposal status |

- Each derived entry links to its Mission or its project channel.
- The exact event list per entry and its texts live in the label module, in German and English.

### 3. The bridge layout

The bridge replaces the Mission overview as the start screen at `/bridge`.

- **Side list (left):** first the decisions channel (`#entscheidungen` / `#decisions`) in red with a counter (RFC-011 Amendment 2, "Attention stays outside the chat flow"); the channels (`#brücke` / `#bridge`, one per project, and the task channels, with "New channel"); the direct chat with Xora; the crew as empty stations ("No crew yet"); and "Missions", which opens the existing Mission overview.
- **Chat (middle):** the open chat. In a project channel each Mission card shows its state and the number of replies; opening it shows its thread next to the channel, as in a team messenger. A message shows the author's picture (Xora's picture of Milestone 14, a neutral mark for the ship computer, initials for the captain), name, time, and text.
- **Details panel (right):** for Xora her picture, status ("Online · script mode"), and what she can do today; for a project its purpose and Missions; for the ship channel who is on board.
- **Input bar:** the Xora input bar of Milestone 13 becomes the input of the open chat or thread. In a channel, a message that mentions Xora (`@Xora`) gets her script-mode reply in the same place; other messages are stored without a reply. In the direct chat every message gets her reply. There, a message written outside a thread starts a new topic thread (its own root, ADR-007 section 2), and Xora answers inside it; the direct chat lists its topic threads, newest first, and the input bar writes into the open one or starts a new one.
- **Message links and mentions:** each message has "Copy link". A pasted link shows a preview card; clicking it opens the linked message in its thread, scrolled into view and highlighted. Typing `@` offers the participants of the chat.
- **Task channels:** "New channel" asks for a name and optionally a project; the channel menu offers "Rename" and "Archive".
- **Mission Detail** (`/missions/:id`) and the Mission overview (`/missions`) stay reachable unchanged; the Mission card links to Mission Detail.
- **Deletion:** a message menu offers "Delete" for stored messages, with a confirmation. The direct chat with Xora offers "Clear chat". Derived entries have no menu.
- **Narrow windows:** below 900 pixels the side list and the details panel fold away behind buttons; the chat stays usable.
- **Accessibility:** the side list is a navigation region, new messages are announced politely, and everything is reachable with the keyboard.

### 4. Xora's replies in script mode

- Xora's replies are fixed texts selected by the existing script-mode logic (Milestone 13: "not on board yet", the topic replies of empty states, and "not understood"). Each reply is stored as a message of `agent:xora` with the text shown, in the language it was shown in.
- Xora never writes anything except her replies and, after a confirmed card, the first-Mission writes of Milestone 13 section 7.

### 5. The first Mission moves into Xora's direct chat

- The first-Mission offer of Milestone 14 section 4 moves from the banner and `/first-steps` into Xora's direct chat: while it is pending, it is pinned at the top of the direct chat as Xora's guide with the steps E1 to E4 and their confirmation cards. It is an offer, not chat history: it is shown from the setup state, as in Milestone 14, is not stored as messages, and is gone when the first Mission is finished or the offer is dismissed. "Clear chat" does not affect it.
- What the first Mission leaves behind lives in the workspace and travels with it: the Mission and its thread in the project channel, and the accepted project goal.
- After the Mission starts, Xora links to its thread in the project channel; the captain answers the question there, and Xora's direct chat continues with recording the project goal.
- **Three hints** introduce the bridge (RFC-011 section 1, part E): the decisions channel ("Red means: I need you. Each entry takes you to the right thread"), threads ("Every Mission has its own thread"), and the input bar ("You write here, to me or in the open channel"). Then Xora proposes one concrete next step: opening the project channel to follow the finished first Mission.
- The writes, actors, and stages stay exactly as in Milestone 13 section 7. The offer can still be dismissed.

### 6. Routes

Normal mode only, with the request protection of the write API (Milestone 12). The browser never sends an actor id.

| Route | Purpose |
|---|---|
| `GET /api/chats` | the chats for the side list, with counts: entries in the decisions channel, replies per thread |
| `GET /api/chats/:address?thread=<root>&after=<cursor>` | a chat or a thread: stored messages and derived entries merged by time |
| `POST /api/chats/:address/messages` | `{ text, threadRoot?, language? }`; stores the captain's message and, when Xora is addressed, her reply |
| `POST /api/chats/messages/:id/delete` | deletes a stored message; `{ thread: true }` deletes its whole thread |
| `POST /api/chats/direct:xora/clear` | clears the direct chat with Xora |
| `POST /api/chats` | `{ name, projectId? }`; creates a task channel |
| `POST /api/chats/:address/rename`, `POST /api/chats/:address/archive` | rename or archive a task channel |
| `GET /api/chats/messages/:id` | one message with its address, for a link preview |

- `POST /api/assistant/message` with `{ text }` (the old input bar) is replaced by the chat route; the setup prompts keep their routes.
- The client polls every 5 seconds while a chat is open (RFC-010 section 6). No push.
- Exact payloads are documented in `APP.md` with the implementation.

### 7. Export

- Workspace export format version 4 with the sections `chats` (including task channels), `chatMessages`, and `chatMessageReferences` (ADR-003 rules). Deleted messages are exported without text. The decisions channel is derived and not exported.
- The reader accepts versions 1 to 3; they restore with no stored messages.

### 8. Tests and documentation

- **Core unit tests:** every rule of section 1, including task channels, archived channels, mentions, and links, including rejected agents, Mission roots of another project, replies to replies, and deletion by an agent.
- **Store and export tests:** migration, round trip with version 4, restore of a version 3 document.
- **Server tests:** each route, request protection, the read-only workspace without `008_chat`, derived entries for the ship channel and a Mission thread, the first Mission in the direct chat with the Milestone 13 writes unchanged.
- **Playwright end-to-end tests** in script mode: from the end of the setup to the bridge, the first Mission in Xora's direct chat and its thread, answering in the thread, the three hints, writing in a channel with and without `@Xora`, the decisions channel jumping to an open question, a message link preview and jump, creating and archiving a task channel, deleting a message, and the narrow layout.
- **Manual check** on Windows by the decision owner: the bridge in both languages, after a fresh setup and with an existing workspace.
- **Documentation:** `APP.md`, `CLI.md` (migration `008_chat`, export version 4), `EXPORT-API.md`, RFC-011 (milestone 4 implemented), the RFC index, `open-questions.md`, and `AGENTS.md` (milestone list).

### 9. Delivery

Three pull requests:

1. Core module, migration, store, export version 4, with their tests.
2. Chat routes, the bridge layout, Xora's replies as messages, deletion, with server and Playwright tests.
3. The first Mission in Xora's direct chat, the three hints and the next-step proposal, the remaining Playwright tests, and the documentation.

## Choices made in this document

These follow from Amendment 2 and ADR-007 but were not decided there. The decision owner can change any of them before merging:

- **The bridge is a new start screen** at `/bridge`; the Mission overview and Mission Detail stay unchanged and reachable.
- **Chat addresses** are `ship`, `project:<id>`, and `direct:xora`.
- **The first-Mission offer is a pinned guide**, not chat history; its state stays in the setup settings, as in Milestone 14.
- **The three hints** cover the side list, threads, and the input bar; the next step is following the finished Mission in its project channel.
- **No unread markers** in this milestone; counters show only what needs the captain.
- **An unmigrated workspace** shows the bridge read-only with a migration hint instead of migrating it.
- **Messages are limited** to 4,000 characters.
- **Task channels are archived, not deleted;** their messages can be deleted one by one.
- **The decisions channel** replaces the "Needs you" list in the side list.

## Explicit non-scope

- Any language model or model runtime (RFC-011 milestone 3).
- Agents as channel members, pinging agents other than Xora, conversations between models in one thread, crew members, and agent direct chats other than Xora's (multi-agent RFC; the requirements are recorded in ADR-007 Amendment 1).
- Voice input, search, editing messages, unread markers, notifications, and push.
- Topic threads without a Mission in the ship and project channels (ADR-007 open question 3); in Xora's direct chat topic threads are in scope (section 3).
- An export variant without chat (ADR-007 open question 1).
- A CLI command or MCP tool for the chat.
- Restyling Mission Detail.

## Acceptance checks

| Check | Evidence |
|---|---|
| Every Mission has exactly one thread in its project channel, with its events, Attention Request, and Outcome | server tests, Playwright |
| Ship channel entries come only from stored events | server tests |
| Only the captain and Xora write; other agents are rejected | Core unit tests |
| Everything that waits for the captain is in the decisions channel, first in the side list, in red with a counter, and links to its thread | server tests, Playwright |
| Deleted messages keep a marker without text, also in the export | Core and export tests |
| Version 1 to 3 exports restore and show their channels | export and server tests |
| The first Mission runs from Xora's direct chat with the Milestone 13 writes | server tests, Playwright |
| German and English labels have the same keys | `packages/app/test/app.test.ts` |
| Existing behavior is unchanged with `--workspace` | `npm run check`, existing tests |
| Windows check: the bridge in both languages | recorded in the pull request |

## Knowledge, navigation, and documentation effects

- New: this document. RFC-011 links it from its Decision section and Amendment 2; ADR-007 links it from its Implementation section.
- On implementation: the documents listed in section 8.
