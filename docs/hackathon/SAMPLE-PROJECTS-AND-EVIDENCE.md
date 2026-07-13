# Sample Projects and Evidence Map

**Status:** Proposed specification

This document defines the curated demo inputs and their minimum navigation paths. It does not create the projects, fixtures, or a functioning import format.

## Project: `identity-contract`

**Purpose:** Provide the shared identity token contract consumed by other projects.

### Navigation layout

```text
Project Map
└── Contract Space
    └── Token Contract Collection
        ├── Token Contract Node
        ├── Compatibility Incident Node
        └── Deferred Migration Plan Node
```

### Knowledge and Evidence

| Artifact | Node | Temporal view | Lifecycle or plan state | Evidence role |
|---|---|---|---|---|
| V1 contract document | Token Contract | Past after V2 | Superseded/Historical | Establishes required `customer_id`. |
| V2 contract proposal | Token Contract | Past after rollback | Superseded/Historical | Replaces `customer_id` with `subject_id`. |
| V3 restoration decision | Token Contract | Current | Canonical restored revision | Restores V1-compatible semantics as a new revision. |
| Compatibility incident | Compatibility Incident | Past and relevant to Current rationale | Reviewed evidence | Records authentication rejection after V2. |
| Deferred migration plan | Deferred Migration Plan | Planned | Deferred | Revisit `subject_id` after consumer compatibility. |

## Project: `customer-portal`

**Purpose:** Provide a customer-facing application whose authentication client consumes `identity-contract`.

### Navigation layout

```text
Project Map
└── Authentication Space
    └── Authentication Client Collection
        ├── Authentication Client Node
        └── Token Dependency Node
```

### Knowledge and Evidence

| Artifact | Node | Temporal view | Lifecycle state | Evidence role |
|---|---|---|---|---|
| Authentication-client document or snippet | Authentication Client | Current | Canonical | Shows the client requires `customer_id` to map a customer. |
| Dependency declaration or import reference | Token Dependency | Current | Canonical | Connects the client to the provided token contract. |
| Authentication rejection/401 record | Authentication Client | Past incident, current rationale | Historical evidence | Shows V2 tokens cannot satisfy client requirements. |

## Cross-project relationship

```text
customer-portal / Authentication Client
→ depends on
identity-contract / Token Contract
```

The relationship must record:

- both project and Node references;
- relationship type and direction;
- contract-consumption scope;
- dependency declaration or import Evidence;
- client expectation Evidence;
- confidence and review state;
- visibility scope;
- applicability across V1, V2, and V3 where relevant.

It must be discoverable from both Project Maps and usable for reverse impact traversal from a proposed provider change.

## Lifecycle evidence sequence

### V1 acceptance

- Proposal: require `customer_id`.
- Evidence: V1 contract document and consumer expectation.
- Review reason: existing consumer compatibility.

### V2 acceptance

- Proposal: replace `customer_id` with generalized `subject_id`.
- Evidence: V2 contract proposal.
- Review reason: unify identity semantics.

### Compatibility failure

- Evidence: consumer cannot map `subject_id` and rejects authentication with 401.
- Impact path: V2 contract → dependency → authentication client requirement.

### V3 restoration

- Proposal: restore `customer_id` compatibility.
- Evidence: incident record, V1, V2, and client requirement.
- Review reason: restore service while preserving the attempted migration history.

### Deferred plan

- Planned change: adopt the `subject_id` direction after the consumer accepts the claim and migration validation passes.
- State: Deferred.
- Relationship: references historical V2 but is not a revision of current token-contract knowledge.

## Navigation limits

Each listed Node must be reachable from its Project Map within:

1. Project Map → Space;
2. Space → Collection;
3. Collection → Node.

Evidence is reachable from the Node as a fourth action. Every page or result must provide a breadcrumb, parent link, or explicit return path.

## Curated-data constraints

- Documents and snippets must contain no secrets or real customer data.
- Evidence identifiers and timestamps must be internally consistent.
- Prepared content must not encode computed impact or Context Package output.
- Fixture formats must remain replaceable supporting infrastructure.
- The final implementation must validate paths and keep file access within registered sample-project roots.
