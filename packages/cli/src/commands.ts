import {
  ContextPackageService,
  CrossProjectImpactService,
  DEFAULT_SCOPE,
  LifecycleService,
  NavigationService,
  PlannedKnowledgeService,
  ReviewInboxService,
  parseWorkspaceExport,
  serializeWorkspaceExport,
  workspaceExportDigest,
  type CollectionId,
  type ContextTemporalView,
  type CrossProjectRelationshipProposalId,
  type EvidenceReferenceId,
  type NodeId,
  type PlannedKnowledgeStatus,
  type ProjectId,
  type ProposalId,
  type RelationshipConfidence,
  type SourceReferenceId,
  type SpaceId,
  type WorkspaceExportRecord,
} from "@loxora/core";
import { openSqliteStore } from "@loxora/sqlite";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { WorkspaceDirectory } from "./directory.js";
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

const PLAN_STATUSES: readonly PlannedKnowledgeStatus[] = [
  "Proposed",
  "Deferred",
  "Ready",
  "Completed",
  "Cancelled",
];
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
      const projects = directory.records("projects").map((project) => ({
        id: project.id,
        name: project.name,
        nodes: directory.records("knowledgeNodes").filter((node) => node.projectId === project.id)
          .length,
        pendingProposals: directory
          .records("knowledgeProposals")
          .filter(
            (proposal) => proposal.projectId === project.id && proposal.status === "Submitted",
          ).length,
      }));
      return {
        message: [
          `Workspace "${config.name}" at ${context.workspaceDirectory}`,
          `Reviewers: ${config.reviewers.join(", ")}`,
          projects.length === 0
            ? "No projects yet."
            : projects
                .map(
                  (p) =>
                    `- ${p.name} (${short(p.id)}): ${p.nodes} nodes, ${p.pendingProposals} pending proposals`,
                )
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
    withWrite(context, async ({ store, actor, directory }) => {
      const project = directory.project(required(context.options, "project"));
      const projectId = String(project.id);
      const space = directory.space(projectId, required(context.options, "space"));
      const collection = directory.collection(
        projectId,
        required(context.options, "collection"),
        String(space.id),
      );
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
      return {
        result: {
          message: `Proposal ${proposal.id} submitted for "${proposal.proposedNodeTitle}"; awaiting review`,
          data: proposal,
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
      const proposal = directory.proposal(required(context.options, "proposal"));
      const projectId = String(proposal.projectId);
      const result = await new LifecycleService(store).reviewKnowledgeProposal({
        projectId: projectId as ProjectId,
        proposalId: proposal.id as ProposalId,
        reviewerId: actor,
        decision: decision(context.options),
        reason: required(context.options, "reason"),
        evidenceReferenceIds: list(context.options, "evidence").map(
          (ref) => directory.evidence(ref, projectId).id as EvidenceReferenceId,
        ),
      });
      return {
        result: {
          message: result.revision
            ? `Accepted: Revision ${result.revision.id} is now Current for "${proposal.proposedNodeTitle}"`
            : `Rejected Proposal ${proposal.id}`,
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
      const lines = items.map((item) =>
        item.kind === "KnowledgeProposal" && item.proposal
          ? `- proposal ${item.id}: "${item.proposal.proposedNodeTitle}" (${item.proposal.kind}) by ${item.proposal.proposerId}`
          : `- ${item.kind} ${item.id}`,
      );
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
      const result = await impactService(store, config).reviewCrossProjectRelationshipProposal({
        proposalId: proposal.id as CrossProjectRelationshipProposalId,
        reviewerId: actor,
        decision: decision(context.options),
        reason: required(context.options, "reason"),
        evidence: qualifiedEvidence(directory, list(context.options, "evidence")),
      });
      return {
        result: {
          message: result.relationship
            ? `Accepted: Relationship ${result.relationship.id} is active`
            : `Rejected Relationship Proposal ${proposal.id}`,
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
      return { message: renderTree(directory, project), data: map };
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
                "Planned knowledge (not implemented, not canonical):",
                ...plans.map((plan) => `- [${plan.status}] ${plan.title} (${plan.id})`),
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
          `      - ${node.title}${revision ? ` [current ${short(revision)}]` : " [no current revision]"}`,
        );
      }
    }
  }
  const pending = directory
    .records("knowledgeProposals")
    .filter((p) => p.projectId === project.id && p.status === "Submitted").length;
  if (pending > 0) lines.push(`  (${pending} proposal(s) awaiting review — see "loxora inbox")`);
  return lines.join("\n");
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
