# Milestone 12: Mission Control write path

**Status:** Implemented — awaiting review and merge
**Decision Owner:** Ocomic
**Authorization date:** October 4, 2026 (this document merged in pull request #28)
**Change class:** C2 (RFC-008): new HTTP write routes and a new store helper
**Implements:** RFC-010 section 9; RFC-011 section 12, milestone 1

## Authorization

- RFC-010 was accepted by Ocomic on October 3, 2026 (pull request #23). Its decision says that a following small write milestone implements section 9: the configured actor, `availableActions`, and the buttons in its table.
- RFC-011 was accepted by Ocomic on October 4, 2026. It names this write path as its first milestone, because the first-launch flow ends with the person answering a Mission in the UI.
- Merging this document authorizes the implementation described here and nothing beyond it.

## Goal

A person can act on a Mission in Mission Control instead of the CLI: answer an Attention Request, pause, stop (cancel), and resume. Every action goes through the same Core operations and policies as the CLI.

## Authorized scope

### Configured actor (RFC-010 section 9)

- `npm run app -- --actor <id>` (and `--workspace`, `--port` as today) starts the app in write mode.
- At start, the server refuses to start in write mode if the actor:
  - starts with `agent:`, or
  - is not listed in `workspace.json` `reviewers`.
- Without `--actor`, the app stays fully read-only, exactly as in Milestone 11.
- The header shows the active actor; it is not switchable.
- The browser never sends an actor id. The server assigns the configured actor to every mutation.

### Allowed actions

`GET /api/missions/:id` returns `availableActions`, computed by the server from the Mission's state, its Wait Reason and Attention Request, the Core transition table (`MISSION_TRANSITIONS`), and the configured actor:

| Action | Offered when |
|---|---|
| `answer` | the Mission is `waiting` with an unanswered Attention Request; for `needs_approval` the action states that `approve` or `reject` is required |
| `pause` | the transition to `paused` is allowed (from `running` or `waiting`) |
| `cancel` | the transition to `cancelled` is allowed (any non-terminal state) |
| `resume` | `waiting` with `provider_limit`, `waiting` with an answered request, or `paused` |

- With no actor configured, `availableActions` is empty.
- Every mutation is still validated by Core when it runs; the list is a display aid, not the authority.

### Write routes

| Route | Body | Core operation |
|---|---|---|
| `POST /api/missions/:id/answer` | `{ sequence, response, decision? }` | `answerAttentionRequest` |
| `POST /api/missions/:id/pause` | `{ sequence, reason? }` | `pauseMission` |
| `POST /api/missions/:id/cancel` | `{ sequence, reason }` | `cancelMission` |
| `POST /api/missions/:id/resume` | `{ sequence }` | `resumeMission` |

- **Stale state.** `sequence` is the Mission sequence the page was showing. If the Mission has changed since, the server answers 409 and the UI reloads the Mission instead of acting on old state.
- **Responses.** Success returns the updated Mission detail. Errors: 400 invalid input, 403 read-only mode or action not allowed, 404 unknown Mission, 409 stale sequence, 415 wrong content type, 503 missing or outdated workspace. No SQL, stacks, or absolute paths.
- **Read-only mode.** Without an actor, every write route answers 403 (Milestone 11 answered 405 for all writes; the route table is now explicit).

### Store access

- A new `@loxora/sqlite` helper opens the workspace **writable without running migrations**, and requires migration `007_missions`, like the read-only helper.
- The app still never migrates. An outdated workspace answers 503 with the same guidance as today.
- Connections stay per request, so CLI writes and app writes see each other without a restart.

### Local request protection

The server still binds to `127.0.0.1`, same-origin, without CORS. Because write routes now exist, every `POST` must also:

- carry `Content-Type: application/json`;
- carry an `Origin` header equal to the server's own origin;
- target a `Host` of `127.0.0.1:<port>` or `localhost:<port>`;
- stay under a small body limit (16 KB).

Requests that fail these checks are rejected before any workspace access. This protects against other web pages in the same browser posting to the local server and against DNS rebinding. It is a local guard, not authentication (RFC-010 section 9).

### UI

- **Decision panel:** one button per option, a free-text answer, and for `needs_approval` the buttons "Freigeben" / "Approve" and "Ablehnen" / "Reject". The answered state shows who answered, as today.
- **Pause, Stop, Resume** buttons in the Mission header, shown only when listed in `availableActions`. Stop asks for a reason and a confirmation, because cancelling is terminal.
- After an action, the page reloads the Mission; a 409 shows "This mission has changed" and reloads.
- The CLI hints stay visible in read-only mode and are hidden in write mode.
- All new text is in the label module in German and English.

### Tests and documentation

- Server tests:
  - start refused for an `agent:*` actor and for an actor not in `reviewers`;
  - each action succeeds for an allowed state and is rejected for a disallowed one;
  - `availableActions` per state;
  - 409 on a stale sequence;
  - 403 in read-only mode;
  - rejection of a foreign `Origin`, a wrong `Host`, a non-JSON body, and an oversized body;
  - the app never migrates in write mode.
- The label parity test covers the new text.
- A manual browser check on a copy of the dogfooding workspace, recorded in the pull request.
- Documentation: `APP.md` (running with `--actor`, write routes, protections), RFC-010 (section 9 implemented), the RFC index, and `AGENTS.md` (milestone list).

## Design notes

- **Write mode is fixed at start.** The actor check reads `workspace.json` once at start. Changing reviewers needs an app restart.
- **Pre-check, then Core.** The server rejects an action that is not in `availableActions` with 403 before calling Core; Core's own refusal (for example a missing cancellation reason) answers 400.
- **Oversized bodies.** The server answers 413 as soon as the limit is passed and stops reading; a client that keeps sending may see the connection close instead.
- **Sidebar refresh.** After an action, the Mission detail and timeline reload at once; the sidebar counts follow with the next poll (5 seconds).
- **Approval without text.** Approve and Reject send the typed text, or the button label when the field is empty, because Core requires a response.

## Explicit non-scope

- Creating, starting, completing, or failing Missions in the UI.
- Evidence on answers (stays CLI-only).
- Any resolver other than `--actor`: a local user profile, the setup's captain, or OS integration. RFC-011 milestone 2 adds the setup and decides how its captain becomes the configured actor.
- Xora, the setup flow, the bridge visualizer, and empty-state actions.
- Reviewing knowledge Proposals in the UI.
- Authentication, multiple users, remote access, and push updates.

## Acceptance checks

| Check | Evidence |
|---|---|
| The app refuses write mode for an `agent:*` or unknown actor and stays read-only without `--actor` | `packages/app/test/app.test.ts` |
| Answer, pause, cancel, and resume run through Core and are refused where Core refuses them | `packages/app/test/app.test.ts` |
| `availableActions` matches the state table above | `packages/app/test/app.test.ts` |
| A stale sequence answers 409 and changes nothing | `packages/app/test/app.test.ts` |
| Foreign origin, wrong host, wrong content type, and oversized bodies are rejected before workspace access | `packages/app/test/app.test.ts` |
| The app never migrates, also in write mode | `packages/app/test/app.test.ts` |
| German and English labels have the same keys | `packages/app/test/app.test.ts` |
| Existing behavior is unchanged | `npm run check` |
| Manual browser check: answer with an option, answer with free text, approve and reject, pause, resume, stop with confirmation, stale-state message, both languages | Recorded in the pull request |

## Knowledge, navigation, and documentation effects

- New: this document.
- On implementation: `APP.md`, RFC-010 (section 9 marked implemented), the RFC index, and `AGENTS.md`.
