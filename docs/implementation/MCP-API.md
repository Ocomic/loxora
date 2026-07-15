# Read-only MCP API

## Demo parity proof

After building a Current package in the local demo, run `npm run demo:mcp:proof`. The command launches the real stdio server, invokes only `loxora_get_context` with `var/demo/last-context-request.json`, and compares fingerprint, ordered entries, Revisions, Evidence, paths, estimates, budget status, and warnings with direct Core output. Schema 005 databases remain compatible because the adapter requires migration 004 as its minimum and runs query-only.

`@loxora/mcp` exposes exactly one stdio tool: `loxora_get_context`. Its schema maps directly to the Context Package Core contract. The adapter does not implement lifecycle selection, dependency traversal, Assessment applicability, deduplication, or budgeting.

## Local setup

Build the workspace, then configure:

```powershell
$env:LOXORA_DATA_ROOT = 'F:\path\to\loxora-data'
$env:LOXORA_DB_PATH = 'F:\path\to\loxora-data\loxora.sqlite'
$env:LOXORA_ALLOWED_PROJECT_IDS = 'project-uuid-1,project-uuid-2'
node packages/mcp/dist/src/server.js
```

The database and data root must already exist. Their real paths are resolved at startup; the database must remain inside the root. Path traversal and symlink or junction escape fail. The adapter opens SQLite read-only, enables query-only protection, verifies migration `004_cross_project_impact`, and does not run migrations.

`LOXORA_ALLOWED_PROJECT_IDS` is the server visibility ceiling. Request inputs cannot broaden it. It is a bounded Hackathon visibility context, not authentication or a production permission engine.

## Tool input

```json
{
  "projectId": "project-uuid",
  "focusNodeIds": ["node-uuid"],
  "temporalViews": ["Current"],
  "includeRelatedProjects": true,
  "relationshipTypes": ["DependsOn"],
  "maxDependencyDepth": 1,
  "taskLabel": "Update authentication client",
  "estimatedTokenBudget": 1800,
  "explicitEvidenceReferenceIds": []
}
```

Visibility is injected from server configuration rather than accepted from the tool caller. Defaults otherwise match Core: Current only, no related Projects, no traversal, depth zero, and `utf8-bytes-div-3-ceil-v1`.

## Result and parity

The tool returns the Core Context Package as stable JSON and structured content. For equivalent inputs, direct Core and MCP calls have the same fingerprint, entry ordering, Revision and temporal classifications, paths, Assessments and freshness, Evidence, reasons, token estimate, budget status, and warnings. The transport envelope and generation time are not parity fields.

stdout is reserved for MCP JSON-RPC. Diagnostics go to stderr. Invalid requests and operational failures return sanitized messages without SQL, stack traces, absolute local paths, secrets, or protected endpoint content. Source locators are never opened and repository files are never read.

## Non-goals

There are no additional tools, write operations, migration behavior, HTTP transport, natural-language routing, persistent Context Packages, Source retrieval, authentication, or production permissions in this package.
