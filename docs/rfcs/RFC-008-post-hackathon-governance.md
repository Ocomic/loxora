# RFC-008 — Post-Hackathon Governance and Work Authorization

**Status:** Accepted
**Version:** 0.1
**Last Updated:** October 2, 2026
**Decision Date:** October 2, 2026
**Decision Owner:** Ocomic

## Purpose

This RFC replaces the Hackathon milestone gate with a proportional, durable authorization model for work on Loxora after the Hackathon.

It does not change Loxora's philosophy, terminology, lifecycle, or navigation principles. It defines who may start which kind of work, what must exist before that work is merged, and how the Hackathon-era decisions are carried forward.

## Context

During the Hackathon, all implementation was authorized milestone by milestone (Milestones 1 through 6.2). `AGENTS.md` prohibited any product functionality outside an explicitly assigned milestone, and RFC-007, ADR-001, and ADR-002 were accepted "only for the Hackathon MVP".

That model protected a time-boxed demo. After the Hackathon it has three problems:

1. Every change, including maintenance such as CI, documentation fixes, and bug fixes, formally needs a milestone, which is disproportionate.
2. RFC-007, ADR-001, and ADR-002 describe the architecture that actually exists in `main`, but their "Hackathon-only" status leaves current work without an accepted baseline.
3. `AGENTS.md` mixes durable rules with a milestone history that grows with every task.

RFC-004 already defines proportional change classes (Trivial, Standard, Significant, Emergency) but does not state who authorizes each class or which work is reserved for the project owner.

## Goals

- Make authorization proportional to risk, reversibility, and public impact.
- Keep documentation-before-implementation for significant changes.
- Give agents a clear rule for what they may start on their own.
- Establish the current architecture baseline without declaring it permanent.
- Keep human accountability explicit for agent-authored work.
- Keep `AGENTS.md` short, durable, and free of task history.

## Non-goals

- A permission system, team roles, or multi-maintainer governance inside the Loxora product.
- Automatic approval of knowledge or code.
- Changes to the knowledge lifecycle, navigation model, or Context Package semantics.
- A roadmap or prioritization of future work.

## Proposal

### Change classes

The classes refine RFC-004. Every pull request should state its class.

| Class | RFC-004 class | Examples | Required before merge | Who may start it |
|---|---|---|---|---|
| **C0 — Maintenance** | Trivial; small Standard | documentation corrections, broken links, CI and tooling, dependency patch updates, tests, bug fixes that do not change documented behavior | Passing CI and maintainer review | Any contributor or agent, directly as a pull request |
| **C1 — Bounded change** | Standard | a small feature, refactor, or behavior fix inside the scope of an accepted RFC or ADR | A short written plan approved by the decision owner (issue, plan, or pull request description), passing CI, maintainer review | Any contributor or agent, after plan approval |
| **C2 — Significant change** | Significant | new architecture; persistence schema or migrations; a new or changed public contract (HTTP API, MCP tools, export format, CLI); a new package; a new external integration; lifecycle, navigation, or Context Package semantics | An accepted RFC or ADR, a milestone document under `docs/implementation/`, passing CI, maintainer review | Implementation only after the RFC/ADR is accepted and the milestone is authorized |
| **C3 — Owner-reserved decision** | Significant | licensing, trademark, contribution policy, security boundaries, data leaving the user's machine, cost-incurring compute or services, hosted services, publication of private knowledge | An explicit, recorded decision by the decision owner | Only the decision owner may decide; agents may prepare proposals |

When a change fits more than one class, the higher class applies. When unsure, the author should treat the change as the higher class and ask.

Emergency changes follow RFC-004: they may shorten discussion but must record the follow-up documentation afterward.

### Items that always require C2 or C3

The following remain gated. An agent must not implement them without the corresponding accepted RFC/ADR and authorized milestone (C2) or owner decision (C3):

- Knowledge Graph or Project Graph beyond the existing typed relationships;
- persistent Context Packages or a Context Builder beyond the existing deterministic operation;
- retrieval, search, full-text search, or embeddings;
- Memory Loop implementation;
- database schema changes;
- new MCP tools or other agent integrations and plugins;
- multi-agent orchestration;
- team server, cloud service, authentication, authorization, or synchronization (C3 where data leaves the machine or cost is incurred);
- new UI surfaces beyond the existing local demo inspector;
- import beyond the existing curated fixture reset;
- capability registry, compute routing, managed compute, Hub, or model gateway (see `docs/planning/PRODUCT-VISION.md`; C3).

Ideas in these areas should be recorded in `docs/planning/open-questions.md` or proposed as an RFC.

### Status of the Hackathon decisions

RFC-007, ADR-001, and ADR-002 become the **current baseline**: they describe the architecture that exists in `main` and constrain C0 and C1 work. They are not declared permanent architecture. They change only through a new or superseding RFC or ADR (C2).

The Hackathon milestone documents (`docs/implementation/MILESTONE-*.md`) and `docs/hackathon/` remain historical records. They are not edited to describe later work.

### Milestones

C2 work is delivered through numbered milestones continuing after 6.2 (Milestone 7, 8, ...). Each milestone document records:

- authorization: who authorized it and when, and which RFC or ADR it implements;
- goal;
- authorized scope;
- explicit non-scope;
- acceptance checks;
- knowledge, navigation, and documentation effects;
- completion status.

### Visibility before publication

Before adding product, business, security, infrastructure, roadmap, or project-specific decisions to the public repository, the author classifies whether the information is safe and intended for public disclosure. Sensitive material belongs in a private knowledge boundary; public documents may carry a sanitized summary.

### Agent attribution and accountability

- Agents propose; humans decide. An agent never merges its own pull request unless the decision owner explicitly asked for that specific merge.
- Agent-authored commits keep the agent's identity and do not carry a sign-off from the agent (see `CONTRIBUTING.md`). The maintainer who merges takes DCO responsibility.
- An agent states the change class, the authorization it relied on, and the `AGENTS.md` output expectations in every pull request.
- An agent that finds a change growing into a higher class stops and asks before continuing.

### `AGENTS.md`

`AGENTS.md` contains only durable instructions: project state in one paragraph, reading order, core rules, change classes, gated items, and output expectations. Milestone history is referenced, not repeated.

## Alternatives considered

### Keep the milestone gate for all work

Rejected. It makes maintenance as expensive as architecture and encourages bundling unrelated changes into milestones.

### Remove the gate and rely on review only

Rejected. It would weaken documentation-before-implementation for exactly the changes where it matters most (schema, public contracts, data boundaries).

### Declare RFC-007, ADR-001, and ADR-002 permanent

Rejected. Export, governance, visibility, and dogfooding are still expected to inform the long-term architecture. A baseline status is enough to build on.

## Risks

- **Class inflation or deflation.** Authors may under-classify changes. Mitigation: the higher class applies when unsure, and reviewers may reclassify.
- **Single decision owner.** All C1 to C3 approvals depend on one person. This is acceptable for the current project size and should be revisited before external maintainers join.

## Effects on existing documents

- `AGENTS.md`: replace the Hackathon project state and milestone paragraphs with this model.
- `README.md`: post-Hackathon status.
- `docs/rfcs/README.md` and `docs/rfcs/CROSS-REFERENCES.md`: list RFC-008 and its dependencies.
- `docs/planning/open-questions.md`: record what remains open.
- RFC-004 is refined, not replaced. Its open question "Which changes require an RFC versus a smaller proposal?" is answered for this repository by the change classes above.

## Open questions

- When should a second maintainer or a review quorum be introduced?
- Should C0 dependency updates be automated (for example by a dependency bot)?
- How should the change classes map to Loxora's own product-level review policies for managed projects?

## Decision

Accepted by Ocomic on October 2, 2026, as proposed (pull request #6). The change classes, the gated items, and the baseline status of RFC-007, ADR-001, and ADR-002 apply from that date. The open questions above remain open.
