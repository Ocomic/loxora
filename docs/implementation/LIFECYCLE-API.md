# Lifecycle Core API

All public operations belong to `@loxora/core`, are asynchronous, and expose no SQLite or synchronous persistence details.

## Initial knowledge

- `submitKnowledgeProposal` reserves a new Node identity and submits Initial knowledge.
- `reviewKnowledgeProposal` accepts or rejects the frozen Proposal.
- Initial acceptance creates the Node, immutable Revision, and Current pointer atomically.

## Successor knowledge

`submitSuccessorProposal` requires project, Node, optional scope, expected Current Revision, proposed content, Sources, Evidence, proposer, and change reason. Submission creates no Revision.

Accepted review creates a new Revision, `DirectPredecessor` and `Supersedes` Relationships, and compare-and-swaps Current. A changed Current produces `CurrentRevisionMismatchError`.

## Rollback and restoration

`recordRollback` requires the currently reverted Revision, an earlier semantic source ancestor, actor, reason, and Evidence. It creates a dedicated append-only Rollback Event only.

`submitRestorationProposal` references that event and freezes its reverted Revision as the expected predecessor. Accepted review creates a new Restoration Revision. It never moves Current directly back to the semantic source Revision.

## Queries

`getCurrentKnowledge({ projectId, nodeId, scope? })` returns only the Revision referenced by Current. The result includes its Revision role, lineage Relationships, Review provenance, Evidence, Sources, and optional Rollback Event.

Current results include a Core-provided Project → Space → Collection → Node → Revision navigation path labeled `Current`.

`getKnowledgeHistory({ projectId, nodeId, scope? })` returns accepted Revisions in direct-predecessor order. Each entry includes derived classifications, current flag, Proposal/change reason, Review Decision, Evidence, Sources, lineage, and Rollback Event. Submitted and Rejected Proposals are excluded.

History results include a Core-provided parent path labeled `Historical`; callers do not reconstruct breadcrumbs.

## Errors and retry behavior

- `ProposalNotReviewableError`: the Proposal already has a Decision.
- `CurrentRevisionMismatchError`: optimistic concurrency failed; no acceptance effects are committed.
- `InvalidRestorationError`: Rollback Event, semantic source, or ancestry is invalid.
- `InvalidLineageError`: accepted Revisions do not form one complete acyclic lineage.
- `IntegrityError`: project, Node, scope, Source, or Evidence ownership is inconsistent.

Submission and rollback recording are non-idempotent create operations. Review is single-decision: a second accept or reject is rejected without side effects.
