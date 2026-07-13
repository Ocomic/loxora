# RFC-007 — Initial Architecture and Hackathon MVP Boundaries

**Status:** Proposed
**Version:** 0.1
**Last Updated:** July 2026

## Purpose

This RFC proposes the initial architecture and strict scope for the Loxora Hackathon MVP. It turns the principles in RFC-000 through RFC-006 into one reviewable vertical slice without selecting a permanent architecture for Loxora.

The MVP must prove two ideas:

1. project knowledge changes through reviewed, immutable, rollback-aware revisions; and
2. evidence-backed relationships allow an impact to be explained across projects.

Repository import, local persistence, a web interface, and MCP access support that proof. They are not the primary product distinction.

## Status and approval boundary

This RFC is a proposal. It does not authorize setup or implementation. The related ADRs must be reviewed before any architecture described here is treated as accepted.

## Demo scenario

The MVP uses two prepared software projects:

- `identity-contract` provides a shared token contract.
- `customer-portal` consumes the contract through an authentication client.

The lifecycle story is:

1. V1 requires a `customer_id` token claim and becomes canonical.
2. V2 replaces `customer_id` with `subject_id` and supersedes V1.
3. `customer-portal` still requires `customer_id`, so tokens following V2 cannot be mapped to a customer and authentication is rejected with a 401 response.
4. V3 restores the V1-compatible `customer_id` understanding through a new reviewed revision. V3 becomes current; neither V1 nor V2 is rewritten or deleted.
5. A separate Planned Knowledge item records a deferred migration to the V2 direction after `customer-portal` supports `subject_id`.

The temporal views therefore remain distinct:

- **Past:** V1 was canonical, then V2 superseded it and was rolled back.
- **Current:** V3 is the canonical restoration of V1-compatible semantics.
- **Planned:** the V2 migration direction is deferred until the consumer is compatible. The plan references V2 but does not make historical V2 current.

## Goals

- Persist the demo knowledge locally and reload it without losing state or lineage.
- Require a review decision before a proposal becomes accepted knowledge.
- Preserve immutable accepted revisions through supersession and restoration.
- Keep current, historical, and planned knowledge separate in navigation, queries, and Context Packages.
- Navigate from each Project Map to relevant detail without requiring internal identifiers.
- Traverse an evidence-backed dependency in either direction and explain compatibility impact.
- Build a deterministic, task-specific Context Package through one shared core operation.
- Expose that same operation through the UI and a read-only stdio MCP adapter.
- Keep project knowledge inspectable, project-owned, and deterministically exportable.

## Non-goals

- General-purpose repository understanding or automatic dependency discovery.
- Live LLM extraction or natural-language query routing.
- Embeddings or a production retrieval stack.
- A dedicated graph database or general graph visualization.
- Production authentication, authorization, collaboration, synchronization, or cloud hosting.
- Claim-level versioning, branch-specific canon, or the final lifecycle state model.
- A permanent storage decision for Loxora.
- Full support for non-software profiles.

## Required real behavior

Prepared documents, evidence, transition reasons, and scenario content may be curated. The following behavior must be real and data-driven:

- persistence and reload;
- proposal submission and Accepted or Rejected Review Decisions;
- immutable accepted revisions;
- supersession and restoration;
- current, history, and planned filtering;
- typed dependency traversal;
- evidence-backed impact explanation;
- Context Package selection, ordering, filtering, and budgeting;
- read-only MCP access to the shared Context Package operation.

The implementation must not branch on the names `identity-contract` or `customer-portal`, fixed demo identifiers, exact fixture wording, or prerecorded answers. The same operations must work with alternate identifiers and equivalent input data.

## Minimum conceptual model

The MVP stores only the concepts needed for the vertical slice:

- Project and Project Map;
- Knowledge Space;
- Knowledge Collection;
- Knowledge Node;
- Source and Evidence reference;
- Proposal;
- Review Decision;
- immutable Knowledge Revision;
- typed intra-project or cross-project Relationship;
- Planned Knowledge item;
- Context Package as a temporary generated artifact.

Space indexes, collection summaries, search results, and other navigation summaries may be projections of Project, Space, Collection, Node, Revision, Evidence, and Relationship data. The broader RFC terminology remains valid, but the MVP does not need a separate persistence model for every derived concept.

## Review model

The review model contains:

- a submitted Proposal;
- one Accepted or Rejected Review Decision;
- reviewer identity;
- decision timestamp;
- reason;
- decision scope;
- supporting or contradicting Evidence references.

Submission freezes the proposal content used for review. Acceptance atomically creates the relevant immutable revision and applies its lifecycle transition. Rejection records the decision but creates no accepted revision. An agent may prepare a proposal but cannot silently accept it.

## Revision and lifecycle behavior

- V1 acceptance creates the first canonical revision.
- V2 acceptance creates a successor revision and makes V1 superseded or historical for the applicable scope.
- V3 acceptance creates a new restoration revision linked to both the earlier compatible revision and the rolled-back V2 revision.
- A current query returns only the canonical revision applicable to the requested scope.
- A history query returns the ordered lineage, review decisions, evidence, and transition reasons.
- A planned query returns Planned Knowledge separately and never treats it as implemented or canonical.
- An accepted lifecycle change invalidates affected navigation projections, summaries, Context Packages, and incoming or outgoing relationship assessments.

## Cross-project relationship behavior

The dependency from the `customer-portal` authentication client to the `identity-contract` token contract must record:

- source and target projects and Nodes;
- relationship type and direction;
- affected scope;
- Evidence and provenance;
- confidence;
- review state;
- visibility or access scope.

The relationship must be discoverable from both Project Maps. Impact output must explain the traversed path and the concrete incompatibility: V2 omits `customer_id`, while the consuming client requires it to map the authenticated user.

## Navigation requirements

- Every relevant demo Node must be reachable from its Project Map in no more than four navigation actions.
- Every view must provide a parent, breadcrumb, or clear return path.
- Cross-project relationships must be discoverable from both affected projects.
- Search and result views must show project, Space or Collection location, lifecycle state, and temporal view.
- Historical results must be visually distinct from current results.
- Planned results must be visually distinct and must not imply implementation.
- Context Package entries must link to their Knowledge Node and Evidence.
- Orphaned demo knowledge must be detected.

## Context Package operation

The UI and MCP adapter must call one shared deterministic core operation. It accepts:

- explicit project identifiers;
- explicit focus Node identifiers;
- requested temporal views;
- whether typed dependencies may be followed;
- a task label or description for display, not natural-language routing;
- an estimated-token budget.

It returns stable ordered entries containing:

- lifecycle-filtered knowledge;
- project and navigation location;
- temporal view and lifecycle state;
- inclusion reason;
- Node and Evidence references;
- followed dependency paths;
- omissions, stale inputs, and inaccessible references;
- budget estimate and estimator identifier.

The proposed MCP tool name is `loxora_get_context`. It is read-only. The MCP adapter must not reimplement selection or lifecycle filtering.

## Proposed MVP architecture

The related ADRs propose a TypeScript workspace, local web UI, local core service, read-only stdio MCP adapter, and SQLite-backed MVP persistence. Typed relationships are represented through relational edges. FTS5 may support general search if time permits.

SQLite is a proposed implementation for the MVP, not Loxora's permanent canonical storage architecture. The design must keep project knowledge locally inspectable and provide a deterministic, lossless export that does not require an external service to interpret or retain project knowledge.

## Repository preparation and import

Import is supporting infrastructure. A narrow deterministic importer may register prepared project metadata, evidence, and relationships, or the implementation may load equivalent curated fixtures if time is constrained.

Import breadth must not displace lifecycle correctness, review, temporal separation, navigation, cross-project impact, or Context Package behavior.

## Pre-Hackathon boundary

Before the Hackathon, work may prepare planning documents, empty application or package shells, development tooling, CI, environment templates, non-functional wireframes, and sample-data specifications.

It must not implement persistence schemas, import logic, lifecycle behavior, retrieval, traversal, Context Packages, review workflows, MCP tools, final UI behavior, or a precomputed demo database.

## Cut order

If implementation time is constrained, cut in this order:

1. visual polish;
2. graph visualization;
3. FTS and general search;
4. navigation-health dashboard;
5. importer breadth;
6. browser automation;
7. extra task types.

Do not cut lifecycle correctness, review before canon, temporal separation, evidence-backed cross-project impact, progressive navigation, or the real MCP Context Package proof.

## Alternatives considered

### Filesystem-first Markdown or JSON

This is highly inspectable but makes atomic lifecycle transitions, referential integrity, invalidation, and repeatable restoration harder within the Hackathon window.

### Python service with a separate web frontend

This supports rapid backend experimentation but creates a split toolchain and duplicated contracts for a solo implementation.

### Dedicated graph or vector infrastructure

Neither is needed to prove the differentiators and both would increase setup and demo risk.

## Approval gates

The following remain subject to human approval:

- this RFC;
- ADR-001 and ADR-002;
- authorization for pre-Hackathon setup;
- authorization for Hackathon implementation;
- designation of the reviewer and Decision Owner;
- acceptance of the deterministic export format as sufficient for MVP portability.

## Implications

This proposal constrains the Hackathon scope, demo data, navigation acceptance criteria, UI behavior, persistence proposal, relationship representation, review flow, and MCP contract. It does not change the long-term Loxora vision or close post-MVP architecture questions.
