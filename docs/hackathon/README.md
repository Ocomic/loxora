# Build Week / Hackathon

**Status:** Draft planning document
**Working title:** Loxora MVP differentiation

## Planning index

- [MVP Scope](./MVP-SCOPE.md)
- [Demo Script](./DEMO-SCRIPT.md)
- [Real Versus Curated Demo Ledger](./REAL-VS-SIMULATED.md)
- [Acceptance Matrix](./ACCEPTANCE-MATRIX.md)
- [Pre-Hackathon Boundary Checklist](./PRE-HACKATHON-BOUNDARY.md)
- [Sample Projects and Evidence Map](./SAMPLE-PROJECTS-AND-EVIDENCE.md)
- [RFC-007 — Initial Architecture and Hackathon MVP Boundaries](../rfcs/RFC-007-initial-architecture-and-mvp-boundaries.md)

The approved-in-principle MVP story leads with knowledge lifecycle and evidence-backed cross-project impact. Repository import is supporting infrastructure and must not become the central demo narrative.

## Context

Understory already demonstrates several capabilities that overlap with Loxora's broader roadmap:

- local and model-independent agent memory,
- plain Markdown knowledge storage,
- a living knowledge graph,
- MCP access,
- a web UI,
- graph maintenance,
- and agent-assisted memory updates.

This does not invalidate Loxora's long-term direction. It changes how the Build Week MVP should be scoped and presented.

The MVP should not compete primarily on "local memory plus graph plus MCP". Those remain important enabling capabilities, but the demo must make at least one or two Loxora-specific ideas visible and understandable.

## MVP positioning

Loxora is not only a memory layer for an agent.

Loxora is a project-owned knowledge and continuity layer that understands:

- multiple projects,
- dependencies and relationships between projects,
- the difference between current and historical knowledge,
- and controlled knowledge evolution through review, supersession, restoration, and rollback.

## Primary differentiator 1: Cross-project dependency intelligence

The MVP should demonstrate that Loxora treats projects as nodes in a wider Project Graph.

### Required demo capability

Connect at least two related projects and show that Loxora can identify and use an explicit relationship between them.

Example:

- Project A contains a shared context-building or authentication concept.
- Project B depends on or reuses that concept.
- A user asks what would be affected by changing the shared concept.
- Loxora returns the related project, dependency type, supporting evidence, and likely impact.

### Minimum viable implementation

The relationship may initially be created through a mixture of:

- repository analysis,
- package or import relationships,
- shared identifiers,
- structured agent proposals,
- and user confirmation.

The demo does not require a universal automatic dependency detector. It requires a credible end-to-end flow that shows:

1. two projects are connected,
2. the relationship is traceable,
3. Loxora uses it when building context or answering an impact question.

### Demo question

> If we change this component or decision, which other project may be affected, and why?

## Primary differentiator 2: Knowledge lifecycle and rollback awareness

The MVP should demonstrate that Loxora does not mix current and outdated knowledge.

### Required demo capability

Show one knowledge item evolving through at least three states, for example:

1. an original decision becomes canonical,
2. a replacement supersedes it,
3. the replacement is rolled back and an earlier approach is restored through a new revision.

Loxora must then answer a current-state question using only the active canonical revision while still making the history available on request.

### Minimum viable implementation

Each demonstrated revision should preserve:

- status,
- evidence,
- provenance,
- reason for change,
- predecessor or successor relationship,
- and the current canonical marker.

The UI or CLI should visibly communicate:

- what is current,
- what is historical,
- what was superseded,
- what was restored,
- and why the transition occurred.

### Demo questions

> What is the current implementation decision?

> What did we use before, and why was it replaced?

> Why was the previous approach restored?

The first answer must not mix historical information into current guidance.

## Supporting MVP capabilities

The following capabilities support the two differentiators but are not the headline by themselves:

- local-first storage,
- model independence,
- basic Knowledge Nodes and relationships,
- evidence and provenance,
- task-specific Context Packages,
- agent proposals,
- a small review flow,
- repository or folder bootstrap,
- a minimal MCP or Codex-facing integration,
- and a lightweight UI or inspectable CLI output.

## Optional secondary demonstration: Domain-independent bootstrap

If time permits, connect one software repository and one document-based project such as a novel folder.

The goal is not to implement every profile deeply. The goal is to show that the same project-owned knowledge model can derive different domain concepts:

- software: components, decisions, dependencies, risks,
- novel: characters, places, timeline events, relationships, and style notes.

This remains secondary to the two primary differentiators.

## Explicit non-goals for the hackathon

The MVP does not need:

- complete enterprise collaboration,
- perfect automatic dependency discovery,
- a production-ready knowledge graph,
- a universal synchronization engine,
- full GitHub history ingestion,
- a complete plugin marketplace,
- advanced embedding infrastructure,
- or complete support for every project profile.

## Differentiating demo narrative

1. Connect `identity-contract` and its consumer, `customer-portal`.
2. Review and accept V1 of the shared token contract.
3. Supersede V1 with V2, replacing `customer_id` with `subject_id`.
4. Follow the dependency path and explain why the unchanged consumer rejects authentication.
5. Accept V3 as a new restoration revision with V1-compatible semantics.
6. Show Past, Current, and a separate Deferred plan to revisit the V2 migration.
7. Generate lifecycle-filtered Context through the UI and the same read-only MCP core operation.

## Success criteria

The MVP is successful when an observer can clearly understand that Loxora offers more than agent memory:

- it understands relationships between projects,
- it preserves project knowledge as an evolving history,
- and it gives humans and agents the correct current context without losing the path that led there.

## Positioning statement

> Understory shows how agent memory can grow as a local knowledge graph. Loxora focuses on how project knowledge remains correct, traceable, and reusable across multiple related projects and across time.
