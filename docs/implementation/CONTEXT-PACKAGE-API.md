# Context Package Core API

Milestone 5 adds `ContextPackageService.buildContextPackage(input)`, an asynchronous, transport-neutral Core operation. SQLite, MCP, SQL, and synchronous persistence types are absent from its public contract.

## Input

The request contains:

- `projectId` and one or more `focusNodeIds`;
- `temporalViews`, defaulting to `Current`;
- `includeRelatedProjects`, defaulting to `false`;
- allowed `relationshipTypes`, limited to `DependsOn`;
- `maxDependencyDepth`, limited to `0` or `1`;
- a display-only `taskLabel`;
- a positive `estimatedTokenBudget`;
- service-provided `readableProjectIds`;
- optional explicit Evidence IDs in the primary Project;
- `estimatorId`, defaulting to `utf8-bytes-div-3-ceil-v1`.

Free text does not route or rank knowledge. Focus Nodes, temporal views, relationship types, Evidence IDs, and readable Projects are explicit structured inputs.

## Selection

Selection priority is deterministic:

1. Current Revision for each explicit focus Node.
2. Explicitly requested complete History.
3. Explicit Evidence and its Source.
4. Accepted allowed one-hop dependency paths.
5. The exact applicable Impact Assessment already selected by the cross-project impact contract.
6. Related Current Node bundles when readable.
7. Optional directly associated Assessment Evidence.

Current after restoration selects V3. V1 and V2 appear only in an explicitly requested History entry. Duplicate candidates collapse by stable entry identity, and output ordering uses stable kind, Project, Node, Revision, and Evidence identifiers rather than timestamps or insertion order.

Depth zero never follows relationships. Depth one is the maximum. When a dependency is Restricted and its endpoint Project is unreadable, the package contains only an inaccessible reference and warning; protected titles, content, paths, Evidence, Sources, and explanations are absent.

## Output

The frozen derived result includes:

- deterministic Package ID and fingerprint;
- generated timestamp and display task label;
- normalized request and estimator ID;
- ordered entries with lifecycle and temporal classifications;
- Navigation Paths and inclusion reasons;
- Evidence and Sources;
- followed dependency paths and exact Assessment identifiers, severity, and freshness;
- included Project, Node, and Revision identifiers;
- stale inputs, inaccessible references, omissions, and warnings;
- requested budget, estimated usage, remaining budget, and status.

`NoApplicableImpactAssessment` is retained when no exact Revision-pair Assessment exists. Relationship and Assessment freshness remain separate.

## Estimation and budget

`utf8-bytes-div-3-ceil-v1` serializes normalized stable JSON, measures UTF-8 bytes, divides by three, and rounds up. The estimator is deterministic for ASCII and Unicode but is only an MVP planning estimate.

Mandatory entries are indivisible. Optional entries are considered in stable order and omitted with `BudgetExceeded` if they do not fit. If mandatory entries exceed the request, all mandatory content is returned with `OverBudgetMandatory`; content is never silently truncated.

## Purity and limitations

Package generation is read-only and produces no Audit Event. Packages are not persisted. The operation supports only Current, explicit History, the accepted `DependsOn` type, and depth zero or one. Planned Knowledge, search, model routing, Source retrieval, multi-hop traversal, and provider tokenizers are not implemented.
