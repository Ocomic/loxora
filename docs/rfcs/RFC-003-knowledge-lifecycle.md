# RFC-003 — Knowledge Lifecycle

**Status:** Draft  
**Version:** 0.1  
**Last Updated:** July 2026

## Purpose

This RFC defines how knowledge is proposed, reviewed, accepted, changed, deprecated, superseded, restored, archived, and removed in Loxora.

Its goal is to ensure that humans and agents can always distinguish:

- what is currently accepted,
- what was accepted previously,
- what is only proposed,
- what is uncertain or conflicting,
- what changed,
- why it changed,
- and whether a rollback restored an earlier understanding.

## Core rule

> Knowledge evolves through explicit revisions and state transitions. History is preserved, but historical knowledge must never be confused with current knowledge.

## Scope

This RFC defines conceptual lifecycle behavior. It does not define database tables, serialization formats, APIs, or storage engines.

## Knowledge identity and revision

A Knowledge Node represents a stable concept or subject over time.

A Knowledge Revision represents an immutable recorded state of that knowledge at a specific point in its history.

Accepted revisions must not be silently mutated. A meaningful change creates a new revision linked to its predecessor.

A revision should preserve, where available:

- node identity,
- revision identity,
- content or claims,
- lifecycle state,
- source evidence,
- provenance,
- proposing agent,
- reviewing agent or policy,
- creation time,
- effective time,
- reason for change,
- predecessor and successor relationships,
- rollback or restoration lineage.

## Knowledge states

### Draft

Knowledge is being prepared and is not yet ready for review.

### Proposed

Knowledge has been submitted for review but is not accepted as current project knowledge.

### Reviewed

Knowledge has completed a review step but has not necessarily become canonical. This state may be optional in implementations with simpler policies.

### Canonical

Knowledge is currently accepted for present decisions and default context generation within its scope.

Canonical does not mean permanently true or globally true.

### Deprecated

Knowledge remains relevant or temporarily usable but should no longer be preferred.

Deprecated knowledge may still describe a supported legacy path.

### Superseded

Knowledge has been actively replaced by a newer canonical revision.

### Historical

Knowledge is retained to explain a previous project state, decision, implementation, or understanding.

Historical knowledge is excluded from default current-state answers unless specifically relevant.

### Rejected

A proposal was reviewed and not accepted.

Rejected knowledge remains traceable when retention policy permits, but must not be presented as canonical.

### Restored

An earlier understanding has been intentionally reintroduced through a new revision.

Restored knowledge becomes current only when the new restoration revision is accepted as canonical.

### Archived

Knowledge is retained for recordkeeping but excluded from ordinary retrieval and active workflows.

## Canonicality and scope

Canonicality is always scoped.

A revision may be canonical for:

- one project,
- one workspace,
- one branch or release line,
- one environment,
- one team,
- one profile,
- or one defined time period.

Loxora must not assume that one globally canonical answer exists for every question.

Where multiple valid variants exist, their scopes must be explicit.

## Current knowledge selection

Default retrieval and Context Packages must prefer current canonical knowledge that matches the task scope.

Selection should consider:

- project and workspace,
- requested branch, release, or environment,
- effective time,
- access permissions,
- lifecycle state,
- active or inactive status,
- confidence and evidence,
- unresolved conflicts.

Historical, superseded, rejected, and archived revisions must not silently appear as current.

## Effective time and transaction time

Loxora should distinguish two kinds of time where practical:

- **Recorded time:** when Loxora learned or stored the revision.
- **Effective time:** when the knowledge became true or applicable in the project.

These may differ.

Example: a migration may have happened on Monday but only been documented on Thursday.

Exact temporal storage is an implementation decision, but the distinction is part of the conceptual model.

## Supersession

When new knowledge replaces existing canonical knowledge:

1. create a new revision,
2. preserve the previous revision,
3. link the new revision to the previous one,
4. mark the previous revision as superseded or historical as appropriate,
5. record the reason and evidence,
6. make the new revision canonical only after required review.

Supersession must not erase the former state.

## Deprecation

Deprecation means the knowledge should no longer be preferred but may remain valid for legacy or transitional use.

Deprecation differs from supersession:

- deprecated knowledge may still be supported,
- superseded knowledge has been replaced as the current preferred understanding.

## Rollback and restoration

A rollback is a new project event, not a deletion of the reverted period.

When an implementation or decision is rolled back:

1. preserve the revision that introduced the now-reverted state,
2. record the rollback reason and evidence,
3. create a new restoration revision derived from the earlier state,
4. link the restoration to both the earlier revision and the reverted revision,
5. review and promote the restoration revision according to policy,
6. clearly communicate which revision is current.

The restored revision is not identical to the old revision because its context, timestamp, rationale, and surrounding project state have changed.

## Conflicting knowledge

Loxora must preserve conflicting proposals or evidence without pretending that the conflict is resolved.

Conflicting knowledge should include:

- the competing revisions or claims,
- their evidence,
- their provenance,
- their scope,
- their confidence,
- review status,
- and whether one has become canonical.

Until resolved, agents should communicate the conflict explicitly.

## Active and inactive knowledge

Lifecycle state and retrieval activity are different dimensions.

Canonical knowledge may be inactive because it is irrelevant to current work, belongs to a dormant subsystem, or is excluded by policy.

Historical knowledge may become temporarily active for tasks such as migration analysis, incident review, or rollback investigation.

Active status must not change historical knowledge into current knowledge.

## Deletion and erasure

The default principle is preservation of understanding, not unconditional retention.

Physical deletion may be required for:

- privacy requests,
- legal compliance,
- secrets or credentials,
- security incidents,
- data minimization,
- contractual obligations,
- or explicit retention policies.

When safe and lawful, Loxora should preserve non-sensitive tombstone metadata explaining that knowledge was removed and why. It must never preserve content that policy requires to be erased.

## Agent communication rules

When responding from project knowledge, agents must:

- state the current canonical answer first,
- avoid blending current and historical revisions,
- label historical, deprecated, superseded, rejected, restored, or conflicting knowledge,
- mention uncertainty when no canonical answer exists,
- provide change reasons or lineage when relevant,
- warn when retrieved knowledge may be stale or outside the requested scope.

## Context Package rules

A default Context Package should contain only task-relevant current knowledge.

Historical knowledge may be included when the task requires:

- rationale,
- migration history,
- rollback analysis,
- incident investigation,
- compatibility work,
- comparison across releases,
- or explicit historical questions.

Historical sections must be visually and structurally separated from current instructions.

## Review and governance

Projects may define different review policies.

Examples include:

- human approval required,
- maintainer approval,
- multiple reviewers,
- policy-based automatic acceptance for low-risk updates,
- agent proposal with later human confirmation.

Regardless of policy, provenance and state transitions must remain traceable.

## Knowledge Claims as an open design question

A Knowledge Node may eventually contain smaller independently versioned Knowledge Claims.

Example:

- Node: Authentication
- Claim: The project uses JWT.
- Claim: The project uses OAuth2.
- Claim: The project uses Better Auth.

Claim-level lifecycle could improve conflict handling and reduce unnecessary node-wide revisions, but it may also increase model and implementation complexity.

This RFC does not mandate claim-level versioning. The question remains open for later architecture work.

## MVP implications

For the Build Week MVP, Loxora should demonstrate at least:

1. one canonical revision,
2. one superseding revision,
3. one rollback that creates a restored revision,
4. a current-state query that returns only the correct current revision,
5. a history query that shows the full lineage and reasons.

The MVP may use a simplified state model if the full conceptual behavior remains visible.

## Implications

This RFC affects:

- Knowledge Graph
- Project Graph
- Context Builder
- Context Packages
- Review Inbox
- Retrieval
- Bootstrap
- Reflections
- MCP tools
- Connectors
- Team collaboration
- Audit history
- Synchronization
- UI state indicators
- Build Week demo design

Any future architecture for these areas must preserve the lifecycle semantics defined here.

## Open questions

- Final mandatory state set
- Whether Reviewed is a persistent state or an event
- Whether lifecycle applies to nodes, revisions, claims, relationships, or all of them
- Conflict resolution policies
- Temporal query semantics
- Branch- and release-specific canonicality
- Tombstone design
- Claim-level versioning
- Automatic review boundaries
- How external source changes invalidate canonical knowledge

## Closing statement

Git versions project artifacts.

Loxora should version project understanding.

A project must be able to explain not only what it believes now, but what it believed before, why that changed, and whether an earlier understanding was later restored.
