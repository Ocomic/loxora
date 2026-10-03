# Planned Knowledge API

Planned Knowledge is explicit, durable, append-only, and non-canonical. Status is `Proposed`, `Deferred`, `Ready`, `InProgress`, `Completed`, or `Cancelled` (`InProgress` since Milestone 9). Plan status is always set explicitly; Missions never change it (RFC-009, ADR-005).

## Operations

`PlannedKnowledgeService(store, ids?, clock?, policy?)` provides these asynchronous Core operations:

- `createPlannedKnowledge(input)`: creates a plan; its creation record is revision 1;
- `revisePlannedKnowledge({ ownerProjectId, plannedKnowledgeId, changes, changeReason, actorId })`:
  - `changes` may set title, description, status, reason, blocking condition, and the related Project (or `null`), and add or remove Nodes and Evidence;
  - the result is `{ outcome: "Revised", revision }`, or `{ outcome: "Proposed", proposal }` when a plan revision proposal needs review;
  - a request that changes nothing is refused;
  - new links to Nodes without Current knowledge are refused;
- `reviewPlannedKnowledgeRevisionProposal({ ownerProjectId, proposalId, reviewerId, decision, reason, evidence })`:
  - on acceptance, the proposal's changed fields apply on top of the effective revision as the next revision;
  - acceptance fails if one of those fields changed since the proposal's base revision;
- `getProjectPlans({ projectId, scope, nodeId?, statuses? })` and `getPlannedKnowledge({ ownerProjectId, plannedKnowledgeId })`: return the **effective** state;
- `getPlannedKnowledgeHistory({ ownerProjectId, plannedKnowledgeId })`:
  - returns revision 1, later revisions, and proposals in order;
  - marks the effective revision;
  - includes each proposal's decision.

## Policy

`policy.mayDecide(actorId)` decides who may close a plan (`Completed`, `Cancelled`), change a closed plan, and review plan revision proposals.

- Other actors get a plan revision proposal for those changes. Every other change takes effect directly and is recorded with its actor.
- The default policy allows every actor that is not `agent:*`. The CLI allows exactly the workspace reviewers.

## Records

- **Plan records:**
  - owning Project and optional related Project;
  - Project-qualified Nodes and Evidence;
  - optional historical Revision;
  - title, description, status, reason, blocking condition;
  - author, scope, and timestamp;
  - `revisionNumber`, `revisedBy`, and `revisedAt` of the effective revision;
  - Sources and Core-provided Planned paths.
- **Revisions and proposals** (`PlannedKnowledgeRevision`):
  - the full revisable state;
  - `changedFields`, `changeReason`, author, base revision;
  - for accepted proposals, `sourceProposalId`.
- **Access:** ownership joins permit only the owner or an explicit related Project.

## Review Inbox

`ReviewInboxService` lists three kinds of items:

- `KnowledgeProposal`;
- `CrossProjectRelationshipProposal`;
- `PlannedKnowledgeRevisionProposal`, which shows the plan title, the effective status, and the proposal.

## Node keys

`NodeKeyService(store, ids?, clock?, policy?).assignNodeKey({ projectId, nodeId, key, actorId })` assigns an immutable key (ADR-006):

- **Format:** 1 to 32 characters, starting with a letter or digit, then letters, digits, `.`, `_`, or `-`.
- **Uniqueness:** per Project, case-insensitive. A key is never reused.
- **Targets:**
  - the reserved Node id of a submitted Proposal, for any actor;
  - an existing Node, only for actors with `mayDecide`.
- `getNodeKeys({ projectId })` lists the keys.

## Unchanged

Current and History APIs for knowledge are unchanged. The MCP Context operation does not include Planned Knowledge.
