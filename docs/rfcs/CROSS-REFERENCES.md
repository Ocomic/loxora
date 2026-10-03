# RFC Cross-References

This document explains how the foundational Loxora RFCs depend on and constrain one another.

## Reading order

1. RFC-000 — Why Loxora?
2. RFC-001 — Project Philosophy
3. RFC-002 — Core Concepts & Terminology
4. RFC-003 — Knowledge Lifecycle
5. RFC-004 — Development Workflow
6. RFC-005 — Project Preparation
7. RFC-006 — Knowledge Navigation & Progressive Context
8. RFC-007 — Initial Architecture and Hackathon MVP Boundaries
9. RFC-008 — Post-Hackathon Governance and Work Authorization
10. RFC-009 — Mission Concept and State Model
11. RFC-010 — Product UI Shell and Mission Control MVP (Proposed)

## Dependency matrix

| RFC | Depends on | Constrains | Key relationship |
|---|---|---|---|
| RFC-000 | — | all later RFCs | Defines the problem, vision, and long-term purpose. |
| RFC-001 | RFC-000 | RFC-003 to RFC-007 | Establishes the principles that later architecture and workflows must preserve. |
| RFC-002 | RFC-000, RFC-001 | RFC-003 to RFC-007 | Defines the shared language used by all later RFCs. |
| RFC-003 | RFC-001, RFC-002 | RFC-004, RFC-005, RFC-006, future architecture | Defines how knowledge changes over time and how current, historical, planned, conflicting, and restored knowledge remain distinguishable. |
| RFC-004 | RFC-001 to RFC-003 | RFC-005, RFC-006, agent prompts, implementation work | Defines how humans and agents move from idea to reviewed knowledge and implementation. |
| RFC-005 | RFC-001 to RFC-004 | bootstrap, source ingestion, initial Codex prompt | Defines how a project is inspected and reconstructed before architecture or implementation begins. |
| RFC-006 | RFC-001 to RFC-005 | retrieval, Context Packages, Project Map, Project Graph, UI, search | Defines how knowledge is organized, indexed, navigated, summarized, and connected without becoming a maze. |
| RFC-007 | RFC-000 to RFC-006 | Hackathon-only ADRs, explicitly authorized Hackathon milestones, MVP persistence, UI, MCP | Defines a bounded Hackathon vertical slice that proves lifecycle and cross-project impact without selecting permanent architecture. |
| RFC-008 | RFC-001, RFC-004, RFC-007 | `AGENTS.md`, `CONTRIBUTING.md`, all post-Hackathon milestones and pull requests | Refines RFC-004 change classes into an authorization model, keeps RFC-007/ADR-001/ADR-002 as current baseline, and reserves licensing, security, cost, and data-boundary decisions for the owner. |
| RFC-009 | RFC-002, RFC-003, RFC-004, RFC-006, RFC-008 | `docs/planning/UI-VISION.md`, future mission ADR and milestone, Mission Control UI | Defines Missions as execution state separate from knowledge, a seven-state model with typed Wait Reasons, and review-gated paths from mission results to knowledge. |
| RFC-010 (Proposed) | RFC-006, RFC-008, RFC-009 | `@loxora/app`, UI milestones, `WEB-UI.md` (frozen demo) | Defines the product UI shell, the read-only Mission Control MVP on real workspace data, the no-invented-data rule for design elements without a data source, and the transition away from the demo inspector. |

## Mandatory cross-RFC rules

### RFC-003 and RFC-006

Lifecycle state must remain visible throughout navigation.

Maps, indexes, summaries, search results, and Context Packages must not present historical, superseded, rejected, or planned knowledge as current canonical knowledge.

When underlying knowledge changes, affected summaries and indexes must be marked stale or regenerated.

### RFC-004 and RFC-006

Meaningful work that changes project knowledge should update or invalidate:

- the relevant Project Map entries,
- Space Indexes,
- Collection summaries,
- cross-project relationships,
- and affected navigation paths.

Reflections and Knowledge Updates should record these navigation effects explicitly.

### RFC-005 and RFC-006

Project preparation should not only inventory sources. It should also produce a first navigable model of the project.

Preparation should identify or propose:

- a Project Map,
- Knowledge Spaces,
- Space Indexes,
- important Collections,
- current, historical, and planned knowledge,
- external knowledge references,
- cross-project dependencies,
- inaccessible but referenced sources,
- stale summaries,
- orphaned knowledge,
- and missing navigation paths.

Bootstrap proposals must preserve source evidence and must not automatically become canonical.

### RFC-003, RFC-004, and RFC-005

A rollback or supersession must update all three layers:

1. lifecycle state and revision history,
2. workflow and decision records,
3. navigation surfaces and summaries.

A rollback is incomplete when code changed but maps, indexes, summaries, plans, or project relationships still describe the reverted state as current.

### Cross-project knowledge

RFC-003 defines lifecycle and scope.
RFC-004 defines proposal and review behavior.
RFC-005 discovers dependencies and external sources.
RFC-006 makes those relationships navigable.

Cross-project relationships must preserve:

- source project,
- target project,
- relationship type,
- evidence,
- provenance,
- confidence,
- lifecycle state,
- access scope,
- and review status.

Shared knowledge is never automatically canonical in the target project.

### RFC-007 and the Hackathon MVP

RFC-007 must preserve the terminology, lifecycle, workflow, preparation, and navigation constraints in RFC-000 through RFC-006.

Its proposed simplifications do not redefine the long-term model:

- repository import remains supporting infrastructure;
- Project Maps, Spaces, Collections, and Nodes provide the stored navigation structure;
- indexes and summaries may be projections for the MVP;
- accepted knowledge remains immutable and review-gated;
- current, historical, and planned knowledge remain separate;
- SQLite is an MVP persistence proposal, not permanent canonical architecture;
- the UI and read-only MCP adapter use the same Context Package core operation.

Changes to RFC-007 require review of both Hackathon-only ADRs and all Hackathon planning documents. Changes to RFC-003 or RFC-006 require revalidation of the lifecycle, temporal, navigation, impact, and Context Package acceptance criteria.

### RFC-004, RFC-007, and RFC-008

RFC-008 refines, and does not replace, the RFC-004 workflow and change classes. Every RFC-008 class still follows RFC-004 verification, review, reflection, and knowledge-update obligations.

RFC-008 changes the status of RFC-007, ADR-001, and ADR-002 from Hackathon-only to current baseline. It does not change their content. Changes to that baseline remain C2 changes and require a new or superseding RFC or ADR.

### RFC-003 and RFC-009

Mission States are not Knowledge States. A completed Mission does not make its results canonical; results become knowledge only through Proposals and Review as defined in RFC-003 and RFC-004. Mission telemetry must not appear in Context Packages as knowledge.

## Change impact rule

When one foundational RFC changes, reviewers should inspect the RFCs and components listed in its `Depends on` and `Constrains` columns.

A documentation update is incomplete when it creates terminology, lifecycle, workflow, preparation, or navigation contradictions elsewhere.
