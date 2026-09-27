# Open Questions

**Status:** Living planning document

## Post-demo portability

Milestone 6 is demo-ready, but deterministic project-owned export/import remains unresolved and explicitly deferred. The repository must not claim permanent MVP portability until a lossless inspectable export can reconstruct canonical knowledge, lineage, relationships, assessments, Evidence, and plans without an external service.

## Knowledge lifecycle

- Final set of Knowledge States
- Allowed state transitions
- Whether state belongs to a node, revision, claim, or all three
- Restoration and rollback semantics
- Validity intervals and effective dates
- How current canonical knowledge is selected
- How conflicting canonical perspectives are represented
- Deletion, retention, privacy, and legal-erasure policies

## Team and collaboration

- Personal, Project, Team, and Organization boundaries
- Roles and permissions
- Knowledge ownership and governance
- Agent identity and delegation
- Review policies
- Concurrent editing and conflict resolution
- Audit history
- Cross-project sharing policies
- Offline-first synchronization
- Self-hosted team server vs. optional managed cloud

## Architecture

- Monorepo vs. single package
- Runtime and package manager
- Storage engine
- Graph representation
- Search and retrieval strategy
- Context Package schema
- Plugin and connector architecture
- MCP boundary
- Codex integration model
- Profile architecture
- Deployment and packaging

### Accepted Hackathon MVP defaults

The following were accepted by Ocomic on July 13, 2026 for explicitly authorized Hackathon MVP milestones only:

- a TypeScript workspace with a local web UI, shared core, and read-only stdio MCP adapter;
- SQLite as replaceable local MVP persistence, with deterministic export;
- relational typed edges instead of a dedicated graph database;
- Project Map, Space, Collection, and Node as the stored navigation structure;
- summaries and indexes as projections where practical;
- deterministic Context Package inputs rather than general natural-language routing.

These defaults do not resolve permanent storage, runtime, workspace, graph, search, connector, or deployment architecture. Node.js 24.18 `node:sqlite` is a release-candidate API and remains replaceable behind asynchronous Core ports.

## Build Week

- **Proposed scope:** lifecycle and rollback awareness plus cross-project impact using `identity-contract` and `customer-portal`.
- **Proposed scenario:** V2 replaces `customer_id` with `subject_id`, breaks the consumer, and is restored through V3.
- **Proposed temporal view:** historical V1/V2, current V3, and a separate Deferred migration plan.
- **Proposed MCP scope:** one deterministic read-only Context Package tool shared with the UI.
- **Proposed real behavior:** persistence, review, immutable revisions, lifecycle transitions, temporal filtering, traversal, impact, Context Packages, and MCP access.
- **Curated inputs:** prepared documents, Evidence, transition reasons, and scenario content.
- **Decision Owner:** Ocomic for the Hackathon MVP decisions dated July 13, 2026.
- **Post-MVP question:** software and non-software profile datasets beyond the two-project demo.

## Post-MVP questions retained

- Permanent persistence and canonical interchange architecture.
- General repository and external-source ingestion.
- Production permissions and governance.
- Offline and team synchronization.
- Claim-level lifecycle.
- Embeddings and broader retrieval strategy.
- Profiles for books, games, research, and business projects.


## Long-term product and commercialization

The long-term direction is described in `docs/planning/PRODUCT-VISION.md`. The following remain open and require RFC/ADR work before implementation:

- Capability registry and provider-independent capability contracts.
- Local system scanner and supported baseline local model/runtime.
- Packaging strategy for a useful first-run local installation.
- Local, hybrid, and cloud-burst execution semantics.
- Compute-router policy inputs and privacy classification.
- Batch scheduling and interactive-vs-background priority rules.
- Cost Guard, budget reservation, worker TTL, idle shutdown, and zombie-worker reaping.
- Remote worker protocol for user-owned and rented NVIDIA compute.
- Local usage accounting and hardware-vs-rental cost analysis.
- Boundary between open-source Loxora Core and optional Hub/Cloud/Compute services.
- Bring-your-own-provider and bring-your-own-API-key requirements.
- Managed compute convenience-fee model and transparent cost reporting.
- Web control-plane trust boundary and local-daemon authority.
- Extension/marketplace trust, signing, review, and update model.
- Data minimization and permission requirements for remote compute.

## Licensing and contribution policy

The repository currently uses MIT. The decision space is recorded in `docs/planning/LICENSING-STRATEGY.md`.

Open questions include:

- Remain MIT vs. move to Apache-2.0, MPL-2.0, AGPLv3, or another approved open-source license.
- Whether protection against closed hosted forks is a product requirement.
- Whether commercial dual licensing is desirable.
- Contributor License Agreement or Developer Certificate of Origin strategy.
- Copyright ownership and relicensing rights before substantial external contributions arrive.
- Dependency-license compatibility for the eventual packaged local runtime.
- Trademark policy for the Loxora name, logo, official hosted service, and compatibility claims.
- Repository and license boundaries for optional proprietary hosted-service components.
