# Pre-Hackathon Boundary Checklist

**Status:** Historical boundary — Hackathon started July 13, 2026

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

## Hackathon start record

- **Decision Owner:** Ocomic
- **Decision date:** July 13, 2026
- **Accepted architecture:** RFC-007, ADR-001, and ADR-002 for the Hackathon MVP only
- **Authorized implementation:** only work explicitly named by a milestone task
- **Current authorization:** Milestone 6 final local demo experience, authorized by Ocomic on July 15, 2026

This record closes the pre-Hackathon boundary. Milestones 1–5 are complete and merged. Milestone 6 authorizes only the curated two-Project demo, deterministic reset, explicit non-canonical Planned Knowledge, Review Inbox, local loopback HTTP/UI, browser proof, and real single-tool MCP parity. It does not authorize export, generalized import, additional MCP tools, authentication, production permissions, synchronization, search, embeddings, graph visualization, persistent Context Packages, or production deployment.
