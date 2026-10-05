# Open Questions

**Status:** Living planning document

## Post-Hackathon governance

RFC-008 (accepted October 2, 2026) defines change classes (C0 to C3) and treats RFC-007, ADR-001, and ADR-002 as the current baseline. Open questions:

- When to introduce a second maintainer or review quorum.
- Whether C0 dependency updates should be automated.
- How the repository change classes map to Loxora's product-level review policies for managed projects.

## Dogfooding and knowledge capture

Milestone 8 implements ADR-004. ADR-004 (accepted October 2, 2026) adds a local CLI and workspace so real project knowledge can be proposed and reviewed outside the demo fixture. Dogfooding starts with a small, non-critical proof-of-concept repository and a dependency on the asset-loading contract of the live game platform. Initially one shared workspace holds all related projects; ADR-004 lists triggers for splitting it. Open questions: a typed provenance model for repository Sources, when to add rollback and impact commands, and whether an importer should follow.

## Product UI direction

The decision owner chose a Mission Control direction for the product UI (see [`UI-VISION.md`](./UI-VISION.md)). The existing demo inspector documented in `WEB-UI.md` is to be rebuilt. Open questions are listed in `UI-VISION.md`; the main ones are how missions relate to the knowledge lifecycle, who owns mission state before a multi-agent runtime exists, and how provider limits are detected without hard-coding providers. Implementation requires an RFC or ADR and an authorized milestone (RFC-008, C2). [RFC-009](../rfcs/RFC-009-mission-concept-and-state-model.md) (accepted October 2, 2026) answers the first two and lists its own open questions. Next steps: [ADR-005](../adr/ADR-005-mission-storage-and-reporting-interface.md) (accepted October 3, 2026) for mission storage and the reporting interface, Milestone 9 (CLI improvements, done) and [Milestone 10](../implementation/MILESTONE-10.md) (mission persistence). [RFC-010](../rfcs/RFC-010-product-ui-shell-and-mission-control-mvp.md) (accepted) defines the product UI shell; [Milestone 11](../implementation/MILESTONE-11.md) delivers the read-only Mission Control in `@loxora/app`. Next: the write slice (RFC-010 section 9), authorized as [Milestone 12](../implementation/MILESTONE-12.md); RFC-010 lists the remaining open questions (Mission Steps, crew model, Context Package link, limits and costs, artwork). The language question is decided: German and English (RFC-010 Amendment 1). [RFC-011](../rfcs/RFC-011-first-launch-setup-and-xora.md) (accepted October 4, 2026) defines the first launch with Xora; its open questions are packaging (browser or desktop shell), the bundled model runtime, where the display name lives, the wait before script mode, whether stations become data, and what happens to an existing `.loxora` workspace. Its first milestone, the write slice, is implemented (Milestone 12); the second, setup in script mode, is authorized as [Milestone 13](../implementation/MILESTONE-13.md) (first part implemented), which picks defaults for the display name (settings file only) and an existing `.loxora` workspace (opened in place). Which model ships as Xora, and installer distribution and signing, are C3 decisions for the decision owner.

## Post-demo portability

Milestone 6 is demo-ready, but deterministic project-owned export/import remains unresolved and explicitly deferred. The repository must not claim permanent MVP portability until a lossless inspectable export can reconstruct canonical knowledge, lineage, relationships, assessments, Evidence, and plans without an external service.

Milestone 7 implements ADR-003, so deterministic workspace export and restore are now available and proven by round-trip tests for every demo stage. ADR-003 (accepted October 2, 2026, initial version) defines the workspace export format, restore into an empty store, and the round-trip proof required before portability may be claimed. Per-Project export, cross-project edge rules, and mixed-visibility export remain open. ADR-003 lists review triggers for its workspace scope and its exact export of Audit Events and derived projections.

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


## Ocomic-first post-Hackathon validation

The first practical product validation target should be Ocomic/Play.Ocomic rather than an abstract attempt to support every domain at once.

Open questions include:

- Which existing Ocomic project should be the first production dogfooding target.
- Which Ocomic workflows provide the smallest useful end-to-end slice.
- What belongs in a reusable software/creative-development profile versus project configuration.
- How private Ocomic knowledge is stored and referenced without publishing it in this repository.
- Which results from Ocomic dogfooding should graduate into generic Loxora concepts.
- What success criteria demonstrate that Loxora is useful beyond the curated Hackathon demo.

## Public/private knowledge boundary

- Visibility classification for knowledge, decisions, evidence, plans, and generated summaries.
- Public, private-project, private-organization, and local-only knowledge boundaries.
- How public RFCs reference private decisions without leaking their contents.
- Sanitized/public summaries of private architecture or commercial decisions.
- Prevention of accidental publication by humans or agents.
- Secret detection and security-sensitive information handling.
- Export/import behavior when a project contains mixed visibility levels.
- Whether visibility is metadata on nodes, revisions, evidence, projects, or multiple layers.

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

Resolved on 2026-10-02: the repository moved from MIT to Apache-2.0. The decision and the options considered are recorded in `docs/planning/LICENSING-STRATEGY.md`. The contribution policy (DCO sign-off, no CLA) was resolved on the same date; see `CONTRIBUTING.md`.

Open questions include:

- Whether protection against closed hosted forks becomes a product requirement for any future hosted-service component.
- Whether commercial dual licensing is desirable.
- Copyright ownership and relicensing rights before substantial external contributions arrive.
- Dependency-license compatibility for the eventual packaged local runtime.
- Trademark policy for the Loxora name, logo, official hosted service, and compatibility claims.
- Repository and license boundaries for optional proprietary hosted-service components.

## Findings from the first dogfooding session (October 2026)

[ADR-006](../adr/ADR-006-plan-revisions-node-keys-and-cli-ergonomics.md) (accepted October 3, 2026; Milestone 9) addresses the plan, key, navigation, and review items below; compact Context Packages remain open.

The first session captured decisions, roadmap phases, and one cross-project dependency from two real repositories with the Milestone 8 CLI. The full chain (proposal, review, relationship, Context Package across two Projects) worked, and provenance stayed traceable. The following friction is generalized here; project-specific details stay in the private workspace. Items that change the CLI contract or Context Package semantics are C2 under RFC-008.

- **Review-gated linking forces a second session.** `plan add --node` and `relate propose` require accepted knowledge on the referenced Nodes, and there is no `plan update` or plan linking command. Plans recorded before review stay unlinked, or must be duplicated. Open: allow linking to pending Nodes, or add a reviewable plan revision. *Plans resolved in Milestone 9 (`plan update`); relationships still need reviewed Nodes.*
- **Plan status vocabulary.** There is no "in progress" status, and Completed plans are still labeled "not implemented, not canonical". `plan add` needs no review, so an agent can mark a plan Completed on its own. Open: status set, labeling, and whether plan status changes need review. *Resolved in Milestone 9 (`InProgress`, reviewer gate for closing).*
- **Natural handles.** Decision logs use short identifiers (for example `D-001`), but Nodes resolve only by full title, id, or id prefix. Open: an optional per-Node key or alias. *Resolved in Milestone 9 (Node keys).*
- **Navigation gaps.** `show map` omits plans and pending Nodes; `workspace status` counts only Nodes with accepted knowledge; relationship proposals in `inbox` show no Projects, Nodes, or author. *Resolved in Milestone 9.*
- **Context Package size.** One focus Node plus one dependency produced about 4,200 estimated tokens because content, Sources, and Evidence are repeated in the knowledge entry, the dependency path, and `followedDependencyPaths`. `NoApplicableImpactAssessment` appears without a CLI path to resolve it. Open: a compact, reference-based output.
- **Provenance depends on reachable, stable commits.** Locators cited local commits that were not yet pushed; a rebase or squash would have orphaned them. Loxora does not check whether a cited commit exists or is reachable. Open: a `source verify` command or a warning for unreachable commits, and guidance to merge rather than rebase cited history.
- **Uncommitted knowledge.** Part of a real contract lived only in an uncommitted working copy. The provenance convention cannot cite it. Open: whether that is a deliberate boundary (commit first) or needs a Source kind.
- **Reviewer ergonomics.** Reviewers must look up Evidence ids by hand. Open: whether `review` should default to the Evidence cited by the proposal. *Resolved in Milestone 9 (default Evidence).*
