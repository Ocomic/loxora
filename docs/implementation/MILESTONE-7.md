# Milestone 7: Deterministic Workspace Export

**Status:** Implemented and merged into `main` (pull request #8)
**Decision Owner:** Ocomic
**Authorization date:** October 2, 2026
**Change class:** C2 (RFC-008)
**Implements:** ADR-003 — Deterministic Workspace Export Format

## Authorization

Ocomic approved the post-Hackathon foundations plan on October 2, 2026. That plan authorizes implementing the export once ADR-003 is accepted. ADR-003 was accepted on October 2, 2026 (pull request #7) as the initial export decision, with explicit review triggers.

## Goal

Close the portability gap recorded since Milestone 6. A workspace must be exportable to an inspectable, canonical JSON file and restorable into an empty store without loss and without an external service.

## Authorized scope

- Core:
  - export format constants and section specifications;
  - validation, parsing, canonical serialization, and the SHA-256 digest;
  - the `WorkspaceExportStore` port.
- SQLite adapter:
  - ordered reads in one read transaction;
  - restore into an empty store in one transaction with deferred foreign keys;
  - a guard that refuses to export when the schema and the export format diverge.
- Demo package:
  - `seedDemoWorkspace` helper, reused by `demo:reset`;
  - `export` and `export:verify` command-line entry points.
- Tests:
  - unit tests for the format and the adapter;
  - the ADR-003 losslessness proof for every demo stage.
- Documentation:
  - `EXPORT-API.md`;
  - references in the README, AGENTS, ADR, and planning documents.

## Explicit non-scope

- Per-Project export.
- Merging into a non-empty store, partial import, and import from other formats.
- Redaction and mixed-visibility export.
- Compression.
- Changes to the persistence schema, lifecycle, navigation, Context Package, or MCP behavior.
- Changes to the Hackathon documents in `docs/hackathon/`. They remain historical records under RFC-008.

## Acceptance checks

| Check | Evidence |
|---|---|
| Exporting the same workspace twice yields identical bytes | `packages/sqlite/test/export.test.ts` and `packages/demo/test/export.test.ts` |
| Export → restore → export is byte-identical for every demo stage | `packages/demo/test/export.test.ts` (Prepared through Complete) |
| Project Maps, navigation health, Current knowledge, History, dependencies, plans, and the Context Package fingerprint are equal after restore | `packages/demo/test/export.test.ts` |
| A non-empty target is rejected without writing | `packages/sqlite/test/export.test.ts` |
| Unknown format, unknown version, unknown fields, duplicate keys, and missing sections are rejected | `packages/sqlite/test/export.test.ts` |
| A restore that violates integrity leaves the target empty | `packages/sqlite/test/export.test.ts` |
| A schema change without a format update fails loudly | `packages/sqlite/test/export.test.ts` |
| CLI round trip on the demo database | `npm run export -- --out var/export/demo.json` then `npm run export:verify -- --in var/export/demo.json` |

## ADR-003 review triggers

None of the ADR-003 review triggers has occurred. The demo workspace contains two Projects with one owner. A full V3Restored export is about 380 KB, of which the derived navigation projections are the largest part. That share should be watched as real workspaces grow.

## Knowledge, navigation, and documentation effects

- The portability gap recorded in the Milestone 6 documents is closed for the MVP concepts. The Hackathon documents keep their historical wording; this milestone is the record of the change.
- New API document: `docs/implementation/EXPORT-API.md`.
- ADR-001 records that its export requirement is implemented through ADR-003.
- `README.md`, `AGENTS.md`, and `docs/planning/open-questions.md` no longer describe export as missing.
