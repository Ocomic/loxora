# RFC-011 — First Launch, Setup, and Xora

**Status:** Proposed (draft for review)
**Version:** 0.1
**Last Updated:** October 4, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (new UI surfaces, new HTTP routes, workspace discovery, an assistant capability), with C3 parts that only the decision owner decides (section 11)

## Purpose

This RFC defines what happens the first time a person starts Loxora: a guided setup that ends with a workspace, a first project, and a first Mission waiting for the person's decision. The guide is **Xora**, a small local language model that acts as the user's first officer. The setup also works without Xora, through fixed texts and buttons.

It turns the decision owner's first-run plan (October 4, 2026) into a reviewable proposal. It does not authorize code. Implementation follows in milestones after acceptance (section 12).

## Context

- **Today there is no setup.** A workspace is created only with `loxora workspace init --reviewer <id>`. `@loxora/app` shows a read-only Mission Control on an existing workspace (RFC-010, Milestone 11). Writing through the UI is decided (RFC-010 section 9) but not built.
- **The product vision** (`PRODUCT-VISION.md`, "Guided setup") expects a future installer that bundles a small local model and runs system diagnostics. It is guidance, not authorization.
- **The UI vision** (`UI-VISION.md`, "Starship bridge and visualizer") records the metaphor confirmed by the decision owner on October 4, 2026 (ship, captain, ship computer, first officer Xora, crew, stations, logbook, bridge), requires every term to be explained in the UI, and allows an optional 2D bridge visualizer. It states that the visualizer needs its own RFC and milestone.
- **Languages:** German and English (RFC-010 Amendment 1). The default follows the system language.
- **Decisions by the decision owner, October 4, 2026:**
  - Windows is the first target platform.
  - The installer ships one small Xora model. Xora starts in the background while fixed questions run without a model; the answers are stored as settings and handed to Xora.
  - After setup, Xora may offer an upgrade based on the hardware: a larger local model, or a cloud model only with explicit consent. The upgrade is not part of the first-run MVP.
  - The MVP includes a simple 2D bridge: Xora at her station with a speech bubble, hideable. No undocking, no 3D, no customization.
  - The logbook (workspace) lives in a visible folder under the user's Documents folder, not in a hidden `.loxora` folder.
  - The installer stays unsigned during the test phase. Signing is decided after testing.
- **Validation before code:** a dialog script for the whole flow was written and walked through with three simulated personas (October 4, 2026). Its findings are reflected here. Real-user tests and a model evaluation are still pending (section 10).

## Problem statement

1. A person who is not a developer cannot start using Loxora: the only entry point is a CLI command with terms like "workspace" and "reviewer".
2. A new workspace is empty, so Mission Control has nothing to show and teaches nothing.
3. The product needs an assistant that explains and guides, but Loxora must stay model-independent, local-first, and usable on weak hardware.

## Goals

- From first start to a usable bridge in under ten minutes, without help, for a person without programming knowledge.
- No technical term (workspace, reviewer, proposal, node, MCP, database, token) in the main flow. Every metaphor term is explained the first time it appears.
- The setup ends with a project and a first Mission in the "needs input" state, so the person immediately practices the most important interaction.
- The principle "Xora proposes, you decide" is visible: Xora never writes without a confirmation card, and only a human accepts knowledge.
- The whole flow works without a running model (script mode). Script mode is also the deterministic stub for end-to-end tests.
- Nothing leaves the machine. After installation, everything works offline.
- Xora sits behind a replaceable capability. The model, the runtime, and the vendor can change without changing the flow.

## Non-goals

- Model upgrade, cloud models, cloud compute, or any download after installation (C3; follows after the MVP).
- Connecting external agents ("hiring crew") or detecting installed tools (C3: data may leave the machine).
- Reading an existing folder or repository (RFC-005 project preparation; its own scope).
- Xora changing the UI, a privacy filter, or training an own model (later ideas recorded in the first-run plan).
- Undocking or 3D for the bridge, crew avatars, and customization.
- macOS and Linux installers.
- Installer code signing (deferred by the decision owner).
- Authentication. As with the CLI, the configured human is a local governance guard, not a login (RFC-010 section 9).

## Proposal

### 1. The flow

The flow has five parts. Part B runs while Xora starts, so nobody waits on the model.

| Part | What happens | Needs Xora |
|---|---|---|
| A. Installation and system start | Installer with a local hardware check; the main window opens and shows real start states: ship computer (server), logbook (workspace), Xora (model). | no |
| B. Fixed questions | (B0) If a workspace already exists, offer to open it. (B1) Name. (B2) Ship name. (B3) Logbook location, default `Documents\Loxora`. Then the workspace is created. Language is not asked: it follows Windows, with a visible DE/EN switch. | no |
| C. Hand-over to Xora | Xora reads the stored answers and greets the person by name and ship. If the questions finish first, three fixed orientation sentences bridge the wait, with "Continue without Xora" offered at once. If Xora cannot start, setup continues in script mode and says why. | optional |
| D. Goal and first project | Xora asks what the person wants to do, summarizes it, and proposes a project with a purpose and three knowledge spaces that fit the goal, on **one** confirmation card. | optional |
| E. First Mission and bridge | Xora creates the Mission "Record the project goal" and asks a real question ("Who is the project for?"). The person answers in Mission Detail. Xora drafts the goal; the person accepts it, and it becomes Current knowledge. Three short hints introduce the bridge, then Xora proposes a concrete next step. | optional |

Rules for every step:

- One question per screen, visible progress, and Back always works.
- Every question has two to four buttons plus free text. Everything can be completed by clicking only.
- Every step can be skipped and done later by asking Xora.
- Xora states each action in one sentence before it happens, on a confirmation card.

The full dialog script (scenes A1 to E4, with branches, guardrails, and persona findings) is maintained outside the repository during testing. Its fixed texts move into the label module when the flow is implemented.

### 2. Script mode

- Script mode is the same flow with fixed texts and fixed choices. Each goal button maps to a fixed project name, purpose, and set of spaces; "Something else" stores the typed text unchanged as the purpose. Xora's drafting step in part E becomes a text field with a template.
- Script mode is used when the hardware is too weak, the model fails to start, or the person chooses "Continue without Xora".
- After a failed start, Loxora does not retry automatically on the next start. It asks once: "Start Xora again" or "Continue without Xora".
- End-to-end tests run the flow in script mode, so they never depend on a model.

### 3. Where the answers are stored

The answers are settings, not chat history. Nothing important lives only in a conversation.

| Answer | Stored in | Why |
|---|---|---|
| Ship name | `workspace.json` `name` (existing field) | it names the workspace |
| Captain id (derived from the name, for example `alex`) | `workspace.json` `reviewers` (existing field) | the captain is the human who accepts knowledge |
| Display name, language, logbook location, Xora state (enabled, last start result), hardware profile | a per-user **app settings file**, for example `%APPDATA%\Loxora\settings.json`, with a `configVersion` | they belong to the person and the installation, not to the project knowledge |

- The app settings file is plain JSON, readable and versionable, and holds no secrets.
- The captain id is checked like any reviewer id today: it must not start with `agent:`. If the derived id is not usable, the person is asked for a short name.

### 4. Finding the workspace

The CLI resolves the workspace from `--workspace`, `LOXORA_WORKSPACE`, then `<home>/.loxora/workspaces/default`. A logbook under `Documents\Loxora` would not be found by the CLI.

Proposal: add one step to the shared resolution, used by the CLI and `@loxora/app`:

1. `--workspace`
2. `LOXORA_WORKSPACE`
3. **the workspace path in the app settings file, if present (new)**
4. `<home>/.loxora/workspaces/default`

This changes the CLI contract (C2) and is documented in `CLI.md` when implemented. Part B0 checks steps 3 and 4 to offer an existing workspace.

### 5. Xora as a capability

- **Assistant capability.** `@loxora/app` gets a narrow internal interface, for example `Assistant`, with two implementations:
  - `ScriptedAssistant`: deterministic, fixed texts; script mode and tests.
  - `LocalModelAssistant`: talks to a bundled local model runtime on `127.0.0.1`.
- **Replaceable.** The flow depends only on the interface. Model, runtime, and vendor are configuration. A larger local model, a cloud model, or an own model later is another implementation, not a change to the flow. Which runtime is bundled is decided in an ADR; which model ships is a C3 decision (section 11).
- **Not in Core.** The assistant lives in the app server. Core stays free of model code.

### 6. What Xora may do

Xora acts as the agent actor `agent:xora`. She gets **no new rights**: every tool maps to an operation that agents can already perform through the CLI, and Core enforces the same policies.

| Tool | Used in | Existing operation |
|---|---|---|
| Read settings | C | app settings file, `workspace.json` |
| Create project | D | `project add` |
| Create spaces and a collection | D | `space add`, `collection add` |
| Run a Mission | E | `mission create`, `start`, `wait`, `complete` |
| Propose knowledge | E | `propose new` |

- **Confirmation first.** The server executes a write only after the person confirms the card. The card shows exactly what will be written.
- **Humans decide.** The person answers the Attention Request and accepts the proposal as the captain, through the UI write path (RFC-010 section 9). Xora cannot accept knowledge.
- **Limits.** No internet, no files outside the logbook, no installations, no UI changes. In the MVP Xora reads only the settings and her own conversation, not project content.
- **Language.** Xora answers in the chosen language, even if the person writes in the other one.
- **Guardrails** for every live text (tone, length, no technical terms, no invented project facts, ask instead of guessing) are the checklist for the model evaluation.

### 7. The first knowledge proposal

`propose new` requires a collection, a Source, and Evidence. Proposal:

- Part D creates, together with the spaces, one collection in the first space (for example "Project goal").
- Part E registers the setup conversation as a Source of the project, and the person's answer to the Attention Request as its Evidence (locator: the Mission id).
- The Mission's Outcome links the proposal, so the path from Mission to accepted knowledge stays visible (RFC-009).

### 8. Bridge and shell

- The bridge is Mission Control (RFC-010) plus:
  - a fixed **Xora input bar** at the bottom of every screen, instead of a Chat tab;
  - **empty states** with one sentence and one button, for example "No missions yet. Should Xora suggest a first one?";
  - the setup surface (`/setup`), shown when no workspace is found.
- Sections without content stay hidden, as Mission Control already does (only implemented sections appear).
- **2D bridge visualizer,** optional and hideable: Xora at her station with a speech bubble. It shows only real state (Xora's status, whether a Mission needs the person). The text UI is complete without it (UI-VISION.md).
- **Stations** suggested in part D are shown during setup only. They are not stored, because there is no data model for them yet (RFC-010, crew model).

### 9. Setup API

The app server starts in **setup mode** when no workspace is found. Setup mode offers only the routes the flow needs, for example:

| Route | Purpose |
|---|---|
| `GET /api/setup` | setup state: existing workspace found, Xora state, hardware profile, answers so far |
| `POST /api/setup/answers` | store answers from part B |
| `POST /api/setup/workspace` | create the workspace (as `workspace init`) or open an existing one |
| `POST /api/assistant/message` | send text to Xora; returns her reply and, if any, a proposed action |
| `POST /api/assistant/confirm` | confirm or reject a proposed action |

- The server still binds only to `127.0.0.1`, same-origin, no CORS.
- The browser never sends an actor id. The server uses `agent:xora` for Xora's confirmed actions and the configured captain for human actions.
- Exact routes and payloads are fixed in the milestone document.

### 10. Validation before and during implementation

| Stage | What | Needs people |
|---|---|---|
| 1 | Dialog script walked through with personas | done as a simulation (October 4, 2026); the decision owner's own walkthrough is pending |
| 2 | Clickable prototype (for example Figma), a human answers live as Xora | yes; optional public call for testers |
| 3 | Model evaluation: about 30 typical setup sentences, in German and English, against two or three sizes of a small open-weights model on the target hardware. Measures tool-call accuracy, staying in role, and response time. Sets the minimum model size, the memory threshold for loading Xora, and the wait before script mode takes over. | no |
| 4 | Playwright end-to-end tests of the flow in script mode | no |

Success criteria:

- A person without programming knowledge completes setup without help in under ten minutes.
- No technical term appears in the main flow.
- Afterwards the person can say in their own words what Xora, the crew, and a Mission are.
- Every step can be skipped without making Loxora unusable.
- On weak hardware the flow ends in script mode, not with an error.

### 11. Decisions reserved for the decision owner (C3)

- **Which model ships as Xora,** and its license. The license must allow redistribution in an Apache-2.0 project's installer.
- **Installer distribution:** where it is published, and code signing (deferred until after the test phase; SignPath Foundation preferred, to be checked against `LICENSING-STRATEGY.md`).
- Anything after the MVP that downloads data, costs money, or sends data off the machine: model upgrade, cloud models, external agents.

### 12. Milestones

Each milestone gets its own document under `docs/implementation/` after this RFC is accepted.

1. **UI write path** (RFC-010 section 9): answer, pause, cancel, and resume in Mission Control. Prerequisite for part E.
2. **Setup in script mode:** setup mode, app settings file, workspace discovery (section 4), parts A4 to E without a model, empty states, the Xora input bar with fixed answers, Playwright tests.
3. **Xora:** the `Assistant` interface with a local model, after stage 3 and the model decision. Needs an ADR for the bundled runtime.
4. **2D bridge visualizer.**
5. **Windows installer:** packaging, hardware check, bundled model. Needs an ADR for packaging (for example browser plus local server, or a desktop shell).

Milestone 2 does not depend on any model and can start as soon as milestone 1 is done.

## Alternatives considered

### Wait for the model before asking anything

Rejected. On slow machines the person would watch a loading screen. The fixed questions need no model.

### A setup wizard without an assistant

Partly adopted: script mode is exactly this, and it is the fallback. Rejected as the only path because the product vision relies on Xora as the guide and explainer.

### Xora decides and writes directly

Rejected. It contradicts "AI agents propose; shared knowledge requires review" and the first officer role.

### Keep the workspace under `.loxora`

Rejected by the decision owner. A hidden folder is hard to find, back up, or understand for non-developers.

### Ask the language in setup

Rejected. The system language is almost always right, and the switch is always visible.

## Risks and tradeoffs

- **Small models are weak, especially in German.** Mitigation: short guardrailed turns, buttons for every question, script mode, and stage 3 before choosing the model.
- **Memory pressure on weak machines.** Mitigation: check free memory before loading Xora, skip loading below a threshold, and never retry automatically after a failure.
- **Installer size.** Mitigation: one small model only; upgrades later and only with consent.
- **Unsigned installer warnings** may stop non-developers during testing. Accepted by the decision owner for the test phase.
- **More moving parts** (settings file, assistant runtime, setup mode). Mitigation: milestones in order, script mode first, every part optional except the workspace.

## Security and privacy

- Everything runs locally; the server binds to `127.0.0.1`; no data leaves the machine.
- Xora has no rights beyond existing agent operations, and every write needs a confirmation.
- In the MVP Xora reads no project content, so project files cannot steer her. Reading project content later must treat it as untrusted input.
- The settings file holds no secrets.
- The model runtime listens only on `127.0.0.1` and is started and stopped by Loxora.

## Migration and rollback

- No database schema change is expected; projects, spaces, collections, Missions, and proposals already exist.
- Existing workspaces keep working. The new resolution step only applies when an app settings file exists.
- Removing the setup surface or Xora leaves the workspace and the CLI usable.

## Implications for existing documents

- RFC index and `CROSS-REFERENCES.md`: add RFC-011 (depends on RFC-005, RFC-008, RFC-009, RFC-010; constrains `@loxora/app`, the CLI workspace resolution, and the setup milestones).
- `RFC-010`: the shell gains the setup surface, the Xora input bar, and the bridge visualizer.
- `PRODUCT-VISION.md` ("Guided setup"): link this RFC as the first concrete step.
- `UI-VISION.md`: link this RFC from the starship bridge section.
- `CLI.md`: the new workspace resolution step, when implemented.
- `open-questions.md`: record the open questions below.

## Open questions

1. **Packaging.** Browser plus local server, or a desktop shell? Decided in an ADR before milestone 5.
2. **Model runtime.** Which local runtime is bundled, and how Loxora starts and stops it. ADR before milestone 3.
3. **Display name.** Should the captain's display name live in `workspace.json` (shared with the workspace) or only in the app settings file (per user)?
4. **Separate list of humans.** RFC-010 already asks whether a list of human actors should exist besides `reviewers`. The setup makes the captain both.
5. **Wait before script mode.** How long part C waits before switching to script mode automatically. Set by stage 3.
6. **Stations.** Whether stations become stored data later, and how they relate to a crew or capability model.
7. **Opening an existing workspace from the CLI default** (`.loxora`): offer to move it to Documents, or open it in place?

## Decision

Not yet decided. Acceptance would authorize milestone documents for the milestones in section 12, one at a time. It would not authorize the C3 items in section 11.
