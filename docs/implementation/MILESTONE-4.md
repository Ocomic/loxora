# Milestone 4: Reviewed Cross-Project Dependencies and Deterministic Impact

**Status:** Implemented and merged to `main`
**Decision Owner:** Ocomic
**Authorization date:** July 14, 2026
**Scope:** Hackathon MVP Milestone 4 only

## Implemented capability

Milestone 4 adds one bounded, data-driven cross-project path:

```text
consumer Current Revision
→ reviewed immutable DependsOn Relationship
→ provider Revision changes
→ deterministic one-hop DependedOnBy traversal
→ revision-bound Impact Assessment
→ both Project Maps
```

Relationship Proposals freeze the Current consumer and provider Revision IDs. Only the configured review policy may accept a Proposal; the Hackathon composition configures `Ocomic`. Acceptance rechecks both Current pointers, writes one Review Decision and immutable Relationship, preserves project-qualified Evidence, and appends correlated Audit Events for both endpoint Projects. Rejection creates no Relationship. Neither decision changes a Knowledge Revision or Current pointer.

## Relationship and Assessment bindings

The accepted Relationship keeps its reviewed endpoint bindings forever. `relationshipBindingFreshness` is derived by comparing those bindings with both Current pointers.

An Impact Assessment is a separate immutable derived record. It may bind a newer provider Revision and the consumer Revision that is Current at assessment time. It never edits the Relationship, either endpoint Project, or canonical knowledge. `assessmentFreshness` independently compares the Assessment pair with Current.

Selection requires an exact provider and consumer Revision pair. Exact candidates sort Fresh before Stale, then newest `assessedAt`, then stable Assessment ID. When no exact candidate exists, the dependency path remains visible with `NoApplicableImpactAssessment`; unrelated historical Assessments are never substituted.

## Deterministic assessment

`loxora-impact-severity-v1` evaluates structured compatibility, requirement, criticality, and observed-failure facts into Low, Medium, High, or Critical severity.

`sha256-impact-assessment-basis-json-v1` hashes a stable basis containing Relationship ID, provider Revision ID, consumer Revision ID, normalized facts, sorted project-qualified Evidence IDs, and evaluator version. Actor, correlation ID, Assessment ID, and recorded time are excluded. This is a replaceable deterministic basis identifier, not a permanent universal content-addressing contract.

## Visibility

Visibility is intentionally limited to `SharedBetweenProjects` and `Restricted` plus service-provided readable Project IDs. An inaccessible endpoint is returned as a minimal stub with `InaccessibleEndpoint`; protected titles, content, Evidence, Sources, and explanation details are omitted. This is not authentication or a production permission engine.

## Project Map and freshness

One small shared cross-project projection helper adds outgoing dependencies, incoming dependents, related Projects, binding freshness, exact Assessment summaries, severity, warnings, and endpoint paths to the existing Project Map build. Canonical fallback and persisted rebuild use that same path.

Relationship acceptance affects content and activity freshness for both Projects. Assessment creation affects activity. Endpoint Revision acceptance already changes canonical content freshness and may make frozen bindings stale. Projection failure cannot roll back canonical Relationship or Assessment transactions.

## Migration 004

`004_cross_project_impact` adds Relationship Proposals, project-qualified Evidence joins, Review Decisions, immutable accepted Relationships, immutable Impact Assessments, indexes for endpoint traversal and exact Revision pairs, and append-only triggers. Composite foreign keys retain Project, Node, scope, and Revision ownership. Migration applies after schemas 001–003 without resetting lifecycle or navigation state.

## Validation and limits

Tests cover review policy, acceptance/rejection boundaries, endpoint and Evidence ownership, frozen bindings, stale/fresh separation, exact Assessment applicability, deterministic fingerprints and severity, reverse traversal, both Project Maps, Restricted redaction, immutability, close/reopen, migration application, and fault rollback.

Intentionally deferred: Planned Knowledge, Context Packages, MCP, HTTP, UI, search, FTS, embeddings, import, export, authentication, production permissions, synchronization, generalized graph traversal, generated explanations, and Milestone 5.

## Exact next recommended milestone

> Reconcile the approved Milestone 5 plan against the implemented `CrossProjectImpactService` and then implement a deterministic lifecycle-filtered Context Package core operation shared by future UI and read-only MCP access. Do not begin until separately authorized.
