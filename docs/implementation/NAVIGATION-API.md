# Navigation Core API

All navigation operations are asynchronous `@loxora/core` contracts. SQLite and synchronous connection details remain inside `@loxora/sqlite`.

## Operations

- `getProjectMap` returns project orientation, ordered Spaces, explicit counts, warnings, Sources, freshness, and lifecycle activity.
- `getSpaceNavigation` returns the Space and ordered Collection summaries.
- `getCollectionNavigation` returns the Collection and compact ordered Node summaries.
- `getNodeNavigation` returns Current preview and counts without loading full History.
- `getEvidenceNavigation` returns Evidence, Source, and Proposal/Revision backlinks.
- `getSourceNavigation` returns a Source and its Evidence navigation.
- `getNavigationHealth` reports bounded integrity, projection, semantic, quality, and external-reference findings.
- `rebuildNavigationProjection` atomically rebuilds one Project and exact scope.

Project Maps additionally expose ordered outgoing dependencies, incoming dependents, related Project references, frozen Relationship-binding freshness, exactly applicable Assessment freshness and severity, and redacted inaccessible stubs. One shared cross-project projection helper supplies these additions to both canonical fallback and persisted generation; the existing hierarchy builder is otherwise unchanged.

All results contain Core-provided navigation paths. Lists are deliberately non-paginated for the bounded local MVP.

## Freshness

Content and activity are independently `Fresh`, `Stale`, or `Missing`. The fingerprint version and projection version are returned with rebuild and failure metadata. A version mismatch is never Fresh.

Canonical fallback and persisted generation use the same `NavigationProjectionBuilder`. Reads never implement a separate SQL projection algorithm.

Milestone 4 keeps that rule for its additions through the shared cross-project Project Map helper. Relationship acceptance contributes to content freshness for both endpoint Projects; Impact Assessment creation contributes activity freshness. A later endpoint Revision changes existing content fingerprints and derives stale Relationship or Assessment bindings without mutating them.

## Preview and ordering

Current content is trimmed, Unicode whitespace is collapsed, and output is limited to 160 Unicode code points using 157 points plus `...`. Spaces, Collections, and Nodes use normalized display ordering with stable IDs as tie-breakers. Evidence and Sources use stable ID ordering; Revisions retain lineage order.

## Warnings

Quality warnings do not block navigation. `SemanticOrphan` covers a Node lacking usable Current knowledge; `ProjectionOrphan` covers canonical knowledge absent from an active projection. Health reporting never authorizes automatic restructuring.
