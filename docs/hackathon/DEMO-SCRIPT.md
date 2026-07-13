# Hackathon Demo Script

**Status:** Proposed

## Demonstration goal

Show that Loxora preserves the correct current project understanding, explains its history, and follows evidence-backed impact across related projects.

Prepared content is curated; all storage, review, revision, filtering, traversal, impact, Context Package, and MCP behavior shown below must execute against persisted data.

## Script

### 1. Open the workspace

Register or load `identity-contract` and `customer-portal`. Show that both have Project Maps and that no product result depends on a live model call.

### 2. Inspect dependency evidence

Open the prepared Evidence showing that the `customer-portal` authentication client consumes the token contract provided by `identity-contract`.

Show the relationship from both projects:

```text
customer-portal / Authentication Client
→ depends on
identity-contract / Token Contract
```

### 3. Accept V1

Open the V1 Proposal requiring `customer_id`. Record an Accepted Review Decision with reviewer, timestamp, scope, reason, and Evidence. Confirm that acceptance creates immutable canonical revision V1.

### 4. Navigate the current understanding

From each Project Map, navigate through Space and Collection to the relevant Node and Evidence. Demonstrate that each Node is reachable within four actions and every view has a parent or return path.

### 5. Accept V2

Open the V2 Proposal replacing `customer_id` with `subject_id`. Accept it. Confirm that immutable V2 becomes current and V1 becomes superseded or historical without being changed or deleted.

### 6. Explain cross-project impact

Run impact analysis for the V2 change. Show the traversed dependency path and explain:

- V2 no longer provides `customer_id`;
- `customer-portal` still requires `customer_id` to map the authenticated customer;
- authentication therefore fails rather than silently creating an invalid session.

### 7. Record compatibility evidence

Attach or open the curated authentication rejection evidence showing a 401 after V2. The evidence is prepared, but its association, navigation, and use by impact analysis are real.

### 8. Accept restoration V3

Open the rollback Proposal and accept V3. Confirm that V3:

- restores V1-compatible `customer_id` semantics;
- is a new immutable revision;
- links to V1 as the compatible semantic predecessor;
- links to V2 as the rolled-back revision;
- records new reason, Evidence, timestamp, proposer, and reviewer.

### 9. Query Current

Request the current token-contract knowledge. The answer must return V3 only. V1 and V2 may be linked as history but must not be blended into current instructions.

### 10. Query History

Request history. Show the ordered V1 → V2 → V3 lineage, applicability, proposal and review events, Evidence, supersession reason, compatibility failure, and restoration reason.

### 11. Query Planned

Open Planned Knowledge. Show a separate Deferred plan to revisit the `subject_id` migration after `customer-portal` is compatible.

Make explicit that historical V2 and the deferred plan are different records. Neither is current.

### 12. Build a Context Package in the UI

Build a Current Context Package for updating the `customer-portal` authentication client. Use explicit project and focus Node identifiers and a visible estimated-token budget.

The package must include V3, the dependency path, the compatibility constraint, and Evidence references. It must omit V1 and V2 from current instructions and explain omissions.

### 13. Invoke MCP

Invoke `loxora_get_context` with the same explicit inputs. Compare the stable ordered entries, lifecycle states, temporal views, Evidence references, dependency paths, and budget metadata with the UI result.

The two surfaces must be equivalent because they call the same core operation.

## Failure handling

- If general search is unavailable, navigate from Project Maps; the demo remains valid.
- If graph visualization is unavailable, show the typed path as an ordered relationship list.
- If importer breadth is unavailable, load curated fixtures and disclose that simplification.
- If MCP output differs from the UI, the demo is not ready; do not explain the difference as presentation-only.

## Closing statement

Loxora did not merely remember three versions. It selected the correct current revision, preserved the rollback lineage, kept a future plan separate, and explained why a decision in one project affected another.
