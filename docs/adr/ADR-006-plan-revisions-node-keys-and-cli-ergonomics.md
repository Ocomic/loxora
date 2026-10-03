# ADR-006 — Plan Revisions, Node Keys, and CLI Ergonomics

**Status:** Accepted
**Date:** October 3, 2026
**Decision Date:** October 3, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (schema migration, Planned Knowledge semantics, export format version, public CLI contract; see RFC-008)

## Context

The first dogfooding session with the Milestone 8 CLI (October 2026, findings in `docs/planning/open-questions.md`) showed these frictions:

- Planned Knowledge can only be created. It cannot be updated or linked later, so plans recorded before a review stay unlinked or must be duplicated (R1, R2, R22).
- There is no "in progress" status. Completed plans are still labeled "not implemented". An agent can mark a plan Completed without review (R3, R4, R5).
- Decision logs use short identifiers such as `D-001`, but Nodes resolve only by full title, id, or id prefix (R15).
- Navigation and review gaps: `show map` omits plans and pending Nodes; `inbox` shows no Projects, Nodes, or author for relationship proposals; there is no per-command help; reviewers must look up Evidence ids by hand; plural errors (R6, R7, R9, R14, R16).

In Core, `PlannedKnowledgeService` today offers only `createPlannedKnowledge` and reads. Closing these gaps therefore changes Planned Knowledge semantics and the schema, not only the CLI.

The decision owner decided on October 3, 2026 that this CLI improvement milestone comes **before** the mission milestone (ADR-005), and answered the design questions:

| Question | Decision |
|---|---|
| G1 Plan changes | Revisions. Every substantive change (status, description or content, links) creates a new plan revision. Purely technical or derived metadata does not. An event records who changed what and what triggered it: the revision is the new state, the event is the action history. |
| G2 Review of plan changes | Only a human sets `Completed` or `Cancelled` effectively. Agents may make other plan changes, recorded with their actor. An agent may **propose** `Completed` or `Cancelled` through the existing proposal and review mechanism, not a parallel one. |
| G3 Status | Add `InProgress`. Remove the "not implemented" label for `Completed`. Plan status is set explicitly and is never derived from Missions. A Mission can be `completed` while its plan stays `InProgress`. |
| G4 Short keys | An optional, stable `key` per Node (for example `D-001`). It belongs to the Node identity, not to a revision. Unique within a Project, immutable once assigned, never reused for another Node. Existing Nodes without a key may receive one once, afterwards it is immutable too. |
| G5 Links to pending Nodes | Not allowed. After review, the link is added through a new plan revision. |
| G6 Small improvements | Included: plans and pending Nodes in `show map`, more context in `inbox`, per-command help, `review` defaulting to the proposal's Evidence, correct plurals, plan update and linking, short keys. Compact Context Packages (R17) are explicitly excluded; they need their own decision. |

## Decision

### 1. Plan revisions

Planned Knowledge gets the same "new state, preserved history" principle as knowledge (RFC-003), adapted to plans.

- **Plan identity:** `planned_knowledge_items` keeps the stable identity: id, owning Project, author, creation time, scope.
- **Plan revisions:** the substantive fields move to revisions:
  - title, description, status, reason, blocking condition;
  - related Project, related Nodes, Evidence, related historical Revision.
- **Effective revision:** each plan has exactly one effective revision, the latest accepted one. Reads return the effective revision.
- **New revision:** `revisePlannedKnowledge` creates revision *n + 1* from the effective revision plus the requested changes and a required change reason. Unchanged fields are carried over.
- **No revision** for derived or technical data: navigation paths, resolved Sources, projections, timestamps of reads.
- **Events:** each revision and each plan revision proposal writes an Audit Event (`PlannedKnowledgeRevised`, `PlannedKnowledgeRevisionProposed`, `PlannedKnowledgeRevisionAccepted`, `PlannedKnowledgeRevisionRejected`) with actor, trigger, and change reason.
- **History:** `getPlannedKnowledgeHistory` returns all revisions in order, including rejected proposals labeled as such.
- **Migration:** every existing plan becomes revision 1 with its current values. Nothing is lost.

### 2. Who may change what

| Change | Workspace reviewer | Other actor (including `agent:*`) |
|---|---|---|
| Status to `Proposed`, `Deferred`, `Ready`, `InProgress` | effective | effective |
| Description, title, reason, blocking condition | effective | effective |
| Add or remove links (Nodes, related Project, Evidence) | effective | effective |
| Status to `Completed` or `Cancelled` | effective | **plan revision proposal**, awaiting review |
| Any change to a plan whose effective status is `Completed` or `Cancelled` (reopening) | effective | plan revision proposal |

- **Reuse of the existing mechanism:** a plan revision proposal is a third kind of item in the existing Review Inbox, next to Knowledge Proposals and cross-project Relationship Proposals. It is decided with the existing `review` command and the existing reviewer rules (ADR-004). No separate approval path exists.
- **Rebasing:** a plan revision proposal records the revision it was based on. On acceptance, its requested changes apply on top of the then-effective revision. If an applied field was changed in between, acceptance fails with a validation error and the proposal must be resubmitted.
- **Reopening:** the rule for reopening closed plans is a proposal by the author of this ADR, derived from G2: closing is human, so reopening is human too. The decision owner may adjust it on review.

### 3. Status set and labels

- Statuses: `Proposed`, `Deferred`, `Ready`, `InProgress`, `Completed`, `Cancelled`.
- Status is always set explicitly. Missions never change plan status (RFC-009, ADR-005).
- Labels: plans are presented as "Planned knowledge — not canonical knowledge". `Completed` is shown as a closed plan without the "not implemented" label. Other statuses keep a "not yet done" marker.

### 4. Node keys

- **Storage:** a new table `knowledge_node_keys` (Project, key as entered, normalized key, Node, assigned by, assigned at), with:
  - primary key on (Project, normalized key);
  - a unique constraint on Node;
  - triggers that reject `UPDATE` and `DELETE`, so a key can never change or be reused.
- **Format:** 1 to 32 characters, starting with a letter or digit, then letters, digits, `.`, `_`, or `-`. Uniqueness is case-insensitive (`D-001` and `d-001` collide); the key is displayed as entered.
- **Assignment:**
  - at proposal time with `propose new --key`, by any actor. The reviewer sees the key during review. The key is bound to the Node when the Node is created, so it stays reserved even if the proposal is rejected;
  - later, once, with `node key --project --node --key`, only for a Node without a key and only by a workspace reviewer. Because keys are immutable, a wrong retroactive key cannot be corrected, so this is limited to reviewers.
- **Resolution:** every CLI option that takes a Node (`--node`, `--from-node`, `--to-node`, `--related-node`) accepts a key. Resolution order: id, key, unique title, id prefix (6 or more characters).
- **Output:** keys appear in text and JSON output wherever the Node appears.

### 5. CLI ergonomics

- **`show map`:** lists plans with status, and pending Nodes marked "pending review".
- **`workspace status`:** counts Nodes with accepted knowledge, pending Nodes, and plans by status, with correct plurals.
- **`inbox`:**
  - relationship proposals show source and target Project and Node, author, and confidence;
  - plan revision proposals show the plan, the requested status, the author, and the change reason.
- **Help:** `loxora <command> --help` and `loxora help <command>` print the usage of that command only.
- **`review` and `relate review`:** if `--evidence` is omitted, the Evidence cited by the proposal is used, and the output states which Evidence was used. Explicit `--evidence` still overrides.

### 6. CLI contract version 2

New and changed commands:

| Command | Core operation |
|---|---|
| `plan update --plan [--status] [--title] [--description] [--blocking-condition] [--add-node…] [--remove-node…] [--related-project] [--evidence…] --reason` | `revisePlannedKnowledge`, or a plan revision proposal per section 2 |
| `plan history --plan` | `getPlannedKnowledgeHistory` |
| `plan add … --status InProgress` | status set extended |
| `propose new … [--key]` | key at Node creation |
| `node key --project --node --key` | `assignNodeKey` (reviewers only) |
| `review --proposal <plan revision proposal>` | `reviewPlannedKnowledgeRevision` |

- Plans are referenced by id, id prefix, or unique title within the Project.
- JSON output only gains fields. Existing fields keep their names and meaning.

### 7. Export format version 2

- `formatVersion` becomes `2`:
  - the plan sections are split into item, revision, revision-node, and revision-evidence sections;
  - a section for plan revision proposals and their review decisions is added;
  - `knowledgeNodeKeys` is added.
- The reader accepts version 1. Core upgrades a version 1 document deterministically before restore: each plan becomes revision 1, and there are no keys.
- The exporter always writes version 2. ADR-005 then uses version 3.

## Alternatives

### Update plan rows in place with an event log

Rejected by the decision owner (G1). It overwrites the plan state and makes the history depend on replaying events.

### Plan changes always as reviewed proposals

Rejected (G2). It would make routine plan maintenance by agents as heavy as accepting knowledge. Only closing a plan needs a human.

### A separate approval command for plans

Rejected (G2). The existing Review Inbox and `review` command are reused.

### Derive plan status from Missions

Rejected (G3). Mission state and plan state are separate concepts.

### Mutable aliases instead of immutable keys

Rejected (G4). References in decision logs, commits, and chats must stay valid.

### Allow links to Nodes still pending review

Rejected (G5). It would blur proposed and accepted knowledge.

## Consequences

- Plans can be maintained without duplicates, with full history and a human gate for closing them.
- Dogfooding data can move to short keys step by step.
- The schema, Planned Knowledge semantics, export format (version 2), and CLI contract (version 2) change together. ADR-003 applies: migration, exporter, restorer, and round-trip tests change in the same milestone.
- `docs/implementation/PLANNED-KNOWLEDGE-API.md`, `CLI.md`, `EXPORT-API.md`, and `DOGFOODING.md` need updates.
- The Context Package operation is unchanged. Planned Knowledge stays outside MCP Context, as before.

## Implementation (after acceptance)

Milestone 9 ([`MILESTONE-9.md`](../implementation/MILESTONE-9.md)) covers:

- Core: plan revisions, plan revision proposals in the Review Inbox, status set, node keys, and reference resolution, with tests for every permission rule in section 2;
- SQLite migration with data migration of existing plans and tests on a copy of a Milestone 8 workspace;
- export format version 2 with version 1 upgrade and round-trip tests;
- CLI changes from sections 5 and 6, with tests and documentation;
- a dogfooding rehearsal: link the existing unlinked plans through `plan update`, assign keys to existing decision Nodes, and have an agent propose `Completed` and a reviewer accept it.

## Implementation notes (Milestone 9)

These notes record how Milestone 9 realized this decision. They do not change it.

- **Revision 1 stays in `planned_knowledge_items`.** Instead of moving the substantive fields out of the plan table, the existing immutable plan row is revision 1. Revisions 2 and later and plan revision proposals live in `planned_knowledge_revisions`; SQL views provide the effective state. The model is the same as in section 1, but no existing data is rewritten. A version 1 export restores without transformation: the upgrade only adds empty version 2 sections, instead of splitting the plan sections as section 7 described.
- **Status check.** The migration rebuilds `planned_knowledge_items` once to allow `InProgress`, copying every row unchanged.
- **Keys at proposal time.** A Node row is created when its first Proposal is accepted. `propose new --key` therefore binds the key to the Proposal's reserved Node id, which keeps the key reserved if the Proposal is rejected.
- **`export verify` of version 1 backups** ignores only the informational `sourceSchema`, which gains migration 006 in the restored store.

## Open questions

- Should plans themselves get keys (for example `P-003`)?
- Should a plan revision proposal also be possible for other fields when a project wants stricter governance (a per-project policy)?
- How should keys interact with a future per-Project export or Project merge?

## Acceptance

Accepted by Ocomic on October 3, 2026, as proposed (pull request #19), including the derived rules flagged for review: reopening a closed plan requires a reviewer, retroactive Node keys are reviewer-only, and a plan revision proposal fails on acceptance if a field it changes was modified in between.

This acceptance authorizes Milestone 9 under `docs/implementation/`. It precedes the mission milestone (ADR-005). Compact Context Packages remain out of scope. The open questions above remain open.

## Related documents

- `docs/adr/ADR-003-deterministic-workspace-export.md`
- `docs/adr/ADR-004-local-knowledge-capture-cli.md`
- `docs/adr/ADR-005-mission-storage-and-reporting-interface.md`
- `docs/rfcs/RFC-003-knowledge-lifecycle.md`
- `docs/rfcs/RFC-009-mission-concept-and-state-model.md`
- `docs/implementation/PLANNED-KNOWLEDGE-API.md`
- `docs/planning/open-questions.md` (dogfooding findings)
