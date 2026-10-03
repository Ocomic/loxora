# Workspace Export API

Milestone 7 implements ADR-003. Milestone 9 (ADR-006) introduces format version 2; Milestone 10 (ADR-005) introduces version 3. The export is a versioned, canonical JSON snapshot of one workspace (every Project in one store) that can be restored into an empty store without loss.

## Core (`@loxora/core`)

- `WORKSPACE_EXPORT_FORMAT` (`"loxora.workspace-export"`) and `WORKSPACE_EXPORT_FORMAT_VERSION` (`3`). `WORKSPACE_EXPORT_SUPPORTED_VERSIONS` is `[1, 2, 3]`.
- `upgradeWorkspaceExport(value)`: upgrades older documents step by step to the current version by adding the empty sections of each newer version (`WORKSPACE_EXPORT_VERSION_2_SECTIONS`, `WORKSPACE_EXPORT_VERSION_3_SECTIONS`); existing records stay unchanged. `parseWorkspaceExport` applies it before validation. An older document that already contains a newer section is rejected.
- `WORKSPACE_EXPORT_SECTIONS` and `WORKSPACE_EXPORT_DERIVED_SECTIONS`: each section's name, its exact field list, and its sort key, in restore order. These lists are the public format contract.
- `assertWorkspaceExport(value)` / `parseWorkspaceExport(text)`: these reject:
  - an unknown format or version;
  - a missing or extra section;
  - a missing or extra field;
  - a value other than a string, a finite number, or `null`;
  - a `null` key;
  - a duplicate key.
- `serializeWorkspaceExport(document)`: returns the canonical bytes, built as follows:
  - object keys sorted at every level;
  - records sorted by key (numbers numerically, strings by code point);
  - 2-space indentation, LF line endings, and a trailing newline;
  - no export-time timestamp.
- `workspaceExportDigest(text)`: the SHA-256 hex digest of the canonical text. It is reported next to the file, never stored in it.
- `workspaceExportRecords(document, spec, derived?)`: typed access to one section's records.
- Port `WorkspaceExportStore`:
  - `readWorkspaceExport()`;
  - `restoreWorkspaceExport(document)`.

## Document shape

```json
{
  "format": "loxora.workspace-export",
  "formatVersion": 3,
  "sections": {
    "auditEventEvidence": [],
    "auditEvents": [],
    "...": [],
    "derived": {
      "navigationProjectionEntries": [],
      "navigationProjectionGenerations": [],
      "navigationProjectionState": [],
      "navigationProjectionWarnings": []
    }
  },
  "sourceSchema": ["001_initial_lifecycle", "002_lifecycle_lineage", "003_navigation_foundation", "004_cross_project_impact", "005_planned_knowledge", "006_plan_revisions_node_keys", "007_missions"]
}
```

Version 3 has 46 canonical sections and 4 derived sections. It adds `missions`, `missionProjectReferences`, `missionKnowledgeReferences`, `missionEvents`, `missionEventEvidence`, `missionAttentionRequests`, `missionOutcomes`, `missionOutcomeProposals`, and `missionLogReferences`; referenced log files are never exported. Version 2 had 37 canonical sections. It adds `plannedKnowledgeRevisions`, `plannedKnowledgeRevisionNodes`, `plannedKnowledgeRevisionEvidence`, `plannedKnowledgeRevisionDecisions`, `plannedKnowledgeRevisionDecisionEvidence`, and `knowledgeNodeKeys` to the 31 sections of version 1. Field names are the camelCase domain names listed in `packages/core/src/export.ts`. Nullable storage values are always present as `null`.

## SQLite adapter (`@loxora/sqlite`)

`openSqliteStore(path)` now also implements `WorkspaceExportStore`.

- **Read:** one read transaction, so the snapshot is consistent. Before reading, the adapter checks that every table and column matches the format specification and that no table is missing from it. Otherwise it raises `IntegrityError`, so a migration cannot silently drop data from exports.
- **Restore:**
  - It raises `ValidationError` if any exported table already contains rows.
  - It inserts every record exactly as exported, in one `BEGIN IMMEDIATE` transaction with `PRAGMA defer_foreign_keys = ON`.
  - It does not call Core lifecycle operations, create Audit Events, or rebuild projections.
  - Any failure rolls back completely and raises `IntegrityError`.

## Command line

The commands below need a build first (`npm run build`).

```sh
npm run export -- --out var/export/workspace.json            # default --db var/demo/loxora-demo.sqlite
npm run export -- --db path/to/store.sqlite --out out.json
npm run export:verify -- --in var/export/workspace.json      # restore into a temp store, re-export, compare bytes
```

`export` prints the SHA-256 of the written file. `export:verify` prints `Round trip identical` and the digest, or exits with code 1 if the bytes differ. These demo scripts expect documents of the current format version. For older backups use `loxora export verify`: it compares the upgraded document and ignores only the informational `sourceSchema`, which gains the migrations the restored store applied.

## Limits

- The export contains everything in the workspace, including Audit Events and actor identifiers. Do not share it across visibility boundaries.
- There is no per-Project export, merge, partial import, or redaction yet; see the ADR-003 open questions and review triggers.
- The export is a snapshot. It does not provide synchronization or incremental backup.
