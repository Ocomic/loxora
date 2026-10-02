# ADR-003 — Deterministic Workspace Export Format

**Status:** Proposed
**Date:** October 2, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (new public contract; see RFC-008)

## Context

ADR-001 requires "a deterministic, lossless export format for project-owned knowledge" and states that the export contract "must be versioned, lossless for MVP concepts, stably ordered, and able to reconstruct Projects, navigation structure, Proposals, Review Decisions, Revisions, Sources, Evidence, Planned Knowledge, and Relationships". It proposes JSON and explicitly leaves acceptance of the format open.

The Hackathon closed without export. `docs/hackathon/ACCEPTANCE-MATRIX.md` records portability as a "Deferred gap", and `docs/planning/open-questions.md` states that the repository must not claim portability until a lossless, inspectable export can reconstruct canonical knowledge without an external service.

Without export, the principle "projects own their knowledge" (RFC-000, RFC-001) depends on a SQLite file and on the `node:sqlite` adapter, which ADR-001 describes as replaceable.

## Decision

Introduce a versioned, canonical JSON **workspace export** and a matching **restore into an empty store**.

### Scope: one workspace

Version 1 exports the whole workspace, which is every Project in one store.

Cross-project Relationships, Relationship Review Decisions, Impact Assessments, Planned Knowledge, and their Evidence links reference records in two Projects. A per-Project export needs explicit rules for edges that leave the Project (omit, stub, or reference). Those rules are deferred to a later ADR.

### Document envelope

```json
{
  "format": "loxora.workspace-export",
  "formatVersion": 1,
  "sourceSchema": ["001_initial_lifecycle", "..."],
  "sections": { ... }
}
```

- `format` and `formatVersion` identify the contract. A reader rejects an unknown `format` or an unsupported `formatVersion`.
- `sourceSchema` lists the applied persistence migrations. It is informational and helps diagnose an export, but readers do not depend on it.
- The document contains **no export-time timestamp, host name, path, or random value**. The same workspace state always produces the same bytes.

### Sections

Each section is an array of records. Every persisted record of the MVP concepts is included, which covers all tables of migrations 001 through 005 except `schema_migrations`.

| Section | Contents |
|---|---|
| `projects`, `knowledgeSpaces`, `knowledgeCollections`, `knowledgeNodes` | Workspace and navigation structure |
| `sourceReferences`, `evidenceReferences` | Sources and Evidence |
| `knowledgeProposals`, `proposalSources`, `proposalEvidence` | Proposals and their links |
| `reviewDecisions`, `reviewDecisionEvidence` | Review Decisions |
| `knowledgeRevisions`, `revisionEvidence`, `currentRevisions` | Immutable revisions and current pointers |
| `revisionRelationships`, `revisionRelationshipEvidence` | Intra-project lineage |
| `rollbackEvents`, `rollbackEventEvidence` | Rollbacks |
| `crossProjectRelationshipProposals`, `...ProposalEvidence`, `...ReviewDecisions`, `...ReviewEvidence`, `crossProjectRelationships`, `crossProjectRelationshipEvidence` | Cross-project relationships |
| `impactAssessments`, `impactAssessmentEvidence` | Impact assessments |
| `plannedKnowledgeItems`, `plannedKnowledgeNodes`, `plannedKnowledgeEvidence` | Planned Knowledge |
| `auditEvents`, `auditEventEvidence` | Audit history |
| `derived.navigationProjectionGenerations`, `derived.navigationProjectionState`, `derived.navigationProjectionEntries`, `derived.navigationProjectionWarnings` | Navigation projections (derived) |

Records use domain field names in camelCase, not SQL column names. A field that is `NULL` in storage is present with the value `null`, so absent and empty cannot be confused.

Mutable rows (for example Proposal status, current-revision pointers, and Relationship freshness) are exported in their current state. Their history is preserved by the append-only Audit Events, Review Decisions, Rollback Events, and immutable Revisions that are exported alongside them.

### Derived data is exported, not regenerated

Navigation projections are derived from canonical knowledge, but rebuilding them writes new generations and Audit Events. Regenerating on restore would therefore change the workspace and make an exact round trip impossible.

Version 1 exports projections verbatim under `derived` and restores them verbatim. Consumers that only need canonical knowledge may ignore `derived`.

### Canonical serialization

- UTF-8, LF line endings, 2-space indentation, and a single trailing newline.
- Object keys are sorted lexicographically at every level, the same rule as the existing Context Package fingerprint (`stableJson` in `packages/core/src/context-package.ts`).
- Records in each section are sorted by primary key. For composite keys, the key columns are compared in declared order.
- Numbers are emitted as JSON numbers, and booleans as JSON booleans. Timestamps stay in their stored ISO-8601 string form.

### Digest

The exporter reports the SHA-256 of the canonical bytes, for example on the command line or in a sidecar file. The digest is **not** stored inside the document, so the document stays self-identical.

### Restore

- Restore targets an **empty** store only. A store that already contains any Project is rejected before any write.
- Restore runs in a single transaction with deferred foreign-key checks. Proposals and Revisions reference each other, so inserts are not order-independent. A foreign-key or constraint violation aborts the whole restore and leaves the target empty.
- Restore inserts records exactly as exported. It does not call Core lifecycle operations, create Audit Events, or rebuild projections.
- Merging into a non-empty store, partial import, and import from other formats are out of scope.

### Losslessness proof

An implementation of this ADR is accepted only if the following hold for the curated demo workspace in every reset stage:

1. Exporting the same workspace twice produces identical bytes.
2. Export, then restore into an empty store, then export again produces identical bytes.
3. After restore, `getProjectMap`, `getKnowledgeHistory`, cross-project impact results, and the Context Package fingerprint equal those of the original store.

## Alternatives

### Copy the SQLite file

This is simple and exact, but it is neither inspectable without SQLite tooling nor independent of the persistence implementation. ADR-001 rejects SQLite as permanent canonical storage, so a file copy cannot be the portability contract.

### Raw table dump

A dump keyed by table and column names would be lossless but would make the SQLite schema the public contract. Domain-named sections let the persistence schema change without breaking exports.

### Replay through Core operations

Restoring by replaying proposals, reviews, and rollbacks through the Core would validate every transition. It cannot reproduce identifiers, timestamps, and Audit Events exactly, so it fails the round-trip proof. It may become a separate validation tool later.

### Per-Project export first

This is closer to "each project owns its knowledge", but it requires cross-project edge rules before any export exists. It is deferred rather than rejected.

### Regenerate derived projections on restore

This produces a smaller and arguably cleaner export, but it changes Audit history on restore. It is rejected for version 1.

## Consequences

- Portability can be tested and claimed for the MVP concepts once the implementation passes the losslessness proof.
- The export format becomes a public contract. Changing it requires a new `formatVersion` and an ADR update (C2).
- Every future schema migration must update the exporter, the restorer, and the round-trip tests in the same change.
- An export contains everything in the workspace, including Audit Events and actor identifiers. Mixed-visibility export (public, private-project, local-only) remains an open question and must be resolved before exports are shared across visibility boundaries.
- The export is a snapshot. It does not provide synchronization, merging, or incremental backup.

## Implementation (after acceptance)

Implementation is a separate milestone (Milestone 7) authorized by a milestone document under `docs/implementation/`. The intended shape is:

- **Core:**
  - export types, a format validator, and the canonical serializer;
  - an `ExportStore` port with `readWorkspaceExport()` and `restoreWorkspaceExport(document)`.
- **SQLite adapter:** ordered reads and transactional restore.
- **CLI:**
  - export a workspace to a file and print its digest;
  - verify a file by round-tripping it through a temporary store.
- **Tests:** the losslessness proof above, plus rejection of non-empty targets, unknown versions, and constraint violations without partial writes.

## Open questions

- Per-Project export and cross-project edge rules.
- Mixed-visibility export and redaction.
- Whether a future version should also offer a canonical-only profile that excludes `derived` and Audit Events.
- Compression or splitting for large workspaces.

## Related documents

- `docs/adr/ADR-001-runtime-workspace-and-mvp-persistence.md`
- `docs/adr/ADR-002-lifecycle-and-relationship-representation.md`
- `docs/rfcs/RFC-007-initial-architecture-and-mvp-boundaries.md`
- `docs/rfcs/RFC-008-post-hackathon-governance.md`
- `docs/hackathon/ACCEPTANCE-MATRIX.md`
