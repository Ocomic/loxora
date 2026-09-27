# Loxora Long-Term Product Vision

**Status:** Product vision — non-implementation guidance  
**Scope:** Post-Hackathon / long-term direction  
**Last Updated:** September 2026

## Purpose

This document describes a possible long-term product direction for Loxora beyond the bounded Hackathon MVP.

It is intentionally not an implementation plan, accepted architecture, roadmap commitment, or authorization to build the described systems.

The purpose is to give humans and coding agents a stable product-level north star while preserving Loxora's existing documentation-first decision process.

## Vision

Loxora should evolve from a persistent project knowledge layer into a local-first orchestration environment that can help a user understand projects, configure the capabilities they need, route work to appropriate models and tools, and optionally acquire temporary compute resources without making cloud services mandatory.

The user should describe goals and required capabilities rather than manually assembling providers, APIs, MCP servers, models, runtimes, and infrastructure.

Loxora should determine what is needed, explain the consequences, request permission where appropriate, and remain portable across local hardware, self-hosted workers, and optional hosted services.

## Non-negotiable principles

### Local-first remains foundational

A functional baseline Loxora installation must not require a Loxora-operated cloud service.

Project knowledge, agent state, configuration, and user-owned credentials should remain local by default.

Cloud services may accelerate or extend Loxora, but they must remain optional.

### Local capability must remain possible

Cloud compute is an optional execution target, not a hard dependency.

Where technically feasible, capabilities should be runnable using:
- the user's own computer,
- a local or LAN-connected compute node,
- self-hosted infrastructure,
- or an external provider selected by the user.

### Provider independence

Loxora should reason in capabilities rather than provider names.

Examples:
- `code.generate`
- `browser.navigate`
- `image.generate`
- `model.3d.generate`
- `blender.modify`
- `email.send`
- `repository.change`

A capability may be fulfilled by a local runtime, CLI, API, MCP server, remote worker, or hosted service.

The user should not need to understand those implementation details unless they want to.

### Human control over cost and authority

Agents must not receive unrestricted direct access to paid compute or privileged external systems.

Costly or privileged actions should pass through policy, permission, and budget controls.

### Open source does not imply public project knowledge

The Loxora source code may be public while the projects managed by Loxora remain private.

Public repository documentation should contain only information that is intentionally safe to publish, such as:
- product principles,
- public architecture contracts,
- generic examples,
- public RFCs and ADRs,
- contributor guidance,
- and intentionally disclosed roadmap information.

Loxora must support project knowledge that is not published to the open-source repository, including:
- unreleased product plans,
- commercial strategy,
- pricing and margin decisions,
- private infrastructure details,
- credentials and secrets,
- security-sensitive information,
- customer or partner information,
- and project-specific decisions that should remain internal.

A documentation-first workflow therefore needs a visibility decision before publication.

A significant decision may be documented privately and referenced publicly only through a sanitized summary when necessary.

The open-source repository must never become the canonical storage location for all knowledge managed by Loxora.

## Ocomic-first validation

The first practical post-Hackathon application of Loxora should be Ocomic and Play.Ocomic.

This is a dogfooding strategy, not a permanent product restriction.

The initial real-world workflows should prove that Loxora can help Ocomic with areas such as:
- software and web-game development,
- repository and architecture knowledge,
- reusable Codex/agent context,
- asset and 3D workflows,
- content and operational workflows,
- local and rented AI compute,
- long-running agent tasks,
- and cross-project knowledge between Ocomic projects.

Ocomic-specific requirements should be used to validate the generic core, but the core should not hard-code Ocomic names, repositories, providers, infrastructure, or game-specific concepts.

Where an Ocomic requirement is genuinely domain-specific, it should prefer a profile, capability, adapter, extension, or project configuration over a core primitive unless a broader reusable abstraction is demonstrated.

The first production-quality profile may therefore be an Ocomic/software-and-creative-development profile while preserving the long-term goal of supporting other project types.

## Guided setup

The initial experience should optimize for a useful local baseline rather than a provider-selection wizard.

A future installer may bundle or bootstrap:
- the Loxora local daemon/runtime,
- local persistence,
- an agent runtime,
- a small supported local model,
- an embedding model,
- capability discovery,
- system diagnostics,
- a job queue,
- a policy and cost guard,
- and a system capability scanner.

On first run Loxora should inspect available resources such as:
- operating system,
- CPU,
- RAM,
- GPU and VRAM,
- storage,
- locally installed developer tools,
- supported model runtimes,
- Docker/container support,
- optional applications such as Blender,
- and configured external integrations.

The user should then be able to describe what they want to do.

Example:

> I want to program, work with GitHub, generate images, create 3D assets, and automate Blender.

Loxora should derive the capabilities needed and propose the smallest practical setup.

## Capability discovery and installation

Loxora should maintain a capability registry that maps user intent to one or more implementation options.

Example:

`image.generate`

Possible providers:
- local ComfyUI,
- remote ComfyUI,
- rented GPU worker,
- external image API.

Example:

`repository.change`

Possible providers:
- local Git,
- GitHub API,
- GitHub MCP or equivalent connector.

The system may recommend and install optional modules, adapters, or MCP integrations only with appropriate user approval.

The user-facing language should focus on outcomes and permissions rather than implementation jargon.

## Compute router

Long-term, Loxora should be able to route a job to the most appropriate available execution target.

Potential targets include:
- local CPU,
- local GPU,
- a LAN-connected GPU node,
- a self-hosted remote worker,
- a rented cloud GPU,
- a model API,
- or a Loxora-managed optional compute service.

Routing inputs may include:
- capability required,
- minimum VRAM,
- model requirements,
- privacy classification,
- estimated runtime,
- estimated cost,
- latency preference,
- currently available local resources,
- provider availability,
- user policy,
- and budget.

Agents should request capabilities. They should not hard-code infrastructure.

## Local, hybrid, and cloud-burst operation

Loxora should support at least three conceptual modes.

### Local

Use only user-owned local or LAN resources.

Cloud execution is disabled.

### Hybrid

Prefer local resources and use external compute only when policy allows and local resources are insufficient or unavailable.

### Cloud burst

Temporarily acquire stronger resources for bounded jobs, execute the work, transfer results back to user-controlled storage, and terminate the rented resource.

Cloud burst should remain useful even after a user owns substantial local hardware because rare high-memory or highly parallel jobs may still be cheaper to rent.

## Job batching

Expensive workers should not be started for every small background task.

Loxora should eventually be able to collect compatible jobs into batches so that:
- containers start less often,
- large models load once,
- idle time is reduced,
- and compute cost is easier to predict.

Interactive jobs may bypass batching when the user is actively waiting.

## Cost Guard

No autonomous agent should directly control paid infrastructure credentials.

A dedicated policy boundary should authorize paid jobs.

Possible controls:
- monthly budget,
- per-job budget,
- autonomous-job budget,
- maximum runtime,
- maximum worker lifetime,
- maximum idle time,
- permitted GPU classes,
- permitted providers,
- maximum parallel resources,
- and confirmation thresholds.

A queued job should reserve its expected cost so the UI does not overstate remaining budget.

## Automatic shutdown and zombie protection

Paid compute must fail safe.

A future cloud worker design should include independent protections such as:
- job timeout,
- worker time-to-live,
- idle shutdown,
- provider-side limits where available,
- and an external reaper/watchdog that detects workers with no corresponding active Loxora job.

A user-facing emergency action should be able to:
- block new external jobs,
- cancel active external jobs where possible,
- terminate external workers,
- and switch Loxora into local-only mode.

## Usage telemetry for the user, not mandatory product telemetry

Loxora should record compute usage locally so users can understand what they actually need.

Useful metrics include:
- model,
- job type,
- GPU type,
- peak VRAM,
- RAM usage,
- runtime,
- utilization,
- energy estimate,
- provider cost,
- local cost estimate,
- queue delay,
- and output size.

This history can support evidence-based decisions such as:
- whether to continue renting,
- when buying a GPU becomes economical,
- how much VRAM is actually required,
- whether multiple smaller GPUs are preferable,
- and which workload should remain cloud-only.

This does not imply mandatory collection by Loxora-operated services.

## Modular local compute

A future power-user setup may consist of:
- a normal workstation,
- a separate modular NVIDIA compute node,
- and a low-power always-on controller.

The compute node should be replaceable independently of the user's primary computer.

The architecture should not assume a particular GPU generation or physical topology.

A local worker might provide LLM inference, image generation, 3D generation, rendering, transcription, or other CUDA-heavy workloads.

## Optional Loxora services

The open-source local core may be complemented by optional services.

Possible product areas:

### Loxora Hub

A discovery and distribution surface for:
- capabilities,
- integrations,
- MCPs,
- agent templates,
- workflows,
- models,
- profiles,
- and community extensions.

### Loxora Compute

A convenience layer that can acquire and manage temporary compute on behalf of users who do not want to manage infrastructure themselves.

The service may charge a transparent convenience fee in addition to underlying compute cost.

Users should still be able to bring their own provider or self-host equivalent workers.

### Loxora Model Gateway

An optional single billing and routing surface for external model APIs.

Bring-your-own API keys should remain possible.

### Optional sync and collaboration services

Future hosted collaboration may exist, but must not redefine local-first ownership of project knowledge.

## Web control plane

A future Loxora website may provide account, compute, usage, marketplace, and management functions.

The website must not silently obtain unrestricted control over the user's machine.

Remote requests should terminate at the local Loxora daemon and pass through local authentication, permissions, policy, and capability checks.

The local daemon remains the authority over what may happen on the local system.

## Business model principle

Commercial services should monetize convenience, managed infrastructure, optional compute, routing, collaboration, and operational support rather than making the open-source local core intentionally unusable.

The long-term product should preserve a credible path for a technically capable user to remain self-hosted.

## Open-source boundary

The intended boundary is conceptually:

- **Loxora Core:** open-source, local-first runtime and knowledge/orchestration foundation.
- **Loxora Hub:** ecosystem and extension discovery; implementation and licensing boundary to be decided.
- **Loxora Cloud / Compute:** optional managed services; may contain proprietary service-side components.

The exact repository, protocol, trademark, contribution, and licensing boundaries are not yet decided.

See `docs/planning/LICENSING-STRATEGY.md`.

## Security and privacy direction

Future architecture should assume that capabilities have different trust levels.

A capability request may need to declare:
- whether data stays local,
- whether data may leave the machine,
- which provider may receive it,
- what credentials are required,
- what files or tools may be accessed,
- whether the action incurs cost,
- and whether human confirmation is required.

Remote compute should receive only the minimum data needed for a job.

## Relationship to the current MVP

The completed Hackathon MVP remains bounded as documented.

The next practical validation target should be applying Loxora to real Ocomic/Play.Ocomic work before attempting to generalize every long-term use case.

That Ocomic-first phase should be treated as production dogfooding:
- solve real Ocomic problems,
- measure where the current knowledge model helps or fails,
- keep sensitive Ocomic knowledge outside the public repository,
- and only promote reusable lessons into public core architecture after review.

Nothing in this document authorizes implementation within the completed Hackathon MVP.

The existing lifecycle, knowledge, Context Package, navigation, review, and provenance work remains the foundation.

The capabilities, compute router, multi-agent runtime, hosted services, marketplace, automatic installer, and commercial features described here require separate RFCs, ADRs, milestones, threat models, and explicit approval before implementation.

## Product north star

The desired long-term experience is:

> Tell Loxora what you want to accomplish. Loxora determines which knowledge, models, tools, integrations, permissions, and compute resources are required; prefers user-controlled local execution; asks before crossing cost or trust boundaries; and remains usable without a mandatory Loxora cloud.

