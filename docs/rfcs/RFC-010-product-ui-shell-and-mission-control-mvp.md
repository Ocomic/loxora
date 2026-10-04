# RFC-010 — Product UI Shell and Mission Control MVP

**Status:** Accepted
**Version:** 0.3 (Amendment 1)
**Last Updated:** October 4, 2026
**Decision Date:** October 3, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (new UI surface, new package; RFC-008)

## Purpose

This RFC defines the product UI shell that replaces the Hackathon demo inspector as Loxora's user interface. It also defines the first slice, the **Mission Control MVP**: a read-only Mission Control list and Mission Detail view on real workspace data.

It is the decision step "RFC or ADR for the product UI shell and the transition away from the demo inspector" in [`UI-VISION.md`](../planning/UI-VISION.md). It follows RFC-009 (Missions) and ADR-005 / Milestone 10 (mission persistence).

## Context

- **The UI vision** (`UI-VISION.md`) chose Mission Control as the product direction. Missions are execution state, separate from knowledge (RFC-009), and are persisted since Milestone 10.
- **The demo inspector** (`packages/demo`, `WEB-UI.md`) is the only UI today. It is bound to the Hackathon fixture: its server opens the demo database, seeds curated data, and drives a guided jury flow. Its useful patterns are:
  - human-first explanations;
  - progressive disclosure (`TechnicalDetails`, `JsonPanel`);
  - Current, Historical, and Planned labels;
  - Evidence access;
  - server-authoritative state;
  - boundary tests that keep Core, SQLite, and Node out of the browser;
  - accessibility checks.
- **The decision owner's design drafts** (October 2026, private, not part of this repository) are the visual target for the MVP. They show:
  - a stable shell with top navigation (Station, Missions, Crew, Chat, Memory, Settings), search, and notifications;
  - a mission sidebar with status filters and counts, plus active and recent missions;
  - a Mission Detail view with header, status badge, start time, a step progress bar, a current-step panel, a crew panel, a timeline with tabs (Timeline, Agent Chat, Context, Results, Files, Notes), and side panels for actions, project and context, and resources and costs;
  - four Mission Detail states: Running, Codex Limit, Needs Input, and Completed;
  - a dark space-station visual language with crew avatars.
- **Decision owner, October 3, 2026:** take over these designs for the first MVP, and build the product UI as a new package `@loxora/app` (variant A).
- **Decision owner, October 3, 2026 (open question 1):** the first UI write path identifies the human through a workspace actor configured at server start (`--actor`). This is recorded in section 9.

## Problem statement

1. Real workspaces cannot be seen in a UI. The demo only shows its fixture.
2. Missions recorded through the CLI have no visual surface, so "what needs my attention" requires terminal commands.
3. The designs show more than the data model contains today. Without an explicit rule, the UI would either invent data or block on new modeling.

## Goals

- A stable product shell that later sections (Station, Crew, Chat, Memory, Settings) plug into.
- A read-only Mission Control MVP on the real local workspace that follows the designs where data exists.
- No invented data: every visible value comes from Core reads.
- Keep the Hackathon demo intact as a historical proof.
- Keep the demo's architectural guarantees: server-authoritative state, no Core logic in the browser, local-only access, accessibility.

## Non-goals

- Writing through the UI in the MVP: answering Attention Requests, pausing, cancelling, or creating Missions. The CLI stays the write path in the MVP. Section 9 decides how a following write slice identifies the human, so that slice is no longer blocked.
- Station dashboard, Crew, Chat, Memory, Settings, and the "New Mission" and "Context Review" flows.
- Automatic resumption, notifications, budgets and costs, and system telemetry (C3 or later decisions).
- Changes to the mission model (for example Mission Steps or a crew model).
- Prompt-configurable or adaptive UI (`PRODUCT-VISION.md`).
- Hosted or remote access.

## Proposal

### 1. Package and boundaries

- **New package `packages/app` (`@loxora/app`):**
  - a local Node server (`node:http`), bound to `127.0.0.1`, same-origin, no CORS, like the demo server;
  - a React and Vite web client;
  - the same stack as the demo (React 19, Vite, React Router), so its patterns can be reused.
- **Data source:** the real workspace, resolved like the CLI: `--workspace`, `LOXORA_WORKSPACE`, then `<home>/.loxora/workspaces/default`. The workspace resolution is reused from `@loxora/cli`.
- **Read-only store:**
  - the server opens the workspace read-only, requires migration `007_missions`, and **never runs migrations**;
  - an outdated workspace gets a clear message to run any CLI command first;
  - this avoids silent migrations through the UI (dogfooding finding R23).
- **Core only:** the server calls only Core reads (`MissionService`, `NavigationService`, `PlannedKnowledgeService`, `ReviewInboxService`). The browser may not import Core, SQLite, Node APIs, or server modules (boundary tests as in the demo).
- **The demo stays as it is:** `packages/demo` keeps working with its E2E tests as the Hackathon proof and gets no new features. Reused components are **copied** into `@loxora/app` and adapted, not imported, so the demo stays frozen.

### 2. Read API (MVP)

| Route | Content (from Core) |
|---|---|
| `GET /api/workspace` | Workspace name, reviewers, schema status (read-only, migration level) |
| `GET /api/projects` | Projects (id, name) for labels and filters |
| `GET /api/missions?project=&state=&reason=&attention=` | Missions with derived `lastActivityAt`, sorted by need for attention as in the CLI, plus counts per status filter |
| `GET /api/missions/:id` | Mission, Attention Request, Outcome with live Proposal status, references with Node keys and titles |
| `GET /api/missions/:id/events` | Mission Events (timeline) |

- Errors follow `LOCAL-APP-API.md`: 400 for validation, 404 for missing records, 503 for an unavailable or outdated workspace.
- Responses never contain SQL, stacks, or absolute paths. External log references are shown as text and never opened.

### 3. Shell (MVP)

- **Top navigation:** the six sections from the designs. In the MVP, only **Missions** is active. The other sections are not shown until they exist, so there are no navigation dead ends (`AGENTS.md`).
- **Header:** workspace name. Search, notifications, and the user menu come later.
- **Missions sidebar**, as designed:
  - status filters with counts;
  - "Active missions" (non-terminal, sorted by need for attention);
  - "Recent missions" (terminal, sorted by last activity).
- **"New Mission" button:** shown only as a hint to the CLI command until writing exists.
- **Labels:** German and English are required (Amendment 1); the shipped app is German only until the English follow-up lands. All UI text is kept in one label module, which will hold one entry per language. German is the language of the designs. Model names (`needs_input`, …) never appear as raw codes in the main view, only in technical details.

### 4. Status mapping

| Design filter or badge | Mission data |
|---|---|
| Läuft | `running` |
| Wartet / Codex Limit | `waiting` + `provider_limit` (badge "Limit erreicht"; capability name as given) |
| Benötigt Input | `waiting` + `needs_input`, `needs_approval`, `needs_permission`, `needs_manual_action` (badge text per reason, for example "Freigabe nötig") |
| Abgeschlossen | `completed` |
| Fehlgeschlagen | `failed` |
| *(not in the designs)* Geplant, Pausiert, Abgebrochen | `queued`, `paused`, `cancelled`. These are shown under "Alle", and added as filters if the decision owner wants. |

### 5. Mission Detail (MVP) — design elements and data

| Design element | MVP | Data source |
|---|---|---|
| Title, project tag, goal text | yes | Mission, owning and referenced Projects |
| Agent/role tag (for example "Codex") | yes, as role | `workerRole`; the actor of the latest event as secondary information |
| Status badge, "started", "running since" | yes | state, Wait Reason, `createdAt`, first `Started` event, `lastActivityAt` |
| Current activity | yes | `currentActivity` |
| **Running:** step progress and checklist | **no** | Mission Steps are not modeled (F5); the current activity is shown instead |
| **Codex Limit:** "Mission safely paused" panel, next window | yes | `waitDetail`, `limitedCapability`, `expectedResumeAt`; text: "nothing resumes automatically" |
| Codex Limit: "automatic continuation" toggle, "another agent can meanwhile …" | **no** | Automatic resumption and orchestration are C3 or not decided |
| **Needs Input:** decision panel with options and consequences | yes, read-only | Attention Request (question, rationale, options, consequences); answer hint: CLI command |
| Needs Input: "choose option" buttons | **no** (MVP) | Needs the write path and UI identity (open question 1) |
| **Completed:** success panel, results, memory suggestions | yes | Outcome (summary, outputs, validations, decisions); Proposals with live review status ("awaiting review" or accepted) |
| Timeline with "Live" | yes | Mission Events; "Live" means polling (section 6) |
| Tabs Agent Chat, Context, Files, Notes | **no** | No data model; Results is part of the Outcome panel |
| Crew panel (agents, context %, tasks) | **no** | No crew model; the role is shown in the header |
| Project & context: Memory Nodes, files, token size | partly | Referenced Nodes (with keys) and plans; no Context Package size, because the Mission–Context Package link is open (ADR-005) |
| Resources & costs (limit %, costs) | **no** | No telemetry or budget model (C3) |
| Mission actions (pause, hand over, stop) | **no** (MVP) | Write path (open question 1) |

**Rule:** elements without a data source are not rendered. There are no placeholders with sample values. Each "no" row is a candidate for a later decision, listed in the open questions.

### 6. Updates

The client polls every 5 seconds while a Mission view is visible. "Live" in the timeline means "updated by polling". Push (SSE or WebSockets) is not introduced until a demonstrated need exists (`AGENTS.md`, avoid premature infrastructure).

### 7. Visual language

- Dark space-station theme with design tokens (colors, spacing, status colors) in one stylesheet.
- Status colors as in the designs: green running/completed, amber limit, red input needed.
- Crew avatars and station illustrations from the design drafts are **not** part of the MVP. Their origin and license must be clarified before they enter a public repository. Neutral icons are used instead.
- Accessibility as in the demo: visible keyboard focus, semantic controls, reduced motion, status shown with text and color, never color alone.

### 8. Transition away from the demo inspector

- The demo inspector is frozen. `WEB-UI.md` stays the documentation of the Hackathon implementation.
- Knowledge views (Project Map, Node, History, Plans, Review Inbox, Evidence, Context) move into `@loxora/app` in later milestones, under "Memory". At that point, the demo is retired from the default developer workflow, but stays runnable for the record.
- The demo's guarantees become requirements of `@loxora/app`: server-authoritative state, boundary tests, accessibility, and progressive disclosure.

### 9. Human actor resolution for UI writes

This section records the decision on open question 1. The Mission Control MVP stays read-only; the decision unblocks the write slice that follows it.

**Identity is not authorization.**
- A `HumanActorResolver` answers only: *which human performs this action?*
- Core and its existing policies answer: *may this actor perform this specific action?* Examples: the human-only rules of ADR-005, and the reviewer gate of ADR-006.
- The UI never derives permissions or valid Mission transitions itself.

**Flow:**

```text
UI → Local App Server → HumanActorResolver → Core (operation + policy)
```

**First resolver: `ConfiguredActorResolver`.**
- `@loxora/app` is started with a known human workspace actor, for example `loxora app --actor <actor>`.
- At start, the server checks that the actor is **not** an `agent:*` id and is a **known human of the workspace**. Today that means listed in `workspace.json` `reviewers`, the only registry of humans. Otherwise the server refuses to start in write mode.
- The server assigns this actor to **every** UI mutation. The browser never sends an actor id.
- **Without a configured actor, `@loxora/app` is fully read-only.** Mutation routes are not offered, and no write actions are shown.
- The UI shows the active actor visibly in the header. It is **not** a switchable dropdown.
- The local UI authenticates no user. As with the CLI's `--actor`, this is a local governance guard, not authentication.

**Allowed actions come from the server.**
- Read responses for a Mission include `availableActions`: for example `answer`, `pause`, `cancel`, and `resume`, each with its options where relevant.
- The server computes them from the Mission's state and the configured actor, using the Core transition table and policies.
- Every mutation is still validated by Core when it is executed.
- If no actor is configured, `availableActions` is empty.

**Buttons in the following write slice:**

| Button | Shown when |
|---|---|
| "Option wählen" | an open Attention Request may be answered by the actor |
| "Pause", "Stoppen" (cancel) | the human-only transition is allowed |
| "Fortsetzen" | resuming is allowed for the current state and Wait Reason |

All of them call the same Core operations as the CLI.

**Adapters, not coupling.**
- `--actor` is only the first resolver. Core does not depend on how the actor was resolved; it only receives an actor id, as it does from the CLI.
- Later resolvers can replace it without changing Core: a local Loxora user profile, a real user or team identity, or optional OS integration.
- **Not used for the MVP:**
  - **OS user mapping:** it couples Loxora to operating-system accounts and does not map cleanly to workspace identities;
  - **free actor selection in the UI:** without authentication it is only a claim of identity and adds little over `--actor`.

## Alternatives considered

### Evolve the demo UI (variant B)

Rejected by the decision owner. It would require untangling the fixture binding and the guided jury flow, and it would break the Hackathon proof and its E2E tests.

### Render the designs with placeholder data

Rejected. Invented values (costs, crew load, steps) contradict "prefer evidence over assumptions" and would make the UI look more capable than the model.

### Write path in the MVP

Deferred to the following write slice. Answering Attention Requests from the UI is the most valuable next step. Section 9 now decides how the human is identified, so the write slice is unblocked.

### Server-sent events for live updates

Deferred until polling proves insufficient.

## Risks and tradeoffs

- **Gap between design and MVP.** The MVP looks sparser than the drafts. Mitigation: the gap table makes each missing element a visible, decidable item, not an accident.
- **Two UIs for a while.** Mitigation: the demo is frozen, and the product UI is the only one that grows.
- **Reading a live database.** The CLI may write while the UI reads. SQLite WAL and read-only connections handle this; the UI always shows server state.

## Security and privacy

- The server binds to `127.0.0.1` only, same-origin, and is read-only in the MVP.
- No secrets, prompts, or logs exist in Missions (ADR-005). External log references are displayed but not opened or followed.
- No data leaves the machine. Remote access, accounts, and notifications are C3 and out of scope.

## Migration and rollback

No data changes. `@loxora/app` reads the existing workspace. Removing the package removes the UI and leaves the workspace and CLI unaffected.

## Implications for existing documents

- `UI-VISION.md`: link this RFC in "Suggested next decision steps".
- `WEB-UI.md`: note that it documents the frozen demo, and point to `@loxora/app`.
- RFC index and cross-references: add RFC-010 (depends on RFC-006, RFC-008, RFC-009; constrains `@loxora/app` and the UI milestones).
- A milestone document (Milestone 11) authorizes the implementation after acceptance.

## Open questions

1. ~~UI identity for writing.~~ **Decided October 3, 2026:** a configured workspace actor at server start (`--actor`); see section 9. Open within that decision: whether a separate list of human workspace actors should exist besides `reviewers`.
2. **Mission Steps.** The designs rely on step progress and checklists. Should RFC-009's Mission Steps be added (F5 revisited), and from which source: agent-reported or derived?
3. **Crew model.** Which agents exist, their role, availability, and load. This needs a capability or agent registry (gated, `PRODUCT-VISION.md`).
4. **Mission ↔ Context Package.** Linking a Mission to the Context Package it used (Memory Nodes, files, token size), still open in ADR-005.
5. **Limits and costs.** Provider limit percentage, next window, and costs need telemetry or budget data (C3: Cost Guard).
6. **Additional filters** for `queued`, `paused`, and `cancelled`.
7. ~~Language.~~ **Decided October 4, 2026:** German and English; see Amendment 1.
8. **Artwork.** Origin and license of avatars and station art before they can be committed.

## Decision

Accepted by Ocomic on October 3, 2026 (pull request #23), including the actor decision in section 9. Section 9 was committed to the pull request after its merge and reached `main` with the Milestone 11 pull request. [Milestone 11](../implementation/MILESTONE-11.md) implements sections 1 to 8.

The acceptance authorizes a milestone document (Milestone 11) for the read-only Mission Control MVP as described in sections 1 to 8. A following small write milestone implements section 9 (configured actor, `availableActions`, and the buttons in its table). It does not authorize the other shell sections or any C3 items. The other open questions remain open.

## Amendments

### Amendment 1 — German and English (October 4, 2026)

Decided by Ocomic. This answers open question 7.

- `@loxora/app` must support German and English. This is a requirement, not yet implemented: once the follow-up below lands, every UI text has an entry for both languages in the label module.
- Planned behavior: the default language follows the system language: German if it is German, English otherwise. The user can switch the language.
- Raw model codes stay out of the main view in both languages, as in section 3.
- Milestone 11 shipped German labels only. Adding the English entries and the language switch is a small follow-up within this RFC; it does not change the data model or the read API.
