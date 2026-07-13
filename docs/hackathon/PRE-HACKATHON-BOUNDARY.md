# Pre-Hackathon Boundary Checklist

**Status:** Proposed

Pre-Hackathon preparation may reduce environment risk, but it must not implement the Loxora demo.

## Allowed after explicit authorization

- [ ] Planning documents and templates.
- [ ] Empty application and package shells.
- [ ] Package-manager and runtime pinning.
- [ ] Linting, formatting, type-checking, test-runner, and CI configuration.
- [ ] Environment template without secrets.
- [ ] Development-environment verification script.
- [ ] Empty migration directory and documented migration procedure.
- [ ] Non-functional wireframes or static screenshots.
- [ ] Sample-data format specifications.
- [ ] Empty or redacted sample-project skeletons that cannot run the final demo.

## Forbidden before the Hackathon

- [ ] Functioning persistence or a product database schema.
- [ ] Import parsing or proposal generation.
- [ ] Lifecycle state transitions or current-revision selection.
- [ ] Review workflows.
- [ ] Retrieval, FTS queries, graph or relationship traversal.
- [ ] Navigation-health computation.
- [ ] Context Package construction or budgeting.
- [ ] Functioning MCP tools or agent integrations.
- [ ] Cross-project impact analysis.
- [ ] Final interactive demo UI.
- [ ] A seeded or precomputed database containing the final scenario.
- [ ] Importer-ready completed fixtures that bypass Hackathon implementation.

## Boundary hazards

- A sample specification becomes implementation when it includes a ready-to-load canonical database.
- An empty MCP package becomes implementation when it exposes a functioning Loxora operation.
- Migration tooling becomes implementation when it defines the knowledge schema.
- A UI shell becomes implementation when it performs review, lifecycle, query, or traversal behavior.
- An environment script becomes implementation when it creates or seeds project knowledge.

## Authorization record

Before setup begins, record:

- approving Decision Owner;
- approval date;
- approved checklist items;
- explicitly excluded items;
- confirmation that RFC-007 and relevant ADR status permit the work.

Approval of setup does not authorize Hackathon runtime implementation.
