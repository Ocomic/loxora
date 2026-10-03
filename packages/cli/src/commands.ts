import {
  ContextPackageService,
  CrossProjectImpactService,
  DEFAULT_SCOPE,
  LifecycleService,
  MISSION_STATES,
  MissionService,
  compareMissionsByAttention,
  NavigationService,
  NodeKeyService,
  PLANNED_KNOWLEDGE_STATUSES,
  PlannedKnowledgeService,
  WAIT_REASONS,
  assertNodeKey,
  ReviewInboxService,
  parseWorkspaceExport,
  serializeWorkspaceExport,
  workspaceExportDigest,
  type CollectionId,
  type ContextTemporalView,
  type CrossProjectRelationshipProposalId,
  type EvidenceReferenceId,
  type Mission,
  type MissionEvent,
  type MissionId,
  type MissionState,
  type NodeId,
  type PlannedKnowledgeChanges,
  type PlannedKnowledgeId,
  type PlannedKnowledgePolicy,
  type PlannedKnowledgeRevisionId,
  type PlannedKnowledgeStatus,
  type ProjectId,
  type ProposalId,
  type RelationshipConfidence,
  type SourceReferenceId,
  type SpaceId,
  type WaitReason,
  type WorkspaceExportRecord,
} from "@loxora/core";
import { openSqliteStore } from "@loxora/sqlite";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { WorkspaceDirectory, type EffectivePlan } from "./directory.js";
import {
  CliUsageError,
  databasePath,
  initWorkspace,
  isAgentActor,
  loadWorkspaceConfig,
  type WorkspaceConfig,
} from "./workspace.js";

type Store = Awaited<ReturnType<typeof openSqliteStore>>;

export interface Options {
  readonly [name: string]: string | boolean | string[] | undefined;
}

export interface CommandContext {
  readonly workspaceDirectory: string;
  readonly options: Options;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
}

export interface CommandResult {
  readonly message: string;
  readonly data: unknown;
}

type Handler = (context: CommandContext) => Promise<CommandResult>;

const PLAN_STATUSES: readonly PlannedKnowledgeStatus[] = PLANNED_KNOWLEDGE_STATUSES;
const CONFIDENCE: readonly RelationshipConfidence[] = ["Low", "Medium", "High"];

export const COMMANDS: Readonly<Record<string, Handler>> = {
  "workspace init": async ({ workspaceDirectory, options }) => {
    const config = initWorkspace({
      directory: workspaceDirectory,
      name: optional(options, "name") ?? "default",
      reviewers: list(options, "reviewer"),
      allowInRepository: options["allow-in-repository"] === true,
    });
    const store = await openSqliteStore(databasePath(workspaceDirectory));
    await store.close();
    return {
      message: `Initialized workspace "${config.name}" at ${workspaceDirectory}\nReviewers: ${config.reviewers.join(", ")}`,
      data: { directory: workspaceDirectory, config },
    };
  },

  "workspace status": (context) =>
    withWorkspace(context, async ({ config, directory }) => {
      const current = new Set(directory.records("currentRevisions").map((record) => record.nodeId));
      const nodeIds = new Set(directory.records("knowledgeNodes").map((node) => node.id));
      const projects = directory.records("projects").map((project) => {
        const submitted = directory
          .records("knowledgeProposals")
          .filter(
            (proposal) => proposal.projectId === project.id && proposal.status === "Submitted",
          );
        const plans = directory
          .plans(String(project.id))
          .filter((plan) => plan.ownerProjectId === project.id);
        const planStatuses: Record<string, number> = {};
        for (const plan of plans) planStatuses[plan.status] = (planStatuses[plan.status] ?? 0) + 1;
        return {
          id: project.id,
          name: project.name,
          nodes: directory
            .records("knowledgeNodes")
            .filter((node) => node.projectId === project.id && current.has(node.id)).length,
          pendingNodes: submitted.filter((proposal) => !nodeIds.has(proposal.proposedNodeId))
            .length,
          pendingProposals: submitted.length + pendingPlanProposals(directory, String(project.id)),
          plans: planStatuses,
        };
      });
      return {
        message: [
          `Workspace "${config.name}" at ${context.workspaceDirectory}`,
          `Reviewers: ${config.reviewers.join(", ")}`,
          projects.length === 0
            ? "No projects yet."
            : projects
                .map((p) => {
                  const plans = Object.entries(p.plans)
                    .map(([status, count]) => `${count} ${status}`)
                    .join(", ");
                  return `- ${p.name} (${short(p.id)}): ${plural(p.nodes, "node")} with accepted knowledge, ${plural(p.pendingNodes, "pending node")}, ${plural(p.pendingProposals, "pending proposal")}${plans ? `; plans: ${plans}` : ""}`;
                })
                .join("\n"),
        ].join("\n"),
        data: { directory: context.workspaceDirectory, config, projects },
      };
    }),

  "project add": (context) =>
    withWrite(context, async ({ store, actor }) => {
      const project = await new LifecycleService(store).createProject({
        name: required(context.options, "name"),
        purpose: optional(context.options, "purpose") ?? "",
        actorId: actor,
      });
      return {
        result: { message: `Project "${project.name}" created (${project.id})`, data: project },
        affected: [project.id],
      };
    }),

  "space add": (context) =>
    withWrite(context, async ({ store, actor, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const space = await new LifecycleService(store).createKnowledgeSpace({
        projectId: project.id as ProjectId,
        name: required(context.options, "name"),
        description: optional(context.options, "description") ?? "",
        actorId: actor,
      });
      return {
        result: { message: `Space "${space.name}" created (${space.id})`, data: space },
        affected: [String(project.id)],
      };
    }),

  "collection add": (context) =>
    withWrite(context, async ({ store, actor, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const space = directory.space(String(project.id), required(context.options, "space"));
      const collection = await new LifecycleService(store).createKnowledgeCollection({
        projectId: project.id as ProjectId,
        spaceId: space.id as SpaceId,
        name: required(context.options, "name"),
        description: optional(context.options, "description") ?? "",
        actorId: actor,
      });
      return {
        result: {
          message: `Collection "${collection.name}" created (${collection.id})`,
          data: collection,
        },
        affected: [String(project.id)],
      };
    }),

  "source add": (context) =>
    withWrite(context, async ({ store, actor, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const source = await new LifecycleService(store).registerSourceReference({
        projectId: project.id as ProjectId,
        kind: optional(context.options, "kind") ?? "document",
        locator: required(context.options, "locator"),
        title: required(context.options, "title"),
        actorId: actor,
      });
      return {
        result: { message: `Source "${source.title}" registered (${source.id})`, data: source },
        affected: [String(project.id)],
      };
    }),

  "evidence add": (context) =>
    withWrite(context, async ({ store, actor, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const source = directory.source(required(context.options, "source"), String(project.id));
      const evidence = await new LifecycleService(store).registerEvidenceReference({
        projectId: project.id as ProjectId,
        sourceReferenceId: source.id as SourceReferenceId,
        summary: required(context.options, "summary"),
        locator: required(context.options, "locator"),
        actorId: actor,
      });
      return {
        result: { message: `Evidence registered (${evidence.id})`, data: evidence },
        affected: [String(project.id)],
      };
    }),

  "propose new": (context) =>
    withWrite(context, async ({ store, actor, directory, config }) => {
      const project = directory.project(required(context.options, "project"));
      const projectId = String(project.id);
      const space = directory.space(projectId, required(context.options, "space"));
      const collection = directory.collection(
        projectId,
        required(context.options, "collection"),
        String(space.id),
      );
      const key = optional(context.options, "key");
      if (key !== undefined) {
        assertNodeKey(key);
        if (directory.keyTaken(projectId, key.trim())) {
          throw new CliUsageError(
            `Key "${key.trim()}" is already used in this Project; keys are never reused`,
          );
        }
      }
      const proposal = await new LifecycleService(store).submitKnowledgeProposal({
        projectId: projectId as ProjectId,
        spaceId: space.id as SpaceId,
        collectionId: collection.id as CollectionId,
        proposedNodeTitle: required(context.options, "title"),
        proposedContent: content(context),
        sourceReferenceIds: list(context.options, "source").map(
          (ref) => directory.source(ref, projectId).id as SourceReferenceId,
        ),
        evidenceReferenceIds: list(context.options, "evidence").map(
          (ref) => directory.evidence(ref, projectId).id as EvidenceReferenceId,
        ),
        proposerId: actor,
      });
      const nodeKey = key
        ? await nodeKeys(store, config).assignNodeKey({
            projectId: projectId as ProjectId,
            nodeId: proposal.proposedNodeId,
            key,
            actorId: actor,
          })
        : null;
      return {
        result: {
          message: `Proposal ${proposal.id} submitted for "${proposal.proposedNodeTitle}"${nodeKey ? ` with key ${nodeKey.key}` : ""}; awaiting review`,
          data: { ...proposal, nodeKey },
        },
        affected: [projectId],
      };
    }),

  "propose successor": (context) =>
    withWrite(context, async ({ store, actor, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const projectId = String(project.id);
      const node = directory.node(projectId, required(context.options, "node"));
      const lifecycle = new LifecycleService(store);
      const current = await lifecycle.getCurrentKnowledge({
        projectId: projectId as ProjectId,
        nodeId: node.id as NodeId,
      });
      if (!current) throw new CliUsageError(`Node "${node.title}" has no Current knowledge yet`);
      const proposal = await lifecycle.submitSuccessorProposal({
        projectId: projectId as ProjectId,
        nodeId: node.id as NodeId,
        expectedCurrentRevisionId: current.revision.id,
        proposedContent: content(context),
        changeReason: required(context.options, "reason"),
        sourceReferenceIds: list(context.options, "source").map(
          (ref) => directory.source(ref, projectId).id as SourceReferenceId,
        ),
        evidenceReferenceIds: list(context.options, "evidence").map(
          (ref) => directory.evidence(ref, projectId).id as EvidenceReferenceId,
        ),
        proposerId: actor,
      });
      return {
        result: {
          message: `Successor Proposal ${proposal.id} submitted for "${node.title}"; awaiting review`,
          data: proposal,
        },
        affected: [projectId],
      };
    }),

  review: (context) =>
    withWrite(context, async ({ store, actor, directory, config }) => {
      requireReviewer(config, actor);
      const item = directory.reviewable(required(context.options, "proposal"));
      const explicit = list(context.options, "evidence");
      if (item.kind === "PlanRevisionProposal") {
        const proposal = item.record;
        const evidence =
          explicit.length > 0
            ? qualifiedEvidence(directory, explicit)
            : directory
                .records("plannedKnowledgeRevisionEvidence")
                .filter((record) => record.revisionId === proposal.id)
                .map((record) => ({
                  projectId: record.evidenceProjectId as ProjectId,
                  evidenceReferenceId: record.evidenceReferenceId as EvidenceReferenceId,
                }));
        const result = await plannedService(store, config).reviewPlannedKnowledgeRevisionProposal({
          ownerProjectId: proposal.ownerProjectId as ProjectId,
          proposalId: proposal.id as PlannedKnowledgeRevisionId,
          reviewerId: actor,
          decision: decision(context.options),
          reason: required(context.options, "reason"),
          evidence,
        });
        const plan = directory.plan(String(proposal.plannedKnowledgeId));
        return {
          result: {
            message: `${
              result.revision
                ? `Accepted: plan "${plan.title}" is now revision ${result.revision.revisionNumber} (${result.revision.state.status})`
                : `Rejected plan revision proposal ${proposal.id}`
            }${evidenceNote(
              evidence.map((entry) => entry.evidenceReferenceId),
              explicit.length === 0,
            )}`,
            data: result,
          },
          affected: [
            String(proposal.ownerProjectId),
            ...(plan.relatedProjectId ? [plan.relatedProjectId] : []),
          ],
        };
      }
      const proposal = item.record;
      const projectId = String(proposal.projectId);
      const evidenceIds =
        explicit.length > 0
          ? explicit.map((ref) => directory.evidence(ref, projectId).id as EvidenceReferenceId)
          : directory
              .records("proposalEvidence")
              .filter((record) => record.proposalId === proposal.id)
              .map((record) => record.evidenceReferenceId as EvidenceReferenceId);
      const result = await new LifecycleService(store).reviewKnowledgeProposal({
        projectId: projectId as ProjectId,
        proposalId: proposal.id as ProposalId,
        reviewerId: actor,
        decision: decision(context.options),
        reason: required(context.options, "reason"),
        evidenceReferenceIds: evidenceIds,
      });
      return {
        result: {
          message: `${
            result.revision
              ? `Accepted: Revision ${result.revision.id} is now Current for "${proposal.proposedNodeTitle}"`
              : `Rejected Proposal ${proposal.id}`
          }${evidenceNote(evidenceIds, explicit.length === 0)}`,
          data: result,
        },
        affected: [projectId],
      };
    }),

  inbox: (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const projects = context.options.project
        ? [directory.project(required(context.options, "project"))]
        : directory.records("projects");
      const items = await new ReviewInboxService(store).getReviewInbox({
        projectIds: projects.map((project) => project.id as ProjectId),
      });
      const lines = items.map((item) => {
        if (item.kind === "KnowledgeProposal" && item.proposal) {
          return `- proposal ${item.id}: "${item.proposal.proposedNodeTitle}"${keySuffix(directory, item.proposal.proposedNodeId)} in ${projectName(directory, item.proposal.projectId)} (${item.proposal.kind}) by ${item.proposal.proposerId}`;
        }
        if (item.kind === "CrossProjectRelationshipProposal" && item.relationshipProposal) {
          const r = item.relationshipProposal;
          return `- relationship ${item.id}: ${projectName(directory, r.source.projectId)} / ${nodeLabel(directory, r.source.nodeId)} DependsOn ${projectName(directory, r.target.projectId)} / ${nodeLabel(directory, r.target.nodeId)} (${r.confidence}) by ${r.proposerId}`;
        }
        if (item.kind === "PlannedKnowledgeRevisionProposal" && item.plannedRevisionProposal) {
          const p = item.plannedRevisionProposal;
          return `- plan revision ${item.id}: "${p.planTitle}" ${p.effectiveStatus} -> ${p.proposal.state.status} (changed: ${p.proposal.changedFields.join(", ")}) by ${p.proposal.authorId}: ${p.proposal.changeReason}`;
        }
        const unknown = item as { kind: string; id: string };
        return `- ${unknown.kind} ${unknown.id}`;
      });
      return {
        message: items.length === 0 ? "Review inbox is empty." : lines.join("\n"),
        data: items,
      };
    }),

  "plan add": (context) =>
    withWrite(context, async ({ store, actor, directory }) => {
      const owner = directory.project(required(context.options, "project"));
      const related = context.options["related-project"]
        ? directory.project(required(context.options, "related-project"))
        : null;
      const status = required(context.options, "status") as PlannedKnowledgeStatus;
      if (!PLAN_STATUSES.includes(status)) {
        throw new CliUsageError(`--status must be one of ${PLAN_STATUSES.join(", ")}`);
      }
      const relatedNodes = [
        ...list(context.options, "node").map((ref) => ({
          projectId: owner.id as ProjectId,
          nodeId: directory.node(String(owner.id), ref).id as NodeId,
        })),
        ...list(context.options, "related-node").map((ref) => {
          if (!related) throw new CliUsageError("--related-node requires --related-project");
          return {
            projectId: related.id as ProjectId,
            nodeId: directory.node(String(related.id), ref).id as NodeId,
          };
        }),
      ];
      const plan = await new PlannedKnowledgeService(store).createPlannedKnowledge({
        ownerProjectId: owner.id as ProjectId,
        ...(related ? { relatedProjectId: related.id as ProjectId } : {}),
        relatedNodes,
        title: required(context.options, "title"),
        description: required(context.options, "description"),
        status,
        reason: required(context.options, "reason"),
        blockingCondition: required(context.options, "blocking-condition"),
        evidence: list(context.options, "evidence").map((ref) => {
          const evidence = directory.evidence(ref);
          return {
            projectId: evidence.projectId as ProjectId,
            evidenceReferenceId: evidence.id as EvidenceReferenceId,
          };
        }),
        authorId: actor,
      });
      return {
        result: { message: `Planned knowledge "${plan.title}" recorded (${plan.id})`, data: plan },
        affected: [String(owner.id), ...(related ? [String(related.id)] : [])],
      };
    }),

  "plan update": (context) =>
    withWrite(context, async ({ store, actor, directory, config }) => {
      const scope = context.options.project
        ? String(directory.project(required(context.options, "project")).id)
        : undefined;
      const plan = directory.plan(required(context.options, "plan"), scope);
      const changes: {
        -readonly [K in keyof PlannedKnowledgeChanges]: PlannedKnowledgeChanges[K];
      } = {};
      const status = optional(context.options, "status");
      if (status !== undefined) {
        if (!PLAN_STATUSES.includes(status as PlannedKnowledgeStatus)) {
          throw new CliUsageError(`--status must be one of ${PLAN_STATUSES.join(", ")}`);
        }
        changes.status = status as PlannedKnowledgeStatus;
      }
      for (const [option, field] of [
        ["title", "title"],
        ["description", "description"],
        ["blocking-condition", "blockingCondition"],
      ] as const) {
        const value = optional(context.options, option);
        if (value !== undefined) changes[field] = value;
      }
      const related = optional(context.options, "related-project");
      if (related !== undefined) {
        changes.relatedProjectId =
          related.trim().toLowerCase() === "none"
            ? null
            : (directory.project(related).id as ProjectId);
      }
      const relatedProjectId =
        changes.relatedProjectId === undefined ? plan.relatedProjectId : changes.relatedProjectId;
      const resolve = (ref: string) => planNode(directory, plan, relatedProjectId, ref);
      changes.addNodes = list(context.options, "add-node").map(resolve);
      changes.removeNodes = list(context.options, "remove-node").map(resolve);
      changes.addEvidence = qualifiedEvidence(directory, list(context.options, "evidence"));
      changes.removeEvidence = qualifiedEvidence(
        directory,
        list(context.options, "remove-evidence"),
      );
      const result = await plannedService(store, config).revisePlannedKnowledge({
        ownerProjectId: plan.ownerProjectId as ProjectId,
        plannedKnowledgeId: plan.id as PlannedKnowledgeId,
        changes,
        changeReason: required(context.options, "reason"),
        actorId: actor,
      });
      const affected = [
        plan.ownerProjectId,
        ...(plan.relatedProjectId ? [plan.relatedProjectId] : []),
        ...(relatedProjectId ? [String(relatedProjectId)] : []),
      ];
      if (result.outcome === "Proposed") {
        return {
          result: {
            message: `Plan revision proposal ${result.proposal.id} submitted for "${plan.title}" (changed: ${result.proposal.changedFields.join(", ")}). Closing or reopening a plan needs a reviewer; see "loxora inbox".`,
            data: result,
          },
          affected,
        };
      }
      return {
        result: {
          message: `Plan "${result.revision.state.title}" is now revision ${result.revision.revisionNumber} (${result.revision.state.status}); changed: ${result.revision.changedFields.join(", ")}`,
          data: result,
        },
        affected,
      };
    }),

  "plan history": (context) =>
    withWorkspace(context, async ({ store, directory, config }) => {
      const scope = context.options.project
        ? String(directory.project(required(context.options, "project")).id)
        : undefined;
      const plan = directory.plan(required(context.options, "plan"), scope);
      const history = await plannedService(store, config).getPlannedKnowledgeHistory({
        ownerProjectId: plan.ownerProjectId as ProjectId,
        plannedKnowledgeId: plan.id as PlannedKnowledgeId,
      });
      if (!history) throw new CliUsageError(`Plan "${plan.title}" was not found`);
      return {
        message: [
          `${history.plan.title} — plan history (planned knowledge, not canonical knowledge)`,
          ...history.entries.map((entry) =>
            entry.kind === "Revision"
              ? `- r${entry.revisionNumber}${entry.isEffective ? " EFFECTIVE" : "          "} ${entry.createdAt} [${entry.state.status}] by ${entry.authorId}${
                  entry.changeReason
                    ? `: ${entry.changeReason} (changed: ${entry.changedFields.join(", ")})`
                    : " (created)"
                }`
              : `- proposal ${short(entry.id)} ${entry.createdAt} [${entry.state.status}] by ${entry.authorId}: ${entry.changeReason} — ${
                  entry.decision
                    ? `${entry.decision.decision} by ${entry.decision.reviewerId}`
                    : "awaiting review"
                }`,
          ),
        ].join("\n"),
        data: history,
      };
    }),

  "node key": (context) =>
    withWrite(context, async ({ store, actor, directory, config }) => {
      const project = directory.project(required(context.options, "project"));
      const node = directory.node(String(project.id), required(context.options, "node"));
      const assigned = await nodeKeys(store, config).assignNodeKey({
        projectId: project.id as ProjectId,
        nodeId: node.id as NodeId,
        key: required(context.options, "key"),
        actorId: actor,
      });
      return {
        result: {
          message: `Node "${node.title}" now has the immutable key ${assigned.key}`,
          data: assigned,
        },
        affected: [String(project.id)],
      };
    }),

  "mission create": (context) =>
    withWrite(context, async ({ store, actor, directory }) => {
      const owner = directory.project(required(context.options, "project"));
      const referenced = list(context.options, "ref-project").map((ref) => directory.project(ref));
      const projects = [owner, ...referenced].map((project) => String(project.id));
      const predecessor = optional(context.options, "predecessor");
      const mission = await new MissionService(store).createMission({
        ownerProjectId: owner.id as ProjectId,
        title: required(context.options, "title"),
        goal: required(context.options, "goal"),
        referencedProjectIds: referenced.map((project) => project.id as ProjectId),
        nodes: list(context.options, "node").map((ref) => {
          for (const projectId of projects) {
            try {
              const node = directory.node(projectId, ref);
              return { projectId: projectId as ProjectId, nodeId: node.id as NodeId };
            } catch {
              // try the next referenced Project
            }
          }
          throw new CliUsageError(`Node "${ref}" was not found in the Mission's Projects`);
        }),
        plans: list(context.options, "plan").map((ref) => {
          const plan = directory.plan(ref);
          const projectId = projects.find(
            (id) => id === plan.ownerProjectId || id === plan.relatedProjectId,
          );
          if (!projectId) {
            throw new CliUsageError(`Plan "${plan.title}" is not in the Mission's Projects`);
          }
          return {
            projectId: projectId as ProjectId,
            plannedKnowledgeId: plan.id as PlannedKnowledgeId,
          };
        }),
        ...(optional(context.options, "role")
          ? { workerRole: required(context.options, "role") }
          : {}),
        ...(predecessor
          ? { predecessorMissionId: directory.mission(predecessor).id as MissionId }
          : {}),
        actorId: actor,
      });
      return {
        result: {
          message: `Mission "${mission.title}" created (${mission.id}); state queued. Start it with "loxora mission start".`,
          data: mission,
        },
        affected: [],
      };
    }),

  "mission start": (context) =>
    missionWrite(context, (missions, mission, actor) =>
      missions.startMission({
        missionId: mission,
        actorId: actor,
        ...(optional(context.options, "activity")
          ? { activity: required(context.options, "activity") }
          : {}),
      }),
    ),

  "mission activity": (context) =>
    missionWrite(context, (missions, mission, actor) =>
      missions.reportActivity({
        missionId: mission,
        actorId: actor,
        activity: required(context.options, "text"),
      }),
    ),

  "mission wait": (context) =>
    missionWrite(context, (missions, mission, actor) => {
      const reason = required(context.options, "reason") as WaitReason;
      if (!WAIT_REASONS.includes(reason)) {
        throw new CliUsageError(`--reason must be one of ${WAIT_REASONS.join(", ")}`);
      }
      const options = list(context.options, "option");
      const consequences = list(context.options, "consequence");
      if (consequences.length > options.length) {
        throw new CliUsageError("Each --consequence belongs to the --option at the same position");
      }
      const text = (name: string) =>
        optional(context.options, name) ? { [camel(name)]: required(context.options, name) } : {};
      return missions.waitMission({
        missionId: mission,
        actorId: actor,
        reason,
        ...text("detail"),
        ...text("question"),
        ...(optional(context.options, "why")
          ? { rationale: required(context.options, "why") }
          : {}),
        ...(optional(context.options, "capability")
          ? { limitedCapability: required(context.options, "capability") }
          : {}),
        ...(optional(context.options, "expected-resume")
          ? { expectedResumeAt: required(context.options, "expected-resume") }
          : {}),
        options: options.map((option, index) => ({
          option,
          consequence: consequences[index] ?? null,
        })),
      });
    }),

  "mission answer": (context) =>
    missionWrite(context, (missions, mission, actor, directory) => {
      const raw = optional(context.options, "decision")?.toLowerCase();
      if (raw !== undefined && raw !== "approve" && raw !== "reject") {
        throw new CliUsageError("--decision must be approve or reject");
      }
      return missions.answerAttentionRequest({
        missionId: mission,
        actorId: actor,
        response: required(context.options, "response"),
        ...(raw ? { decision: raw } : {}),
        evidence: qualifiedEvidence(directory, list(context.options, "evidence")),
      });
    }),

  "mission resume": (context) =>
    missionWrite(context, (missions, mission, actor) =>
      missions.resumeMission({ missionId: mission, actorId: actor }),
    ),

  "mission pause": (context) =>
    missionWrite(context, (missions, mission, actor) =>
      missions.pauseMission({
        missionId: mission,
        actorId: actor,
        ...(optional(context.options, "reason")
          ? { reason: required(context.options, "reason") }
          : {}),
      }),
    ),

  "mission cancel": (context) =>
    missionWrite(context, (missions, mission, actor) =>
      missions.cancelMission({
        missionId: mission,
        actorId: actor,
        reason: required(context.options, "reason"),
      }),
    ),

  "mission complete": (context) =>
    missionWrite(context, (missions, mission, actor, directory) =>
      missions.completeMission({
        missionId: mission,
        actorId: actor,
        summary: required(context.options, "summary"),
        ...outcomeOptions(context, directory, mission),
      }),
    ),

  "mission fail": (context) =>
    missionWrite(context, (missions, mission, actor, directory) =>
      missions.failMission({
        missionId: mission,
        actorId: actor,
        summary: required(context.options, "reason"),
        ...outcomeOptions(context, directory, mission),
      }),
    ),

  "mission show": (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const missions = new MissionService(store);
      const mission = await missions.getMission({
        missionId: directory.mission(required(context.options, "mission")).id as MissionId,
      });
      if (!mission) throw new CliUsageError("Mission was not found");
      const events = await missions.getMissionEvents({ missionId: mission.id });
      return {
        message: renderMission(directory, mission, events),
        data: { mission, events },
      };
    }),

  "mission list": (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const project = context.options.project
        ? directory.project(required(context.options, "project"))
        : null;
      const state = optional(context.options, "state") as MissionState | undefined;
      if (state !== undefined && !MISSION_STATES.includes(state)) {
        throw new CliUsageError(`--state must be one of ${MISSION_STATES.join(", ")}`);
      }
      const reason = optional(context.options, "reason") as WaitReason | undefined;
      if (reason !== undefined && !WAIT_REASONS.includes(reason)) {
        throw new CliUsageError(`--reason must be one of ${WAIT_REASONS.join(", ")}`);
      }
      const missions = (
        await new MissionService(store).listMissions({
          ...(project ? { projectId: project.id as ProjectId } : {}),
          ...(state ? { states: [state] } : {}),
          ...(reason ? { waitReasons: [reason] } : {}),
        })
      )
        .filter(
          (mission) =>
            context.options.attention !== true ||
            (mission.state === "waiting" &&
              mission.waitReason !== null &&
              mission.waitReason !== "provider_limit"),
        )
        .slice()
        .sort(compareMissionsByAttention);
      const now = Date.now();
      return {
        message:
          missions.length === 0
            ? "No missions."
            : missions
                .map(
                  (mission) =>
                    `- [${missionStateLabel(mission)}] ${mission.title} (${short(mission.id)}, ${projectName(directory, mission.ownerProjectId)}) — last activity ${ago(mission.lastActivityAt, now)}${
                      mission.attentionRequest && !mission.attentionRequest.answeredAt
                        ? ` — needs you: ${mission.attentionRequest.question}`
                        : mission.currentActivity && mission.state === "running"
                          ? ` — ${mission.currentActivity}`
                          : ""
                    }`,
                )
                .join("\n"),
        data: missions,
      };
    }),

  "relate propose": (context) =>
    withWrite(context, async ({ store, actor, directory, config }) => {
      const from = directory.project(required(context.options, "from-project"));
      const to = directory.project(required(context.options, "to-project"));
      const confidence = (optional(context.options, "confidence") ??
        "Medium") as RelationshipConfidence;
      if (!CONFIDENCE.includes(confidence)) {
        throw new CliUsageError(`--confidence must be one of ${CONFIDENCE.join(", ")}`);
      }
      const proposal = await impactService(store, config).submitCrossProjectRelationshipProposal({
        sourceProjectId: from.id as ProjectId,
        sourceNodeId: directory.node(String(from.id), required(context.options, "from-node"))
          .id as NodeId,
        targetProjectId: to.id as ProjectId,
        targetNodeId: directory.node(String(to.id), required(context.options, "to-node"))
          .id as NodeId,
        evidence: qualifiedEvidence(directory, list(context.options, "evidence")),
        confidence,
        reason: required(context.options, "reason"),
        visibility: context.options.restricted === true ? "Restricted" : "SharedBetweenProjects",
        proposerId: actor,
      });
      return {
        result: {
          message: `Relationship Proposal ${proposal.id}: "${from.name}" DependsOn "${to.name}"; awaiting review`,
          data: proposal,
        },
        affected: [String(from.id), String(to.id)],
      };
    }),

  "relate review": (context) =>
    withWrite(context, async ({ store, actor, directory, config }) => {
      requireReviewer(config, actor);
      const proposal = directory.relationshipProposal(required(context.options, "proposal"));
      const explicit = list(context.options, "evidence");
      const evidence =
        explicit.length > 0
          ? qualifiedEvidence(directory, explicit)
          : directory
              .records("crossProjectRelationshipProposalEvidence")
              .filter((record) => record.proposalId === proposal.id)
              .map((record) => ({
                projectId: record.evidenceProjectId as ProjectId,
                evidenceReferenceId: record.evidenceReferenceId as EvidenceReferenceId,
              }));
      const result = await impactService(store, config).reviewCrossProjectRelationshipProposal({
        proposalId: proposal.id as CrossProjectRelationshipProposalId,
        reviewerId: actor,
        decision: decision(context.options),
        reason: required(context.options, "reason"),
        evidence,
      });
      return {
        result: {
          message: `${
            result.relationship
              ? `Accepted: Relationship ${result.relationship.id} is active`
              : `Rejected Relationship Proposal ${proposal.id}`
          }${evidenceNote(
            evidence.map((entry) => entry.evidenceReferenceId),
            explicit.length === 0,
          )}`,
          data: result,
        },
        affected: [String(proposal.sourceProjectId), String(proposal.targetProjectId)],
      };
    }),

  "show map": (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const map = await new NavigationService(store).getProjectMap({
        projectId: project.id as ProjectId,
      });
      return {
        message: renderTree(directory, project),
        data: { ...map, plans: directory.plans(String(project.id)) },
      };
    }),

  "show current": (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const node = directory.node(String(project.id), required(context.options, "node"));
      const current = await new LifecycleService(store).getCurrentKnowledge({
        projectId: project.id as ProjectId,
        nodeId: node.id as NodeId,
      });
      return {
        message: current
          ? `${node.title} — Current Revision ${current.revision.id} (accepted ${current.revision.acceptedAt} by ${current.revision.reviewerId})\n\n${current.revision.content}`
          : `${node.title} has no Current knowledge yet.`,
        data: current,
      };
    }),

  "show history": (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const node = directory.node(String(project.id), required(context.options, "node"));
      const history = await new LifecycleService(store).getKnowledgeHistory({
        projectId: project.id as ProjectId,
        nodeId: node.id as NodeId,
      });
      return {
        message: history
          ? [
              `${node.title} — History (historical entries are not current knowledge)`,
              ...history.entries.map(
                (entry) =>
                  `- ${entry.isCurrent ? "CURRENT   " : "historical"} ${entry.revision.id} ${entry.revision.acceptedAt} ${entry.revisionRole}${entry.changeReason ? `: ${entry.changeReason}` : ""}`,
              ),
            ].join("\n")
          : `${node.title} has no accepted revisions yet.`,
        data: history,
      };
    }),

  "show plans": (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const plans = await store.getProjectPlans({
        projectId: project.id as ProjectId,
        scope: DEFAULT_SCOPE,
      });
      return {
        message:
          plans.length === 0
            ? "No planned knowledge."
            : [
                "Planned knowledge (not canonical knowledge):",
                ...plans.map(
                  (plan) =>
                    `- [${plan.status}] ${plan.title} r${plan.revisionNumber} (${plan.id}) — ${planStateLabel(plan.status)}`,
                ),
              ].join("\n"),
        data: plans,
      };
    }),

  context: (context) =>
    withWorkspace(context, async ({ store, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const nodes = list(context.options, "node").map(
        (ref) => directory.node(String(project.id), ref).id as NodeId,
      );
      if (nodes.length === 0) throw new CliUsageError("--node is required at least once");
      const views: ContextTemporalView[] = ["Current"];
      if (context.options.history === true) views.push("History");
      const budget = Number(optional(context.options, "budget") ?? "12000");
      if (!Number.isInteger(budget) || budget <= 0) {
        throw new CliUsageError("--budget must be a positive integer");
      }
      const contextPackage = await new ContextPackageService(store).buildContextPackage({
        projectId: project.id as ProjectId,
        focusNodeIds: nodes,
        temporalViews: views,
        includeRelatedProjects: context.options["include-related"] === true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: context.options["include-related"] === true ? 1 : 0,
        taskLabel: optional(context.options, "task") ?? "CLI context request",
        estimatedTokenBudget: budget,
        visibility: {
          readableProjectIds: directory.records("projects").map((p) => p.id as ProjectId),
        },
      });
      return {
        message: `${JSON.stringify(contextPackage, null, 2)}`,
        data: contextPackage,
      };
    }),

  export: (context) =>
    withWorkspace(context, async ({ store }) => {
      const out = resolve(context.cwd, required(context.options, "out"));
      const text = serializeWorkspaceExport(await store.readWorkspaceExport());
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, text, "utf8");
      const digest = workspaceExportDigest(text);
      return {
        message: `Exported to ${out}\nsha256 ${digest}`,
        data: { path: out, sha256: digest },
      };
    }),

  "export verify": async (context) => {
    const input = resolve(context.cwd, required(context.options, "in"));
    const original = readFileSync(input, "utf8");
    const document = parseWorkspaceExport(original);
    const temp = mkdtempSync(join(tmpdir(), "loxora-cli-verify-"));
    try {
      const store = await openSqliteStore(join(temp, "verify.sqlite"));
      let roundTrip: string;
      try {
        await store.restoreWorkspaceExport(document);
        roundTrip = serializeWorkspaceExport(await store.readWorkspaceExport());
      } finally {
        await store.close();
      }
      const digest = workspaceExportDigest(original);
      const upgraded = serializeWorkspaceExport(document);
      if (upgraded !== original) {
        // An older format version was upgraded on parse. The restored store has applied newer
        // migrations, so only the informational sourceSchema may differ (ADR-003, ADR-006).
        const restored = parseWorkspaceExport(roundTrip);
        const comparable = serializeWorkspaceExport({
          ...restored,
          sourceSchema: document.sourceSchema,
        });
        if (comparable === upgraded) {
          const added = restored.sourceSchema.filter((id) => !document.sourceSchema.includes(id));
          return {
            message: `Round trip identical after upgrade to format version ${document.formatVersion}${added.length > 0 ? ` (restored store adds migrations: ${added.join(", ")})` : ""}\nsha256 ${digest} (input)`,
            data: {
              path: input,
              sha256: digest,
              identical: true,
              upgraded: true,
              addedMigrations: added,
            },
          };
        }
      }
      if (roundTrip !== original) {
        throw new CliUsageError(
          `Round trip differs: input sha256 ${digest}, restored sha256 ${workspaceExportDigest(roundTrip)}`,
        );
      }
      return {
        message: `Round trip identical\nsha256 ${digest}`,
        data: { path: input, sha256: digest, identical: true },
      };
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  },
};

interface WorkspaceSession {
  readonly store: Store;
  readonly config: WorkspaceConfig;
  readonly directory: WorkspaceDirectory;
}

async function withWorkspace(
  context: CommandContext,
  operation: (session: WorkspaceSession) => Promise<CommandResult>,
): Promise<CommandResult> {
  const config = loadWorkspaceConfig(context.workspaceDirectory);
  const store = await openSqliteStore(databasePath(context.workspaceDirectory));
  try {
    const directory = new WorkspaceDirectory(await store.readWorkspaceExport());
    return await operation({ store, config, directory });
  } finally {
    await store.close();
  }
}

/** Runs a write and refreshes the navigation projection of every affected Project. */
async function withWrite(
  context: CommandContext,
  operation: (
    session: WorkspaceSession & { readonly actor: string },
  ) => Promise<{ readonly result: CommandResult; readonly affected: readonly string[] }>,
): Promise<CommandResult> {
  const actor = (optional(context.options, "actor") ?? context.env.LOXORA_ACTOR ?? "").trim();
  if (!actor) throw new CliUsageError("Write commands require --actor <id> or LOXORA_ACTOR");
  return withWorkspace(context, async (session) => {
    const { result, affected } = await operation({ ...session, actor });
    const navigation = new NavigationService(session.store);
    for (const projectId of new Set(affected)) {
      await navigation.rebuildNavigationProjection({
        projectId: projectId as ProjectId,
        actorId: actor,
      });
    }
    return result;
  });
}

function impactService(store: Store, config: WorkspaceConfig): CrossProjectImpactService {
  return new CrossProjectImpactService(store, {
    mayAccept: (reviewerId) => config.reviewers.includes(reviewerId),
  });
}

function requireReviewer(config: WorkspaceConfig, actor: string): void {
  if (isAgentActor(actor) || !config.reviewers.includes(actor)) {
    throw new CliUsageError(
      `Actor "${actor}" is not a reviewer of this workspace (reviewers: ${config.reviewers.join(", ")})`,
    );
  }
}

function decision(options: Options): "Accepted" | "Rejected" {
  const value = required(options, "decision").toLowerCase();
  if (value === "accept" || value === "accepted") return "Accepted";
  if (value === "reject" || value === "rejected") return "Rejected";
  throw new CliUsageError("--decision must be accept or reject");
}

function qualifiedEvidence(directory: WorkspaceDirectory, references: readonly string[]) {
  return references.map((ref) => {
    const evidence = directory.evidence(ref);
    return {
      projectId: evidence.projectId as ProjectId,
      evidenceReferenceId: evidence.id as EvidenceReferenceId,
    };
  });
}

function content(context: CommandContext): string {
  const inline = optional(context.options, "content");
  const file = optional(context.options, "content-file");
  if (inline && file) throw new CliUsageError("Use either --content or --content-file, not both");
  if (file) return readFileSync(resolve(context.cwd, file), "utf8");
  if (inline) return inline;
  throw new CliUsageError("--content or --content-file is required");
}

function renderTree(directory: WorkspaceDirectory, project: WorkspaceExportRecord): string {
  const current = new Map(
    directory
      .records("currentRevisions")
      .filter((record) => record.projectId === project.id)
      .map((record) => [record.nodeId, record.revisionId]),
  );
  const lines = [
    `${project.name} (${short(project.id)})${project.purpose ? ` — ${project.purpose}` : ""}`,
  ];
  for (const space of directory
    .records("knowledgeSpaces")
    .filter((s) => s.projectId === project.id)) {
    lines.push(`  ${space.name}/`);
    for (const collection of directory
      .records("knowledgeCollections")
      .filter((c) => c.spaceId === space.id)) {
      lines.push(`    ${collection.name}/`);
      for (const node of directory
        .records("knowledgeNodes")
        .filter((n) => n.collectionId === collection.id)) {
        const revision = current.get(node.id);
        lines.push(
          `      - ${nodeLabel(directory, node.id)}${revision ? ` [current ${short(revision)}]` : " [no current revision]"}`,
        );
      }
      const nodeIds = new Set(directory.records("knowledgeNodes").map((node) => node.id));
      for (const proposal of directory
        .records("knowledgeProposals")
        .filter(
          (p) =>
            p.collectionId === collection.id &&
            p.status === "Submitted" &&
            !nodeIds.has(p.proposedNodeId),
        )) {
        lines.push(
          `      - ${keyPrefix(directory, proposal.proposedNodeId)}${proposal.proposedNodeTitle} [pending review]`,
        );
      }
    }
  }
  const plans = directory.plans(String(project.id));
  if (plans.length > 0) {
    lines.push("  Plans (planned knowledge, not canonical):");
    for (const plan of plans) {
      lines.push(`    - [${plan.status}] ${plan.title} r${plan.revisionNumber}`);
    }
  }
  const pending =
    directory
      .records("knowledgeProposals")
      .filter((p) => p.projectId === project.id && p.status === "Submitted").length +
    pendingPlanProposals(directory, String(project.id));
  if (pending > 0) {
    lines.push(`  (${plural(pending, "proposal")} awaiting review — see "loxora inbox")`);
  }
  return lines.join("\n");
}

/** Runs one mission write and prints the resulting Mission. */
function missionWrite(
  context: CommandContext,
  operation: (
    missions: MissionService,
    missionId: MissionId,
    actor: string,
    directory: WorkspaceDirectory,
  ) => Promise<Mission>,
): Promise<CommandResult> {
  return withWrite(context, async ({ store, actor, directory }) => {
    const reference = directory.mission(required(context.options, "mission"));
    const mission = await operation(
      new MissionService(store),
      reference.id as MissionId,
      actor,
      directory,
    );
    const external = mission.outcome?.logReferences.filter((entry) => !entry.portable) ?? [];
    return {
      result: {
        message: `Mission "${mission.title}" is ${missionStateLabel(mission)} (event ${mission.sequence})${
          external.length > 0
            ? `\nWarning: ${plural(external.length, "external log reference")} not portable; it is not part of exports or other machines.`
            : ""
        }`,
        data: mission,
      },
      affected: [],
    };
  });
}

function outcomeOptions(
  context: CommandContext,
  directory: WorkspaceDirectory,
  missionId: MissionId,
) {
  const mission = directory.mission(missionId);
  return {
    outputs: list(context.options, "output"),
    validations: list(context.options, "validation"),
    decisions: list(context.options, "decision"),
    proposalIds: list(context.options, "proposal").map((ref) => {
      const proposal = directory.proposal(ref);
      if (proposal.projectId !== mission.ownerProjectId) {
        throw new CliUsageError(`Proposal ${proposal.id} is not in the Mission's owning Project`);
      }
      return proposal.id as ProposalId;
    }),
    logReferences: list(context.options, "log"),
    evidence: qualifiedEvidence(directory, list(context.options, "evidence")),
  };
}

function missionStateLabel(mission: Mission): string {
  return mission.state === "waiting" && mission.waitReason
    ? `waiting: ${mission.waitReason}`
    : mission.state;
}

function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function renderMission(
  directory: WorkspaceDirectory,
  mission: Mission,
  events: readonly MissionEvent[],
): string {
  const lines = [
    `${mission.title} — ${missionStateLabel(mission)}`,
    `Goal: ${mission.goal}`,
    `Project: ${projectName(directory, mission.ownerProjectId)}${
      mission.references.projectIds.length > 0
        ? ` (references: ${mission.references.projectIds.map((id) => projectName(directory, id)).join(", ")})`
        : ""
    }`,
    ...(mission.workerRole ? [`Role: ${mission.workerRole}`] : []),
    ...(mission.currentActivity ? [`Current activity: ${mission.currentActivity}`] : []),
    `Last activity: ${ago(mission.lastActivityAt, Date.now())} (${mission.lastActivityAt})`,
  ];
  if (mission.state === "waiting" && mission.waitReason === "provider_limit") {
    lines.push(
      `Paused by a provider limit — the Mission has not failed. ${mission.waitDetail ?? ""}`.trim(),
      ...(mission.limitedCapability ? [`Limited capability: ${mission.limitedCapability}`] : []),
      ...(mission.expectedResumeAt
        ? [`Expected to continue: ${mission.expectedResumeAt} (nothing resumes automatically)`]
        : []),
    );
  }
  const request = mission.attentionRequest;
  if (request) {
    lines.push(
      `Needs you (${request.waitReason}): ${request.question}`,
      `Why: ${request.rationale}`,
      ...request.options.map(
        (entry, index) =>
          `  ${index + 1}. ${entry.option}${entry.consequence ? ` — ${entry.consequence}` : ""}`,
      ),
      request.answeredAt
        ? `Answered by ${request.responderId}: ${request.response}${request.decision ? ` (${request.decision})` : ""} — resume the Mission to continue`
        : `Answer with "loxora mission answer --mission ${short(mission.id)} --response ..."`,
    );
  }
  const outcome = mission.outcome;
  if (outcome) {
    lines.push(`${outcome.kind === "Completed" ? "Outcome" : "Failure"}: ${outcome.summary}`);
    for (const [label, values] of [
      ["Output", outcome.outputs],
      ["Validation", outcome.validations],
      ["Decision", outcome.decisions],
    ] as const) {
      for (const value of values) lines.push(`  ${label}: ${value}`);
    }
    for (const proposal of outcome.proposals) {
      lines.push(
        `  Proposal ${short(proposal.proposalId)}: ${proposal.status === "Submitted" ? "awaiting review" : proposal.status}`,
      );
    }
    for (const log of outcome.logReferences) {
      lines.push(`  Log: ${log.kind}:${log.locator}${log.portable ? "" : " (not portable)"}`);
    }
  }
  lines.push("History:");
  for (const event of events) {
    lines.push(
      `  ${event.sequence}. ${event.occurredAt} ${event.type} ${event.previousState ?? "-"} -> ${event.newState}${
        event.waitReason && event.type === "Waiting" ? ` (${event.waitReason})` : ""
      } by ${event.actorId}${event.reason ? `: ${event.reason}` : ""}`,
    );
  }
  return lines.join("\n");
}

function plannedPolicy(config: WorkspaceConfig): PlannedKnowledgePolicy {
  return { mayDecide: (actor) => !isAgentActor(actor) && config.reviewers.includes(actor) };
}

function plannedService(store: Store, config: WorkspaceConfig): PlannedKnowledgeService {
  return new PlannedKnowledgeService(store, undefined, undefined, plannedPolicy(config));
}

function nodeKeys(store: Store, config: WorkspaceConfig): NodeKeyService {
  return new NodeKeyService(store, undefined, undefined, plannedPolicy(config));
}

function planNode(
  directory: WorkspaceDirectory,
  plan: EffectivePlan,
  relatedProjectId: string | null,
  reference: string,
): { projectId: ProjectId; nodeId: NodeId } {
  try {
    const node = directory.node(plan.ownerProjectId, reference);
    return { projectId: plan.ownerProjectId as ProjectId, nodeId: node.id as NodeId };
  } catch (error) {
    if (!relatedProjectId) throw error;
    const node = directory.node(relatedProjectId, reference);
    return { projectId: relatedProjectId as ProjectId, nodeId: node.id as NodeId };
  }
}

function pendingPlanProposals(directory: WorkspaceDirectory, projectId: string): number {
  const decided = new Set(
    directory.records("plannedKnowledgeRevisionDecisions").map((record) => record.proposalId),
  );
  return directory
    .records("plannedKnowledgeRevisions")
    .filter(
      (record) =>
        record.kind === "Proposal" &&
        record.ownerProjectId === projectId &&
        !decided.has(record.id),
    ).length;
}

function planStateLabel(status: PlannedKnowledgeStatus): string {
  if (status === "Completed") return "closed";
  if (status === "Cancelled") return "cancelled";
  return "not yet done";
}

function projectName(directory: WorkspaceDirectory, projectId: unknown): string {
  const project = directory.records("projects").find((record) => record.id === projectId);
  return project ? String(project.name) : short(projectId);
}

function keyPrefix(directory: WorkspaceDirectory, nodeId: unknown): string {
  const key = directory.nodeKey(nodeId);
  return key ? `[${key}] ` : "";
}

function keySuffix(directory: WorkspaceDirectory, nodeId: unknown): string {
  const key = directory.nodeKey(nodeId);
  return key ? ` [${key}]` : "";
}

function nodeLabel(directory: WorkspaceDirectory, nodeId: unknown): string {
  const node = directory.records("knowledgeNodes").find((record) => record.id === nodeId);
  return `${keyPrefix(directory, nodeId)}${node ? String(node.title) : short(nodeId)}`;
}

function evidenceNote(ids: readonly unknown[], fromProposal: boolean): string {
  if (ids.length === 0) return "";
  return `\nEvidence: ${ids.map(short).join(", ")}${fromProposal ? " (from the proposal)" : ""}`;
}

export function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function short(value: unknown): string {
  return String(value).slice(0, 8);
}

export function optional(options: Options, name: string): string | undefined {
  const value = options[name];
  if (Array.isArray(value)) return value.at(-1);
  return typeof value === "string" ? value : undefined;
}

export function required(options: Options, name: string): string {
  const value = optional(options, name)?.trim();
  if (!value) throw new CliUsageError(`--${name} is required`);
  return value;
}

export function list(options: Options, name: string): string[] {
  const value = options[name];
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? [value] : [];
}
