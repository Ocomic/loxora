# ADR-005 — Mission Storage and Reporting Interface

**Status:** Proposed
**Date:** October 3, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (schema migration, export format version, public CLI contract; see RFC-008)

## Context

RFC-009 (accepted October 2, 2026) defines Missions as execution state separate from knowledge, a seven-state model with typed Wait Reasons, and the rule that missions produce knowledge only through review-gated paths. It leaves storage, interfaces, and export to an ADR.

Before writing this ADR, the decision owner decided the blocking questions on October 3, 2026:

| Question | Decision |
|---|---|
| Reporting interface | The CLI is the first adapter. The transition contract lives in Core; CLI, server, and a possible later MCP surface are adapters over the same Core operations. |
| Authority | The workspace database is the persistent source of truth for mission state. Core is the authority for validation and allowed transitions. CLI and server access mission state only through Core. The UI never derives state from logs. |
| `queued` | Included. Creating and starting a Mission are separate actions. |
| Projects | One owning Project plus optional references to other Projects. References do not create shared ownership. |
| Mission Steps | Not in the first slice. A `currentActivity` field is enough. |
| Telemetry | No raw logs and no prompts are stored. Only structured events, explicit Attention Requests, and deliberately recorded outcomes. Log references should be portable; external absolute paths are not portable workspace data. |
| Export | Missions, Mission Events, Attention Requests, and Outcomes become part of a new export format version. External logs are not exported. |
| Staleness | No state and no automatic transition. "Last activity" is derived for display and not persisted. |
| Out of scope | Notifications, automatic resumption, and budget logic stay C3 and are not implemented. The model must not block them. |

The first dogfooding session (October 2026) showed that agents already work through the `loxora` CLI (ADR-004), so a CLI adapter reaches real agent work without a running server.

## Decision

### 1. Core: `MissionService` and `MissionStore`

A new Core module (`packages/core/src/mission.ts`) defines the mission types, the transition table, and a `MissionService` over a `MissionStore` port, following the pattern of `PlannedKnowledgeService`.

- **All rules live in Core:** allowed transitions, required Wait Reason payloads, actor rules, and reference validation. Adapters never write mission tables directly.
- **One transaction per operation:** each operation validates the expected current state, updates the Mission, and appends exactly one Mission Event. A transition based on a stale state fails with a validation error instead of overwriting a concurrent change.
- **Mission Events are the audit trail for missions.** Mission operations do not also write knowledge Audit Events, so execution history and knowledge history stay separate (RFC-009, "Mission vs. Knowledge").

### 2. Operations

| Operation | Transition | Who | Notes |
|---|---|---|---|
| `createMission` | → `queued` | human, agent | Owning Project, title, goal; optional referenced Projects, Nodes, Planned Knowledge items, Worker Role, predecessor Mission |
| `startMission` | `queued` → `running` | human, agent | Optional `currentActivity` |
| `reportActivity` | `running` → `running` | human, agent | Updates `currentActivity`; appends an activity event (source of "last activity") |
| `waitMission` | `running` → `waiting` | human, agent | Wait Reason required; see section 3 |
| `answerAttentionRequest` | stays `waiting` | human only | Records the response; required before leaving `input_required`, `approval_required`, or `permission_required` |
| `resumeMission` | `waiting` / `paused` → `running` | see section 3 | From `paused`: human only |
| `pauseMission` | `running` / `waiting` → `paused` | human only | |
| `cancelMission` | non-terminal → `cancelled` | human only | |
| `completeMission` | `running` → `completed` | human, agent | Records the Outcome |
| `failMission` | `running` / `waiting` → `failed` | human, agent | Failure reason required |
| reads | — | anyone | `getMission`, `listMissions` (by Project, state, Wait Reason), `getMissionEvents` |

Terminal states have no outgoing transitions. Continuing failed or cancelled work creates a new Mission with `predecessorMissionId` (RFC-009, section 4).

**Human vs. agent:** as in ADR-004, an actor id starting with `agent:` is an agent; any other id is treated as a human. Human-only operations reject `agent:` actors. This is a local governance guard, not authentication.

### 3. Wait Reasons and Attention Requests

Wait Reasons use the names accepted in RFC-009:

| Wait Reason | Required payload | Leaving `waiting` |
|---|---|---|
| `provider_limit` | `detail`; optional `limitedCapability`, `expectedResumeAt` | `resumeMission` by human or agent |
| `input_required` | Attention Request: question, why it is needed, optional options with consequences | after `answerAttentionRequest`; then `resumeMission` |
| `approval_required` | Attention Request: what needs approval and its consequences | after an `approve` or `reject` answer; then `resumeMission` |
| `permission_required` | Attention Request: which capability or access is missing | after a human answer (granted or not); then `resumeMission` |
| `budget_required` | — | **Reserved.** Rejected by Core until a C3 decision defines budget handling. |

- UI labels are presentation only. "Needs input" shows `input_required`; the state designed as "Codex Limit" shows `provider_limit`.
- `limitedCapability` is free text that describes the capability (for example "coding agent"). A provider or model name may appear only in optional, secondary `agentMetadata`; Core never interprets it.
- `expectedResumeAt` is informational. Nothing resumes automatically (C3).
- Adding a Wait Reason changes the Core contract, the schema check, and the export format, so it requires an update of this ADR.

### 4. Outcome

`completeMission` records a Mission Outcome:

- `summary` (required);
- `outputs`, `validations`, and `decisions`: lists of short texts;
- `proposalIds`: Proposals in the owning Project that the Mission produced. Core checks that they exist. Their review state is read live, so the Outcome always shows whether results are still pending review;
- `logReferences` (see section 5).

`failMission` records a failure reason and may record the same optional fields as a partial Outcome.

### 5. Log references

No log, prompt, tool call, or provider response content is stored. A Mission may carry references to logs:

- `workspace:<relative path>`: a file inside the workspace directory, without `..`. This kind is portable.
- `external:<locator>`: anything else, for example an absolute path on the machine where the agent ran. It is stored verbatim, labeled **not portable**, and shown as such. The CLI warns when it is used.

The exporter writes references as stored. It never reads or exports the referenced files.

### 6. Storage

A new SQLite migration adds:

| Table | Content |
|---|---|
| `missions` | id, owning Project, title, goal, state, wait reason and payload, `currentActivity`, Worker Role, optional `agentMetadata`, predecessor, `createdBy`, `createdAt`, `updatedAt` |
| `mission_project_references` | referenced Projects (no ownership) |
| `mission_knowledge_references` | referenced Nodes and Planned Knowledge items (Project-qualified) |
| `mission_events` | append-only: id, Mission, sequence number, type, previous and new state, Wait Reason, actor, timestamp, reason, payload |
| `mission_event_evidence` | optional Evidence on events (Project-qualified) |
| `mission_attention_requests` | question, rationale, options, consequences, response, responder, answered time |
| `mission_outcomes`, `mission_outcome_proposals`, `mission_log_references` | Outcome data as in sections 4 and 5 |

- `STRICT` tables with `CHECK` constraints for states and Wait Reasons, as in migration 005.
- Mission rows are updated only through Core operations; `mission_events` rows are never updated or deleted.
- "Last activity" is derived from the latest event timestamp at read time and not persisted.
- Missions are never part of Context Packages, navigation projections, or knowledge maps (RFC-009).

### 7. Export format version 2

- Workspace export `formatVersion` becomes `2`. It adds one section per new table, with field lists and sort keys in `WORKSPACE_EXPORT_SECTIONS` (ADR-003 rules unchanged: canonical bytes, restore into an empty store only).
- The reader accepts version 1 and version 2. A version 1 document restores with empty mission sections. The exporter always writes version 2.
- Referenced log files are not exported (section 5).

### 8. CLI adapter (version 2 of the ADR-004 contract)

New `mission` command group. Every write needs `--actor` or `LOXORA_ACTOR`.

| Command | Core operation |
|---|---|
| `mission create --project --title --goal [--ref-project…] [--node…] [--plan…] [--role] [--predecessor]` | `createMission` |
| `mission start --mission [--activity]` | `startMission` |
| `mission activity --mission --text` | `reportActivity` |
| `mission wait --mission --reason provider_limit\|input_required\|approval_required\|permission_required [--detail] [--question] [--why] [--option…] [--consequence…] [--expected-resume]` | `waitMission` |
| `mission answer --mission --response [--decision approve\|reject]` | `answerAttentionRequest` |
| `mission resume --mission` | `resumeMission` |
| `mission pause --mission`, `mission cancel --mission --reason` | `pauseMission`, `cancelMission` |
| `mission complete --mission --summary [--output…] [--validation…] [--decision…] [--proposal…] [--log…]` | `completeMission` |
| `mission fail --mission --reason [--log…]` | `failMission` |
| `mission show --mission`, `mission list [--project] [--state] [--reason] [--attention]` | reads; `--attention` lists Missions waiting for a human |

Missions are referenced by id, id prefix (6 or more characters), or unique title within the Project. Text output and `--json` follow ADR-004 conventions. Exit codes are unchanged.

### 9. Server and UI

The local server gets read-only mission endpoints only when the UI milestone needs them (F11: read-only Mission Detail after this persistence step). Those endpoints call the same Core reads. No write endpoint and no MCP tool is part of this decision.

## Alternatives

### Separate mission store or file per Mission

Rejected. Missions reference Projects, Nodes, plans, and Proposals in the workspace. A separate store would need cross-store references and a second export.

### Log-derived or event-sourced state only

Rejected. State is stored on the Mission row and validated by Core; events are the history, not the only source. Reading state never requires replaying or parsing logs (RFC-009, UI-VISION section 18).

### Write knowledge Audit Events for mission operations too

Rejected. It would mix execution history into the knowledge audit trail and double every record.

### Flat waiting states or free-form reasons

Rejected by RFC-009. Free-form reasons would let the UI depend on agent-specific wording.

### Store logs or prompts with retention rules

Rejected for the first slice by the decision owner. It avoids secrets in the workspace and retention policy questions.

## Consequences

- Real agent work can be tracked locally with explicit human intervention points, without orchestration or a running server.
- The schema, the export format (version 2), and the CLI contract change. Each is versioned and covered by tests.
- Every later adapter (server, MCP) must call the same Core operations.
- The ADR-003 rule applies: the migration, exporter, restorer, and round-trip tests change together.
- Notifications, automatic resumption, and budgets can later attach to Mission Events and Wait Reasons without changing the state model.

## Implementation (after acceptance)

A milestone document under `docs/implementation/` authorizes the work. It follows the CLI improvement milestone that the decision owner placed first (plan update, linking, status, short ids). It covers:

- Core module, transition table, and unit tests for every allowed and forbidden transition and actor rule;
- SQLite migration and store, including the concurrency check;
- export format version 2 with version 1 compatibility and round-trip tests;
- CLI `mission` commands, `docs/implementation/CLI.md`, and a mission section in `DOGFOODING.md`;
- an end-to-end rehearsal: create, start, wait with `provider_limit`, resume, wait with `input_required`, answer, resume, complete with a Proposal.

## Open questions

- Should `dependency` (waiting for another Mission or Project) and `manual` become Wait Reasons? `manual` overlaps with `paused`; `dependency` could reference a blocking Mission.
- Should `answerAttentionRequest` be limited to workspace reviewers, or is any non-agent actor enough?
- Should RFC-009 open question 6 (an "in progress" plan status) be solved in the CLI improvement milestone instead?
- How should a Mission refer to a Context Package once Context Packages are persisted? For now, an optional fingerprint text.

## Related documents

- `docs/rfcs/RFC-009-mission-concept-and-state-model.md`
- `docs/rfcs/RFC-008-post-hackathon-governance.md`
- `docs/adr/ADR-003-deterministic-workspace-export.md`
- `docs/adr/ADR-004-local-knowledge-capture-cli.md`
- `docs/planning/UI-VISION.md`
