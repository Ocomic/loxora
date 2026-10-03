# Milestone 10: Mission Persistence and Reporting Interface

**Status:** Implemented — awaiting review and merge
**Decision Owner:** Ocomic
**Authorization date:** October 3, 2026
**Change class:** C2 (RFC-008)
**Implements:** ADR-005 — Mission Storage and Reporting Interface (RFC-009 with Amendment 1)

## Authorization

Ocomic accepted ADR-005 on October 3, 2026 (pull requests #18 and #19). The acceptance authorizes a milestone for the mission persistence slice after Milestone 9. Missions use export format version 3.

## Goal

Record real agent work as Missions, separate from knowledge, so that humans see what is running, what is blocked, and what needs them. This is the persistence step the UI vision (F11) places before a read-only Mission Detail view.

## Authorized scope

- **Core:** `MissionService` and the `MissionStore` port:
  - the RFC-009 transition table;
  - Wait Reasons from Amendment 1, Attention Requests, and Outcomes;
  - human-only operations;
  - stale-write protection.
- **SQLite:** migration `007_missions`, with append-only events, references, and outcomes, and Attention Requests that are answered once.
- **Export:** format version 3, which reads versions 1 and 2.
- **CLI:** the `mission` command group as the first adapter.
- Tests and documentation.

## Explicit non-scope

- Server endpoints, UI, and MCP tools. The read-only Mission Detail comes in a later UI milestone.
- Orchestration, automatic resumption, notifications, and budgets (`needs_budget` is rejected). These are C3 or later decisions.
- Mission Steps (F5), storage of logs or prompts (F6), and a persisted staleness state (F8).
- Any change to knowledge lifecycle, Context Packages, or navigation. Missions are never part of them.

## Design notes

- **Authority.** The workspace database is the source of truth. Core validates every transition and payload, and the CLI only calls Core.
- **Concurrency.** Every operation appends exactly one Mission Event and moves the Mission's `sequence` by one.
  - The store updates the Mission only `WHERE sequence = expected`, so a stale write fails.
  - A trigger also refuses any Mission update that does not move `sequence` by exactly one.
- **Events.** Mission Events are the audit trail; no knowledge Audit Events are written. "Last activity" is the latest event time, derived at read time.
- **Attention Requests.** `needs_input`, `needs_approval`, `needs_permission`, and `needs_manual_action` require a question and a rationale ("why"); options with consequences are optional.
  - Only a human (any non-`agent:` actor) answers. `needs_approval` needs `approve` or `reject`.
  - A trigger allows exactly one answer. Resuming requires the answer.
- **Pause and cancel** are human-only. Resuming a paused Mission is human-only. Resuming after `provider_limit` is open to agents, but always explicit: nothing resumes automatically.
- **Outcomes.** Completion and failure record an Outcome:
  - Proposals are checked to exist in the owning Project, and their review state is read live.
  - Log references are `workspace:` (portable) or `external:` (stored and flagged not portable); the CLI warns about the latter.
  - No log content is stored or exported.
- **Predecessors.** Continuing failed, cancelled, or completed work creates a new Mission with `--predecessor`. The predecessor must be terminal.
- **CLI options.** `--plan`, `--proposal`, and `--decision` became repeatable for `mission create` and `mission complete`. Single-value commands use the last value, so their behavior is unchanged.
- **List order.** `mission list` sorts by need for attention: human-needed waits first, then provider limits, running, paused, queued, and finished Missions.

## Acceptance checks

| Check | Evidence |
|---|---|
| Full path: create, start, provider limit, resume, needs input, human answer, resume, complete; events in order; sequence and last activity derived | `packages/sqlite/test/missions.test.ts`, `packages/cli/test/cli.test.ts` |
| Transition table matches RFC-009; terminal states are final | `packages/sqlite/test/missions.test.ts` |
| Human-only answer, pause, cancel, and resume-from-pause; approval needs a decision; `needs_budget` rejected; payload validation | `packages/sqlite/test/missions.test.ts`, `packages/cli/test/cli.test.ts` |
| Predecessor must exist and be terminal | `packages/sqlite/test/missions.test.ts` |
| Stale writes refused; triggers protect events, Mission identity, and deletion; `foreign_key_check` clean | `packages/sqlite/test/missions.test.ts` |
| Missions change neither navigation projections nor knowledge Audit Events | `packages/sqlite/test/missions.test.ts` |
| Export version 3 round-trips Missions, events, Attention Requests, and outcomes; versions 1 and 2 upgrade | `packages/sqlite/test/missions.test.ts`, `packages/sqlite/test/plan-revisions.test.ts`, `packages/cli/test/cli.test.ts` |
| Log references: portability, path traversal, and absolute paths | `packages/sqlite/test/missions.test.ts` |
| Existing behavior unchanged | `npm run check` (87 tests) |
| Real data: a copy of the dogfooding workspace migrates to 007; real backups (versions 1 and 2) pass `export verify`; a mission with `needs_approval` appears in `mission list --attention`; the version 3 export round-trips | Recorded in the pull request |

## ADR-003, ADR-004, and ADR-005 review triggers

- The export format and CLI contract change, as ADR-005 decided.
- No workspace-splitting trigger has occurred.

## Knowledge, navigation, and documentation effects

- New: `docs/implementation/MISSION-API.md` and this document.
- Updated: `CLI.md`, `EXPORT-API.md`, `DOGFOODING.md`, the planning index, `AGENTS.md`, `UI-VISION.md` (next steps), and `open-questions.md`.
- Missions are not knowledge: no maps, indexes, or summaries change.
