# RFC-009 — Mission Concept and State Model

**Status:** Accepted
**Version:** 0.2 (Amendment 1)
**Last Updated:** October 3, 2026
**Decision Date:** October 2, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (RFC-008)

## Purpose

This RFC defines what a **Mission** is in Loxora, how it relates to the existing knowledge model, and which states and transitions it has.

It is the first decision step named in [`UI-VISION.md`](../planning/UI-VISION.md) ("Suggested next decision steps"). The product UI direction (Mission Control, Mission Detail) needs a mission state that is modeled independently of the UI. This RFC provides that conceptual model. It does not select storage, APIs, a runtime, or UI implementation.

## Context

- Loxora today manages project knowledge: Projects, Nodes, Revisions, Proposals, Reviews, Planned Knowledge, cross-project relationships, and Context Packages (RFC-002, RFC-003, RFC-006, RFC-007).
- Real work on projects is increasingly done by AI agents (coding agents, local models, browser workers). That work happens outside Loxora. Loxora currently sees only what an agent or human later proposes as knowledge.
- The UI vision chooses Mission Control as product direction. Users should see what work is happening, who is responsible, whether it is blocked, whether it needs them, and what came out of it.
- A specific, observed need is that coding agents hit provider usage limits. Today such a pause is indistinguishable from failure, and the work context is easily lost.
- The first dogfooding session (October 2026) showed that agent work produces knowledge in batches and that the review step is the natural boundary between "work done" and "knowledge accepted".
- Multi-agent orchestration, compute routing, notifications, and cost-incurring automation remain gated (RFC-008).

## Problem statement

Without a defined mission concept:

1. The UI would have to infer execution state from logs or agent output, which UI-VISION explicitly rules out.
2. Execution telemetry could leak into the knowledge model and blur the line between "what happened during work" and "what the project knows".
3. Human intervention, provider limits, and failures would collapse into a generic "error" state.
4. A later orchestration or routing design would have no stable state model to build on.

## Goals

- Define Mission and its related terms consistently with RFC-002.
- Keep missions and knowledge strictly separate, with explicit, review-gated paths from mission results to knowledge.
- Define a small, explicit state model with typed reasons for waiting, so that human intervention, provider limits, and failures are distinguishable.
- Make every state transition attributable and auditable.
- Stay provider-independent: no provider, model, or vendor appears in the state model.
- Allow a first slice that records missions about externally run agent work without introducing orchestration.

## Non-goals

- Multi-agent orchestration, scheduling, queues, or a worker runtime.
- Automatic resumption, retries, or fallback to other models.
- External notifications (chat services, email, push).
- Cost tracking, budgets, or paid compute (see `PRODUCT-VISION.md`, "Cost Guard").
- Storage, schema, HTTP, MCP, CLI, or export format decisions.
- UI layout or visual design.

## Proposal

### 1. Terms

These terms are proposed as additions to RFC-002 upon acceptance.

| Term | Definition |
|---|---|
| **Mission** | A goal-directed unit of work on one or more Projects, carried out by one or more Agents, whose progress, state, and outcome Loxora records. A Mission is execution state, not Knowledge. |
| **Mission State** | The current position of a Mission in its lifecycle (see section 3). Exactly one state is current at a time. |
| **Wait Reason** | The typed reason why a Mission in state `waiting` cannot currently proceed. |
| **Attention Request** | A structured request from a Mission to a human: what is needed, why, which options exist, and what each option implies. |
| **Mission Step** | An optional, ordered subdivision of a Mission used for progress display. Steps carry no lifecycle semantics of their own. |
| **Worker Role** | The responsibility an Agent holds within a Mission (for example architecture, implementation, review). Roles are separate from the Agent and from the model that fulfills them. |
| **Mission Outcome** | The recorded result of a terminal Mission: outputs, validations, decisions made, and the Proposals it produced. |
| **Mission Event** | An append-only record of a state transition or significant occurrence, with actor, time, reason, and optional Evidence. |

The existing distinction "Agent vs. Model" is preserved. A Worker Role is fulfilled by an Agent, and an Agent may use a model. The UI shows the role first (UI-VISION, section 5).

### 2. Missions and knowledge stay separate

A new reserved distinction is proposed for RFC-002: **Mission vs. Knowledge**.

- A Mission is never a Knowledge Node, a Revision, or Planned Knowledge.
- Mission telemetry (logs, prompts, tool calls, token usage, provider responses) is not knowledge and never appears in Context Packages as knowledge.
- A Mission produces knowledge only through existing paths: Proposals (`propose new` or `propose successor`), Planned Knowledge entries, relationship proposals, Sources, and Evidence. All of them follow the existing review rules (RFC-003, RFC-004).
- `completed` means "the work ended successfully". It does not mean "the results are accepted". A completed Mission may have Proposals pending review, and the Outcome shows that explicitly (UI-VISION, "Completed").
- A Mission may reference the knowledge it works on: Projects, Nodes, Planned Knowledge items, and Context Packages (by fingerprint). These references do not change the referenced knowledge. In particular, a running Mission does not change the status of a Planned Knowledge item automatically.
- Reflections (RFC-004, phase 10) may be attached to a Mission Outcome as a Proposal like any other knowledge.

### 3. State model

Seven states. Waiting is one state with a required, typed Wait Reason instead of one state per reason.

| State | Meaning | Terminal | Who may cause entry |
|---|---|---|---|
| `queued` | Created, not yet started | no | human, agent |
| `running` | Actively progressing | no | agent (worker), human |
| `waiting` | Cannot proceed until a condition is met; Wait Reason required | no | agent, system |
| `paused` | Deliberately halted by a human | no | human |
| `completed` | Work ended successfully; Outcome recorded | yes | agent, human |
| `failed` | Work ended unsuccessfully; failure reason recorded | yes | agent, system |
| `cancelled` | Stopped by a human before completion | yes | human |

**Wait Reasons:**

| Wait Reason | Meaning | Resolved by |
|---|---|---|
| `provider_limit` | An external model or provider limit was reached. Optional: limited capability, expected reset time, whether another capability could continue. | Time passing or a human decision |
| `needs_input` | Missing information or a decision. Carries an Attention Request. | Human answer |
| `needs_approval` | An action needs human approval (for example a merge or publication). Carries an Attention Request. | Human approval or rejection |
| `needs_permission` | A capability or access right is missing. | Human grant, or cancellation |
| `needs_manual_action` | The human must perform an action outside Loxora (for example sign in or run a local step). Carries an Attention Request. Added by Amendment 1. | Human confirmation |
| `needs_budget` | The action would exceed or need a budget. Reserved; no cost handling in this RFC. | Human decision |

**Mapping to the UI vision:**

| UI-VISION state | Mission State |
|---|---|
| Running | `running` |
| Provider limit (originally "Codex Limit") | `waiting` + `provider_limit` |
| Needs input | `waiting` + `needs_input` (also `needs_approval`, `needs_permission`, `needs_manual_action`) |
| Completed | `completed` |
| `waiting_for_provider` / `waiting_for_user` / `waiting_for_permission` (UI-VISION, section 18) | `waiting` + the corresponding Wait Reason |

UI-VISION section 8 distinguishes system failure, provider limitation, permission requirement, missing information, decision required, approval required, budget approval, and task completion. Each maps to exactly one state or state plus Wait Reason (`failed`, `provider_limit`, `needs_permission`, `needs_input`, `needs_input` with a decision, `needs_approval`, `needs_budget`, `completed`).

### 4. Transitions

Allowed transitions:

```text
queued   -> running | cancelled
running  -> waiting | paused | completed | failed | cancelled
waiting  -> running | paused | failed | cancelled
paused   -> running | cancelled
```

Rules:

- Terminal states (`completed`, `failed`, `cancelled`) have no outgoing transitions. Continuing failed work creates a **new Mission** that references the earlier one as its predecessor. History is never rewritten (consistent with rollback in RFC-002 and RFC-003).
- Leaving `waiting` with `needs_input`, `needs_approval`, `needs_permission`, or `needs_manual_action` requires a recorded human response. An agent cannot answer its own Attention Request.
- `cancelled` and `paused` can only be caused by a human.
- Every transition creates a Mission Event with actor (a human id or `agent:<name>`, as in the CLI), timestamp, previous and new state, reason, and optional Evidence.
- A human may move a Mission out of `waiting` (for example to `cancelled`) at any time.
- Automatic transitions by policy (for example resuming after a provider limit resets) are out of scope. If they are introduced later, they must be attributable to a named policy and are subject to RFC-008 (C2, or C3 where cost is involved).

### 5. Ownership of mission state

- The local Loxora server is the authority for mission state, like it is for knowledge (server-authoritative state, `WEB-UI.md`).
- Agents report transitions through an adapter or a local interface. Loxora validates each reported transition against the state model and rejects invalid ones.
- Provider limits are reported as a Wait Reason by the adapter that observes them. The core knows only the reason, not the provider. Provider and model identifiers may appear as optional metadata, displayed secondarily.
- The UI and any other client read mission state from the server and never derive it from logs.

### 6. Suggested first slice

This RFC does not authorize implementation. For the later milestone it suggests a slice that needs no orchestration:

- Record Missions for agent work that runs outside Loxora (for example a coding-agent session). The agent or a human reports transitions.
- Store Missions, Mission Events, Attention Requests, and Outcomes locally.
- Show a read-only Mission Detail and a minimal list of Missions, ordered by need for attention.
- Link Outcomes to the Proposals the Mission produced.

The slice should be validated against real Ocomic dogfooding work, as the UI vision requires, without introducing Ocomic-specific concepts.

## Alternatives considered

### Mission as a Knowledge Node type

Rejected. It would mix execution telemetry with reviewed knowledge, put unreviewed state into Context Packages, and conflict with the reserved distinctions in RFC-002.

### Flat waiting states (`waiting_for_provider`, `waiting_for_user`, `waiting_for_permission`)

Considered; this is the sketch in UI-VISION section 18. Rejected in favor of one `waiting` state with typed reasons, because all waiting states share the same transitions and new reasons (for example `needs_budget`) can be added without changing the transition table. The UI can still present each reason as its own state.

### Infer mission state from logs or agent output

Rejected. UI-VISION section 18 rules it out, and it would make state depend on provider-specific output formats.

### Adopt an existing agent framework's task model

Rejected for the core. It would bind Loxora to one framework or vendor. Adapters may map external task models onto this state model.

### Allow retrying a failed Mission in place

Rejected. A new Mission with a predecessor reference keeps the failed attempt visible and keeps terminal states final.

## Risks and tradeoffs

- **Over-modeling before evidence.** The state model may not fit real agent work. Mitigation: a small state set, a first slice that only records external work, and dogfooding before any orchestration.
- **Reporting gaps.** Externally run agents may not report reliably, leaving Missions stuck in `running`. Possible mitigation for the milestone: an "unknown since" or staleness indicator, not an automatic state change.
- **Telemetry volume.** Logs and prompts can be large. The concept keeps them out of the knowledge model; retention is a storage decision.
- **Term collision.** "Mission" and "crew" come from the UI metaphor. The core uses neutral terms (Mission, Worker Role); the metaphor stays in the UI.

## Security and privacy considerations

- Mission telemetry can contain secrets, private code, or personal data. It stays local, is shown only behind progressive disclosure, and is not part of Context Packages.
- Whether missions and telemetry are included in workspace export (ADR-003) is open. The default proposal is: Missions, Events, and Outcomes yes; raw telemetry no.
- Attention Requests must not ask a human to paste credentials into Loxora. Credential handling stays outside the mission model.
- External notifications and remote control of missions are C3 (data leaving the machine) and out of scope.

## Migration and rollback

- No existing data changes. The concept is additive.
- If the concept is rejected or superseded, no knowledge is affected, because Missions never became knowledge. Proposals already produced by Missions remain ordinary Proposals.

## Implications for existing knowledge and documents

- **RFC-002:** on acceptance, add the terms from section 1 and the reserved distinction "Mission vs. Knowledge".
- **RFC-003:** unchanged. Mission states are not knowledge states.
- **RFC-004:** a Mission can carry one pass through phases 7 to 11 (implementation, verification, review, reflection, knowledge update). Reviews stay human or policy decisions.
- **RFC-006:** Missions are not navigation items for knowledge. A separate Mission navigation (Mission Control) is a UI concern.
- **ADR-003 (export):** a future ADR decides whether and how Missions are exported.
- **`UI-VISION.md`:** the state model replaces the sketch in section 18 once accepted.
- **`open-questions.md`:** the product UI section points to this RFC.

## Open questions

1. Can a Mission span several Projects, or should cross-project work be modeled as linked Missions?
2. Are Mission Steps needed in the first slice, or is "current activity" text enough?
3. How does an external agent report transitions: CLI commands, a local HTTP interface, an MCP tool (gated, RFC-008), or a file-based protocol?
4. Should `queued` exist before an orchestrator exists, or do recorded Missions start in `running`?
5. Which retention rules apply to Mission Events and telemetry?
6. Should Planned Knowledge gain an "in progress" status that a human sets when a Mission starts work on it (dogfooding finding), or is the Mission reference enough?
7. Is staleness of a `running` Mission (no report for a long time) a display concern or a state?

## Decision

Accepted by Ocomic on October 2, 2026, as proposed (pull request #15). The terms from section 1 and the reserved distinction "Mission vs. Knowledge" were added to RFC-002.

This acceptance authorizes preparing an ADR for storage and interfaces and a milestone document for the first slice. Implementation starts only after that ADR is accepted and the milestone is authorized (RFC-008, C2). It does not authorize orchestration, automatic resumption, notifications, or cost handling. The open questions above remain open.

## Amendments

### Amendment 1 — Wait Reason names (October 3, 2026)

Decided by Ocomic while preparing ADR-005. Backend and UI use the same names to avoid misunderstandings, and every Wait Reason that waits for a human starts with `needs_`:

| Before (version 0.1) | After |
|---|---|
| `input_required` | `needs_input` |
| `approval_required` | `needs_approval` |
| `permission_required` | `needs_permission` |
| `budget_required` (reserved) | `needs_budget` (reserved) |
| — | `needs_manual_action` (new): the human must perform an action outside Loxora |

`provider_limit` is unchanged. `paused` remains a human-initiated halt only and is not a Wait Reason. No implementation existed before this amendment, so no data is affected.
