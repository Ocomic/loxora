# ADR-004 — Local Knowledge Capture CLI and Workspace

**Status:** Proposed
**Date:** October 2, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (new package and public CLI contract; see RFC-008)

## Context

After Milestone 7, Loxora can store, review, navigate, relate, export, and restore project knowledge. All of it is reachable only through the curated Hackathon demo: `demo:reset` seeds a fixed fixture, and the demo inspector operates on that fixture. There is no supported way to put real project knowledge into a workspace.

Dogfooding is the next validation step (`docs/planning/PRODUCT-VISION.md`, RFC-008). Ocomic chose the following setup on October 2, 2026:

- **Primary target:** a small, non-critical proof-of-concept repository (a local 3D game-asset pipeline). It has a decision log, a phased roadmap, and benchmark runs.
- **Dependent Project:** the live Ocomic game platform, represented only by its runtime asset-loading contract (GLB files under a public models directory). That contract is the dependency the proof of concept is meant to serve.
- **Storage:** knowledge stays local on the decision owner's machine, outside every repository.

RFC-008 lists "import beyond the existing curated fixture reset" as gated. This ADR decides how knowledge enters a real workspace without introducing an importer.

## Decision

Add a small local command-line interface, `loxora`, in a new package `@loxora/cli`. It is a thin adapter over the existing Core services and the SQLite store. Humans and agents use it to **propose** knowledge, and humans use it to **review** it.

### Principles

- **No import and no inference.** The CLI never parses repositories, documents, or chats on its own. Every Proposal is an explicit command with explicit content.
- **Review before canon.** Every piece of accepted knowledge goes through the existing Proposal → Review Decision → Revision path. The CLI adds no shortcut that creates a Revision directly.
- **Thin adapter.** Lifecycle, navigation, relationship, impact, planning, Context, and export rules stay in Core. The CLI only parses arguments, resolves the workspace, and formats output.
- **Model and agent independence.** Any agent that can run a shell command can propose knowledge, and the CLI has no agent-specific behavior. The MCP surface is unchanged.

### Workspace

- A workspace is one directory containing:
  - `workspace.sqlite`, the store;
  - `workspace.json`, the configuration (format version, display name, allowed reviewers).
- Resolution order:
  1. `--workspace <dir>`;
  2. the `LOXORA_WORKSPACE` environment variable;
  3. the default `<home>/.loxora/workspaces/default`, where `<home>` is the user's home directory on Windows, macOS, or Linux.
- `loxora workspace init` creates the directory and the configuration. It refuses to initialize inside a Git working tree unless `--allow-in-repository` is given. This keeps private project knowledge out of repositories by default.
- Backups use the Milestone 7 export: `loxora export --out <file>` and `loxora export verify --in <file>`.

### Actors and review

- Every write command requires `--actor <id>`, or the `LOXORA_ACTOR` environment variable.
- `workspace.json` lists `reviewers`. Accepting or rejecting a Proposal, or accepting a cross-project Relationship, is allowed only for a listed reviewer.
- Conventional actor ids for agents are prefixed, for example `agent:claude-code` or `agent:codex`. Agent ids must not be listed as reviewers.
- This is a local governance guard against accidental self-acceptance, not a security boundary. There is no authentication; anyone with access to the files can change them.

### Commands in version 1

| Command | Core operation |
|---|---|
| `workspace init`, `workspace status` | configuration and migrations |
| `project add`, `space add`, `collection add` | `LifecycleService.createProject` / `createKnowledgeSpace` / `createKnowledgeCollection` |
| `source add`, `evidence add` | `registerSourceReference` / `registerEvidenceReference` |
| `propose new`, `propose successor` | `submitKnowledgeProposal` / `submitSuccessorProposal` |
| `review` | `reviewKnowledgeProposal` |
| `inbox` | `ReviewInboxService` |
| `plan add` | `PlannedKnowledgeService.createPlannedKnowledge` |
| `relate propose`, `relate review` | `CrossProjectImpactService` relationship proposal and review |
| `show map`, `show current`, `show history`, `show plans` | existing navigation and lifecycle reads |
| `context` | `ContextPackageService.buildContextPackage` |
| `export`, `export verify` | Milestone 7 |

- **Rollback and restoration** (`recordRollback`, `submitRestorationProposal`) and **impact assessment** are deferred. They exist in Core and can be added once dogfooding needs them.
- **Content input:** content can be given inline (`--content`) or read from a file (`--content-file`). Reading a file copies its text into the Proposal. The CLI does not keep a link to the file or watch it.
- **Output:** human-readable by default, plus `--json` for agents. Identifiers are printed so that later commands can refer to them. Names are accepted where they are unique within the Project, so day-to-day use does not need internal identifiers (RFC-006).

### Provenance convention

Repository material is referenced as a Source with a locator that includes the repository, commit, and path, for example `git:Ocomic/<repository>@<commit>:docs/DECISION-LOG.md`. Evidence locators point inside the Source, for example `#D-001` or a line range. This is a documented convention in version 1, not a schema change.

## Alternatives

### Generalize the demo fixture loader into an importer

Real knowledge would be written as a manifest and loaded through the demo seeding path. This was rejected because it bypasses review for the initial state, couples real workspaces to the demo package, and is the gated import RFC-008 warns about.

### Repository or Markdown importer

A parser would turn existing decision logs and roadmaps into Proposals automatically. This was deferred: it requires format heuristics, and every result would still need review. Manual proposals during dogfooding will show which structures are worth importing.

### Extend the local web UI

This was deferred. Agents cannot drive a browser UI easily, and the demo inspector is bound to the fixture.

### Additional MCP write tools

This was deferred. MCP is one integration among several (model independence). A CLI is usable by every agent and by humans, and an MCP write surface can reuse it later.

### Workspace inside each repository (`.loxora/`)

This was rejected as the default. It risks committing private knowledge and splits cross-project knowledge across repositories. It remains possible with `--allow-in-repository`.

## Consequences

- Real project knowledge can be captured locally, with review, provenance, export, and restore.
- The CLI becomes a public contract. Command names, flags, and `--json` output shapes change only through an ADR update and a documented version.
- Dogfooding results feed later decisions: an importer, rollback commands, MCP write tools, per-Project export, profiles, and the review triggers in ADR-003.
- No schema change is needed. If one becomes necessary, it is a separate C2 decision.

## Implementation (after acceptance)

Milestone 8, authorized by a milestone document under `docs/implementation/`, covers:

- `packages/cli` with the `loxora` binary and the commands above;
- workspace resolution, `workspace.json` validation, and the repository-location guard;
- tests for every command, reviewer enforcement, JSON output, and an end-to-end dogfooding rehearsal against a temporary workspace;
- `docs/implementation/CLI.md` and a short dogfooding guide.

## Open questions

- Whether a user-level workspace should hold all Ocomic projects, or one workspace should exist per product.
- How Source locators should evolve into a typed provenance model.
- When to add rollback, restoration, and impact assessment commands.
- Whether and how an importer for decision logs and roadmaps should follow, based on dogfooding evidence.

## Related documents

- `docs/rfcs/RFC-004-development-workflow.md`
- `docs/rfcs/RFC-006-knowledge-navigation-and-progressive-context.md`
- `docs/rfcs/RFC-008-post-hackathon-governance.md`
- `docs/adr/ADR-001-runtime-workspace-and-mvp-persistence.md`
- `docs/adr/ADR-003-deterministic-workspace-export.md`
- `docs/planning/PRODUCT-VISION.md`
