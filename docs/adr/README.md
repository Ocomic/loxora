# Architecture Decision Records

The following ADRs were accepted by Ocomic on July 13, 2026 only for explicitly authorized Hackathon MVP milestones:

- [ADR-001 — Runtime, Workspace, and MVP Persistence](./ADR-001-runtime-workspace-and-mvp-persistence.md)
- [ADR-002 — Lifecycle and Relationship Representation](./ADR-002-lifecycle-and-relationship-representation.md)

These decisions are not permanent long-term Loxora architecture and do not authorize work outside an assigned milestone.

Under RFC-008 (post-Hackathon governance), ADR-001 and ADR-002 are the current architecture baseline for post-Hackathon work. They remain non-permanent and change only through a new or superseding ADR.

## Post-Hackathon decisions

- [ADR-003 — Deterministic Workspace Export Format](./ADR-003-deterministic-workspace-export.md) — **Accepted October 2, 2026** (initial version with review triggers); defines the versioned canonical JSON export and restore-into-empty-store contract that closes the ADR-001 portability requirement.
- [ADR-004 — Local Knowledge Capture CLI and Workspace](./ADR-004-local-knowledge-capture-cli.md) — **Accepted October 2, 2026** (initial version with review triggers); a local `loxora` CLI over existing Core services so real project knowledge can be proposed, reviewed, and exported for dogfooding, without an importer.
