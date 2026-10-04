# Milestone 13: First-launch setup in script mode

**Status:** Proposed — awaiting the decision owner's approval
**Decision Owner:** Ocomic
**Change class:** C2 (RFC-008): new HTTP routes, a new per-user settings file, a changed CLI workspace resolution, and a new UI surface
**Implements:** RFC-011 section 12, milestone 2 (sections 1 to 4, 6 to 9, without a model)

## Authorization

- RFC-011 was accepted by Ocomic on October 4, 2026. Its decision authorizes one milestone document per milestone in section 12; each milestone starts only when its document is merged.
- Milestone 12 (RFC-011 milestone 1, the UI write path) is merged (pull request #29). RFC-011 says milestone 2 can start as soon as milestone 1 is done.
- Merging this document authorizes the implementation described here and nothing beyond it. The C3 items of RFC-011 section 11 (which model ships, installer distribution, anything that downloads or sends data) stay out of scope.

## Goal

A person starts `@loxora/app` without a workspace and is guided, in German or English, from the first screen to a project with a first Mission and a first accepted piece of knowledge, without a language model and without the CLI.

Everything Xora would say is a fixed text in this milestone (script mode, RFC-011 section 2). Script mode stays the fallback and the deterministic stub for tests when milestone 3 adds a local model.

## Authorized scope

### 1. App settings file (RFC-011 section 3)

A per-user JSON file, read and written only by `@loxora/app` (the CLI only reads `workspacePath`, see section 2).

| Platform | Location |
|---|---|
| `LOXORA_HOME` set (tests) | `<LOXORA_HOME>/.loxora/settings.json` |
| Windows | `%APPDATA%\Loxora\settings.json` |
| Other systems | `$XDG_CONFIG_HOME/loxora/settings.json`, else `<home>/.config/loxora/settings.json` |

Content, version 1:

| Field | Meaning |
|---|---|
| `configVersion` | `1` |
| `displayName` | how Xora addresses the person (answer B1) |
| `captain` | the human actor id derived from the name; a reviewer of the workspace |
| `workspacePath` | absolute path of the logbook (answer B3, or the opened existing workspace) |
| `language` | `de`, `en`, or absent (follow the system language) |
| `xora` | `{ "state": "not_installed" }` in this milestone; milestone 3 adds the model states |
| `setup` | progress of an unfinished setup (current step, ids of what it already created) and `completedAt` once done |

Rules:

- The file holds no secrets and no project knowledge. Answers that belong to the workspace (ship name, captain as reviewer) go to `workspace.json` (RFC-011 section 3).
- Writes are atomic (temporary file, then rename).
- An unreadable file or an unknown `configVersion` is never overwritten: the app shows that the settings file needs attention and stays read-only.
- The hardware profile is not recorded in this milestone; it arrives with the installer (milestone 5).

### 2. Workspace resolution (RFC-011 section 4)

The shared resolution in `@loxora/cli`, used by the CLI and the app, becomes:

1. `--workspace`
2. `LOXORA_WORKSPACE`
3. **`workspacePath` from the app settings file, if the file exists and has one (new)**
4. `<home>/.loxora/workspaces/default`

- The CLI only reads the settings file and never writes it. CLI write commands still need `--actor` or `LOXORA_ACTOR`; the captain is not a CLI default.
- Without a settings file, CLI behavior is unchanged.
- This changes the CLI contract defined in ADR-004. The implementing pull request adds an amendment note to ADR-004 pointing to RFC-011 section 4, and documents the step in `CLI.md`.

### 3. Setup mode and the human actor

When the app starts **without** `--workspace` and `LOXORA_WORKSPACE`, it decides per request:

- **Setup mode** when the settings file is missing, has no completed setup, or points to a folder without a workspace. The browser shows `/setup`.
- **Normal mode** (Mission Control) when the setup is complete and the workspace exists.

With `--workspace` or `LOXORA_WORKSPACE`, the app behaves exactly as in Milestone 12 (no setup, `--actor` for write mode). This keeps the developer path and the existing tests unchanged.

**Second actor resolver (RFC-010 section 9, "a local Loxora user profile").** In normal mode the human actor is, in this order:

1. `--actor`, checked at start as in Milestone 12;
2. the `captain` from the settings file, checked on every request: not `agent:*` and listed in `workspace.json` `reviewers`.

If neither applies, the app is read-only, as today. The header still shows the active actor. The browser never sends an actor id.

### 4. The flow (RFC-011 section 1, dialog script scenes A4 to E4)

All texts are fixed and live in the label module in German and English. One question per screen, visible progress, Back on every screen, every question answerable by clicking. Each metaphor term (ship, logbook, bridge, crew, Mission) is explained in half a sentence where it first appears.

| Scene | In this milestone |
|---|---|
| A4 Systems start | Status list with real states: ship computer (server) ready; logbook found or not yet created; Xora "not on board in this version". No invented progress. |
| B0 Existing ship | Offered when the settings file or the CLI default (step 3 or 4 of the resolution) has a workspace. "Open this ship" opens it **in place** (no move; RFC-011 open question 7 stays open). The captain is the only reviewer, or the person picks themselves from the reviewers. Then on to C. |
| B1 Name | Text field. Stores `displayName` and derives `captain` (section 5). |
| B2 Ship name | Buttons "Nova", "Aurora", or own text. Stored as `workspace.json` `name`. |
| B3 Logbook location | Default shown as "Documents › Loxora" (German "Dokumente › Loxora"), the full path under Details (section 6). "Choose another folder" opens a path field. Then the workspace is created. |
| C2 Orientation | The three fixed orientation sentences of the dialog script, one at a time. |
| C3 Script mode | Fixed text with the reason "Xora is not on board in this version yet", saying that setup continues with fixed choices. No retry button, because there is no model to start. |
| D1 Goal | Buttons "Develop a game", "Build a website", "Write texts or a book", "Something else" (text field, stored unchanged as the purpose). Each button has a fixed project name suggestion, purpose, three knowledge spaces, and the stations as one sentence (stations are not stored, RFC-011 section 8). |
| D2 Project | Name: suggestion or own text. Then **one** confirmation card that lists exactly what will be written: the project with purpose, three spaces, and the collection "Project goal" in the first space (RFC-011 section 7). |
| E1 First Mission | Confirmation card "I start the Mission 'Record the project goal'". On confirm the Mission is created, started, and set to waiting with the question "Who is the project for?" and the three options of the dialog script, each with its consequence. |
| E2 Decision | The person answers in Mission Detail with the Milestone 12 answer form. A setup banner leads back into the setup. |
| E3 Goal | Script mode: a text field with a template built from the purpose and the answer. "Accept" makes it Current knowledge (section 7). |
| E4 Bridge | Short hints only for elements that exist: the input bar at the bottom, the Mission list ("red means I need you"). No bridge visualizer hint (milestone 4). A fixed closing sentence says what works today and that Xora will suggest next steps once she is on board. |

- Every step can be skipped. Skipping B0 to B3 is not possible, because without a workspace nothing else works; D and E can be skipped, and the setup then ends on an empty Mission Control.
- An interrupted setup continues where it stopped on the next start, using `setup` in the settings file.

### 5. Captain id

- Derived from the name: lower case, `ä ö ü ß` written as `ae oe ue ss`, other letters and digits kept, spaces and other characters become `-`, at most 40 characters. "Alex Müller" becomes `alex-mueller`.
- If nothing usable is left, or the result starts with `agent`, the person is asked for a short name.
- For a new workspace the captain becomes its only reviewer. For an existing workspace the captain must already be one of its reviewers; `workspace.json` is not changed.

### 6. Logbook location

- Default: the user's Documents folder plus `Loxora`. On Windows the app asks the system for the real Documents folder (it can be redirected, for example to OneDrive); if that fails, it uses `<home>\Documents`. Elsewhere `<home>/Documents`.
- **OneDrive hint.** If the chosen folder is inside a OneDrive folder, the setup says in one sentence that the logbook would then be synchronized to the cloud by OneDrive, and offers another folder. Loxora itself sends nothing; the person decides.
- The same guards as `loxora workspace init`: refused inside a Git working tree (dialog script text "This folder belongs to a code project …"), and an existing workspace in that folder is offered for opening instead.
- A native folder picker is not part of this milestone; it depends on the packaging decision (RFC-011 open question 1).

### 7. Writes during setup

The setup writes only through existing Core operations and policies (RFC-011 section 6). Each write happens after the person confirms a card that shows what will be written.

| Step | Actor | Core operations |
|---|---|---|
| B3 create the workspace | — (settings, `workspace.json`) | as `workspace init`; then a **new, empty** store is created with all migrations |
| D2 project | `agent:xora` | `createProject`, `createKnowledgeSpace` ×3, `createKnowledgeCollection` |
| E1 Mission | `agent:xora` | `createMission`, `startMission`, `waitMission` (needs_input with question and options) |
| E2 answer | captain | `answerAttentionRequest` (Milestone 12 route) |
| E3 accept | `agent:xora`, then the captain | `resumeMission`; `registerSourceReference` (the setup conversation, kind `setup`); `registerEvidenceReference` (the answer, locator: the Mission id); `submitKnowledgeProposal` titled "Project goal"; `completeMission` with the proposal as Outcome; then `reviewKnowledgeProposal` "Accepted" by the captain with the proposal's Evidence |

- **Xora's actor in script mode.** Setup actions are attributed to `agent:xora` in script mode as well, so the path, the audit trail, and the tests are the same when milestone 3 adds the model, and the first knowledge is still reviewed by a human who is not its proposer.
- **The app creates a database only for a new workspace.** Milestones 11 and 12 never migrate. This milestone keeps that for every existing workspace (an outdated one still answers with the existing guidance); only a workspace that the setup has just created in an empty folder gets a fresh store.
- **Several operations per click.** Core has no transaction across operations. If one fails midway, the ids already created are kept in `setup`, and repeating the step continues from there instead of creating duplicates.

### 8. Assistant capability and the input bar (RFC-011 sections 5 and 8)

- `@loxora/app` gets the narrow `Assistant` interface and its first implementation, `ScriptedAssistant`. An assistant only returns text, choices, and at most one **proposed action**. It never writes.
- Proposed actions form a closed list: `createProject`, `startFirstMission`, `recordGoal`. The server validates them, keeps them pending in memory, and executes one only when the person confirms it. Unknown or expired action ids are refused.
- **Xora input bar** at the bottom of every screen in normal mode. In script mode it answers every message with one fixed text: Xora is not on board in this version yet, and what the person can do today. Messages are not stored or logged.
- **Empty states** for sections without content, with one sentence and one button. In script mode the button opens the input bar with the fixed answer for that topic.
- No Core change; no model code.

### 9. Routes

All routes keep the Milestone 12 request protection (127.0.0.1, `Origin`, `Host`, JSON content type, 16 KB limit). The setup routes exist only in setup mode; the assistant and settings routes in both modes.

| Route | Purpose |
|---|---|
| `GET /api/setup` | mode, current step, existing workspace if found, default logbook location (display text and full path), OneDrive and Git hints, Xora state, answers so far |
| `POST /api/setup/answers` | store `name`, `shipName`, `logbookPath` (validated; Back can change them) |
| `POST /api/setup/workspace` | `{ "action": "create" }` or `{ "action": "open", "captain"? }` |
| `POST /api/setup/finish` | `{ "skipped"?: true }` marks the setup complete |
| `POST /api/assistant/message` | `{ "text" }` or `{ "choice" }` with the setup context; returns the reply, choices, and a proposed action if any |
| `POST /api/assistant/confirm` | `{ "actionId", "confirm": true \| false }` |
| `POST /api/settings/language` | `{ "language": "de" \| "en" \| null }` |

- `GET /api/workspace` additionally reports `setupComplete` and where the actor came from (`flag` or `settings`).
- Errors follow Milestone 12: 400, 403, 404, 409, 413, 415, 503, without SQL, stacks, or absolute paths beyond the logbook path the person chose.
- Exact payloads are documented in `APP.md` with the implementation.

### 10. Language

- The language moves from browser storage to the settings file (RFC-011 section 3), so Xora can use it from milestone 3 on. Without a stored choice the UI follows the browser's language, as today.
- The DE/EN switch stays visible on every screen, including the setup, and applies at once.
- All new fixed texts are in the label module in German and English; the label parity test covers them.

### 11. Tests and documentation

- **Unit and server tests:**
  - settings file: locations, atomic write, unknown version not overwritten;
  - resolution order with and without a settings file (CLI tests);
  - captain id derivation, including umlauts and unusable names;
  - setup mode versus normal mode, and the unchanged behavior with `--workspace`;
  - the settings actor resolver: an agent id or a non-reviewer captain leaves the app read-only;
  - workspace creation: Git guard, existing workspace, new store only for a new workspace, no migration of an existing one;
  - each proposed action executes only after confirmation and only once; a repeated step after a failure creates no duplicates;
  - the full setup result: project, three spaces, collection, Mission completed with the proposal as Outcome, Current knowledge accepted by the captain, every write attributed to the actor in section 7.
- **Playwright end-to-end tests** for `@loxora/app` in script mode: the full flow in German, the full flow in English, opening an existing workspace, and skipping D and E. They run with a temporary `LOXORA_HOME` and never touch the real user folders. CI gets a job "App end-to-end (Playwright)" next to the demo job.
- **Manual check** on Windows by the decision owner (the first target platform): Documents location, OneDrive hint if applicable, and the whole flow in both languages. Recorded in the pull request.
- **Documentation:** `APP.md` (setup mode, settings file, routes, actor resolution), `CLI.md` and an amendment note in ADR-004 (resolution step 3), RFC-011 (milestone 2 implemented), the RFC index, `open-questions.md`, and `AGENTS.md` (milestone list).

### 12. Delivery

Two pull requests, so each stays reviewable:

1. Settings file, resolution step, settings actor resolver, language in settings, setup mode with scenes A4 to C3 and workspace creation or opening.
2. Assistant interface and `ScriptedAssistant`, confirmation cards, scenes D1 to E4, input bar, empty states, Playwright tests, and the CI job.

## Choices made in this document

These follow from RFC-011 but were not decided there. The decision owner can change any of them before merging:

- **Display name** lives only in the settings file (RFC-011 open question 3); `workspace.json` is unchanged.
- **An existing workspace is opened in place** and not moved to Documents (open question 7 stays open for a later move offer).
- **Setup actions use `agent:xora`** in script mode too (section 7).
- **Setup only without `--workspace`**: developers and tests that pass a workspace keep the Milestone 12 behavior.
- **OneDrive hint** instead of silently placing the logbook in a synchronized folder.

## Explicit non-scope

- Any language model, model runtime, hardware check, memory threshold, or wait time before script mode (milestone 3, with an ADR and the model evaluation).
- The 2D bridge visualizer (milestone 4) and the installer, packaging, and a native folder picker (milestone 5).
- Moving an existing workspace, renaming a ship, or changing reviewers in the UI.
- Creating further Missions, projects, or knowledge outside the setup flow; general proposal review in the UI.
- CLI defaults from the settings file other than the workspace path.
- Storing stations or crew data.
- Authentication, multiple users, remote access.

## Acceptance checks

| Check | Evidence |
|---|---|
| Without a workspace, the app opens the setup; with `--workspace` it behaves as in Milestone 12 | server tests |
| The CLI finds the logbook through the settings file and is unchanged without one | `packages/cli/test/cli.test.ts` |
| After setup the captain acts without `--actor`; an invalid captain leaves the app read-only | server tests |
| The setup creates exactly the workspace, project, spaces, collection, Mission, proposal, and accepted revision listed in section 7, with the listed actors | server tests |
| No write happens without a confirmed card; a repeated step creates no duplicates | server tests |
| An existing workspace is never migrated by the app | server tests |
| The full flow works in German and in English, by clicking only | Playwright |
| German and English labels have the same keys | `packages/app/test/app.test.ts` |
| Existing behavior is unchanged | `npm run check`, demo end-to-end tests |
| Windows check: Documents location and the whole flow | recorded in the pull request |

## Knowledge, navigation, and documentation effects

- New: this document; on implementation, the settings file format and the setup routes in `APP.md`.
- RFC-011 links this document as its second milestone document.
- On implementation: `CLI.md`, the ADR-004 amendment note, RFC-011, the RFC index, `open-questions.md`, and `AGENTS.md`.
