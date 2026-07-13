# ADR-001 — Runtime, Workspace, and MVP Persistence

**Status:** Proposed
**Date:** July 2026
**Decision Owner:** Unassigned

## Context

RFC-007 requires a solo Hackathon implementation that shares lifecycle and Context Package behavior across a local web UI and read-only MCP adapter. The repository has no selected runtime, workspace, package manager, or storage engine.

The choice must preserve local-first operation, model independence, project ownership, inspectability, and future replacement of MVP infrastructure.

## Proposed decision

Use a TypeScript workspace with:

- a shared core library containing lifecycle, relationship, navigation, and Context Package behavior;
- a local service boundary used by the web UI;
- a local web UI;
- a read-only stdio MCP adapter;
- SQLite as the MVP persistence implementation;
- relational typed edges for knowledge and project relationships;
- FTS5 only as optional general-search support;
- a deterministic, lossless export format for project-owned knowledge.

The package manager and precise web/service frameworks remain setup-level choices only after this ADR is accepted. They must not create a second implementation of core behavior.

## Persistence boundary

SQLite is an MVP implementation choice, not a declaration that Loxora knowledge permanently belongs in SQLite or that SQLite is the final canonical storage architecture.

The MVP persistence implementation must:

- operate locally without a mandatory cloud service;
- preserve immutable revisions, review decisions, evidence, relationships, and temporal classification across restart;
- support transactional acceptance, supersession, and restoration;
- remain directly inspectable with standard SQLite tooling;
- provide deterministic export without external service dependencies;
- keep generated Context Packages temporary rather than canonical knowledge.

The export contract must be versioned, lossless for MVP concepts, stably ordered, and able to reconstruct Projects, navigation structure, Proposals, Review Decisions, Revisions, Sources, Evidence, Planned Knowledge, and Relationships. JSON is the proposed MVP interchange format; acceptance of that format remains an approval decision.

This ADR does not define a functioning database schema.

## Runtime boundaries

- The core library owns all lifecycle filtering, traversal, invalidation, and Context Package selection.
- The UI presents core results and submits explicit review operations.
- The MCP adapter exposes only deterministic read operations and delegates directly to the core.
- Natural-language routing, model calls, and provider-specific behavior are outside the MVP.
- Repository import is replaceable supporting infrastructure and must not be coupled to the core domain model.

## Alternatives

### Filesystem-first Markdown or JSON

Advantages include direct inspectability and simple ownership. Risks include weaker transactional integrity, more complex relationship maintenance, and greater effort for deterministic restoration.

### Python plus SQLite with a separate frontend

Advantages include rapid backend prototyping. Risks include a split toolchain and duplicated contracts between backend, frontend, and MCP surfaces.

### Dedicated graph database or vector database

These are unnecessary for the required relationship paths and would add operational complexity without strengthening the core demonstration.

## Consequences

- One language can cover the core, UI, and MCP adapter.
- SQLite can make lifecycle operations deterministic within the MVP.
- Export is a required portability boundary, not an optional backup feature.
- The persistence implementation must remain replaceable behind core interfaces.
- General search may be cut without affecting the differentiating demo.
- A later RFC or ADR may supersede this choice after broader storage requirements are known.

## Rollback

Before product implementation begins, this proposal can be replaced without migration. After MVP data exists, rollback requires exporting project knowledge, validating round-trip completeness, and importing it into the replacement persistence adapter.

## Related documents

- RFC-001 — Project Philosophy
- RFC-003 — Knowledge Lifecycle
- RFC-006 — Knowledge Navigation & Progressive Context
- RFC-007 — Initial Architecture and Hackathon MVP Boundaries
- ADR-002 — Lifecycle and Relationship Representation
