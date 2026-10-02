# Milestone 8: Local Knowledge Capture CLI

**Status:** Implemented — awaiting review and merge
**Decision Owner:** Ocomic
**Authorization date:** October 2, 2026
**Change class:** C2 (RFC-008)
**Implements:** ADR-004 — Local Knowledge Capture CLI and Workspace

## Authorization

Ocomic accepted ADR-004 on October 2, 2026, including the initial shared-workspace decision and its review triggers. That acceptance, together with the dogfooding decisions recorded there, authorizes this milestone.

## Goal

Make it possible to capture real project knowledge outside the curated demo fixture, using the existing review-gated lifecycle, so that dogfooding can begin on the decision owner's machine.

## Authorized scope

- A new package `@loxora/cli` with the `loxora` binary and the version-1 commands listed in ADR-004.
- Workspace handling:
  - resolution order `--workspace`, `LOXORA_WORKSPACE`, then `<home>/.loxora/workspaces/default`;
  - `workspace.json` validation;
  - the Git working-tree guard.
- Reviewer enforcement for knowledge and relationship reviews; agent actors (`agent:*`) can never review.
- Name and id-prefix resolution, human-readable output, and `--json` output.
- Tests and documentation.

## Explicit non-scope

- Import or parsing of repositories, documents, or chats.
- Rollback, restoration, and impact assessment commands.
- New Core ports, schema changes, MCP tools, and UI changes.
- Authentication or any security boundary beyond the documented governance guard.

## Design notes

- **Name resolution.** The CLI resolves names, ids, and unique id prefixes from the Milestone 7 workspace export (`readWorkspaceExport`), so no new store queries or Core ports were needed. This reads the whole workspace per command, which is fine at dogfooding scale. A dedicated lookup port is a candidate for later if workspaces grow.
- **Navigation freshness.** Every write command rebuilds the navigation projection of each affected Project. This keeps `show map` current. As a consequence, each write also records the projection rebuild in the Audit history under the acting actor.
- **Content.** Core trims Proposal content, so `--content-file` contents are stored without trailing whitespace.
- **Unaccepted nodes.** A Node only exists once its first Proposal is accepted. Referencing a title that only has a pending Proposal yields a message that points to that Proposal.

## Acceptance checks

| Check | Evidence |
|---|---|
| Workspace defaults to `<home>/.loxora/workspaces/default`, requires a non-agent reviewer, refuses re-initialization | `packages/cli/test/cli.test.ts` |
| Workspace creation inside a Git working tree is refused unless `--allow-in-repository` is given | `packages/cli/test/cli.test.ts` |
| Missing workspace, missing actor, unknown commands, and unknown flags fail with exit code 2 and guidance | `packages/cli/test/cli.test.ts` |
| Agents and non-reviewers cannot accept knowledge or relationships; reviewers can | `packages/cli/test/cli.test.ts` |
| Proposal → review → Current; successor → History with Current and historical entries; rejected Proposals do not change Current | `packages/cli/test/cli.test.ts` |
| Cross-project dependency appears on the Project Map; Planned Knowledge is labeled not implemented and not canonical; Context includes the reviewed dependency | `packages/cli/test/cli.test.ts` |
| `export` and `export verify` round-trip the workspace | `packages/cli/test/cli.test.ts` |
| Ambiguous and unknown references are rejected; `--json` errors are machine-readable | `packages/cli/test/cli.test.ts` |
| Manual rehearsal with content from the dogfooding proof-of-concept repository | Recorded in the pull request |

## ADR-003 and ADR-004 review triggers

None has occurred: the rehearsal used a single local workspace with two related Projects.

## Knowledge, navigation, and documentation effects

- New documents: `docs/implementation/CLI.md` and `docs/implementation/DOGFOODING.md`.
- `README.md` and the planning index list the CLI.
