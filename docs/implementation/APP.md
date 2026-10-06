# Loxora App (Mission Control)

`@loxora/app` is the product UI (RFC-010). Milestone 11 delivers a **read-only Mission Control** on the real local workspace. Milestone 12 adds the **write path**: with a configured human actor, Missions can be answered, paused, stopped, and resumed in the UI. Milestone 13 (RFC-011) adds the **first-launch setup** in script mode: scenes A4 to C3 (name, ship, logbook folder, orientation) and the first steps D1 to E4 (first project, first Mission, first accepted knowledge), the Xora input bar, and empty states. Milestone 14 (RFC-011 Amendment 1) turns the setup into **one conversation with Xora**: name, ship, logbook, project, and bridge, typed or tapped, and moves the first Mission to the bridge. The Hackathon demo inspector (`WEB-UI.md`) stays frozen.

## Running it

```sh
npm ci && npm run build
npm run app                                   # settings file; setup if there is no workspace
npm run app -- --workspace <dir> --port 4181  # explicit workspace and port, no setup
npm run app -- --actor <your-id>              # write mode as a human workspace actor
```

- **Workspace:**
  - With `--workspace` or `LOXORA_WORKSPACE`, the app uses that workspace and never runs the setup (Milestone 12 behavior).
  - Otherwise it reads the app settings file on every request. While the file has no workspace, or its folder holds none, the app shows the setup at `/setup`. As soon as the workspace exists, Mission Control opens.
- **Never migrates.** If the workspace needs a newer migration, the UI says so. Back up by copying the workspace directory, then run any `loxora` command once.
- **Human actor** (RFC-010 section 9), in this order:
  1. `--actor`: the app refuses to start if the actor is an `agent:*` id or not listed in `workspace.json` `reviewers`;
  2. the `captain` from the settings file, checked on every request in the same way (Milestone 13).
  - Without either, the app is read-only. The header shows the actor; it cannot be switched in the UI.

## App settings file (Milestone 13)

A per-user JSON file (RFC-011 section 3). It holds no secrets and no project knowledge.

| Platform | Location |
|---|---|
| `LOXORA_HOME` set (tests) | `<LOXORA_HOME>/.loxora/settings.json` |
| Windows | `%APPDATA%\Loxora\settings.json` |
| Other systems | `$XDG_CONFIG_HOME/loxora/settings.json`, else `<home>/.config/loxora/settings.json` |

| Field | Meaning |
|---|---|
| `configVersion` | `1` |
| `displayName` | how Xora addresses the person |
| `captain` | the human actor id, derived from the name (`Alex Müller` becomes `alex-mueller`) |
| `workspacePath` | absolute path of the logbook; the CLI reads it as resolution step 3 (`CLI.md`) |
| `language` | `de` or `en`; absent means the browser's language |
| `xora` | `{ "state": "not_installed" }` |
| `setup` | the answers (`shipName`, `logbookPath`) until the workspace exists; the ids the project and the first Mission wrote (`purpose`, `projectId`, `spaceIds`, `collectionId`, `missionId`, `sourceId`, `evidenceId`, `proposalId`), so a repeated step continues instead of duplicating; `completedAt` once the setup conversation ended on the bridge; `firstMissionDismissedAt` once the first Mission offer was dismissed. `introducedAt` (Milestone 13) is no longer written but still read. |

- Writes are atomic (a temporary file, then a rename).
- An invalid file or an unknown `configVersion` is never overwritten. The app then shows that the file needs attention and acts on nothing.

## Setup (Milestones 13 and 14)

The setup is one conversation with Xora in script mode (RFC-011 Amendment 1, Milestone 14). Every text is fixed, in German and English. Every answer can be typed into the input bar below the conversation, and every answer except the name can also be tapped. Beside the conversation: Xora's picture (its provenance is recorded in `packages/app/src/web/public/xora/PROVENANCE.md`), her status, and the ship terms ("Bordbegriffe") the conversation has used so far.

| Part | What happens |
|---|---|
| Start screen | "Establishing connection to the command center" with one line per state the server reported: ship computer ready, logbook found or not created yet, Xora online in script mode. Xora's picture is dimmed until the conversation starts. If the server cannot be reached, the app says so and offers to connect again. |
| Name | Xora introduces herself and explains "captain". If the name gives no usable id, she asks for a short name. |
| Existing ship | If the CLI default workspace or the settings file has one, Xora offers to open it in place. The captain must be one of its reviewers; with several, the person picks themselves. |
| Ship | "Nova", "Aurora", "Kepler", or any typed name. It becomes `workspace.json` `name`. |
| Logbook | `Documents › Loxora` by default (on Windows the real Documents folder, which may be redirected), the full path under "Details". "That's fine", "Choose another folder", or a typed full path. Warnings for a folder in a Git working tree (refused), a OneDrive folder, and a folder that already holds a logbook (offered for opening). After "That's fine" the workspace is created like `loxora workspace init`, with a new store. |
| Project | "Start a new project", "Add an existing project" (shown, not active: Xora says it comes later and reads no folder), or "Look around first". A new project: one or two typed sentences, which become the purpose unchanged, or "A game", "A website", "Texts or a book" (the Milestone 13 templates), or "Something else" with a typed purpose. Xora suggests a name and the spaces and shows a confirmation card with "Create" and "Change name". |
| Bridge | Xora explains bridge, Mission, and crew. "To the bridge" ends the setup (`completedAt`) and opens Mission Control. |

- **Not understood.** A typed answer the keyword list cannot place, or that fits more than one button, gets "I don't understand that yet, I'm still in script mode. Just tap one of the answers." and the same buttons again. Name, ship name, folder path, plan description, and project name accept any text.
- **Keyword list** (`packages/app/src/shared/conversation.ts`): fixed per language; answers are compared in lower case, with umlauts as ae, oe, ue, ss, without accents and punctuation; keywords match whole words or word stems. A plan description is placed under the game, website, or writing template by keyword, otherwise "other". Buttons send their key, never their text.
- **Resume.** A reload continues at the current step; the conversation is rebuilt from the stored answers. The transcript is not stored. Earlier messages keep the language they were shown in.
- **First Mission on the bridge.** While a project created by the setup exists and its first Mission is not finished, Mission Control offers it in a banner and in the empty Mission list. "First mission" opens `/first-steps` with the Milestone 13 steps E1 to E4 (start the Mission "Record the project goal", answer it in Mission Detail, accept the project goal, two hints). "Not now" dismisses the offer for good.
- **Writes** (Milestone 13 section 7): the project, spaces, collection, Mission, source, evidence, and proposal are written as `agent:xora`; the answer and the review are the captain's. Each write runs only after the person confirmed the card that shows it.
- **Xora input bar:** at the bottom of every Mission Control screen. In script mode every message gets one fixed answer: Xora is not on board in this version yet, and what works today. Messages are not stored or logged.
- **Empty states:** a section without content shows one sentence and one button; the button opens the input bar with the fixed answer for that topic (for the Mission list: how Missions are created today).

### Setup API

All `POST` routes need the same request protection as the write API below. The setup routes answer 409 outside setup mode.

| Route | Body | Effect |
|---|---|---|
| `GET /api/setup` | | `{ mode }` with `fixed`, `ready`, `setup`, or `settingsError`. In setup mode also `step` (`name`, `ship`, or `logbook`), `boot` (`shipComputer`: `ready`, `logbook`: `found` or `notCreated`, `xora`: `scriptMode`), `answers`, `existing`, `logbook` (path, `documentsPath`, `inRepository`, `oneDrive`, `hasWorkspace`, and the human `reviewers` of a logbook found there), and `xora`. In ready mode `step` (`project`, `bridge`, or `null` once the setup ended), while not null also `answers` and `boot`, and `firstSteps` (`pending`: the first Mission is offered; `stage`: `goal`, `mission`, `answer`, `record`, or `hints`; `projectId`, `purpose`, `missionId`, `answer`) |
| `POST /api/setup/answers` | `{ name?, captain?, shipName?, logbookPath? }` | stores answers; 400 `CaptainNeeded` when no id can be derived |
| `POST /api/setup/workspace` | `{ action: "create" }` or `{ action: "open", path, captain? }` | creates the workspace in the chosen folder (400 `InRepository`, 409 `WorkspaceExists` or `FolderInUse`) or opens an existing one without migrating it |
| `POST /api/setup/finish` | `{ skipped?: boolean }` | ends the setup conversation (`setup.completedAt`, kept if already set); `skipped: true` also dismisses the first Mission offer (`setup.firstMissionDismissedAt`); 409 `NotReady` before the workspace exists. `POST /api/setup/intro` (Milestone 13) is removed. |
| `POST /api/assistant/message` | `{ prompt, choice }` or `{ prompt, text }`, `{ text, topic? }`, or `{ choice, … }`, each with `language?` | asks the assistant; never writes. A setup answer (`prompt`: a prompt key of `shared/conversation.ts`) returns `{ prompt, choice?, value?, goal?, choices, terms }`, or `reply: "notUnderstood"` when the keyword list cannot place the text; an unknown prompt or a choice that is not one of the prompt's buttons is 400. `text` alone (the input bar) returns `{ reply }`, a fixed reply key. `choice` is `goal` (`goal`: `game`, `website`, `writing`, or `other`; `projectName`; `purpose`, required for `other`, otherwise replacing the template's purpose), `firstMission`, or `goalText` (`text`) and returns `{ action }`: the proposed action with its `id` and exactly what will be written. These choices need ready mode (409 `NotReady`) and a human actor (403 `ReadOnly`) |
| `POST /api/assistant/confirm` | `{ actionId, confirm }` | `confirm: true` executes the pending action, `false` discards it; returns `{ confirmed, firstSteps }`. 404 `UnknownAction` for an unknown, used, or expired id (pending actions live 30 minutes, in memory); 409 `WrongStep` when the action is not due; `SetupFinished` for the project after the setup ended, and for the first Mission after its offer was dismissed |
| `GET /api/settings` | | `{ available, language }` |
| `POST /api/settings/language` | `{ language: "de" \| "en" \| null }` | stores the language |

- An unreadable settings file answers 503 `SettingsUnreadable` on every write.
- Only a workspace the setup creates in a folder without one gets a new store with migrations; an existing workspace is never migrated by the app.

## Read API

The server binds to `127.0.0.1`, serves the web client and `/api` from one origin, and enables no CORS.

| Route | Content |
|---|---|
| `GET /api/workspace` | `{ name, reviewers, actor, actorSource, readOnly, setupComplete }`; `actor` is `null` and `readOnly` is `true` without a valid actor; `actorSource` is `flag` or `settings` |
| `GET /api/projects` | `[{ id, name }]` |
| `GET /api/missions?filter=all\|running\|limit\|input\|completed\|failed&project=` | `{ counts, missions }`: counts per filter; Missions sorted by need for attention |
| `GET /api/missions/:id` | Mission detail: state, Wait Reason, Attention Request, Outcome with live Proposal status, references with Node keys and plan status; `availableActions`: the write actions the configured actor may offer (empty without `--actor`) |
| `GET /api/missions/:id/events` | Mission Events |

- **Status codes:** 400 for an invalid filter, 404 for an unknown Mission or route, 405 for a non-GET request outside the write routes, 503 for a missing or outdated workspace, or while the setup has no workspace yet.
- **Response content:** never SQL, stacks, or absolute paths, except the workspace directory printed by the start command.

## Write API (Milestone 12)

| Route | Body | Core operation |
|---|---|---|
| `POST /api/missions/:id/answer` | `{ sequence, response, decision? }` | `answerAttentionRequest`; `decision` is `approve` or `reject`, required for `needs_approval` |
| `POST /api/missions/:id/pause` | `{ sequence, reason? }` | `pauseMission` |
| `POST /api/missions/:id/cancel` | `{ sequence, reason }` | `cancelMission` |
| `POST /api/missions/:id/resume` | `{ sequence }` | `resumeMission` |

- **Actor:** the server assigns the configured actor to every write; the browser never sends one.
- **Available actions** (`availableActions`): `answer` while an Attention Request is open; `pause` and `cancel` where the Core transition table allows them; `resume` for `provider_limit`, after an answer, or when paused. Core validates every write again.
- **Stale state:** `sequence` is the Mission sequence the page showed. Core applies the write only at exactly that sequence (`expectedSequence`, atomic in the store). A changed Mission answers 409 and nothing is written.
- **Request protection:** every write needs `Content-Type: application/json`, an `Origin` equal to the app's own origin, a `Host` of `127.0.0.1:<port>` or `localhost:<port>`, and a body under 16 KB. Otherwise it is rejected (403, 413, or 415) before the workspace is opened. This guards against other pages in the browser and DNS rebinding; it is not authentication.
- **Status codes:** 200 with the updated Mission detail; 400 invalid input or a write Core refuses; 403 read-only mode, a foreign origin or host, or an action not available; 404 unknown Mission; 409 stale sequence; 413 body too large; 415 not JSON; 503 missing or outdated workspace.
- **Never migrates:** writes open the workspace writable but without migrations, and require `007_missions` like reads.
- **Not in the UI:** creating, starting, completing, or failing Missions, evidence on answers, and reviewing Proposals. Use the CLI. The only exception is the first Mission and the first proposal of the setup (above).

## Language

The UI is available in German and English (RFC-010, Amendment 1). All UI text lives in `src/web/labels.ts`, with one entry per language for the same keys; a test checks that both languages have the same keys.

- **Default:** German if the browser's first preferred language is German, English otherwise.
- **Switch:** the DE/EN buttons in the top bar, also during the setup. Since Milestone 13 the choice is stored in the app settings file, not in the workspace, because it belongs to the person and not to the project knowledge. A choice that Milestones 11 and 12 stored in the browser (`localStorage`) is used and imported once when the settings file has none.
- **Not translated:** Mission content written by agents and people, error messages from the read API, and CLI commands.

## Filters

| Filter (German / English) | Missions |
|---|---|
| Alle / All | all |
| Läuft / Running | `running` |
| Wartet / Waiting | `waiting` + `provider_limit` |
| Benötigt Input / Needs input | `waiting` + `needs_input`, `needs_approval`, `needs_permission`, `needs_manual_action` |
| Abgeschlossen / Completed | `completed` |
| Fehlgeschlagen / Failed | `failed` |

## What is shown, and what is not

- **Shown:**
  - title, Project, role, status, start time, and last activity;
  - current activity;
  - the provider-limit panel with the next window and "nothing resumes automatically";
  - the decision panel with question, rationale, options, and consequences, plus the CLI command to answer;
  - the completion panel with outputs, validations, decisions, Proposals and their review state, and log references (flagged when not portable);
  - the timeline and referenced Nodes (with keys) and plans;
  - technical details behind a disclosure.
- **Write mode only:** option buttons and a free-text answer (Approve and Reject for `needs_approval`), and Pause, Stop, and Resume in the Mission header. Stop asks for a reason and a confirmation. The CLI hints for answering and resuming are hidden while the UI offers the action.
- **Not shown,** because there is no data source yet (RFC-010 section 5): steps and checklist, crew panel, chat, costs and limit percentage, and the automatic-continuation toggle.

## Guarantees

- Server-authoritative state: the browser derives no states, permissions, or transitions.
- Boundary test: the web client imports no Core, SQLite, CLI, MCP, Node, or server code.
- The setup conversation's prompts and keyword list live in `src/shared/conversation.ts`, which imports nothing; the server and the web client both use it.
- Typefaces: Orbitron (headings, buttons), Exo 2 (text), and Share Tech Mono (labels), all under the SIL Open Font License 1.1, are bundled from their Fontsource packages and never loaded from the internet. The license texts are served with the web client under `fonts/` (`packages/app/src/web/public/fonts/`).
- Accessibility:
  - skip link and visible keyboard focus;
  - status as text and color;
  - semantic regions and labels; new messages of the setup conversation are announced politely;
  - the only animation, the start screen of the setup, is off with reduced motion.

## Tests

- `packages/app/test/app.test.ts` and `setup.test.ts` (in `npm test`): read and write API, setup, the keyword list, first steps and the first Mission offer, assistant routes, request protection, label parity.
- `packages/app/e2e/setup.spec.ts` (Playwright, `npm run test:app:e2e`): the setup in German by tapping (apart from the name) through the first Mission from the bridge, with requests to other hosts blocked to show the typefaces are bundled; in English by typing, with "Change name", a not-understood reply, and dismissing the offer; "Look around first" with the inactive "Add an existing project"; a not-understood reply and a resumed setup; and opening an existing workspace. Each test starts its own server with a temporary `LOXORA_HOME`; the real user folders are never touched. CI runs it as "App end-to-end (Playwright)".
