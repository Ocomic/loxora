# Loxora App (Mission Control)

`@loxora/app` is the product UI (RFC-010). Milestone 11 delivers a **read-only Mission Control** on the real local workspace. Milestone 12 adds the **write path**: with a configured human actor, Missions can be answered, paused, stopped, and resumed in the UI. Milestone 13 (RFC-011) adds the **first-launch setup** in script mode; its first part, delivered so far, covers scenes A4 to C3 (name, ship, logbook folder, orientation). The Hackathon demo inspector (`WEB-UI.md`) stays frozen.

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
| `setup` | the answers of part B until the workspace exists; `introducedAt` once the orientation (C2, C3) was shown to the end; `completedAt` once the first steps (parts D and E) are done or skipped |

- Writes are atomic (a temporary file, then a rename).
- An invalid file or an unknown `configVersion` is never overwritten. The app then shows that the file needs attention and acts on nothing.

## Setup (Milestone 13)

The setup follows the dialog script of RFC-011 in script mode: every text is fixed, in German and English, and every question can be answered by clicking.

| Scene | What happens |
|---|---|
| A4 | "Ship systems" beside every screen: ship computer ready, logbook found or not yet created, Xora not on board in this version. |
| B0 | If the CLI default workspace exists, it is offered and opened in place. With several reviewers the person picks themselves. |
| B1 | Name. If it gives no usable id, the person is asked for a short name. |
| B2 | Ship name: "Nova", "Aurora", or own text. It becomes `workspace.json` `name`. |
| B3 | Logbook folder: `Documents › Loxora` by default (on Windows the real Documents folder, which may be redirected), or a typed full path. Warnings for a folder in a Git working tree (refused), a OneDrive folder, and a folder that already holds a logbook (offered for opening). Then the workspace is created like `loxora workspace init`, with a new store. |
| C2, C3 | The three orientation sentences, then the note that Xora is not on board in this version yet. "To the bridge" opens Mission Control. A reload before that returns to the orientation instead of skipping it. |

Parts D and E (first project and first Mission) follow in the second part of Milestone 13. Until then they stay pending and Mission Control is fully usable.

### Setup API

All `POST` routes need the same request protection as the write API below. The setup routes answer 409 outside setup mode.

| Route | Body | Effect |
|---|---|---|
| `GET /api/setup` | | `{ mode }` with `fixed`, `ready`, `setup`, or `settingsError`; in setup mode also `answers`, `existing`, `logbook` (path, `documentsPath`, `inRepository`, `oneDrive`, `hasWorkspace`, and the human `reviewers` of a logbook found there), and `xora`; in ready mode `introPending` |
| `POST /api/setup/answers` | `{ name?, captain?, shipName?, logbookPath? }` | stores answers; 400 `CaptainNeeded` when no id can be derived |
| `POST /api/setup/workspace` | `{ action: "create" }` or `{ action: "open", path, captain? }` | creates the workspace in the chosen folder (400 `InRepository`, 409 `WorkspaceExists` or `FolderInUse`) or opens an existing one without migrating it |
| `POST /api/setup/intro` | `{}` | records that the orientation was shown to the end; 409 `NotReady` before the workspace exists |
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
- **Not in the UI:** creating, starting, completing, or failing Missions, evidence on answers, and reviewing Proposals. Use the CLI.

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
- Accessibility:
  - skip link and visible keyboard focus;
  - status as text and color;
  - semantic regions and labels;
  - no animations.
