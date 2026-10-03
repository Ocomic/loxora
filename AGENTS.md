# AGENTS.md

## Project state

Loxora has completed its Hackathon MVP (Milestones 1 through 6.2, merged into `main`) and is in post-Hackathon development. Work is authorized by change class as defined in `docs/rfcs/RFC-008-post-hackathon-governance.md`.

RFC-007, ADR-001, and ADR-002 are the current architecture baseline. They constrain current work but are not permanent architecture; they change only through a new or superseding RFC or ADR.

## Required reading order

Before proposing architecture or implementation, read:

1. `README.md`
2. `docs/rfcs/README.md`
3. `docs/rfcs/CROSS-REFERENCES.md`
4. `docs/rfcs/RFC-000-why-loxora.md`
5. `docs/rfcs/RFC-001-project-philosophy.md`
6. `docs/rfcs/RFC-002-core-concepts-and-terminology.md`
7. `docs/rfcs/RFC-003-knowledge-lifecycle.md`
8. `docs/rfcs/RFC-004-development-workflow.md`
9. `docs/rfcs/RFC-005-project-preparation.md`
10. `docs/rfcs/RFC-006-knowledge-navigation-and-progressive-context.md`
11. `docs/rfcs/RFC-008-post-hackathon-governance.md`
12. `docs/planning/PRODUCT-VISION.md`
13. `docs/planning/open-questions.md`

For work touching the existing implementation, also read `docs/rfcs/RFC-007-initial-architecture-and-mvp-boundaries.md`, the ADRs under `docs/adr/`, and the relevant API documents under `docs/implementation/`.

For work touching the UI or missions, also read `docs/planning/UI-VISION.md`, `docs/rfcs/RFC-009-mission-concept-and-state-model.md`, and `docs/implementation/WEB-UI.md`. The current demo UI is not the long-term product UI.

For contributions, read `CONTRIBUTING.md`.

For licensing, commercial-service, managed-compute, or contribution-policy work, also read `docs/planning/LICENSING-STRATEGY.md`.

The long-term product vision is guidance, not implementation authorization.

The first intended real-world post-Hackathon validation target is Ocomic/Play.Ocomic. Treat this as dogfooding of the generic core, not authorization to hard-code Ocomic-specific concepts into foundational architecture. Prefer profiles, adapters, capabilities, extensions, or project configuration over Ocomic-specific core concepts.

## Core rules

- Documentation before implementation.
- Plan before architecture.
- Architecture before code.
- Knowledge before context.
- Navigate before loading.
- Use maps, indexes, summaries, and typed relationships before loading detailed knowledge.
- Project knowledge belongs to the project, not to a model, IDE, chat, or individual.
- Open-source code does not imply that all project knowledge is public.
- Before adding product, business, security, infrastructure, roadmap, or project-specific decisions to the public repository, classify whether the information is safe and intended for public disclosure.
- Sensitive Ocomic or future customer/project knowledge belongs in an appropriate private knowledge boundary; public docs should use sanitized/generalized summaries when needed.
- Never place credentials, secrets, private customer data, or security-sensitive operational details in public repository documentation.
- AI agents propose; shared knowledge requires appropriate review.
- Prefer evidence over assumptions.
- Preserve uncertainty instead of inventing certainty.
- Keep changes small, explicit, and reviewable.
- Do not silently overwrite shared knowledge.
- Do not mix current, historical, and planned knowledge.
- Preserve provenance, evidence, review state, and history.
- Treat rollback as a new documented state transition, not as deletion of history.
- Update or invalidate affected maps, indexes, summaries, and cross-project links when knowledge changes.
- Avoid orphaned knowledge, broken links, duplicate concepts, and unexplained navigation dead ends.
- Local-first and model independence are foundational constraints.
- Optional cloud services must not become a hard dependency for the local core.
- Long-term agents should request capabilities rather than hard-code providers or infrastructure.
- Any future cost-incurring autonomous compute must sit behind user-governed policy, budget, and shutdown controls.
- Team, organization, role, permission, and agent-identity support must remain possible.
- Models must remain replaceable. Loxora must not become architecturally dependent on any single model, AI vendor, IDE, MCP implementation, or hosted service, including the tools used to build it, unless the decision owner explicitly approves it.
- Model external functionality as capabilities rather than providers; routing to a particular implementation must remain replaceable.
- Avoid premature infrastructure. Do not introduce additional agents, queues, event systems, services, abstractions, or distributed components without a demonstrated requirement.
- Prefer evidence from real workflows over speculative generalization. Validate abstractions against actual dogfooding use before turning them into foundational systems.
- Prefer reversible decisions. New configuration, workflow, adaptive behavior, or generated state should be inspectable, versionable, and recoverable where practical.
- Persistent project state and important decisions belong in Loxora or documented project knowledge, not only in a chat conversation.
- Keep tests and documentation aligned with behavioral changes. Do not leave architectural intent only in code comments or chat history.
- Cross-project knowledge sharing must be explicit, typed, evidence-backed, and permission-aware.

## Before starting a task

Inspect the relevant existing code, RFCs, ADRs, implementation documents, and tests before changing architecture. Do not design from the product vision alone.

When a task is ambiguous, first identify:

- what is already implemented,
- what is documented but not implemented,
- what is only long-term vision,
- and what requires a new decision.

When implementation reveals a significant new architectural or product decision, surface it explicitly and determine whether an RFC, ADR, planning note, or private project decision is needed before encoding it in code.

## Change classes and authorization

Classify every change before starting (details in RFC-008). When unsure, use the higher class and ask.

- **C0 — Maintenance:** documentation corrections, CI and tooling, tests, dependency patches, bug fixes that do not change documented behavior. May be opened directly as a pull request.
- **C1 — Bounded change:** a small feature, refactor, or behavior fix inside an accepted RFC or ADR. Requires a short plan approved by the decision owner first.
- **C2 — Significant change:** architecture, schema or migrations, public contracts (HTTP, MCP, export format, CLI), new packages, new external integrations, lifecycle/navigation/Context semantics. Requires an accepted RFC or ADR and an authorized milestone document under `docs/implementation/`.
- **C3 — Owner-reserved decision:** licensing, trademark, contribution policy, security boundaries, data leaving the user's machine, cost-incurring compute or services, hosted services, publication of private knowledge. Only the decision owner decides; agents may prepare proposals.

State the change class and the authorization relied on in every pull request. Agents never merge their own pull requests unless the decision owner explicitly asks for that specific merge. Agent-authored commits keep the agent identity and carry no agent sign-off (see `CONTRIBUTING.md`).

## Always gated (C2 or C3)

Do not implement without an accepted RFC/ADR and authorized milestone, or an owner decision:

- Knowledge Graph or Project Graph beyond the existing typed relationships
- Persistent Context Packages or a Context Builder beyond the existing deterministic operation
- Retrieval, search, full-text search, or embeddings
- Memory Loop implementation
- Database schema changes
- New MCP tools, other agent integrations, or Codex/Claude Code plugins
- Multi-agent orchestration
- Team server, cloud service, authentication, authorization, or synchronization
- New UI surfaces beyond the existing local demo inspector
- Import beyond the existing curated fixture reset
- Capability registry, compute routing, managed compute, Hub, or model gateway

Record such ideas in `docs/planning/open-questions.md` or propose an RFC.

The Hackathon milestone history is recorded in `docs/hackathon/PRE-HACKATHON-BOUNDARY.md` and `docs/implementation/MILESTONE-*.md`. Those documents are historical and are not edited to describe later work. Post-Hackathon milestones start with `docs/implementation/MILESTONE-7.md` (deterministic workspace export, ADR-003) `docs/implementation/MILESTONE-8.md` (local knowledge capture CLI, ADR-004), `docs/implementation/MILESTONE-9.md` (plan revisions, Node keys, CLI ergonomics, ADR-006), and `docs/implementation/MILESTONE-10.md` (mission persistence, ADR-005).

## Knowledge evolution

Current knowledge must be clearly distinguishable from historical and planned knowledge.

When knowledge changes:

- create a new revision,
- preserve the previous revision,
- record why the change occurred,
- record who or what proposed and reviewed it,
- identify which revision is current,
- communicate deprecations, supersessions, restorations, and rollbacks explicitly,
- update or invalidate affected summaries and indexes,
- review incoming and outgoing cross-project relationships.

Historical knowledge must not be presented to agents as current unless the task explicitly requests history.

Planned knowledge must not be presented as implemented or canonical until it has been verified and accepted according to project governance.

## Navigation and discoverability

Project knowledge must remain understandable without requiring internal identifiers or exhaustive graph traversal.

Important knowledge should be reachable through at least one clear navigation path, such as:

- Workspace Map,
- Project Map,
- Knowledge Space,
- Space Index,
- Knowledge Collection,
- search,
- or a typed relationship from another relevant item.

If an agent discovers orphaned knowledge, stale summaries, broken links, duplicate concepts, or missing project dependencies, it should report them and propose a reviewable correction rather than silently reorganizing the knowledge structure.

## Decision process

For significant changes:

1. Understand the problem.
2. Document the proposal.
3. Discuss alternatives.
4. Create or update the relevant RFC or ADR.
5. Review RFC dependencies in `docs/rfcs/CROSS-REFERENCES.md`.
6. Plan implementation.
7. Implement only after approval.
8. Review the result.
9. Record reflection and resulting knowledge changes.
10. Update or invalidate affected navigation surfaces and project relationships.

## Output expectations

Every completed task should state:

- what changed,
- what was intentionally not changed,
- assumptions made,
- validation performed,
- open questions,
- documentation requiring updates,
- knowledge lifecycle effects,
- navigation or summary effects,
- architectural implications,
- known cross-project impacts,
- and any newly discovered decision that should be recorded.
