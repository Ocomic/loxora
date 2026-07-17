# AGENTS.md

## Project state

Loxora is currently in a controlled Hackathon MVP implementation phase.

Do not implement product functionality unless a task explicitly authorizes implementation.

RFC-007, ADR-001, and ADR-002 are accepted only for the Hackathon MVP. Each implementation task must remain inside its explicitly assigned milestone. Acceptance of those documents is not blanket authorization for the complete MVP or permanent long-term architecture.

## Required reading order

Before proposing architecture or implementation, read:

1. `README.md`
2. `docs/rfcs/README.md`
3. `docs/rfcs/CROSS-REFERENCES.md`
4. `docs/rfcs/RFC-000-why-loxora.md`
5. `docs/rfcs/RFC-001-project-philosophy.md`
6. `docs/rfcs/RFC-002-core-concepts-and-terminology.md`
7. `docs/rfcs/RFC-003-knowledge-lifecycle.md`
8. `docs/rfcs/RFC-004-development-workflow.md`
9. `docs/rfcs/RFC-005-project-preparation.md`
10. `docs/rfcs/RFC-006-knowledge-navigation-and-progressive-context.md`
11. `docs/planning/open-questions.md`

## Core rules

- Documentation before implementation.
- Plan before architecture.
- Architecture before code.
- Knowledge before context.
- Navigate before loading.
- Use maps, indexes, summaries, and typed relationships before loading detailed knowledge.
- Project knowledge belongs to the project, not to a model, IDE, chat, or individual.
- AI agents propose; shared knowledge requires appropriate review.
- Prefer evidence over assumptions.
- Preserve uncertainty instead of inventing certainty.
- Keep changes small, explicit, and reviewable.
- Do not silently overwrite shared knowledge.
- Do not mix current, historical, and planned knowledge.
- Preserve provenance, evidence, review state, and history.
- Treat rollback as a new documented state transition, not as deletion of history.
- Update or invalidate affected maps, indexes, summaries, and cross-project links when knowledge changes.
- Avoid orphaned knowledge, broken links, duplicate concepts, and unexplained navigation dead ends.
- Local-first and model independence are foundational constraints.
- Team, organization, role, permission, and agent-identity support must remain possible.
- Cross-project knowledge sharing must be explicit, typed, evidence-backed, and permission-aware.

## Outside an explicitly authorized milestone, do not implement

- Knowledge Graph
- Project Graph
- Context Builder or Context Packages
- Retrieval or embeddings
- Memory Loop implementation
- Database schema
- MCP server
- Codex or Claude Code plugin
- Multi-agent orchestration
- Team server, cloud service, authentication, or synchronization
- UI
- Build Week demo functionality

Record such ideas in `docs/planning/open-questions.md`.

Milestones 1 through 6 are complete and merged into `main`. Milestone 6 was authorized by Ocomic on July 15, 2026 and delivered the bounded final local demo described in `docs/implementation/MILESTONE-6.md`: curated fixtures, deterministic reset, minimal non-canonical Planned Knowledge, Review Inbox, the local `@loxora/demo` application, one Playwright flow, and real Context/MCP parity. Export, generalized import, additional MCP tools, authentication, production permissions, synchronization, search, embeddings, graph visualization, persistent Context Packages, and production deployment remain outside the completed Hackathon MVP scope.

Milestone 6.1 was authorized by Ocomic on July 16, 2026 for presentation and UX only and is complete and merged into `main`. It adds Guided/Explore presentation state, server-provided actions, result explanations, responsive/accessibility polish, screenshots, and UI tests without changing canonical lifecycle, persistence, Planned Knowledge, relationships, impact, Context Package, MCP, visibility, or project-ownership behavior.

Milestone 6.2 was authorized by Ocomic on July 17, 2026 for jury-flow and general-audience presentation only and is implemented and merged into `main`. It adds an explicit revalidated temporal presentation transition, verified-result next actions, plain-language freshness and Context explanations, compact phases, reset confirmation, and a non-implemented novel-continuity concept preview. It does not authorize a novel fixture, Core or schema changes, Context or MCP behavior changes, export, import, authentication, search, synchronization, or deployment.

## Knowledge evolution

Current knowledge must be clearly distinguishable from historical and planned knowledge.

When knowledge changes:

- create a new revision,
- preserve the previous revision,
- record why the change occurred,
- record who or what proposed and reviewed it,
- identify which revision is current,
- communicate deprecations, supersessions, restorations, and rollbacks explicitly,
- update or invalidate affected summaries and indexes,
- review incoming and outgoing cross-project relationships.

Historical knowledge must not be presented to agents as current unless the task explicitly requests history.

Planned knowledge must not be presented as implemented or canonical until it has been verified and accepted according to project governance.

## Navigation and discoverability

Project knowledge must remain understandable without requiring internal identifiers or exhaustive graph traversal.

Important knowledge should be reachable through at least one clear navigation path, such as:

- Workspace Map,
- Project Map,
- Knowledge Space,
- Space Index,
- Knowledge Collection,
- search,
- or a typed relationship from another relevant item.

If an agent discovers orphaned knowledge, stale summaries, broken links, duplicate concepts, or missing project dependencies, it should report them and propose a reviewable correction rather than silently reorganizing the knowledge structure.

## Decision process

For significant changes:

1. Understand the problem.
2. Document the proposal.
3. Discuss alternatives.
4. Create or update the relevant RFC or ADR.
5. Review RFC dependencies in `docs/rfcs/CROSS-REFERENCES.md`.
6. Plan implementation.
7. Implement only after approval.
8. Review the result.
9. Record reflection and resulting knowledge changes.
10. Update or invalidate affected navigation surfaces and project relationships.

## Output expectations

Every completed task should state:

- what changed,
- what was intentionally not changed,
- assumptions made,
- validation performed,
- open questions,
- documentation requiring updates,
- knowledge lifecycle effects,
- navigation or summary effects,
- and known cross-project impacts.
