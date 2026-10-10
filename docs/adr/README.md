# Architecture Decision Records

The following ADRs were accepted by Ocomic on July 13, 2026 only for explicitly authorized Hackathon MVP milestones:

- [ADR-001 — Runtime, Workspace, and MVP Persistence](./ADR-001-runtime-workspace-and-mvp-persistence.md)
- [ADR-002 — Lifecycle and Relationship Representation](./ADR-002-lifecycle-and-relationship-representation.md)

These decisions are not permanent long-term Loxora architecture and do not authorize work outside an assigned milestone.

Under RFC-008 (post-Hackathon governance), ADR-001 and ADR-002 are the current architecture baseline for post-Hackathon work. They remain non-permanent and change only through a new or superseding ADR.

## Post-Hackathon decisions

- [ADR-003 — Deterministic Workspace Export Format](./ADR-003-deterministic-workspace-export.md) — **Accepted October 2, 2026** (initial version with review triggers); defines the versioned canonical JSON export and restore-into-empty-store contract that closes the ADR-001 portability requirement.
- [ADR-004 — Local Knowledge Capture CLI and Workspace](./ADR-004-local-knowledge-capture-cli.md) — **Accepted October 2, 2026** (initial version with review triggers); a local `loxora` CLI over existing Core services so real project knowledge can be proposed, reviewed, and exported for dogfooding, without an importer.
- [ADR-005 — Mission Storage and Reporting Interface](./ADR-005-mission-storage-and-reporting-interface.md) — **Accepted October 3, 2026**; implements RFC-009 with a Core `MissionService`, a SQLite migration, export format version 2, and a CLI `mission` command group as the first adapter.
- [ADR-006 — Plan Revisions, Node Keys, and CLI Ergonomics](./ADR-006-plan-revisions-node-keys-and-cli-ergonomics.md) — **Accepted October 3, 2026**; plan revisions with a human gate for closing plans, immutable short Node keys, and CLI fixes from the first dogfooding session (Milestone 9, before the mission milestone).
- [ADR-007 — Bridge Chat History and Threads](./ADR-007-bridge-chat-history-and-threads.md) — **Accepted October 10, 2026**; stores the bridge chat (RFC-011 Amendment 2) in the workspace, with one thread per Mission, derived ship computer reports, deletion by the captain, and export format version 4.
