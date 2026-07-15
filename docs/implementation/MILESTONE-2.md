# Milestone 2: Supersession, Restoration, and Deterministic History

**Status:** Implemented and merged for the Hackathon MVP

**Decision Owner:** Ocomic

**Authorization date:** July 14, 2026

## Implemented capability

Milestone 2 extends the persistent Milestone 1 foundation with a real, data-driven lifecycle:

```text
Canonical V1
→ accepted Successor V2 supersedes V1
→ explicit Rollback Event
→ accepted Restoration V3 restores V1-compatible semantics
→ Current returns V3 only
→ History returns V1 → V2 → V3
```

The implementation does not branch on demo project names, identifiers, or content. The `customer_id` → `subject_id` → compatible restoration story remains curated scenario data.

## Lifecycle rules

- Successor and Restoration Proposals target an existing Node and freeze an expected Current Revision.
- Acceptance revalidates that expectation under `BEGIN IMMEDIATE` and updates Current with compare-and-swap semantics.
- Stale acceptance raises `CurrentRevisionMismatchError` without a Decision or partial transition. A stale Proposal may still be explicitly Rejected.
- V1 and V2 remain immutable. Historical, Superseded, Reverted, and RestorationSource classifications are derived from the Current pointer and typed lineage.
- A Rollback Event is an append-only decision record. It does not reactivate V1 or itself create a Revision.
- V3 is a new accepted Revision with `DirectPredecessor`, `Supersedes`, and `Reverts` links to V2 and `RestoredFrom` to V1.
- History follows `DirectPredecessor` lineage, never timestamp recency. Missing, branched, orphaned, or cyclic accepted lineage produces `InvalidLineageError`.

## Migration 002

`002_lifecycle_lineage` safely rebuilds the Proposal table to remove the one-Proposal-per-Node constraint and add transition metadata. It preserves populated Milestone 1 databases and adds Rollback Events, typed Revision Relationships, normalized Evidence joins, ownership constraints, indexes, cycle prevention, and append-only triggers.

The migration runner disables foreign-key enforcement only around the referenced-table rebuild, outside the transaction. Schema changes, copied data, `foreign_key_check`, and migration-history insertion remain atomic. Foreign keys are restored in `finally`; failure leaves migration 002 unrecorded and retryable.

Migration 002 is forward-only. Valuable databases should be copied before upgrade; returning to Milestone 1 requires the earlier code and an unupgraded database copy.

## Audit and correlation

Proposal submission, rollback recording, and review acceptance are separate transactions with separate correlation IDs. The durable Rollback Event ID connects the restoration workflow across transactions. New lifecycle Audit Events preserve actor, reason, affected Revisions, transition, Evidence, timestamp, and correlation. Audit Events, Rollback Events, Relationships, and their Evidence joins are append-only.

## Verification coverage

Automated tests cover Milestone 1 compatibility, V2 supersession, V3 restoration, deterministic History, immutable V1, stale and competing Proposals, explicit stale rejection, fault rollback after Current change, close/reopen persistence, cycle and self-link defense, append-only records, migration failure recovery, and a populated 001-to-002 upgrade.

## Known limits

This is not the complete RFC-004 rollback workflow. No navigation projections, summaries, indexes, cross-project impact assessments, or invalidation hooks exist yet. Recorded and effective time remain unseparated. `node:sqlite` remains a replaceable release-candidate MVP adapter behind asynchronous Core ports.

Planned Knowledge, cross-project Relationships, impact analysis, Project Maps, Context Packages, MCP, HTTP, UI, import, export, authentication, permissions, synchronization, FTS, and embeddings are deliberately deferred.

## Exact next recommended milestone

> Implement Milestone 3: project-owned navigation foundations using persisted Project Maps and projection-based Space/Collection/Node listings, with lifecycle-visible Current and History navigation, parent/return paths, orphan detection, and invalidation hooks connected to accepted lifecycle transitions. Do not implement cross-project impact, Context Packages, MCP, or UI polish beyond the minimum navigation proof.
