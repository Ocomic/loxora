# Milestone 5: Deterministic Context Package and Read-only MCP

**Status:** Implemented locally on `agent/milestone-5-context-package-mcp`
**Decision Owner:** Ocomic
**Authorization date:** July 14, 2026
**Scope:** Hackathon MVP Milestone 5 only

## Implemented capability

Milestone 5 adds one transport-neutral, asynchronous Core operation and exposes it through exactly one read-only stdio MCP tool:

```text
structured request
→ Current selection
→ optional explicit History
→ optional accepted one-hop DependsOn traversal
→ exact applicable Impact Assessment
→ Evidence and Source provenance
→ deterministic budgeting
→ ephemeral Context Package
→ loxora_get_context
```

The implementation reconciles with the actual Milestone 4 API: exact Assessment applicability remains owned by `CrossProjectImpactService` and is reused through `getProjectDependencies`; one-hop traversal reuses the accepted `DependsOn`/`DependedOnBy` paths. The MCP adapter contains configuration, validation, invocation, and serialization only.

## Lifecycle and selection boundary

Current is always selected for every explicit focus Node. History is included only when explicitly requested and preserves deterministic lineage order. Submitted and Rejected Proposals never enter a package. Related Projects and dependency paths are excluded by default and are enabled only for allowed `DependsOn` traversal at depth one.

Dependencies retain relationship-binding freshness. An Impact Assessment is selected only when its provider and consumer Revisions exactly match the selected pair; Assessment freshness is returned separately. Missing exact Assessments preserve the dependency path and add `NoApplicableImpactAssessment`. Restricted unreadable endpoints become minimal inaccessible stubs.

Context Packages are frozen, derived, and ephemeral. Generation does not write Knowledge, Revisions, Current pointers, projections, Relationships, Assessments, or Audit Events. No migration 005 was needed.

## Determinism and budget

`utf8-bytes-div-3-ceil-v1` estimates stable JSON as `ceil(UTF-8 bytes / 3)`. It is deterministic and provider-independent, but intentionally not a provider tokenizer. Mandatory focus Current, requested History, explicit Evidence, and enabled dependency bundles remain complete. Optional entries that do not fit are omitted deterministically with `BudgetExceeded`; mandatory overflow is returned with `OverBudgetMandatory`.

`sha256-context-package-json-v1` fingerprints the normalized request and normalized output while excluding `generatedAt`. The Package ID is derived from that fingerprint. Both identifiers are replaceable MVP mechanisms, not permanent content-addressing contracts.

## Read-only MCP boundary

`@loxora/mcp` uses the stable MCP TypeScript SDK v1 line and exposes only `loxora_get_context`. Startup requires an existing database within a configured real data root, verifies migration 004, runs no migrations, and opens SQLite in read-only plus query-only mode. Source locators are returned as provenance but never dereferenced. stdout is reserved for MCP JSON-RPC; startup diagnostics use stderr, and tool errors are sanitized.

## Persistence and migrations

No canonical or projection schema changes were required. The read-only Context Package factory requires `004_cross_project_impact` and deliberately refuses to initialize or upgrade a database. Existing writable factories retain their prior behavior.

## Deliberately deferred

Planned Knowledge, web UI, HTTP, additional MCP tools, natural-language routing, search, FTS, embeddings, importer expansion, export, authentication, production permissions, synchronization, multi-hop traversal, persisted Context Packages, generation Audit Events, Source retrieval, and graph visualization remain outside this milestone.

The complete Hackathon MVP is not declared complete by this milestone.
