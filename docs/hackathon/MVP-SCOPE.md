# Hackathon MVP Scope

**Status:** Proposed
**Capacity assumption:** One developer for one Hackathon week

## Outcome

The MVP must prove that Loxora can give two related projects correct, traceable knowledge across both time and project boundaries.

The headline is not repository import. The headline is:

1. a reviewed decision can be superseded and later restored without losing history; and
2. an evidence-backed dependency can explain why another project is affected.

## Demo projects

- `identity-contract` provides the shared token contract.
- `customer-portal` consumes the contract through an authentication client.

V1 requires `customer_id`. V2 replaces it with `subject_id`. Because the consumer still requires `customer_id` to map the authenticated customer, V2 causes authentication rejection. V3 is a new accepted restoration revision with V1-compatible semantics.

A separate Planned Knowledge item defers the V2 migration direction until the consumer supports `subject_id`.

## Required real functionality

- Local persistence and reload.
- Proposal submission and Accepted or Rejected Review Decisions.
- Immutable accepted Knowledge Revisions.
- Supersession and restoration with full lineage.
- Separate current, history, and planned filters.
- Navigation through Project Map, Space, Collection, and Node.
- Typed cross-project dependency traversal in both directions.
- Impact explanation with Evidence and provenance.
- Deterministic Context Package construction and budgeting.
- Equivalent lifecycle-filtered Context Packages through the UI and read-only MCP.
- Detection of orphaned demo knowledge.
- Deterministic, lossless export of MVP project knowledge.

## Curated inputs

The following may be prepared for the scenario:

- sample project documents and source snippets;
- contract V1, V2, and V3 content;
- Evidence references;
- proposal and review text;
- compatibility incident and 401 evidence;
- transition and rollback reasons;
- deferred migration plan;
- operator actions and task prompts.

Curated inputs must remain clearly labeled. They may establish the scenario but may not precompute product results.

## Non-hardcoding rule

Core behavior must be driven by stored data and explicit operation inputs. It must not branch on demo project names, fixed Node identifiers, exact fixture wording, or prerecorded questions.

As a validation, the same operations must work with alternate project and Node identifiers and semantically equivalent fixture wording.

## Required navigation model

The MVP stores:

- Project Map;
- Knowledge Space;
- Knowledge Collection;
- Knowledge Node.

Indexes and summaries may be projections of these entities, their accepted revisions, Evidence, and Relationships. The MVP does not need separate complex persistence subsystems for every derived navigation concept in RFC-006.

## Review model

- A Proposal is submitted with scope and Evidence.
- A reviewer records an Accepted or Rejected Review Decision with identity, timestamp, reason, scope, and Evidence references.
- Acceptance creates the relevant immutable revision and applies the requested transition atomically.
- Rejection creates no accepted revision.
- AI may propose; it does not decide canon.

## Temporal behavior

- Current returns V3 only after restoration.
- History returns the ordered V1 → V2 → V3 lineage and associated decisions and Evidence.
- Planned returns a separate Deferred migration item referencing the V2 direction.
- Planned and historical knowledge never appear as current merely because they are related or recent.

## Context Package behavior

One deterministic core operation accepts explicit project IDs, focus Node IDs, requested temporal views, dependency-following policy, display-only task text, and an estimated-token budget.

It returns stable ordered entries, navigation location, lifecycle and temporal classifications, inclusion reasons, Node and Evidence references, dependency paths, omissions, stale or inaccessible inputs, and budget metadata.

The UI and proposed `loxora_get_context` MCP tool call this same operation. MCP is read-only and performs no general natural-language routing.

## Supporting infrastructure

- Narrow prepared-project loading or deterministic import.
- Local service and web UI.
- Optional FTS5 search.
- Reset and diagnostic operations.
- Export and validation utilities.

Repository import may be reduced to curated fixture loading if necessary. It is not a differentiator and must not consume the critical path.

## Non-goals

- General extraction, embeddings, cloud services, production permissions, synchronization, multi-user collaboration, claim-level lifecycle, a universal graph browser, full repository history, and broad project profiles.

## Cut order

1. Visual polish.
2. Graph visualization.
3. FTS and general search.
4. Navigation-health dashboard.
5. Importer breadth.
6. Browser automation.
7. Extra task types.

Lifecycle correctness, review before canon, temporal separation, evidence-backed cross-project impact, progressive navigation, and the real MCP Context Package proof are not cuttable.

## Approval required

Implementation requires acceptance of RFC-007 and its related ADRs, authorization for the appropriate work phase, and assignment of a Decision Owner and reviewer.
