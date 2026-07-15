# Sample Projects and Evidence Map

**Status:** Implemented fixture specification (`fixtures/hackathon-demo-v1`)

This document describes the curated raw fixture inputs and minimum navigation paths. Reset consumes them through real Core operations; no canonical database or computed result is committed.

## Project: `identity-contract`

**Purpose:** Provide the shared identity token contract consumed by other projects.

### Navigation layout

```text
Project Map
└── Authentication Space
    └── Token Contract Collection
        └── Token Format Node
```

### Knowledge and Evidence

| Artifact | Node | Temporal view | Lifecycle or plan state | Evidence role |
|---|---|---|---|---|
| V1 contract document | Token Format | Past after V2 | Superseded/Historical | Establishes required `customer_id`. |
| V2 contract proposal | Token Format | Past after rollback | Superseded/Historical | Replaces `customer_id` with `subject_id`. |
| V3 restoration decision | Token Format | Current | Canonical restored revision | Restores V1-compatible semantics as a new revision. |

## Project: `customer-portal`

**Purpose:** Provide a customer-facing application whose authentication client consumes `identity-contract`.

### Navigation layout

```text
Project Map
└── Authentication Space
    └── Authentication Client Collection
        └── Token Parser Node
```

### Knowledge and Evidence

| Artifact | Node | Temporal view | Lifecycle state | Evidence role |
|---|---|---|---|---|
| Authentication-client document or snippet | Token Parser | Current | Canonical | Shows the client requires `customer_id` to map a customer. |
| Dependency declaration | Token Parser | Current | Relationship Evidence | Connects the client to Token Format. |
| Authentication rejection/401 record | Token Parser | Incident Evidence | Assessment Evidence | Shows V2 tokens cannot satisfy client requirements. |
| Deferred subject migration | Token Parser and Token Format | Planned | Deferred | Requires subject mapping and compatibility tests. |

## Cross-project relationship

```text
customer-portal / Token Parser
→ depends on
identity-contract / Token Format
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
