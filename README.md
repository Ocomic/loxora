# Loxora

[![CI](https://github.com/Ocomic/loxora/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ocomic/loxora/actions/workflows/ci.yml)

> Projects should never lose their memory.

Loxora is an experimental, local-first and model-independent project knowledge and context layer.

**Status:** Post-Hackathon foundations — Hackathon MVP complete through Milestone 6.2
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

## Long-term direction

The bounded Hackathon implementation is not the permanent product boundary. The non-implementation long-term direction is documented in:

- `docs/planning/PRODUCT-VISION.md`
- `docs/planning/LICENSING-STRATEGY.md`

These documents guide future planning but do not authorize implementation.

## Important

Loxora is documentation-driven. Architecture decisions should be documented before implementation whenever reasonably possible.

Work after the Hackathon is authorized by change class as defined in `docs/rfcs/RFC-008-post-hackathon-governance.md`. RFC-007, ADR-001, and ADR-002 are the current architecture baseline, not permanent architecture. Start with `docs/implementation/DEMO-RUNBOOK.md`, `docs/implementation/MILESTONE-6-2.md`, and the API documents under `docs/implementation/`. Workspaces can be exported to canonical JSON and restored without loss (`docs/implementation/EXPORT-API.md`, Milestone 7). Real project knowledge can be captured locally with the `loxora` CLI (`docs/implementation/CLI.md`, `docs/implementation/DOGFOODING.md`, Milestone 8).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). All commits require a Developer Certificate of Origin sign-off (`git commit -s`).

## License

Loxora is licensed under the [Apache License, Version 2.0](LICENSE). See `NOTICE` for copyright and license-history information. Versions up to commit `c6aebbb` were released under the MIT License.

The license does not grant rights to the Loxora name or logo. The decision record is in `docs/planning/LICENSING-STRATEGY.md`.
