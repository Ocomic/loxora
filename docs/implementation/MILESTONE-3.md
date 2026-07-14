# Milestone 3: Persisted Navigation Foundation

**Status:** Implemented locally
**Decision Owner:** Ocomic
**Authorization date:** July 14, 2026
**Scope:** Hackathon MVP Milestone 3 only

## Implemented capability

Milestone 3 adds persistent, progressive navigation over the immutable lifecycle foundation:

```text
Project Map → Space → Collection → Node → Current or History → Evidence and Source
```

Project purpose and Space/Collection descriptions are canonical metadata. Empty legacy values remain valid and produce `MissingProjectPurpose`, `MissingSpaceDescription`, or `MissingCollectionDescription` quality warnings without becoming structural orphans.

## Projection and fallback

`NavigationProjectionBuilder` is the single deterministic transform used by persisted rebuilds and canonical fallback reads. Missing or stale projections cannot hide canonical knowledge. Fresh reads use the active persisted generation; stale or missing content uses builder-produced canonical output with an explicit freshness classification.

Projection generations and entries are derived and replaceable. Rebuild creates a candidate generation and atomically switches the active pointer. A failed rebuild preserves the prior generation and canonical lifecycle state.

## Fingerprints

`sha256-canonical-json-v1` is a projection-freshness mechanism, not a permanent content-addressing contract. Fingerprint generation is isolated behind the builder. A future projection format may introduce another fingerprint version.

The Project/scope-wide fingerprint is an intentional Hackathon simplification. Content and activity fingerprints are separate: accepted revisions and Current changes affect content; Rollback Events affect activity. Recording rollback therefore does not invalidate or alter a valid Current preview. Restoration acceptance changes content because it creates a new Current Revision.

## Counts and temporal rules

Navigation uses unambiguous `nodeCount`, `currentNodeCount`, `acceptedRevisionCount`, `historicalRevisionCount`, and `nodesWithHistoryCount` fields. Historical Revision content is never used for Current previews. History is loaded only through the explicit lifecycle History operation.

## Migration 003

`003_navigation_foundation` adds backward-compatible metadata columns, projection generations, active state, inspectable hierarchy entries, warnings, and ownership constraints. Schema 001 and 002 databases migrate forward without resetting lifecycle data.

## Known limits

This milestone does not complete RFC-004 rollback reconciliation or the full RFC-006 Project Map. Planned Knowledge, cross-project dependencies and impact, Context Packages, MCP, HTTP, UI, search, import, export, permissions, effective time, and external locator availability remain deferred.

## Exact next recommended milestone

> Implement Milestone 4: evidence-backed typed cross-project dependencies and deterministic impact paths that are discoverable from both affected Project Maps. Preserve lifecycle, navigation freshness, and project ownership; do not implement Context Packages, MCP, or Planned Knowledge yet.
