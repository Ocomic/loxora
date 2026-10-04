# Loxora App (Mission Control)

`@loxora/app` is the product UI (RFC-010). Milestone 11 delivers a **read-only Mission Control** on the real local workspace. Milestone 12 adds the **write path**: with a configured human actor, Missions can be answered, paused, stopped, and resumed in the UI. The Hackathon demo inspector (`WEB-UI.md`) stays frozen.

## Running it

```sh
npm ci && npm run build
npm run app                                   # default workspace, http://127.0.0.1:4180
npm run app -- --workspace <dir> --port 4181  # explicit workspace and port
npm run app -- --actor <your-id>              # write mode as a human workspace actor
```

- **Workspace:** resolved like the CLI: `--workspace`, `LOXORA_WORKSPACE`, then `<home>/.loxora/workspaces/default`.
- **Never migrates.** If the workspace needs a newer migration, the UI says so. Back up by copying the workspace directory, then run any `loxora` command once.
- **`--actor`** turns on write mode (RFC-010 section 9). The app refuses to start if the actor is an `agent:*` id or not listed in `workspace.json` `reviewers`. The header shows the actor; it cannot be switched in the UI. Without `--actor`, the app is read-only.

## Read API

The server binds to `127.0.0.1`, serves the web client and `/api` from one origin, and enables no CORS.

| Route | Content |
|---|---|
| `GET /api/workspace` | `{ name, reviewers, actor, readOnly }`; `actor` is `null` and `readOnly` is `true` without `--actor` |
| `GET /api/projects` | `[{ id, name }]` |
| `GET /api/missions?filter=all\|running\|limit\|input\|completed\|failed&project=` | `{ counts, missions }`: counts per filter; Missions sorted by need for attention |
| `GET /api/missions/:id` | Mission detail: state, Wait Reason, Attention Request, Outcome with live Proposal status, references with Node keys and plan status; `availableActions`: the write actions the configured actor may offer (empty without `--actor`) |
| `GET /api/missions/:id/events` | Mission Events |

- **Status codes:** 400 for an invalid filter, 404 for an unknown Mission or route, 405 for a non-GET request outside the write routes, 503 for a missing or outdated workspace.
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
- **Stale state:** `sequence` is the Mission sequence the page showed. A changed Mission answers 409 and nothing is written.
- **Request protection:** every write needs `Content-Type: application/json`, an `Origin` equal to the app's own origin, a `Host` of `127.0.0.1:<port>` or `localhost:<port>`, and a body under 16 KB. Otherwise it is rejected (403, 413, or 415) before the workspace is opened. This guards against other pages in the browser and DNS rebinding; it is not authentication.
- **Status codes:** 200 with the updated Mission detail; 400 invalid input or a write Core refuses; 403 read-only mode, a foreign origin or host, or an action not available; 404 unknown Mission; 409 stale sequence; 413 body too large; 415 not JSON; 503 missing or outdated workspace.
- **Never migrates:** writes open the workspace writable but without migrations, and require `007_missions` like reads.
- **Not in the UI:** creating, starting, completing, or failing Missions, evidence on answers, and reviewing Proposals. Use the CLI.

## Language

The UI is available in German and English (RFC-010, Amendment 1). All UI text lives in `src/web/labels.ts`, with one entry per language for the same keys; a test checks that both languages have the same keys.

- **Default:** German if the browser's first preferred language is German, English otherwise.
- **Switch:** the DE/EN buttons in the top bar. The choice is stored in the browser (`localStorage`), not in the workspace, because it is a viewing preference and not project knowledge.
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
