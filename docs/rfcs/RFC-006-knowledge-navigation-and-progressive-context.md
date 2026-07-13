# RFC-006 — Knowledge Navigation & Progressive Context

**Status:** Draft  
**Version:** 0.2  
**Last Updated:** July 2026

## Purpose

This RFC defines how humans and AI agents navigate Loxora's project knowledge without becoming lost in an unstructured graph or loading unnecessary information.

Loxora should behave like a well-organized shared memory palace or library:

- a clear entrance provides orientation,
- rooms organize knowledge by meaningful domains,
- indexes explain what can be found where,
- summaries allow fast relevance decisions,
- detailed knowledge is opened only when needed,
- history remains reachable without being confused with the present,
- planned states remain distinguishable from implemented reality,
- and explicit pathways connect related knowledge within and across projects.

## Core rule

> Navigate before loading. Every important knowledge item must be reachable through clear, meaningful, and maintainable paths.

A graph alone is not enough. A graph without orientation, hierarchy, summaries, and maintenance becomes a maze.

## Goals

Loxora navigation should ensure that:

- users and agents can quickly understand what knowledge exists,
- relevant knowledge can be found without scanning the full project,
- each navigation level explains the next level,
- current, historical, and planned knowledge remain separate,
- relationships are meaningful rather than decorative,
- orphaned knowledge is detectable,
- duplicate and contradictory structures are visible,
- cross-project dependencies are discoverable,
- access restrictions remain explicit,
- and Context Packages can be assembled progressively under a token budget.

## Conceptual model

The preferred conceptual structure is:

```text
Workspace
└── Project
    ├── Project Map
    ├── Knowledge Spaces
    │   ├── Space Index
    │   └── Knowledge Collections
    │       ├── Collection Summary
    │       ├── Table of Contents
    │       └── Knowledge Nodes, Claims, Revisions, and Sources
    ├── Temporal Views
    │   ├── Past
    │   ├── Current
    │   └── Planned
    └── Project Relationships
        ├── Dependencies
        ├── Shared Knowledge
        ├── Reuse
        └── Impact Paths
```

This structure is conceptual. It does not require a specific file layout, database schema, or UI.

## Project Map

The Project Map is the primary orientation layer for a project.

It should provide a compact overview of:

- the project's purpose,
- major Knowledge Spaces,
- a short description of each space,
- current priorities,
- important decisions,
- active risks and conflicts,
- planned changes,
- recent significant knowledge changes,
- external knowledge sources,
- project dependencies,
- and known navigation gaps.

The Project Map must not attempt to contain the entire project. It is a map, not the territory.

An agent entering a project should normally read the Project Map before loading detailed knowledge.

## Knowledge Space

A Knowledge Space is a coherent domain of project knowledge.

Examples include:

- Architecture
- Product
- Gameplay
- Characters
- Lore
- Research
- Operations
- Security
- Business
- Decisions
- Planning

A Knowledge Space should have:

- a clear purpose,
- an explicit scope,
- an owner or governance scope when applicable,
- a Space Index,
- relationships to adjacent spaces,
- and a signal when its organization is incomplete or stale.

Spaces should not become arbitrary folders. A space exists because it represents a meaningful domain or access boundary.

## Space Index

A Space Index explains what exists inside a Knowledge Space.

It should list major Knowledge Collections or important nodes with:

- title,
- concise description,
- lifecycle or temporal relevance,
- scope,
- key relationships,
- and optional freshness or review indicators.

The index should help an agent decide what to open next without reading every item.

## Knowledge Collection

A Knowledge Collection groups related knowledge that is useful to navigate together.

Examples include:

- an authentication subsystem,
- a game feature,
- a character arc,
- a research topic,
- a release line,
- an incident,
- a business process,
- a migration.

A collection should provide:

- a Collection Summary,
- a Table of Contents or equivalent navigation structure,
- key current knowledge,
- linked historical knowledge,
- planned states,
- related sources,
- and links to adjacent collections or projects.

Collections must not duplicate the underlying canonical knowledge. They organize and summarize it.

## Knowledge Index

A Knowledge Index is a navigational representation that points to knowledge items and explains their relevance.

Indexes may exist at workspace, project, space, collection, temporal, or cross-project level.

Indexes are derived knowledge and must preserve:

- scope,
- provenance,
- generation or update time,
- included item references,
- lifecycle assumptions,
- and invalidation state.

An index that no longer reflects its underlying knowledge must be marked stale and refreshed.

## Knowledge Summary

A Knowledge Summary is a compact derived representation of underlying knowledge.

Summaries must:

- identify their scope,
- reference the knowledge or sources they summarize,
- distinguish current, historical, and planned information,
- preserve uncertainty and unresolved conflicts,
- carry a freshness or invalidation signal,
- and never silently replace the underlying knowledge.

A summary may be regenerated when its inputs change.

## Progressive disclosure

Loxora should reveal knowledge progressively:

```text
Workspace Map
→ Project Map
→ Space Index
→ Collection Summary
→ Table of Contents
→ Knowledge Node or Claim
→ Revision
→ Evidence and Source
```

The system should begin at the shallowest level that can answer the task reliably.

Deeper levels are opened only when:

- the summary is insufficient,
- evidence is required,
- a conflict must be resolved,
- historical reasoning is relevant,
- implementation details are needed,
- or the user explicitly requests more depth.

This approach reduces token use while preserving explainability.

## Navigational paths

Every important knowledge item should have at least one meaningful path from a Project Map or Space Index.

Preferably, it should have:

- one primary organizational path,
- zero or more typed relationship paths,
- one provenance path to supporting evidence,
- and, where relevant, one temporal path to predecessor or successor revisions.

Navigation paths must use meaningful relationship types such as:

- belongs to,
- depends on,
- implements,
- informs,
- supersedes,
- restores,
- contradicts,
- derived from,
- planned for,
- affects,
- shared with,
- reused by.

Generic links without semantic meaning should be avoided.

## Anti-maze rules

To prevent Loxora from becoming a knowledge maze:

1. Every important item must be reachable from an index or map.
2. Every index entry must have a concise description.
3. Every relationship must have a meaningful type.
4. Duplicate concepts should be merged, linked, or explicitly distinguished.
5. Orphaned knowledge must be detected and reviewed.
6. Broken links must be detectable.
7. Cycles are allowed only when semantically meaningful and should not prevent orientation.
8. Navigation should not depend on knowing exact internal identifiers.
9. Search results should show scope, state, time, and location.
10. Historical and planned items must not appear as current merely because they are highly connected.
11. Restricted knowledge must appear as inaccessible or partially visible, not as nonexistent.
12. Important cross-project relationships must be surfaced at project level.

## Orphan and dead-end detection

A knowledge item is potentially orphaned when it has no meaningful route from a Project Map, Space Index, Collection, or explicit search index.

A navigation dead end occurs when an item references a concept without providing a usable path to it.

Loxora should eventually detect:

- orphan nodes,
- broken references,
- empty spaces,
- duplicate collections,
- circular navigation without an exit,
- stale indexes,
- summaries whose sources changed,
- and heavily referenced knowledge missing from higher-level maps.

Detection does not automatically authorize restructuring. Agents may propose repairs; governance decides shared canonical organization.

## Search and browsing

Search and browsing complement each other.

Browsing is preferred when:

- the user needs orientation,
- the domain is unfamiliar,
- the query is broad,
- or relationships and context matter.

Search is preferred when:

- the target is specific,
- known terminology exists,
- or the user needs direct retrieval.

Search results should include enough metadata to avoid ambiguity:

- project,
- Knowledge Space,
- collection,
- short summary,
- lifecycle state,
- temporal view,
- confidence or review signal,
- and key relationships.

Vector search, keyword search, graph traversal, and indexes may all support retrieval, but none replaces explicit navigation structure.

## Temporal navigation

Loxora must support three primary temporal views:

### Past

What was previously accepted, implemented, attempted, rejected, or rolled back?

### Current

What is currently canonical, active, and applicable within the requested scope?

### Planned

What is proposed, approved, in progress, deferred, or otherwise intended for the future?

Planned Knowledge is not current fact.

Possible planning states include:

- Idea
- Candidate
- Approved Plan
- In Progress
- Deferred
- Abandoned
- Completed

Completion does not automatically make a plan canonical knowledge. Verification and knowledge review are still required.

Temporal views should allow users and agents to ask:

- What was true at a given time?
- What is true now?
- What is planned next?
- Which plan replaced another?
- Which implementation was rolled back?
- Which historical decision still affects the present?

## Conversation distillation

Chat history is a Source, not the preferred everyday navigation format.

Loxora should distill significant conversations into structured knowledge such as:

- confirmed requirements,
- decisions,
- rationale,
- rejected alternatives,
- unresolved questions,
- discoveries,
- risks,
- plans,
- and changes to previous understanding.

A Conversation Digest should preserve references to the source conversation and identify what was extracted.

Routine wording, repetition, greetings, and irrelevant turns do not need to become project knowledge.

## Shared project intelligence

Loxora represents shared project intelligence for humans and agents.

Shared knowledge may be contributed by:

- team members,
- coding agents,
- review agents,
- local models,
- external models,
- connectors,
- and automated analysis.

Shared does not mean unrestricted.

Navigation must respect:

- workspace and project boundaries,
- permissions,
- personal versus shared knowledge,
- agent identity,
- provenance,
- review state,
- and cross-project sharing policies.

## Cross-project navigation

Projects must not appear as isolated islands when meaningful relationships exist.

The Project Graph should expose relationships such as:

- depends on,
- provides to,
- shares component with,
- reuses knowledge from,
- inspired by,
- supersedes,
- migrates from,
- compatible with,
- affects,
- and conflicts with.

A Project Map should summarize important incoming and outgoing relationships.

Cross-project navigation should allow a user or agent to move from:

```text
Project A
→ dependency or shared concept
→ Project B
→ affected Knowledge Space
→ relevant current knowledge
```

Every cross-project relationship should preserve:

- source and target projects,
- relationship type,
- evidence,
- confidence,
- scope,
- access policy,
- and review state.

A relationship may be visible while its restricted target details remain inaccessible.

## Dependency paths and impact navigation

Dependencies should be navigable as paths, not only listed as labels.

For example:

```text
Project A authentication client
→ depends on
Shared identity package
→ published by
Project B
→ governed by
ADR-017
→ planned change
Token format migration
```

This path enables impact questions such as:

- Which projects are affected by this change?
- Why are they affected?
- Which evidence supports the dependency?
- Which current decisions govern the relationship?
- Which planned changes may break compatibility?

## Navigation health

Navigation quality is a maintained property.

Useful health signals may include:

- orphan count,
- broken-link count,
- stale index count,
- stale summary count,
- duplicate concept candidates,
- unresolved conflicts,
- inaccessible referenced sources,
- missing project relationships,
- and high-value nodes without clear entry paths.

These signals should support review and maintenance rather than encourage uncontrolled automatic rewriting.

## Context Package construction

Context Packages should use progressive navigation rather than bulk loading.

A Context Builder should conceptually:

1. identify project and task scope,
2. read the relevant Project Map,
3. select likely Knowledge Spaces,
4. inspect summaries and indexes,
5. follow typed relationships,
6. apply lifecycle, temporal, and permission filters,
7. open detailed nodes only when necessary,
8. include evidence or history only when relevant,
9. deduplicate overlapping knowledge,
10. stop when the task is sufficiently supported or the token budget is reached.

The resulting package should explain what was included, what was omitted, and whether relevant inaccessible knowledge exists.

## Bootstrap implications

Project preparation and bootstrap should create or propose:

- an initial Project Map,
- candidate Knowledge Spaces,
- initial Space Indexes,
- important Collections,
- current, past, and planned distinctions,
- cross-project relationships,
- and navigation gaps requiring review.

Bootstrap must not fabricate a complete organization where evidence is insufficient.

## MVP implications

For the Build Week MVP, Loxora should demonstrate at least:

1. a Project Map for two projects,
2. navigation from map to space to collection to detailed knowledge,
3. concise summaries at each level,
4. separation of current and historical knowledge,
5. one planned-state view,
6. one cross-project dependency path,
7. an impact question that follows that path,
8. and a token-budgeted Context Package that avoids loading unrelated spaces.

A full visual memory palace is not required. A clear hierarchical UI, graph, or hybrid navigator is sufficient.

## Implications

This RFC affects:

- Project Map design,
- Knowledge Space organization,
- indexes and summaries,
- Knowledge Graph,
- Project Graph,
- search and retrieval,
- Context Builder,
- Context Packages,
- bootstrap,
- conversation ingestion,
- lifecycle and temporal views,
- permissions,
- cross-project analysis,
- navigation-health tooling,
- UI and MCP interfaces,
- and the Build Week demo.

## Non-goals

This RFC does not define:

- a mandatory visual metaphor,
- a specific graph database,
- a fixed folder hierarchy,
- a universal taxonomy for all domains,
- a final search engine,
- or automatic restructuring without review.

## Open questions

- Should Knowledge Collections be first-class stored objects or derived views?
- Which indexes are manually curated versus generated?
- How should taxonomy differ across profiles?
- What is the minimum metadata needed for useful navigation?
- How should navigation health be scored?
- How should aliases and terminology drift be handled?
- How should restricted cross-project relationships appear?
- How often should summaries and indexes be regenerated?
- Can agents propose reorganization safely without causing churn?
- How should very large workspaces provide a workspace-level map?

## Closing statement

A project memory is useful only when its knowledge can be found, understood, and trusted.

Loxora must not become a warehouse of disconnected facts or an attractive but confusing graph.

It should provide a clear map, meaningful rooms, reliable indexes, traceable books, understandable history, and explicit pathways between related projects.