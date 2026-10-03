# Milestone 9: Plan Revisions, Node Keys, and CLI Ergonomics

**Status:** Implemented — awaiting review and merge
**Decision Owner:** Ocomic
**Authorization date:** October 3, 2026
**Change class:** C2 (RFC-008)
**Implements:** ADR-006 — Plan Revisions, Node Keys, and CLI Ergonomics

## Authorization

Ocomic accepted ADR-006 on October 3, 2026 (pull request #19), including the derived rules for reopening, retroactive keys, and stale plan revision proposals. That acceptance authorizes this milestone. It precedes the mission milestone (ADR-005).

## Goal

Remove the friction found in the first dogfooding session: plans can be maintained and linked after review without duplicates, closing a plan stays a human decision, decisions are addressable by short keys such as `D-001`, and the CLI shows what is pending and why.

## Authorized scope

- **Plan revisions:**
  - substantive plan changes create append-only revisions;
  - plan revision proposals are reviewed in the existing Review Inbox with the existing `review` command;
  - status `InProgress` is added.
- **Node keys:** immutable, unique per Project (case-insensitive), never reused; resolvable wherever a Node is referenced.
- **CLI:**
  - `plan update`, `plan history`, `node key`, and `propose new --key`;
  - plans and pending Nodes in `show map`;
  - counts in `workspace status`;
  - richer `inbox`;
  - per-command help;
  - `review` and `relate review` defaulting to the proposal's Evidence;
  - correct plurals.
- **Persistence and export:** SQLite migration `006_plan_revisions_node_keys` and export format version 2, which reads version 1.
- Tests and documentation.

## Explicit non-scope

- Compact Context Packages (dogfooding finding R17). They need their own decision.
- Missions (ADR-005), MCP tools, UI changes, and keys for plans.
- Any change to knowledge lifecycle semantics, Context Package content, or MCP behavior.

## Design notes

- **Revision 1 is the existing plan record.** `planned_knowledge_items` stays unchanged and immutable and is revision 1 of each plan. Revisions 2 and later, and plan revision proposals, are appended to `planned_knowledge_revisions` with their own Node and Evidence link tables. The views `planned_knowledge_effective`, `planned_knowledge_effective_nodes`, and `planned_knowledge_effective_evidence` provide the effective state to all reads, including navigation fingerprints and Evidence backlinks.
  - ADR-006 described moving the substantive fields out of the plan table. Keeping them as revision 1 gives the same model without rewriting existing data: no data migration, and version 1 exports restore unchanged.
  - The migration rebuilds `planned_knowledge_items` once, only to widen its status check for `InProgress`; all rows are copied unchanged. See the implementation notes in ADR-006.
- **Who decides.**
  - `PlannedKnowledgeService` and `NodeKeyService` take a policy (`mayDecide`). The CLI passes the workspace reviewers; the default policy accepts every non-`agent:` actor.
  - Closing (`Completed`, `Cancelled`) or changing a closed plan by an actor without `mayDecide` creates a plan revision proposal instead of a revision.
- **Stale proposals.** A proposal stores its base revision and changed fields. On acceptance, Core compares each changed field between the base and the effective revision and refuses acceptance if one differs. Appends also check the expected effective revision number inside the transaction, so concurrent changes fail instead of overwriting.
- **Keys of pending Nodes.** A Node row is created when its first Proposal is accepted (Milestone 8). A key given with `propose new --key` is therefore bound to the Proposal's reserved Node id. It stays reserved if the Proposal is rejected, as ADR-006 requires.
- **Linking rule.** Core refuses links to Nodes without Current knowledge in plan revisions. Creating a plan keeps its Milestone 6 behavior in Core; the CLI already refuses pending Nodes there.
- **Export verify of old backups.** A version 1 backup is upgraded on parse. The restored store has also applied migration 006, so `export verify` compares everything except the informational `sourceSchema` and reports the added migration.

## Acceptance checks

| Check | Evidence |
|---|---|
| Plan changes create numbered revisions; history shows revision 1 and later revisions with the effective one marked; unchanged requests are refused | `packages/sqlite/test/plan-revisions.test.ts` |
| Links to Nodes still pending review are refused | `packages/sqlite/test/plan-revisions.test.ts`, `packages/cli/test/cli.test.ts` |
| Agents closing or reopening a plan create a proposal in the Review Inbox; agents cannot review it; a reviewer's acceptance creates the next revision; a second review is refused | `packages/sqlite/test/plan-revisions.test.ts`, `packages/cli/test/cli.test.ts` |
| A proposal whose field changed in between cannot be accepted | `packages/sqlite/test/plan-revisions.test.ts` |
| Keys: unique per Project case-insensitively, immutable, never reused, valid format only; retroactive keys need a reviewer; keys resolve in commands | `packages/sqlite/test/plan-revisions.test.ts`, `packages/cli/test/cli.test.ts` |
| Revisions, proposals, decisions, and keys survive export and restore byte-identically; a version 1 export is upgraded without changing records | `packages/sqlite/test/plan-revisions.test.ts`, `packages/cli/test/cli.test.ts` |
| Migration 006 keeps existing plans, passes `foreign_key_check`, and guards new tables with triggers | `packages/sqlite/test/plan-revisions.test.ts` |
| CLI: `show map` (keys, pending Nodes, plans), `workspace status` counts and plurals, `inbox` details, default review Evidence, per-command help | `packages/cli/test/cli.test.ts` |
| Existing behavior unchanged: all earlier tests pass | `npm run check` |
| Real data: a copy of the dogfooding workspace migrates; all three real backups (version 1) pass `export verify` after upgrade; a version 2 export of the migrated copy round-trips byte-identically | Recorded in the pull request |

## ADR-003, ADR-004, and ADR-006 review triggers

- **ADR-003:** the format changes, as ADR-006 decided; version 2 follows the ADR-003 rules.
- **ADR-004:** the CLI contract changes, as ADR-006 decided; JSON output only gains fields.
- No workspace-splitting trigger has occurred.

## Knowledge, navigation, and documentation effects

- Updated: `CLI.md`, `EXPORT-API.md`, `PLANNED-KNOWLEDGE-API.md`, `DOGFOODING.md`, and the implementation notes in ADR-006.
- `open-questions.md` marks the dogfooding findings this milestone resolves.
- The planning index and `AGENTS.md` list Milestone 9.
