# Planned Knowledge API

Planned Knowledge is explicit, durable, append-only, and non-canonical. Status is `Proposed`, `Deferred`, `Ready`, `Completed`, or `Cancelled`; Milestone 6 exercises `Deferred` only.

Asynchronous Core operations:

- `createPlannedKnowledge(input)`;
- `getProjectPlans({ projectId, scope, nodeId?, statuses? })`;
- `getPlannedKnowledge({ ownerProjectId, plannedKnowledgeId })`.

Records contain owner/optional related Project, project-qualified Nodes and Evidence, optional historical Revision, title, description, status, reason, blocking condition, author, scope, timestamp, Sources, and Core-provided Planned paths. Ownership joins permit only the owner or explicit related Project. Current and History APIs are unchanged; the MCP Context operation does not include Planned in Milestone 6.
