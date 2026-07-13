# RFC-004 — Development Workflow

**Status:** Draft  
**Version:** 0.1  
**Last Updated:** July 2026

## Purpose

This RFC defines how humans and AI agents collaborate on Loxora.

The workflow connects ideas, requirements, decisions, implementation, review, reflection, and project knowledge into one traceable process.

It applies to the development of Loxora itself and should later inform the workflows Loxora supports for other projects.

## Core principle

Work should not move directly from an idea to implementation when the change is significant.

The default workflow is:

```text
Idea
→ Problem Definition
→ Research
→ RFC or Design Proposal
→ Discussion
→ Decision or ADR
→ Implementation Plan
→ Implementation
→ Verification
→ Review
→ Reflection
→ Knowledge Update
→ Reuse
```

Not every small change requires every artifact. The process should remain proportional to risk, scope, reversibility, and impact.

## Workflow goals

The workflow should ensure that:

- intent is understood before implementation,
- decisions remain traceable,
- assumptions are visible,
- humans remain accountable,
- agents do not silently redefine architecture,
- implementation and documentation remain aligned,
- rollbacks update knowledge as well as code,
- lessons are captured for future reuse,
- current and historical knowledge are not mixed.

## Roles

### Initiator

The person or agent that identifies a problem, opportunity, or idea.

### Author

The person or agent that prepares an RFC, proposal, plan, implementation, or reflection.

### Reviewer

A person or authorized agent that evaluates quality, correctness, risk, and alignment.

### Decision Owner

The person or governance role accountable for accepting or rejecting a significant decision.

### Implementing Agent

A human or AI agent authorized to perform implementation work within the approved scope.

### Knowledge Steward

A person or policy responsible for ensuring that resulting project knowledge is accurate, current, and correctly classified.

One participant may hold several roles, but the roles should remain conceptually distinct.

## Phase 1 — Idea and problem definition

An idea is not yet a solution.

Before architecture or implementation begins, the underlying problem should be described.

A useful problem definition includes:

- the observed problem or opportunity,
- affected users, projects, or agents,
- why it matters,
- current evidence,
- known constraints,
- unresolved assumptions,
- desired outcome,
- explicit non-goals.

Agents should distinguish facts from assumptions.

## Phase 2 — Research

Research may include:

- repository inspection,
- existing RFCs and ADRs,
- prior implementations,
- external projects,
- standards and papers,
- experiments and prototypes,
- user feedback,
- security and privacy implications.

Research findings should preserve sources and dates where relevant.

External inspiration must not be treated as an accepted Loxora decision without review.

## Phase 3 — RFC or design proposal

A significant change should be described before implementation.

Use an RFC when the change affects foundational concepts, philosophy, architecture, governance, public interfaces, data models, or long-term compatibility.

Use a smaller design proposal when the change is important but does not require a foundational RFC.

A proposal should normally include:

- context,
- problem statement,
- goals and non-goals,
- proposed approach,
- alternatives considered,
- risks and tradeoffs,
- security and privacy considerations,
- migration or rollback considerations,
- implications for existing knowledge,
- open questions.

## Phase 4 — Discussion

Discussion should improve the proposal rather than merely approve it.

Participants should test:

- whether the problem is correctly framed,
- whether the proposal conflicts with earlier RFCs,
- whether simpler alternatives exist,
- whether the change preserves local-first and model independence,
- whether team, permission, and provenance requirements remain possible,
- whether current and historical knowledge can remain distinguishable,
- whether the proposal is reversible.

Conflicting views should be recorded when they influence the decision.

## Phase 5 — Decision and ADR

An RFC may define a principle or approved direction without selecting every implementation detail.

When a concrete architectural choice is made, it should be recorded as an Architecture Decision Record.

An ADR should include:

- decision,
- context,
- alternatives,
- rationale,
- consequences,
- evidence,
- status,
- date,
- decision owner,
- related RFCs,
- superseded or conflicting decisions.

A new decision should not silently rewrite an older ADR. It should supersede, deprecate, or restore it explicitly.

## Phase 6 — Implementation plan

Before implementation, create a plan proportional to the task.

The plan should identify:

- approved scope,
- affected files or components,
- dependencies,
- migration steps,
- validation strategy,
- rollback strategy,
- documentation changes,
- expected knowledge updates,
- deferred work.

Agents must not expand the scope silently.

New discoveries that materially change the plan should trigger a planning update or renewed review.

## Phase 7 — Implementation

Implementation should follow the approved plan and relevant RFCs, ADRs, and agent instructions.

Implementation rules:

- keep changes small and reviewable,
- avoid unrelated refactoring,
- preserve compatibility unless change is approved,
- do not introduce major dependencies without rationale,
- document material assumptions,
- never simulate completion with misleading placeholders,
- do not overwrite shared knowledge silently,
- preserve evidence and provenance where the feature requires them.

An AI agent should report when implementation reveals that the approved architecture is incomplete or inconsistent.

## Phase 8 — Verification

Implementation is not complete merely because code was written.

Verification may include:

- automated tests,
- type checking,
- linting,
- builds,
- security checks,
- migration tests,
- manual workflows,
- comparison against acceptance criteria,
- Context Package validation,
- lifecycle and rollback tests,
- cross-project impact checks.

The verification result and known limitations should be reported explicitly.

## Phase 9 — Review

Review evaluates more than code style.

Review should check:

- alignment with the approved problem and plan,
- correctness,
- architecture and maintainability,
- security and privacy,
- local-first behavior,
- model independence,
- permissions and data boundaries,
- migration and rollback safety,
- documentation accuracy,
- resulting knowledge changes.

Review comments should distinguish blocking issues from optional improvements.

## Phase 10 — Reflection

After meaningful work, record structured reflection.

Reflection should answer:

- what changed,
- what was learned,
- what assumptions were wrong,
- what unexpected behavior occurred,
- what should be repeated,
- what should be avoided,
- what remains unresolved,
- what other projects or components may be affected.

Reflection is not a generic activity log. It captures reusable understanding.

## Phase 11 — Knowledge update

Completed work may change project knowledge.

The Knowledge Update should identify:

- new knowledge,
- revised knowledge,
- superseded knowledge,
- deprecated knowledge,
- restored knowledge,
- historical knowledge,
- rejected proposals,
- evidence and provenance,
- affected relationships,
- affected projects.

Canonical status must not be assigned automatically unless project governance explicitly permits it.

Agents may propose updates. Reviewers or authorized policies decide what becomes canonical.

## Phase 12 — Reuse

Knowledge should be made reusable when appropriate.

Reuse may include:

- future Context Packages,
- related project recommendations,
- cross-project impact warnings,
- reusable patterns,
- onboarding material,
- updated profiles,
- new automation rules.

Reuse must preserve scope, permissions, provenance, and applicability.

## Change classes

The workflow should be proportional.

### Trivial change

Examples:

- typo correction,
- formatting fix,
- obviously safe metadata update.

Usually requires implementation and verification only.

### Standard change

Examples:

- isolated bug fix,
- small feature,
- internal refactor with limited impact.

Usually requires a short plan, implementation, verification, review, and knowledge update when behavior changes.

### Significant change

Examples:

- architecture change,
- new public interface,
- storage model change,
- governance change,
- security-sensitive feature,
- cross-project behavior,
- lifecycle semantics.

Requires documented problem definition, proposal or RFC, decision, plan, implementation, review, reflection, and knowledge update.

### Emergency change

An urgent fix may temporarily shorten discussion, but it must not erase documentation obligations.

After stabilization, the team should record:

- why the emergency path was used,
- what changed,
- validation performed,
- risks accepted,
- required follow-up,
- resulting knowledge changes.

## Agent operating rules

Before work, an agent should:

1. read `AGENTS.md`,
2. inspect relevant RFCs, ADRs, plans, and current knowledge,
3. identify the task scope,
4. list material assumptions and conflicts,
5. determine whether implementation is authorized.

During work, an agent should:

- stay within approved scope,
- preserve traceability,
- surface uncertainty,
- report material discoveries early,
- avoid treating historical knowledge as current,
- avoid silently resolving conflicting knowledge,
- keep changes reviewable.

After work, an agent should report:

- what changed,
- what was intentionally not changed,
- assumptions made,
- validation performed,
- failures or limitations,
- knowledge that may need review,
- cross-project impacts,
- recommended next action.

## Rollback workflow

A rollback affects implementation and knowledge.

The workflow is:

```text
Rollback Trigger
→ Impact Assessment
→ Rollback Decision
→ Implementation Reversal or Restoration
→ Verification
→ Knowledge Revision
→ Review
→ Reflection
```

A rollback must record:

- what was rolled back,
- why,
- which implementation state was restored,
- whether earlier knowledge was fully or partially restored,
- what remains valid from the reverted period,
- new risks or follow-up work,
- affected projects and Context Packages.

Rollback must never make reverted knowledge appear as though it never existed.

## Cross-project workflow

When a change may affect another project:

1. identify the relationship and supporting evidence,
2. determine the likely impact,
3. notify or flag the affected project,
4. create a scoped proposal rather than modifying the other project silently,
5. preserve source-project provenance,
6. require the target project's governance to accept shared knowledge.

Cross-project reuse is a proposal, not automatic canon.

## Documentation synchronization

Code, decisions, and project knowledge may temporarily diverge during work, but completion requires reconciliation.

If implementation differs from the approved plan:

- document the difference,
- explain why,
- update the plan or decision record,
- review affected knowledge,
- mark outdated documentation explicitly.

Do not leave contradictory documents without status or explanation.

## MVP implications

For the Build Week MVP, this RFC does not require a complete workflow engine.

The demo should support a small traceable workflow:

```text
Proposal
→ Review
→ Canonical Knowledge
→ Implementation or Decision Change
→ Superseded Knowledge
→ Rollback
→ Restored Canonical Revision
```

A second demo flow should show a cross-project dependency producing an impact proposal for another project without silently modifying that project's canonical knowledge.

## Implications

This RFC affects:

- `AGENTS.md`,
- RFC and ADR templates,
- review inbox,
- Knowledge Lifecycle implementation,
- agent identity and provenance,
- Context Packages,
- repository bootstrap,
- connectors and MCP tools,
- cross-project graph,
- impact analysis,
- audit history,
- team and organization governance,
- Build Week demo flows.

## Non-goals

This RFC does not define:

- the final storage schema,
- a specific issue tracker,
- a mandatory Git branching strategy,
- a specific CI provider,
- the final permission model,
- automatic approval policies,
- the complete workflow UI.

## Open questions

- Which changes require an RFC versus a smaller proposal?
- How should project-specific governance override the default workflow?
- Can trusted automation approve low-risk knowledge updates?
- How should agent delegation be represented?
- Which workflow artifacts become Knowledge Nodes or Claims?
- How should abandoned implementation plans be retained?
- How should workflow state synchronize across offline and team environments?

## Closing statement

Loxora should not only preserve what a project knows.

It should preserve how the project moved from an idea to a decision, from a decision to implementation, and from implementation to reusable knowledge.
