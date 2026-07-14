# Cross-Project Impact Core API

All public contracts are asynchronous and transport-neutral in `@loxora/core`. `DatabaseSync`, SQL, migrations, and synchronous connection state remain private to `@loxora/sqlite`.

## Services and operations

`CrossProjectImpactService` receives a `CrossProjectImpactStore`, injected `RelationshipReviewPolicy`, ID generator, Clock, and replaceable `ImpactAssessmentBuilder`.

- `submitCrossProjectRelationshipProposal` resolves and freezes both Current endpoints and records a project-qualified Evidence-backed `DependsOn` Proposal.
- `reviewCrossProjectRelationshipProposal` creates an Accepted or Rejected Review Decision. Acceptance revalidates both frozen bindings and atomically creates one immutable Relationship.
- `assessRevisionImpact` resolves consumer Current, validates the explicit provider Revision, evaluates structured facts, creates the versioned basis fingerprint, and persists one immutable derived Assessment.
- `getProjectDependencies` returns stable outgoing, incoming, or combined dependency summaries for one Project and exact scope.
- `getRevisionImpact` performs deterministic one-hop reverse traversal from an explicit provider Project, Node, Revision, and scope.
- `getImpactPath` reconstructs one Assessment's provider-to-consumer path.

## Direction and binding

Canonical storage direction is consumer `DependsOn` provider. Reverse display is provider `DependedOnBy` consumer. The accepted Relationship's endpoint Revision IDs are frozen. Later endpoint changes produce `Stale` relationship binding freshness without mutation.

Assessment binding is independent. Assessment creation can use newer endpoint Revisions and can therefore be Fresh while the accepted Relationship binding is Stale.

## Applicability and ordering

Queries explicitly select provider and consumer Revisions. An Assessment is applicable only when both IDs match exactly. Applicable candidates are ordered by Fresh before Stale, newest assessment timestamp, and stable Assessment ID. If no exact Assessment exists, APIs preserve the dependency path, return `assessment: null`, and include `NoApplicableImpactAssessment`.

## Impact facts and severity

Structured facts contain compatibility, consumer requirement, operational criticality, observed-failure status, change summary, consumer constraint, and consequence. `loxora-impact-severity-v1` applies the approved deterministic Low/Medium/High/Critical rules. Assessment confidence inherits the accepted Relationship confidence.

## Fingerprint

`sha256-impact-assessment-basis-json-v1` covers Relationship ID, provider and consumer Revision IDs, normalized structured facts, sorted project-qualified Evidence IDs, and severity evaluator version. It excludes actor, correlation ID, Assessment ID, and timestamp. The builder is deterministic and replaceable.

## Visibility and redaction

Read operations receive service-provided readable Project IDs. Missing access produces an inaccessible endpoint stub. Restricted endpoints do not expose protected hierarchy labels, Revision content, Evidence, Sources, or explanation details. The API does not implement identities, roles, groups, inheritance, authentication, or production authorization.

## Atomicity and canon isolation

Relationship review and Assessment creation use separate `BEGIN IMMEDIATE` transactions with one correlation ID per operation and endpoint Audit Events. Faults roll back Decisions, Relationships or Assessments, Evidence joins, Proposal status, and Audit Events. Cross-project operations never insert or mutate Knowledge Revisions or Current pointers.
