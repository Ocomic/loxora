# Loxora

> Projects should never lose their memory.

Loxora is an experimental, local-first and model-independent project knowledge and context layer.

**Status:** Guided Hackathon demo-ready implementation — Milestone 6.1
**Working title:** Loxora

This repository contains foundational RFCs, accepted Hackathon-only architecture decisions, persistent lifecycle lineage, progressive navigation, reviewed cross-project impact, deterministic Context Packages, one read-only MCP tool, explicit Planned Knowledge, and a guided local demo inspector. The Hackathon decisions do not establish permanent long-term Loxora architecture.

## Foundational RFCs

- `docs/rfcs/RFC-000-why-loxora.md`
- `docs/rfcs/RFC-001-project-philosophy.md`
- `docs/rfcs/RFC-002-core-concepts-and-terminology.md`
- `docs/rfcs/RFC-003-knowledge-lifecycle.md`
- `docs/rfcs/RFC-004-development-workflow.md`
- `docs/rfcs/RFC-005-project-preparation.md`
- `docs/rfcs/RFC-006-knowledge-navigation-and-progressive-context.md`

## Hackathon architecture and planning

- `docs/rfcs/RFC-007-initial-architecture-and-mvp-boundaries.md`
- `docs/adr/ADR-001-runtime-workspace-and-mvp-persistence.md`
- `docs/adr/ADR-002-lifecycle-and-relationship-representation.md`
- `docs/hackathon/MVP-SCOPE.md`
- `docs/hackathon/DEMO-SCRIPT.md`
- `docs/hackathon/ACCEPTANCE-MATRIX.md`

See `docs/hackathon/README.md` for the complete planning index.

## Important

Loxora is documentation-driven. Architecture decisions should be documented before implementation whenever reasonably possible.

RFC-007, ADR-001, and ADR-002 are accepted only for the Hackathon MVP. Runtime implementation remains limited to explicitly authorized milestones. Start with `docs/implementation/DEMO-RUNBOOK.md`, `docs/implementation/MILESTONE-6-1.md`, and the API documents under `docs/implementation/`. Deterministic export remains an explicit portability gap.
