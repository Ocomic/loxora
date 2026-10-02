# Loxora Product UI Vision

**Status:** Product UI direction — planning input, non-implementation guidance  
**Scope:** Post-Hackathon product UI  
**Decision owner:** Ocomic  
**Last Updated:** October 2026

## Purpose

This document records the product and UI direction chosen by the decision owner for Loxora after the Hackathon MVP.

It is a planning input. It is not an implementation plan, an accepted architecture, or authorization to build the described surfaces. New UI surfaces beyond the existing local demo inspector, mission state modeling, and multi-agent orchestration remain gated by RFC-008 (C2, or C3 where cost, external notification channels, or data leaving the machine are involved).

The broader long-term direction, including adaptive workspaces and adaptation governance, is described in [`PRODUCT-VISION.md`](./PRODUCT-VISION.md). This document narrows that direction to the product UI and adds the Mission Control concept.

## Product principle

The UI should answer:

> What is Loxora doing for me right now, what needs my attention, and why?

It should hide unnecessary complexity while always allowing the user to inspect the underlying work.

The longer-term direction is a stable Mission Control shell around an adaptive, local-first working environment that evolves with the user's workflows.

## 1. UI role

Loxora should not feel like a conventional admin dashboard or a static developer tool. The intended experience is closer to a Mission Control or AI operations environment where the user can see:

- what work is currently happening,
- which model or agent is responsible,
- where a task is blocked,
- whether the system needs human input,
- whether a provider or model limit has been reached,
- what completed successfully,
- and what can happen next.

The UI should make multi-model and agent work understandable without exposing unnecessary technical complexity. The user should be able to stay at a high-level operational view and drill into technical details only when needed.

## 2. Visual concept: Mission Control

A space-station or mission-control metaphor is the general visual direction. It must not become a game-like gimmick that reduces usability. The metaphor mainly organizes concepts:

| Metaphor | Meaning |
|---|---|
| Missions | Units of work |
| Crew | Models, agents, and specialized workers |
| Mission Control | Overview and coordination |
| Stations / rooms | Functional areas or capability groups |
| Alerts | Blocked work, limits, failures, required input |
| Logs / telemetry | Technical details and execution history |

The UI must remain professional, readable, fast, and useful for real work. The metaphor should enhance understanding, not replace normal UI conventions.

## 3. Core near-term screen: Mission Detail

The most important new UI concept is the Mission Detail screen. A mission is a meaningful unit of work assigned to or coordinated by Loxora.

The screen should answer at a glance:

- What is the goal?
- What is happening right now?
- Which model or agent is working on it?
- Which step is currently active?
- Is progress being made?
- Is the task blocked?
- Does the user need to do something?
- Is the task paused because of provider or model limits?
- What output has already been produced?
- What happens next?

The screen needs a strong status hierarchy and should not force the user to read raw logs unless necessary.

## 4. Four key mission states

Four major UI states were designed conceptually.

### Running

The mission is actively progressing. The UI shows the active worker, the current task or subtask, progress or recent activity, the current step, relevant execution telemetry, possible next steps, and optionally recent logs or generated outputs.

Primary message: *the system is working and does not currently require the user.*

### Provider limit

The mission is paused because an external model or provider limit has been reached. The concept was first designed around a Codex usage limit; the state is named generically so that it applies to any provider.

The UI should clearly communicate:

- that the mission itself has not failed,
- which provider or model is limited,
- why execution stopped,
- when execution may continue, if known,
- whether Loxora can continue using another local or remote capability,
- whether the task is queued for automatic continuation,
- and whether user intervention is required.

This state should feel like a controlled pause, not an error. Long-term, Loxora may resume the task automatically after the limit resets and may notify the user through an external channel such as a chat service (see [Limits and automatic continuation](#9-limits-and-automatic-continuation)).

### Needs input

The mission cannot safely or meaningfully continue without human input. The UI makes the requested decision extremely clear:

- what information is missing,
- why it is needed,
- what decision Loxora is waiting for,
- what consequences the options may have,
- and, where appropriate, suggested options.

The goal is to minimize ambiguity and make human intervention fast. After input is provided, the mission should resume from its previous execution state.

### Completed

The mission finished successfully. The screen emphasizes:

- what was accomplished,
- outputs and artifacts,
- relevant changed files or resources,
- validation and tests,
- important decisions made,
- follow-up opportunities,
- and resulting knowledge that should be stored or reviewed.

Completion must not only mean "the agent stopped". The user should understand the outcome and whether additional review is needed. Resulting knowledge flows into Loxora's existing proposal and review lifecycle rather than becoming Current automatically.

## 5. Crew and model representation

Models and agents may be represented as a crew. Example roles: Architect, Coding Agent, Local Assistant, Reviewer, Researcher, Browser Worker, Asset Worker.

The UI primarily communicates **role and current responsibility**, not provider or model names. Example presentation:

```text
Architecture   — <architecture model>
Implementation — <coding agent>
Local Support  — <local model>
```

Provider names stay secondary where possible. A role may later be fulfilled by another model without redesigning the UI. This supports Loxora's provider-independent architecture and the capability-over-provider rule in `AGENTS.md`.

## 6. Mission Control overview

The main Mission Control screen provides a high-level operational picture. Possible areas:

- active, paused, and input-requiring missions,
- recently completed work,
- crew and model availability,
- provider and model limits,
- alerts and queue,
- local and external compute state,
- cost and budget state,
- and recent project activity.

The UI prioritizes exceptions. If everything runs normally, the user should not need to inspect every mission. Blocked, expensive, risky, or input-requiring work surfaces automatically.

## 7. Progressive disclosure

A user first sees goal, status, responsible worker, progress, and next action.

Technical information stays available behind expandable areas: prompts, logs, token and model usage, tool calls, raw provider responses, task graph, internal identifiers, Context Packages, and execution metadata.

The UI should serve both non-technical and advanced users without forcing either experience on everyone. This continues the disclosure pattern of the existing demo UI.

## 8. Human intervention as a first-class concept

Human input is not a generic error. Loxora explicitly distinguishes:

- system failure,
- provider limitation,
- permission requirement,
- missing information,
- decision required,
- approval required,
- budget approval,
- and task completion.

This distinction should be reflected in both the backend mission state model and the UI.

## 9. Limits and automatic continuation

Loxora should recognize when a coding agent or another provider reaches a usage limit. Long-term behavior may include:

1. detect the provider limit,
2. preserve mission state,
3. determine when execution can continue,
4. optionally perform safe local tasks while waiting,
5. resume automatically when possible,
6. notify the user if manual intervention becomes necessary.

The UI makes this lifecycle visible. A provider limit is modeled as a **resumable mission state**, not a terminal failure.

Automatic resumption and external notifications fall under the cost, authority, and shutdown controls described in `PRODUCT-VISION.md` ("Cost Guard", "Automatic shutdown and zombie protection") and require owner decisions where cost is incurred or data leaves the machine.

## 10.–15. Adaptive UI, prompt configuration, primitives, shell, governance, rollback

These directions are already described in `PRODUCT-VISION.md` and apply to the product UI unchanged:

- **Adaptive UI** — Loxora may observe recurring behavior and *propose* new workspaces or dashboards (for example news monitoring, price tracking, browser research, software development, build monitoring, content production, project management, research). It must not silently redesign major parts of the UI. See [Adaptive dashboards and workspaces](./PRODUCT-VISION.md#adaptive-dashboards-and-workspaces).
- **Prompt-configurable UI** — natural-language requests such as "Put blocked missions at the top" or "Make the mission cards more compact" should generate or update versioned configuration, not rewrite arbitrary frontend code. See [Prompt-configurable UI](./PRODUCT-VISION.md#prompt-configurable-ui).
- **Reusable UI primitives** — cards, feeds, tables, charts, timelines, status panels, mission queues, kanban boards, alerts, logs, knowledge views, price trackers, calendars, comparison views, dashboards, and extension widgets, so that new workspaces can be assembled without a new application mode each time.
- **Stable shell, flexible workspaces** — stable: navigation, global search and command interface, Mission Control, notifications, permissions, settings, capability management, project switching. Flexible: dashboards, mission layouts, project workspaces, research and monitoring surfaces, custom widgets.
- **Governed adaptation** — passive personalization may be automatic; workspace and configuration adaptation is user-requested or clearly proposed; structural changes (executable frontend extensions, privileged plugins, core navigation, security-sensitive integrations) require explicit approval and normal Loxora governance. See [Adaptation authority levels](./PRODUCT-VISION.md#adaptation-authority-levels).
- **Versioning and rollback** — generated or heavily modified workspaces should be versioned; the user can see what changed, restore an earlier layout, disable an adaptation, edit generated configuration, and reject a proposal. See [Versioning, evaluation, and rollback](./PRODUCT-VISION.md#versioning-evaluation-and-rollback).

## 16. Relationship to the existing Hackathon UI

The existing Hackathon demo UI is not the final product UI. [`WEB-UI.md`](../implementation/WEB-UI.md) documents the current implementation, not the long-term UI target.

Strengths to preserve:

- human-first explanations,
- progressive disclosure,
- clear Current / Historical / Planned distinction,
- Evidence access,
- accessibility,
- server-authoritative state,
- and separation between UI and Core logic.

The next product UI should evolve toward Mission Control and real operational workflows rather than remain primarily a guided product demonstration. Rebuilding the existing UI is intended, but requires its own RFC or ADR and an authorized milestone (RFC-008, C2).

## 17. Ocomic as first UI validation environment

Ocomic and Play.Ocomic are the first real-world environment for testing the next UI. Relevant workflows include coding-agent development tasks, local model support, build and test status, blocked tasks, provider limits, architecture review, project knowledge, devlog and content workflows, asset generation, and eventually deployment and release workflows.

These workflows validate generic UI abstractions. The Loxora UI must not become permanently game-development-specific (see [Ocomic-first validation](./PRODUCT-VISION.md#ocomic-first-validation)).

## 18. Architectural implication: mission state independent of UI

Mission state should be modeled independently of the UI. The frontend must not infer critical execution state from logs.

Conceptually, a mission may expose states such as:

```text
queued
running
waiting_for_provider
waiting_for_user
waiting_for_permission
paused
failed
cancelled
completed
```

The exact state model still requires design. It must not be implemented from this document alone without an approved architecture task (RFC or ADR).

## Open questions

- How does a mission relate to existing Loxora concepts (Project, Node, Planned Knowledge, Context Package, Proposal)? Is a mission itself knowledge, or execution state that produces knowledge?
- Which component owns mission state while no multi-agent runtime exists — the local server, an adapter around external agents, or a separate process?
- How are provider limits detected without hard-coding providers (capability metadata, adapter signals, user configuration)?
- Which mission states are terminal, which are resumable, and which transitions require human authorization?
- Which external notification channels are acceptable, and how are they governed (C3: data leaving the machine)?
- What is the smallest useful first slice: a read-only Mission Detail for externally started agent work, or a full Mission Control overview?
- Which parts of the existing demo inspector are carried over, and which are retired?

## Suggested next decision steps

1. Owner review of this document.
2. An RFC for mission concept and mission state model (C2), including its relationship to the knowledge lifecycle.
3. An RFC or ADR for the product UI shell and the transition away from the demo inspector (C2).
4. A milestone under `docs/implementation/` for the first slice, validated against real Ocomic workflows.
