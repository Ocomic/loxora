# Hackathon MVP Acceptance Matrix

**Status:** Proposed

The MVP is demo-ready only when every Required row passes or is explicitly re-approved through a scope change.

| Area | Requirement | Validation | Priority |
|---|---|---|---|
| Persistence | Accepted state and lineage survive restart. | Create V1/V2/V3, restart, and compare projects, reviews, revisions, relationships, and temporal classifications. | Required |
| Review | Acceptance creates the relevant immutable revision. | Accept a Proposal and verify its decision metadata and resulting revision. | Required |
| Review | Rejection creates no accepted revision. | Reject a Proposal and verify that current selection is unchanged. | Required |
| Immutability | Accepted revisions cannot be edited in place. | Attempt replacement through the write boundary and require creation of a new revision. | Required |
| Supersession | V2 supersedes V1 without deleting V1. | Query Current and History immediately after V2 acceptance. | Required |
| Restoration | V3 is new and links to V1 and V2. | Inspect lineage and restoration reason after rollback acceptance. | Required |
| Current | Current returns V3 only after restoration. | Verify V1 and V2 do not appear in current instructions. | Required |
| History | History returns ordered V1 → V2 → V3 lineage. | Verify state, applicability, Evidence, proposals, reviews, and reasons. | Required |
| Planned | Deferred migration is separate from historical V2. | Query Planned and verify it is not labeled implemented or canonical. | Required |
| Navigation | Every relevant demo Node is reachable within four actions of its Project Map. | Record and review each navigation path. | Required |
| Navigation | Every view has a clear parent or return path. | Inspect breadcrumbs, parent links, or explicit back navigation. | Required |
| Navigation | The dependency is discoverable from both projects. | Start at each Project Map and reach the relationship. | Required |
| Results | Result views show project, Space/Collection location, lifecycle state, and temporal view. | Inspect Current, History, Planned, impact, and search results if search exists. | Required |
| Results | Historical knowledge is visually distinct from current knowledge. | Compare V1/V2 history with V3 current presentation. | Required |
| Results | Planned knowledge is visually distinct and never presented as implemented. | Inspect the Deferred migration plan. | Required |
| Context | Every Context Package entry links to its Node and Evidence. | Follow links for every entry in the demo package. | Required |
| Navigation health | Orphaned demo knowledge is detected. | Add an unindexed fixture Node and verify a finding is produced. | Required |
| Impact | The stored dependency path explains the missing-claim incompatibility. | Traverse from V2 to the client and cite contract and client Evidence. | Required |
| Impact | Restricted details are not treated as absent. | Mark one target detail restricted and verify an inaccessible signal without content leakage. | Required |
| Context | Budget and lifecycle filters are deterministic. | Repeat identical input and compare stable ordering, entries, omissions, and estimator metadata. | Required |
| MCP | UI and MCP return equivalent ordered Context Package knowledge. | Call both with identical inputs and compare normalized core output. | Required |
| Portability | Export can reconstruct MVP project knowledge without an external service. | Export, import into an empty instance, and compare normalized knowledge and lineage. | Required |
| Non-hardcoding | Core behavior works with alternate IDs and revised fixture wording. | Repeat the scenario variant without source changes. | Required |
| General search | FTS or general search returns lifecycle and location metadata. | Run a keyword search if the feature remains in scope. | Cuttable |
| Visualization | A graph view renders dependency paths. | Compare it with the canonical ordered relationship path. | Cuttable |
| Browser automation | The full UI narrative is automated. | Run the end-to-end browser suite. | Cuttable |

## Context Package equivalence

Equivalent means the UI and MCP expose the same normalized core result for:

- ordered entry identifiers;
- revision identifiers;
- lifecycle states;
- temporal views;
- inclusion and omission reasons;
- Evidence references;
- dependency paths;
- budget and estimator metadata.

Presentation wrappers and transport metadata may differ.
