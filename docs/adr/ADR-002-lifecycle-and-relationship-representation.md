# ADR-002 — Lifecycle and Relationship Representation

**Status:** Accepted for Hackathon MVP
**Date:** July 13, 2026
**Decision Owner:** Ocomic

## Context

The Hackathon MVP must demonstrate review before canon, immutable revisions, supersession, restoration, temporal separation, and evidence-backed cross-project impact. It must do so without implementing every long-term Loxora concept as a separate storage subsystem.

## Hackathon MVP decision

Represent accepted knowledge as immutable Knowledge Revisions belonging to stable Knowledge Nodes. Use a minimal Proposal and Review Decision workflow to create those revisions. Represent intra-project and cross-project connections as typed, evidence-backed Relationship records.

Project Maps, Spaces, Collections, and Nodes are the stored navigation structure required by the MVP. Indexes and summaries may be projections of that structure and its revisions rather than separately governed storage models.

This ADR defines conceptual representation only. It does not define database tables or a functioning schema.

Accepted Revision content and acceptance facts are immutable. Current is derived from a separate Current pointer. Historical is derived from accepted Revisions that are no longer referenced as Current. Later supersession and restoration relationships must add lineage without mutating prior Revision content.

This acceptance is limited to explicitly authorized Hackathon MVP milestones and does not establish permanent lifecycle or relationship architecture.

## Proposal and review

A submitted Proposal contains the proposed knowledge, intended scope, Evidence references, and requested transition. Submission freezes the reviewed payload.

A Review Decision is either Accepted or Rejected and records:

- reviewer;
- timestamp;
- reason;
- scope;
- Evidence references.

Acceptance atomically creates the relevant immutable Knowledge Revision and applies the transition. Rejection preserves the proposal and decision history but creates no accepted revision.

## Supersession

Accepting V2:

- creates a new immutable successor to V1;
- records the reason, evidence, proposal, and review;
- makes V2 current for the accepted scope;
- classifies V1 as superseded or historical for current queries;
- invalidates affected navigation projections, summaries, Context Packages, and relationship assessments.

## Restoration

Accepting V3 after rollback:

- creates a new immutable revision;
- preserves V1 and V2;
- links V3 to V1 as the compatible semantic predecessor;
- links V3 to V2 as the rolled-back revision;
- records new evidence, context, reason, proposal, and review;
- makes V3 current only after acceptance.

Restoration does not reactivate V1 or erase V2.

## Temporal representation

- **Current** selects the accepted canonical revision applicable to the requested scope.
- **History** exposes ordered lineage, previous applicability, review decisions, evidence, and transition reasons.
- **Planned** contains future intent with its own planning state and must not be treated as implemented or canonical.

For the demo, historical V2 and the deferred plan to revisit the V2 direction are distinct records. The plan may reference V2 without changing V2's historical lifecycle state.

## Relationship representation

Every relevant Relationship records:

- source and target Projects or Nodes;
- semantic relationship type and direction;
- scope;
- Evidence and provenance;
- confidence;
- review state;
- visibility or access scope;
- lifecycle or validity information where applicable.

The MVP relationship from `customer-portal` to `identity-contract` is navigable in both directions. Traversal output must explain the path rather than return an unexplained match.

## Navigation projections and invalidation

Project Maps, Space and Collection listings, summaries, search results, and Context Packages are derived views over the accepted structure and lifecycle state.

After an accepted change, affected projections must be regenerated or marked stale. A stale projection must not silently present superseded knowledge as current.

The MVP must detect orphaned demo Nodes. Automatic restructuring remains out of scope; detection produces a reviewable finding.

## Alternatives

### Mutable knowledge records with audit events

This is simpler to store but makes it easier to lose the exact accepted content and obscures restoration lineage.

### Full claim-level lifecycle

Claim-level versioning could improve precision but would expand the model and review surface beyond the MVP.

### Separate stored models for every index and summary

This would align literally with every conceptual term but add unnecessary synchronization and governance complexity for the demo.

## Consequences

- Lifecycle correctness is centralized and testable.
- Review decisions remain traceable without a large workflow engine.
- Current, historical, and planned knowledge cannot be selected solely by recency.
- Relationship traversal remains explainable and permission-aware.
- Projection invalidation becomes a required consequence of accepted revisions.
- The model can later expand to claim-level lifecycle or richer governance through a superseding ADR.

## Implementation status

Milestone 1 implemented immutable initial Revisions and Current pointers. Milestone 2 implements successor and restoration Revisions, dedicated Rollback Events, typed Revision Relationships, stale-current protection, and deterministic History. Milestone 3 implements replaceable navigation projections. Milestone 4 implements reviewed immutable cross-project `DependsOn` Relationships and revision-bound Impact Assessments. Milestone 5 derives ephemeral lifecycle-filtered Context Packages. Milestone 6 adds append-only explicit Planned Knowledge as a separate non-canonical temporal view; it does not change Current/History or add Planned review/status-transition governance.

## Related documents

- RFC-002 — Core Concepts & Terminology
- RFC-003 — Knowledge Lifecycle
- RFC-004 — Development Workflow
- RFC-006 — Knowledge Navigation & Progressive Context
- RFC-007 — Initial Architecture and Hackathon MVP Boundaries
- ADR-001 — Runtime, Workspace, and MVP Persistence
