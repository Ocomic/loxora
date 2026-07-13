# Real Versus Curated Demo Ledger

**Status:** Proposed

The demo may use curated scenario content, but it must not use prerecorded product behavior.

## Curated inputs

| Input | Allowed preparation | Required disclosure |
|---|---|---|
| Sample projects | Small prepared `identity-contract` and `customer-portal` projects | They exist to make the scenario deterministic. |
| Contract documents | Prepared V1, V2, and V3 content | The contract wording is curated. |
| Consumer snippet | Prepared client behavior requiring `customer_id` | It is scenario evidence, not a discovered production dependency. |
| Compatibility incident | Prepared rejection/401 evidence | The incident is curated; its lifecycle and impact use are real. |
| Proposals and reviews | Prepared proposal text and suggested reasons | Review decisions must still be executed and persisted. |
| Migration rationale | Prepared rollback and deferred-plan rationale | Temporal classification must be computed from stored state. |
| Operator flow | Prepared actions and task labels | The application must execute each operation. |

## Behavior that must be real

| Behavior | Proof |
|---|---|
| Persistence | Restart and reload preserve projects, reviews, revisions, relationships, and temporal state. |
| Proposal and review | Accepted and Rejected decisions produce different persisted outcomes. |
| Immutable revisions | An accepted revision cannot be edited in place. |
| Supersession | V2 creates a successor and removes V1 from current selection without deleting it. |
| Restoration | V3 is newly created and links to both V1 and V2. |
| Temporal filtering | Current, History, and Planned return separate, correctly labeled results. |
| Dependency traversal | The impact path is followed from stored typed Relationships. |
| Impact explanation | Output cites the missing `customer_id` compatibility Evidence. |
| Evidence linkage | Results link to persisted Source and Evidence references. |
| Context Package | Selection, ordering, lifecycle filtering, deduplication, and budgeting execute at request time. |
| UI/MCP equivalence | Both surfaces call the same core operation and return equivalent ordered knowledge. |
| Export | A deterministic export contains enough MVP data to reconstruct project knowledge without an external service. |

## Prohibited simulation

- Branching on the names of the demo projects.
- Returning fixed results for known task labels or questions.
- Storing only the final V3 state while displaying invented V1/V2 history.
- Showing a prerecorded impact path that is not backed by stored Relationships.
- Giving MCP a fixture response different from the core UI operation.
- Loading a precomputed database that bypasses proposal, review, and transition behavior.

## Non-hardcoding validation

Run the core scenario with:

- alternate project and Node identifiers;
- semantically equivalent but revised fixture wording;
- at least one Rejected Proposal;
- one relationship whose direction is traversed from the opposite project.

The operations must still produce correct lifecycle, impact, and Context Package results without code changes.
