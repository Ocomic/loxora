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

## Change impact rule

When one foundational RFC changes, reviewers should inspect the RFCs and components listed in its `Depends on` and `Constrains` columns.

A documentation update is incomplete when it creates terminology, lifecycle, workflow, preparation, or navigation contradictions elsewhere.
