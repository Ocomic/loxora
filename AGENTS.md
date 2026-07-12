# AGENTS.md

## Project state

Loxora is currently in a controlled planning and preparation phase.

Do not implement product functionality unless a task explicitly authorizes implementation.

## Required reading order

Before proposing architecture or implementation, read:

1. `README.md`
2. `docs/rfcs/RFC-000-why-loxora.md`
3. `docs/rfcs/RFC-001-project-philosophy.md`
4. `docs/rfcs/RFC-002-core-concepts-and-terminology.md`
5. `docs/planning/open-questions.md`

## Core rules

- Documentation before implementation.
- Plan before architecture.
- Architecture before code.
- Knowledge before context.
- Project knowledge belongs to the project, not to a model, IDE, chat, or individual.
- AI agents propose; shared knowledge requires appropriate review.
- Prefer evidence over assumptions.
- Preserve uncertainty instead of inventing certainty.
- Keep changes small, explicit, and reviewable.
- Do not silently overwrite shared knowledge.
- Do not mix current and historical knowledge.
- Preserve provenance, evidence, review state, and history.
- Treat rollback as a new documented state transition, not as deletion of history.
- Local-first and model independence are foundational constraints.
- Team, organization, role, permission, and agent-identity support must remain possible.
- Cross-project knowledge sharing must be explicit and permission-aware.

## During the current phase, do not implement

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

## Knowledge evolution

Current knowledge must be clearly distinguishable from historical knowledge.

When knowledge changes:

- create a new revision,
- preserve the previous revision,
- record why the change occurred,
- record who or what proposed and reviewed it,
- identify which revision is current,
- communicate deprecations, supersessions, restorations, and rollbacks explicitly.

Historical knowledge must not be presented to agents as current unless the task explicitly requests history.

## Decision process

For significant changes:

1. Understand the problem.
2. Document the proposal.
3. Discuss alternatives.
4. Create or update the relevant RFC or ADR.
5. Plan implementation.
6. Implement only after approval.
7. Review the result.
8. Record reflection and resulting knowledge changes.

## Output expectations

Every completed task should state:

- what changed,
- what was intentionally not changed,
- assumptions made,
- validation performed,
- open questions,
- documentation requiring updates.
