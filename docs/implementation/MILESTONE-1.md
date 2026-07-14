# Milestone 1: Persistent Lifecycle Foundation

**Status:** Implemented locally for the Hackathon MVP

**Decision Owner:** Ocomic

**Decision date:** July 13, 2026

## Authorization and boundary

This milestone implements only the approved persistent lifecycle vertical slice. The RFC-007, ADR-001, and ADR-002 decisions are accepted only for explicitly assigned Hackathon MVP milestones. They do not establish permanent Loxora architecture.

Implemented flow:

```text
Create Project and location
→ Submit Proposal
→ Accept through Review Decision
→ Create immutable accepted Revision
→ Set Current pointer
→ Query Current Knowledge
→ Close and reopen SQLite
→ Query the same Current Knowledge
```

Supersession, restoration, History queries, Planned Knowledge, cross-project Relationships and impact, maps, export, Context Packages, MCP, HTTP, UI, FTS, embeddings, import, authentication, permissions, and multi-user behavior are deliberately deferred.

## Runtime and package boundary

The reference environment is Node.js 24.18 and npm 11.7 with npm Workspaces and TypeScript.

Node.js 24.18 documents `node:sqlite` as Stability 1.2 — Release candidate. It is an MVP persistence implementation risk, not a permanent storage commitment. `DatabaseSync`, SQL, migrations, and connection details exist only inside `@loxora/sqlite`. `@loxora/core` exposes asynchronous, transport-neutral ports and use cases returning `Promise` values, so another adapter can replace SQLite.

- `@loxora/core`: domain values, invariants, errors, asynchronous ports, and use cases.
- `@loxora/sqlite`: versioned migrations, `DatabaseSync` adapter, prepared statements, transactions, and database integrity enforcement.

The public SQLite package entry point exposes only the asynchronous `openSqliteLifecycleStore(path)` factory typed as the Core `LifecycleStore`. Test-only fault and integrity access remains outside public package exports.

## Public Core operations

- `createProject`
- `createKnowledgeSpace`
- `createKnowledgeCollection`
- `registerSourceReference`
- `registerEvidenceReference`
- `submitKnowledgeProposal`
- `reviewKnowledgeProposal`
- `getCurrentKnowledge`

IDs and timestamps are generated through injected `IdGenerator` and `Clock` ports. Scope is a non-empty opaque string with exact matching and defaults to `project`.

## Lifecycle and transaction invariants

Proposal submission reserves a Node ID but creates no Node, accepted Revision, or Current pointer. A Rejected decision creates a decision and audit records, but no accepted knowledge. A second decision attempt fails with `ProposalNotReviewableError` and changes nothing.

Acceptance runs under `BEGIN IMMEDIATE`. It validates the still-Submitted Proposal and ownership, then records the decision, Node, immutable accepted Revision, Evidence links, Current pointer, Proposal state, and Audit Events before committing. Any failure rolls back the entire operation.

One correlation ID joins the Review Decision, accepted Revision, Current pointer, and all Audit Events produced by a review operation. Core has no Audit Event update/delete operation. SQLite triggers reject direct updates and deletes.

Accepted Revision rows contain immutable acceptance facts and content. They contain no mutable Current/Historical field:

- **Current** is derived only from the Current pointer.
- `getCurrentKnowledge` classifies its pointed accepted Revision as `Canonical` and `Current`.
- **Historical** will be derived in a later milestone from accepted Revisions no longer referenced by a Current pointer.
- Future supersession and restoration lineage must use new records and Relationships without changing prior Revision content.

SQLite triggers reject direct accepted-Revision updates and deletes.

## Migration and opening behavior

Migration `001_initial_lifecycle` creates Projects, Spaces, Collections, Nodes, Sources, Evidence, Proposals, review decisions, accepted Revisions, Current pointers, their Evidence joins, Audit Events, and migration history.

The adapter enables foreign keys and a busy timeout. File-backed databases use WAL. Every migration runs in its own transaction; its history row is inserted only after its SQL succeeds. Failure rolls back both schema work and history, so reopening retries the migration.

Composite foreign keys retain project, Node, and scope ownership. In particular, Review Evidence cannot cross project boundaries, and a Current pointer must reference a Revision with the same project, Node, and scope.

Example opening:

```ts
import { openSqliteLifecycleStore } from "@loxora/sqlite";

const store = await openSqliteLifecycleStore("./loxora.sqlite");
// Inject store into LifecycleService from @loxora/core.
```

## Verification coverage

The Node test suite verifies submission without canon, accept/reject behavior, duplicate decisions, complete Current provenance, Evidence-to-Source traceability, persistence after close/reopen, fault-injected acceptance rollback, migration atomicity and retry, migration idempotency, foreign-key ownership, alternate identifiers/content, correlation IDs, Core isolation, and SQLite protections for immutable Revisions and append-only Audit Events.

Required local checks:

```text
npm install
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check
git diff --check
git status -sb
```

## Exact next recommended milestone

> Implement Milestone 2: supersession, complete History queries, and restoration revisions using immutable accepted Revisions, Current-pointer replacement, explicit lineage Relationships, atomic review transitions, and strict Current-versus-Historical derivation. Do not implement UI, MCP, Context Packages, or cross-project impact yet.
