# RFC-005 — Project Preparation

**Status:** Draft  
**Version:** 0.1  
**Last Updated:** July 2026

## Purpose

This RFC defines how Loxora, humans, and AI agents prepare an existing or new project before architecture or implementation work begins.

The preparation phase is discovery-first. It establishes what already exists, which sources are authoritative, what remains unknown, and which external knowledge systems may need access.

Project preparation must not begin by inventing architecture.

## Core principle

> Inspect before interpreting. Interpret before planning. Plan before implementation.

The goal is not merely to collect files. The goal is to reconstruct the best available understanding of the project from evidence.

## Preparation outcomes

A completed preparation phase should produce:

- a source inventory,
- a project structure overview,
- a documentation inventory,
- an implementation and dependency overview,
- a list of external knowledge sources,
- identified contradictions and stale information,
- explicit assumptions and open questions,
- access requests where required,
- and a preparation report suitable for later bootstrap and planning.

## Discovery order

Agents should inspect the project in the following order unless evidence justifies a different sequence.

### 1. Agent and repository instructions

Inspect instruction-bearing files first.

Examples include:

- `AGENTS.md`
- nested `AGENTS.md` files
- `README.md`
- `CONTRIBUTING.md`
- repository-specific instruction files
- coding-agent configuration
- workspace policies
- security and governance documents

These files may define mandatory reading order, scope limits, repository conventions, linked sources, or rules that override default assumptions.

Nested instructions must be treated as potentially scope-specific.

### 2. Documentation discovery

Search for existing documentation before interpreting source code.

Relevant sources may include:

- Markdown files
- AsciiDoc
- reStructuredText
- text documents
- architecture documents
- ADRs
- RFCs
- planning files
- roadmaps
- changelogs
- release notes
- runbooks
- API documentation
- diagrams
- generated documentation
- comments that explicitly reference design decisions or external documents

Documentation should be classified by purpose, ownership, recency, review state, and likely authority.

Documentation must not be assumed current merely because it exists.

### 3. Manifest and configuration discovery

Inspect manifests and configuration files that describe the project structure, runtime, tooling, dependencies, and deployment model.

Examples include:

- `package.json`
- workspace manifests
- lockfiles
- `pyproject.toml`
- `requirements.txt`
- `Cargo.toml`
- `go.mod`
- build files
- container definitions
- CI workflows
- infrastructure manifests
- environment templates
- engine or editor project files
- plugin manifests
- MCP configuration
- deployment descriptors

Manifests are strong evidence for declared dependencies and tooling, but they do not alone prove runtime usage.

### 4. Source structure and entry points

Map the repository or project structure.

Identify:

- applications
- packages
- services
- libraries
- modules
- plugins
- scripts
- tests
- assets
- generated content
- data directories
- migration folders
- public entry points
- runtime entry points
- build entry points

The preparation phase should determine where the project starts and how its main parts connect.

### 5. Functions, components, and behavior

Inspect implementation only after the instruction, documentation, manifest, and structural context is understood.

Focus on:

- major functions
- public APIs
- core classes or components
- domain models
- data flows
- workflows
- side effects
- error handling
- state transitions
- persistence boundaries
- external calls
- tests that reveal intended behavior

Agents should prefer structural understanding over exhaustive file-by-file summarization.

### 6. Dependency analysis

Identify both declared and observed dependencies.

This includes:

- package dependencies
- internal module dependencies
- service dependencies
- shared libraries
- external APIs
- databases
- queues
- storage systems
- authentication systems
- build tools
- runtime assumptions
- operating system or environment dependencies
- cross-repository dependencies

Distinguish:

- declared dependencies,
- imported or referenced dependencies,
- runtime-observed dependencies,
- historical dependencies,
- optional dependencies,
- and suspected dependencies.

### 7. Comments and embedded references

Search comments, docstrings, TODOs, FIXMEs, annotations, commit references, issue identifiers, and URLs for hidden project knowledge.

Comments may reveal:

- rationale not present elsewhere,
- temporary workarounds,
- known risks,
- external documentation,
- migration status,
- deprecations,
- rollback history,
- ownership,
- or unresolved decisions.

Comments are evidence, but their recency and correctness must be validated against current implementation and other sources.

### 8. Linked and external knowledge sources

The repository may point to knowledge that is not stored locally.

Examples include:

- SharePoint
- Obsidian vaults
- Notion
- Confluence
- Google Drive
- GitHub issues or discussions
- private wikis
- design tools
- ticket systems
- chat archives
- cloud storage
- external repositories
- local folders outside the repository
- project management systems

Agents must record the existence of these sources even when they cannot access them.

If a potentially relevant source requires permission, credentials, a connector, or user-provided access, the agent should request access explicitly and explain:

- which source was discovered,
- where it was referenced,
- why it may matter,
- what access is required,
- and what uncertainty remains without it.

An inaccessible source must not be silently treated as absent.

## Source inventory

The preparation process should produce a structured inventory containing at least:

- source name or path,
- source type,
- scope,
- owner if known,
- last modified signal if available,
- authority level,
- accessibility,
- relevance,
- and notes about staleness or conflicts.

## Evidence and authority

No single source category is universally authoritative.

Typical guidance:

- current runtime behavior is best evidenced by executable code and tests,
- intended behavior may be best evidenced by accepted RFCs, ADRs, specifications, or reviewed documentation,
- declared dependencies are best evidenced by manifests and lockfiles,
- operational behavior may be best evidenced by deployment configuration and runbooks,
- historical rationale may be best evidenced by commits, issues, reviews, and archived documents,
- project rules are best evidenced by applicable instruction and governance files.

When sources disagree, preparation must record the conflict instead of choosing silently.

## Staleness and contradiction detection

Agents should actively look for:

- documentation that names removed components,
- comments that contradict current behavior,
- manifests containing unused dependencies,
- code referencing deprecated systems,
- links to unavailable or moved documents,
- duplicate specifications,
- conflicting setup instructions,
- rollback evidence not reflected in documentation,
- and terminology drift.

Potentially outdated knowledge should be marked as such and must not be mixed with current knowledge.

## Access boundaries

Preparation must respect repository, workspace, user, organization, and external-system permissions.

Agents must not:

- bypass access controls,
- infer inaccessible content,
- copy private knowledge across project boundaries without permission,
- expose secrets,
- or treat linked systems as globally readable.

Access requests are part of preparation, not a failure of preparation.

## New projects

For a new or nearly empty project, preparation should still inspect:

- repository metadata,
- existing README and instructions,
- selected license,
- issue templates,
- linked planning documents,
- related repositories,
- user-provided source material,
- and existing organizational standards.

Missing information should be documented as open questions rather than replaced with invented decisions.

## Existing projects

For an established project, preparation should emphasize reconstruction rather than redefinition.

Agents should identify:

- current behavior,
- intended behavior,
- historical decisions,
- undocumented conventions,
- active migration work,
- technical debt,
- stale knowledge,
- and dependencies outside the visible repository.

## Preparation report

The final report should include:

1. Project summary
2. Applicable instructions
3. Repository and workspace structure
4. Documentation inventory
5. Manifest and toolchain inventory
6. Major components and entry points
7. Dependency overview
8. External knowledge sources
9. Access requests
10. Conflicts and stale information
11. Assumptions
12. Open questions
13. Risks
14. Recommended next planning step
15. Items intentionally not inspected or not accessible

## Preparation and Loxora bootstrap

Project preparation precedes full Loxora bootstrap.

Preparation determines:

- what sources exist,
- what can be trusted,
- what requires review,
- what should be ingested,
- what must remain external,
- and which knowledge is likely current, historical, or uncertain.

Bootstrap may later create Knowledge Nodes, relationships, evidence links, and proposals from this inventory.

Preparation itself must not automatically declare extracted information canonical.

## Current phase constraints

During the initial Loxora repository preparation phase, agents may:

- inspect the repository,
- create or improve documentation,
- record open questions,
- create planning artifacts,
- and establish minimal repository structure when explicitly approved.

Agents must not implement core Loxora product features unless explicitly authorized.

## Completion criteria

Preparation is complete when:

- applicable instructions have been read,
- local documentation has been inventoried,
- manifests and configuration have been inspected,
- major entry points and components are understood,
- key dependencies are identified,
- linked external sources are recorded,
- necessary access requests are explicit,
- contradictions and stale knowledge are documented,
- assumptions and open questions are visible,
- and a human or designated reviewer can understand what is known and unknown before planning begins.

## Implications

This RFC affects:

- repository bootstrap,
- source ingestion,
- Knowledge Node proposals,
- provenance,
- evidence handling,
- review workflows,
- context generation,
- connector design,
- external knowledge integrations,
- Codex and other agent prompts,
- and cross-project analysis.

## Open questions

The following remain intentionally undecided:

- the exact machine-readable source inventory schema,
- the default authority scoring model,
- which connectors are part of the MVP,
- how deeply functions are analyzed during bootstrap,
- how external sources are synchronized,
- how inaccessible references are represented in the knowledge graph,
- and how preparation results are incrementally refreshed.
