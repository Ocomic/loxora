# Mission API

Milestone 10 implements ADR-005 on top of RFC-009 (with Amendment 1). A Mission is execution state, never knowledge. It produces knowledge only through Proposals and other review-gated paths. Missions never appear in Context Packages, navigation projections, or knowledge maps.

## States and Wait Reasons

| State | Terminal | Entered by |
|---|---|---|
| `queued` | no | `createMission` |
| `running` | no | `startMission`, `resumeMission`, `reportActivity` (stays running) |
| `waiting` | no | `waitMission` with a Wait Reason |
| `paused` | no | `pauseMission` (human only) |
| `completed` | yes | `completeMission` |
| `failed` | yes | `failMission` |
| `cancelled` | yes | `cancelMission` (human only) |

**Wait Reasons:**
- `provider_limit`: needs `detail`; optional `limitedCapability` and `expectedResumeAt`.
- `needs_input`, `needs_approval`, `needs_permission`, `needs_manual_action`: need an Attention Request with a question, a rationale, and optional options with consequences.
- `needs_budget`: reserved and rejected.

`MISSION_TRANSITIONS` is the RFC-009 transition table.

## Operations

`MissionService(store, ids?, clock?)` provides these operations. Each is one transaction that appends one Mission Event.

| Operation | Notes |
|---|---|
| `createMission({ ownerProjectId, title, goal, referencedProjectIds?, nodes?, plans?, workerRole?, agentMetadata?, predecessorMissionId?, actorId })` | References must exist in the owning or a referenced Project. A predecessor must be terminal. |
| `startMission({ missionId, actorId, activity? })` | `queued` → `running` |
| `reportActivity({ missionId, actorId, activity })` | Updates `currentActivity`; the source of "last activity" |
| `waitMission({ missionId, reason, actorId, detail?, limitedCapability?, expectedResumeAt?, question?, rationale?, options? })` | `running` → `waiting` |
| `answerAttentionRequest({ missionId, actorId, response, decision?, evidence? })` | Human only; once per request; `needs_approval` needs `approve` or `reject` |
| `resumeMission({ missionId, actorId })` | From `waiting`: after an answer, or directly for `provider_limit`. From `paused`: human only. |
| `pauseMission({ missionId, actorId, reason? })`, `cancelMission({ missionId, actorId, reason })` | Human only |
| `completeMission(…)`, `failMission(…)` | Record an Outcome: `summary`, `outputs`, `validations`, `decisions`, `proposalIds` (owning Project), `logReferences`, optional `evidence` |
| `getMission`, `listMissions({ projectId?, states?, waitReasons? })`, `getMissionEvents` | Reads |

**Human vs. agent:** an actor starting with `agent:` is an agent; any other actor is treated as a human. This is a governance guard, not authentication.

## Records

- **`Mission`:**
  - owning Project, title, goal, state;
  - Wait Reason fields, `currentActivity`, Worker Role, optional `agentMetadata`, predecessor;
  - `createdBy`, `createdAt`, `updatedAt`, `sequence`;
  - derived `lastActivityAt`;
  - references to Projects, Nodes, and plans;
  - the current `attentionRequest`;
  - the `outcome`, with live Proposal status and log references marked `portable` or not.
- **`MissionEvent`:** sequence, type, previous and new state, Wait Reason, actor, time, reason, payload, Evidence.
- **Log references:**
  - `workspace:<relative path>`: portable; absolute paths and `..` are refused;
  - `external:<locator>`: stored verbatim, not portable.
  - No log content is stored or exported.

## Storage

Migration `007_missions` adds these tables:

- `missions`, `mission_project_references`, `mission_knowledge_references`;
- `mission_events`, `mission_event_evidence`;
- `mission_attention_requests`;
- `mission_outcomes`, `mission_outcome_proposals`, `mission_log_references`.

Triggers keep events, references, and outcomes append-only. A Mission update must advance `sequence` by exactly one. An Attention Request is answered once.
