# Loxora App (Mission Control)

`@loxora/app` is the product UI (RFC-010). Milestone 11 delivers a **read-only Mission Control** on the real local workspace. The Hackathon demo inspector (`WEB-UI.md`) stays frozen.

## Running it

```sh
npm ci && npm run build
npm run app                                   # default workspace, http://127.0.0.1:4180
npm run app -- --workspace <dir> --port 4181  # explicit workspace and port
```

- **Workspace:** resolved like the CLI: `--workspace`, `LOXORA_WORKSPACE`, then `<home>/.loxora/workspaces/default`.
- **Never migrates.** If the workspace needs a newer migration, the UI says so. Back up by copying the workspace directory, then run any `loxora` command once.
- **`--actor`** is refused until the write milestone (RFC-010 section 9). Without an actor, the app is read-only.

## Read API

The server binds to `127.0.0.1`, serves the web client and `/api` from one origin, and enables no CORS.

| Route | Content |
|---|---|
| `GET /api/workspace` | `{ name, reviewers, actor: null, readOnly: true }` |
| `GET /api/projects` | `[{ id, name }]` |
| `GET /api/missions?filter=all\|running\|limit\|input\|completed\|failed&project=` | `{ counts, missions }`: counts per filter; Missions sorted by need for attention |
| `GET /api/missions/:id` | Mission detail: state, Wait Reason, Attention Request, Outcome with live Proposal status, references with Node keys and plan status; `availableActions` (empty in the MVP) |
| `GET /api/missions/:id/events` | Mission Events |

- **Status codes:** 400 for an invalid filter, 404 for an unknown Mission or route, 405 for any write, 503 for a missing or outdated workspace.
- **Response content:** never SQL, stacks, or absolute paths, except the workspace directory printed by the start command.

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
- **Not shown,** because there is no data source yet (RFC-010 section 5): steps and checklist, crew panel, chat, costs and limit percentage, the automatic-continuation toggle, and action buttons.

## Guarantees

- Server-authoritative state: the browser derives no states, permissions, or transitions.
- Boundary test: the web client imports no Core, SQLite, CLI, MCP, Node, or server code.
- Accessibility:
  - skip link and visible keyboard focus;
  - status as text and color;
  - semantic regions and labels;
  - no animations.
