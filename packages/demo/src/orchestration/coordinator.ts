import {
  ContextPackageService,
  CrossProjectImpactService,
  LifecycleService,
  NavigationService,
  PlannedKnowledgeService,
  ReviewInboxService,
  type ContextPackage,
  type Clock,
  type EvidenceReferenceId,
  type IdGenerator,
  type ImpactAssessmentId,
  type NodeId,
  type PlannedKnowledgeId,
  type ProjectId,
  type ProposalId,
  type RollbackEventId,
} from "@loxora/core";
import { openSqliteStore } from "@loxora/sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DEMO_STAGES, type DemoStage, type RuntimeState } from "../shared/contracts.js";
import { fixtureText, loadManifest, type DemoManifest } from "./manifest.js";

type Store = Awaited<ReturnType<typeof openSqliteStore>>;

class DeterministicIds implements IdGenerator {
  private count = 1;
  public next(): string {
    return `90000000-0000-4000-8000-${String(this.count++).padStart(12, "0")}`;
  }
}
class FixtureClock {
  private tick = 0;
  public now(): string {
    return new Date(Date.UTC(2026, 6, 15, 9, 0, this.tick++)).toISOString();
  }
}

export interface DemoStatus {
  readonly fixtureVersion: string;
  readonly stage: DemoStage;
  readonly databaseConnected: boolean;
  readonly highestMigrationId: string;
  readonly projects: readonly { id: string; name: string; nodeId: string; freshness: unknown }[];
  readonly availableActions: readonly string[];
  readonly mcpReady: boolean;
  readonly lastFailure: string | null;
  readonly currentImpact: unknown;
  readonly historicalV2Impact: unknown;
}

export class DemoCoordinator {
  public readonly manifest: DemoManifest = loadManifest();
  public readonly dataDirectory = resolve(process.cwd(), "var", "demo");
  public readonly databasePath = resolve(this.dataDirectory, "loxora-demo.sqlite");
  public readonly runtimePath = resolve(this.dataDirectory, "runtime.json");
  public readonly contextRequestPath = resolve(this.dataDirectory, "last-context-request.json");
  public readonly proofPath = resolve(this.dataDirectory, "mcp-proof.json");
  private store: Store | null = null;
  private resetting = false;
  private lastFailure: string | null = null;

  public async open(): Promise<void> {
    mkdirSync(this.dataDirectory, { recursive: true });
    if (!existsSync(this.databasePath)) throw new Error("Demo database is missing; run demo:reset");
    this.store = await openSqliteStore(this.databasePath);
  }
  public async close(): Promise<void> {
    if (this.store) await this.store.close();
    this.store = null;
  }

  public async reset(stage: DemoStage = "Prepared"): Promise<DemoStatus> {
    if (this.resetting) throw new Error("DemoResetInProgress");
    this.resetting = true;
    const next = `${this.databasePath}.next`;
    const previous = `${this.databasePath}.previous`;
    try {
      await this.close();
      removeSqliteFiles(next);
      const candidate = await openSqliteStore(next);
      const seeded = new SeedSession(candidate, this.manifest);
      await seeded.seedPrepared();
      await seeded.advance(stage === "Complete" ? "V3Restored" : stage);
      await seeded.rebuild();
      const validation = await seeded.validate(stage === "Complete" ? "V3Restored" : stage);
      if (!validation) throw new Error("Candidate demo database did not reach the requested stage");
      const runtime: RuntimeState = {
        fixtureVersion: this.manifest.fixtureVersion,
        artifactIds: seeded.artifactIds,
        lastAction: `reset:${stage}`,
        parity: null,
      };
      await candidate.close();
      removeSqliteFiles(previous);
      if (existsSync(this.databasePath)) renameSync(this.databasePath, previous);
      try {
        renameSync(next, this.databasePath);
      } catch (error) {
        if (existsSync(previous)) renameSync(previous, this.databasePath);
        throw error;
      }
      removeSqliteFiles(previous);
      rmSync(this.proofPath, { force: true });
      rmSync(this.contextRequestPath, { force: true });
      this.writeRuntime(runtime);
      await this.open();
      this.lastFailure = null;
      this.resetting = false;
      return this.status();
    } catch (error) {
      if (process.env.LOXORA_DEMO_DEBUG === "1" && error instanceof Error) {
        process.stderr.write(`${error.stack ?? error.message}\n`);
      }
      removeSqliteFiles(next);
      this.lastFailure = sanitize(error);
      if (/locked|busy|eperm|access/i.test(this.lastFailure)) {
        this.lastFailure = `${this.lastFailure}. Stop external MCP readers before retrying`;
      }
      if (existsSync(this.databasePath) && !this.store) await this.open();
      throw new Error(`Demo reset failed; previous database preserved. ${this.lastFailure}`);
    } finally {
      this.resetting = false;
    }
  }

  public async status(): Promise<DemoStatus> {
    const store = this.requiredStore();
    const lifecycle = new LifecycleService(store);
    const navigation = new NavigationService(store);
    const stage = await this.deriveStage();
    const projects = await Promise.all(
      Object.values(this.manifest.projects).map(async (project) => ({
        id: project.id,
        name: project.name,
        nodeId: project.nodeId,
        freshness:
          (await navigation.getProjectMap({ projectId: project.id as ProjectId }))?.freshness ??
          null,
      })),
    );
    const access = {
      readableProjectIds: [this.portal.id as ProjectId, this.identity.id as ProjectId],
    };
    const currentImpact =
      (
        await this.impact().getProjectDependencies({
          projectId: this.portal.id as ProjectId,
          direction: "Outgoing",
          access,
        })
      )[0] ?? null;
    const historicalV2Impact = await this.impact().getImpactPath({
      assessmentId: this.manifest.artifacts.v2Assessment as ImpactAssessmentId,
      access,
    });
    void lifecycle;
    return Object.freeze({
      fixtureVersion: this.manifest.fixtureVersion,
      stage,
      databaseConnected: true,
      highestMigrationId: "005_planned_knowledge",
      projects: Object.freeze(projects),
      availableActions: Object.freeze(actions(stage)),
      mcpReady: existsSync(resolve(process.cwd(), "packages", "mcp", "dist", "src", "server.js")),
      lastFailure: this.lastFailure,
      currentImpact,
      historicalV2Impact,
    });
  }

  public async reviewKnowledge(
    proposalId: string,
    decision: "Accepted" | "Rejected",
    reviewerId: string,
    reason: string,
  ) {
    const store = this.requiredStore();
    const inbox = await new ReviewInboxService(store).getReviewInbox({
      projectIds: Object.values(this.manifest.projects).map((p) => p.id as ProjectId),
    });
    const item = inbox.find(
      (entry) => entry.kind === "KnowledgeProposal" && entry.id === proposalId,
    );
    if (!item || !item.proposal) throw new Error("Submitted knowledge Proposal was not found");
    const result = await new LifecycleService(store).reviewKnowledgeProposal({
      proposalId: proposalId as ProposalId,
      projectId: item.proposal.projectId,
      reviewerId,
      decision,
      reason,
      evidenceReferenceIds: item.proposal.evidenceReferenceIds,
    });
    this.mergeArtifacts(
      { [`revision:${proposalId}`]: result.revision?.id ?? "rejected" },
      "review-knowledge",
    );
    if (decision === "Accepted") {
      await this.resume();
      if (result.proposal.kind === "Restoration") await this.assessImpact();
    }
    return result;
  }

  public async reviewRelationship(
    proposalId: string,
    decision: "Accepted" | "Rejected",
    reviewerId: string,
    reason: string,
  ) {
    const store = this.requiredStore();
    const inbox = await new ReviewInboxService(store).getReviewInbox({
      projectIds: Object.values(this.manifest.projects).map((p) => p.id as ProjectId),
    });
    const item = inbox.find(
      (entry) => entry.kind === "CrossProjectRelationshipProposal" && entry.id === proposalId,
    );
    if (!item || !item.relationshipProposal)
      throw new Error("Submitted relationship Proposal was not found");
    const result = await this.impact().reviewCrossProjectRelationshipProposal({
      proposalId: item.relationshipProposal.id,
      reviewerId,
      decision,
      reason,
      evidence: item.relationshipProposal.evidence,
    });
    if (result.relationship)
      this.mergeArtifacts({ relationship: result.relationship.id }, "review-relationship");
    if (decision === "Accepted") await this.resume();
    return result;
  }

  public async assessImpact(): Promise<unknown> {
    const store = this.requiredStore();
    const dependency = (
      await this.impact().getProjectDependencies({
        projectId: this.portal.id as ProjectId,
        direction: "Outgoing",
        access: {
          readableProjectIds: [this.portal.id as ProjectId, this.identity.id as ProjectId],
        },
      })
    )[0];
    if (!dependency) throw new Error("Accepted dependency was not found");
    const current = await new LifecycleService(store).getCurrentKnowledge({
      projectId: this.identity.id as ProjectId,
      nodeId: this.identity.nodeId as NodeId,
    });
    if (!current) throw new Error("Provider Current was not found");
    const restoration = current.revisionRole === "Restoration";
    const assessment = await this.impact().assessRevisionImpact({
      id: this.manifest.artifacts[
        restoration ? "v3Assessment" : "v2Assessment"
      ] as ImpactAssessmentId,
      relationshipId: dependency.relationship.id,
      providerRevisionId: current.revision.id,
      evidence: restoration
        ? [this.qe("identity.v3-restoration"), this.qe("portal.requirement")]
        : [this.qe("identity.v2-proposal"), this.qe("portal.401")],
      facts: restoration
        ? {
            changeCompatibility: "Compatible",
            consumerRequirement: "Required",
            operationalCriticality: "Normal",
            observedFailure: false,
            changeSummary: "V3 restores customer_id",
            consumerConstraint: "Token Parser requires customer_id",
            consequence: "Authentication compatibility restored",
          }
        : {
            changeCompatibility: "Breaking",
            consumerRequirement: "Required",
            operationalCriticality: "Normal",
            observedFailure: true,
            changeSummary: "V2 removes customer_id for subject_id",
            consumerConstraint: "Token Parser requires customer_id",
            consequence: "Authentication rejects the token with HTTP 401",
          },
      requestingActorId: this.manifest.reviewer,
    });
    this.mergeArtifacts(
      { [restoration ? "v3Assessment" : "v2Assessment"]: assessment.id },
      "assess-impact",
    );
    await this.rebuild();
    return assessment;
  }

  public async recordRollback(): Promise<unknown> {
    const lifecycle = new LifecycleService(this.requiredStore());
    const history = await lifecycle.getKnowledgeHistory({
      projectId: this.identity.id as ProjectId,
      nodeId: this.identity.nodeId as NodeId,
    });
    if (!history || history.entries.length < 2) throw new Error("V1/V2 History is required");
    const semanticSource = history.entries[0];
    if (!semanticSource) throw new Error("V1 semantic source is missing");
    const result = await lifecycle.recordRollback({
      id: this.manifest.artifacts.rollbackEvent as RollbackEventId,
      projectId: this.identity.id as ProjectId,
      nodeId: this.identity.nodeId as NodeId,
      revertedRevisionId: history.currentRevisionId,
      semanticSourceRevisionId: semanticSource.revision.id,
      actorId: this.manifest.reviewer,
      reason: "customer-portal rejects V2 tokens because customer_id is absent",
      evidenceReferenceIds: [
        this.evidence("identity.rollback"),
        this.evidence("portal.401"),
      ].filter((id) => id.startsWith("12")) as EvidenceReferenceId[],
    });
    this.mergeArtifacts({ rollbackEvent: result.rollbackEvent.id }, "rollback");
    await this.resume();
    return result;
  }

  public async resume(): Promise<DemoStatus> {
    const session = new SeedSession(
      this.requiredStore(),
      this.manifest,
      this.readRuntime().artifactIds,
      false,
    );
    await session.resumeOne();
    this.mergeArtifacts(session.artifactIds, "resume");
    await this.rebuild();
    return this.status();
  }

  public async buildContextPackage(input?: Record<string, unknown>): Promise<ContextPackage> {
    const transportRequest = input ?? {
      projectId: this.portal.id,
      focusNodeIds: [this.portal.nodeId],
      temporalViews: ["Current"],
      includeRelatedProjects: true,
      relationshipTypes: ["DependsOn"],
      maxDependencyDepth: 1,
      taskLabel: "Update customer-portal authentication safely",
      estimatedTokenBudget: 12000,
    };
    const { readableProjectIds, revealRestrictedProjectIds, ...mcpRequest } =
      transportRequest as Record<string, unknown>;
    const result = await new ContextPackageService(this.requiredStore()).buildContextPackage({
      ...mcpRequest,
      visibility: {
        readableProjectIds: (readableProjectIds as string[] | undefined) ?? [
          this.portal.id,
          this.identity.id,
        ],
        revealRestrictedProjectIds: (revealRestrictedProjectIds as boolean | undefined) ?? false,
      },
    } as never);
    writeFileSync(this.contextRequestPath, JSON.stringify(mcpRequest, null, 2));
    this.mergeArtifacts({ lastContextFingerprint: result.fingerprint }, "context-package");
    return result;
  }

  public services() {
    const store = this.requiredStore();
    return {
      lifecycle: new LifecycleService(store),
      navigation: new NavigationService(store),
      plans: new PlannedKnowledgeService(store),
      inbox: new ReviewInboxService(store),
      impact: this.impact(),
    };
  }

  private async deriveStage(): Promise<DemoStage> {
    const store = this.requiredStore();
    const lifecycle = new LifecycleService(store);
    const [identityCurrent, portalCurrent] = await Promise.all([
      lifecycle.getCurrentKnowledge({
        projectId: this.identity.id as ProjectId,
        nodeId: this.identity.nodeId as NodeId,
      }),
      lifecycle.getCurrentKnowledge({
        projectId: this.portal.id as ProjectId,
        nodeId: this.portal.nodeId as NodeId,
      }),
    ]);
    if (!identityCurrent || !portalCurrent) return "Prepared";
    const deps = await this.impact().getProjectDependencies({
      projectId: this.portal.id as ProjectId,
      direction: "Outgoing",
      access: { readableProjectIds: [this.portal.id as ProjectId, this.identity.id as ProjectId] },
    });
    if (deps.length === 0) return "V1Accepted";
    if (identityCurrent.revisionRole === "Initial") return "DependencyAccepted";
    if (identityCurrent.revisionRole === "Successor") {
      const rollback = await lifecycle.getRollbackEvent({
        projectId: this.identity.id as ProjectId,
        rollbackEventId: this.manifest.artifacts.rollbackEvent as RollbackEventId,
      });
      if (rollback) return "RollbackRecorded";
      const impact = await this.impact().getImpactPath({
        assessmentId: this.manifest.artifacts.v2Assessment as ImpactAssessmentId,
        access: {
          readableProjectIds: [this.portal.id as ProjectId, this.identity.id as ProjectId],
        },
      });
      return impact ? "ImpactAssessed" : "V2Accepted";
    }
    if (identityCurrent.revisionRole === "Restoration") {
      if (
        existsSync(this.proofPath) &&
        JSON.parse(readFileSync(this.proofPath, "utf8")).passed === true
      )
        return "Complete";
      return "V3Restored";
    }
    return "Prepared";
  }

  private async rebuild(): Promise<void> {
    const navigation = new NavigationService(this.requiredStore());
    for (const project of Object.values(this.manifest.projects))
      await navigation.rebuildNavigationProjection({
        projectId: project.id as ProjectId,
        actorId: this.manifest.reviewer,
      });
  }
  private impact(): CrossProjectImpactService {
    return new CrossProjectImpactService(this.requiredStore(), {
      mayAccept: (id) => id === this.manifest.reviewer,
    });
  }
  private requiredStore(): Store {
    if (this.resetting) throw new Error("DemoResetInProgress");
    if (!this.store) throw new Error("Demo database is unavailable");
    return this.store;
  }
  private get identity() {
    return this.manifest.projects.identity;
  }
  private get portal() {
    return this.manifest.projects.portal;
  }
  private evidence(alias: string): EvidenceReferenceId {
    return this.manifest.sources.find((s) => s.alias === alias)?.evidenceId as EvidenceReferenceId;
  }
  private qe(alias: string) {
    const source = this.manifest.sources.find((s) => s.alias === alias);
    if (!source) throw new Error("Fixture Evidence missing");
    return {
      projectId: this.manifest.projects[source.project].id as ProjectId,
      evidenceReferenceId: source.evidenceId as EvidenceReferenceId,
    };
  }
  private readRuntime(): RuntimeState {
    return existsSync(this.runtimePath)
      ? JSON.parse(readFileSync(this.runtimePath, "utf8"))
      : {
          fixtureVersion: this.manifest.fixtureVersion,
          artifactIds: {},
          lastAction: "unknown",
          parity: null,
        };
  }
  private writeRuntime(runtime: RuntimeState): void {
    writeFileSync(this.runtimePath, JSON.stringify(runtime, null, 2));
  }
  private mergeArtifacts(ids: Record<string, string>, action: string): void {
    const runtime = this.readRuntime();
    this.writeRuntime({
      ...runtime,
      artifactIds: { ...runtime.artifactIds, ...ids },
      lastAction: action,
    });
  }
}

class SeedSession {
  public readonly artifactIds: Record<string, string>;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly lifecycle: LifecycleService;
  private readonly navigation: NavigationService;
  private readonly plans: PlannedKnowledgeService;
  private readonly impact: CrossProjectImpactService;
  public constructor(
    private readonly store: Store,
    private readonly manifest: DemoManifest,
    existing: Record<string, string> = {},
    deterministic = true,
  ) {
    this.artifactIds = { ...existing };
    this.ids = deterministic ? new DeterministicIds() : { next: () => randomUUID() };
    this.clock = deterministic ? new FixtureClock() : { now: () => new Date().toISOString() };
    this.lifecycle = new LifecycleService(store, this.ids, this.clock);
    this.navigation = new NavigationService(store, this.ids, this.clock);
    this.plans = new PlannedKnowledgeService(store, this.ids, this.clock);
    this.impact = new CrossProjectImpactService(
      store,
      { mayAccept: (id) => id === manifest.reviewer },
      this.ids,
      this.clock,
    );
  }
  public async seedPrepared(): Promise<void> {
    for (const key of ["identity", "portal"] as const) {
      const p = this.manifest.projects[key];
      await this.lifecycle.createProject({
        id: p.id as ProjectId,
        name: p.name,
        purpose: p.purpose,
        actorId: this.manifest.reviewer,
      });
      await this.lifecycle.createKnowledgeSpace({
        id: p.spaceId as never,
        projectId: p.id as ProjectId,
        name: p.space,
        description: p.spaceDescription,
        actorId: this.manifest.reviewer,
      });
      await this.lifecycle.createKnowledgeCollection({
        id: p.collectionId as never,
        projectId: p.id as ProjectId,
        spaceId: p.spaceId as never,
        name: p.collection,
        description: p.collectionDescription,
        actorId: this.manifest.reviewer,
      });
    }
    for (const item of this.manifest.sources) {
      const project = this.manifest.projects[item.project];
      await this.lifecycle.registerSourceReference({
        id: item.id as never,
        projectId: project.id as ProjectId,
        kind: item.path.endsWith(".ts") ? "source" : "document",
        locator: `fixture://${this.manifest.fixtureVersion}/${item.path}`,
        title: item.title,
        actorId: this.manifest.reviewer,
      });
      await this.lifecycle.registerEvidenceReference({
        id: item.evidenceId as EvidenceReferenceId,
        projectId: project.id as ProjectId,
        sourceReferenceId: item.id as never,
        summary: item.summary,
        locator: `fixture://${this.manifest.fixtureVersion}/${item.path}`,
        actorId: this.manifest.reviewer,
      });
    }
    await this.lifecycle.submitKnowledgeProposal({
      id: this.manifest.artifacts.identityV1Proposal as ProposalId,
      projectId: this.identity.id as ProjectId,
      spaceId: this.identity.spaceId as never,
      collectionId: this.identity.collectionId as never,
      proposedNodeId: this.identity.nodeId as NodeId,
      proposedNodeTitle: this.identity.node,
      proposedContent: fixtureText("identity-contract/token-contract-v1.md"),
      sourceReferenceIds: [this.source("identity.v1-contract")],
      evidenceReferenceIds: [this.evidence("identity.v1-contract")],
      proposerId: "identity-maintainer",
    });
    await this.lifecycle.submitKnowledgeProposal({
      id: this.manifest.artifacts.portalV1Proposal as ProposalId,
      projectId: this.portal.id as ProjectId,
      spaceId: this.portal.spaceId as never,
      collectionId: this.portal.collectionId as never,
      proposedNodeId: this.portal.nodeId as NodeId,
      proposedNodeTitle: this.portal.node,
      proposedContent: `${fixtureText("customer-portal/token-parser.ts")}\n\n${fixtureText("customer-portal/customer-id-requirement.md")}`,
      sourceReferenceIds: [this.source("portal.parser"), this.source("portal.requirement")],
      evidenceReferenceIds: [this.evidence("portal.parser"), this.evidence("portal.requirement")],
      proposerId: "portal-maintainer",
    });
  }
  public async advance(target: DemoStage): Promise<void> {
    const index = DEMO_STAGES.indexOf(target);
    if (index >= 1) {
      await this.acceptKnowledge(this.artifact("identityV1Proposal"));
      await this.acceptKnowledge(this.artifact("portalV1Proposal"));
      await this.resumeOne();
    }
    if (index >= 2) {
      await this.acceptRelationship();
      await this.resumeOne();
    }
    if (index >= 3) {
      await this.acceptKnowledge(this.artifact("v2Proposal"));
    }
    if (index >= 4) await this.assess(false);
    if (index >= 5) {
      await this.rollback();
      await this.resumeOne();
    }
    if (index >= 6) {
      await this.acceptKnowledge(this.artifact("v3Proposal"));
      await this.assess(true);
    }
  }
  public async resumeOne(): Promise<void> {
    const [i, p] = await Promise.all([
      this.lifecycle.getCurrentKnowledge({
        projectId: this.identity.id as ProjectId,
        nodeId: this.identity.nodeId as NodeId,
      }),
      this.lifecycle.getCurrentKnowledge({
        projectId: this.portal.id as ProjectId,
        nodeId: this.portal.nodeId as NodeId,
      }),
    ]);
    if (i && p) {
      const deps = await this.impact.getProjectDependencies({
        projectId: this.portal.id as ProjectId,
        direction: "Outgoing",
        access: {
          readableProjectIds: [this.portal.id as ProjectId, this.identity.id as ProjectId],
        },
      });
      const inbox = await new ReviewInboxService(this.store).getReviewInbox({
        projectIds: [this.identity.id as ProjectId, this.portal.id as ProjectId],
      });
      if (deps.length === 0 && !inbox.some((x) => x.kind === "CrossProjectRelationshipProposal")) {
        const proposal = await this.impact.submitCrossProjectRelationshipProposal({
          id: this.manifest.artifacts.relationshipProposal as never,
          sourceProjectId: this.portal.id as ProjectId,
          sourceNodeId: this.portal.nodeId as NodeId,
          targetProjectId: this.identity.id as ProjectId,
          targetNodeId: this.identity.nodeId as NodeId,
          evidence: [this.qe("portal.dependency"), this.qe("identity.v1-contract")],
          confidence: "High",
          reason: "Token Parser consumes the shared Token Format",
          visibility: "SharedBetweenProjects",
          proposerId: "portal-maintainer",
        });
        this.artifactIds.relationshipProposal = proposal.id;
        return;
      }
      if (
        deps.length &&
        i.revisionRole === "Initial" &&
        !inbox.some((x) => x.kind === "KnowledgeProposal" && x.proposal?.kind === "Successor")
      ) {
        const proposal = await this.lifecycle.submitSuccessorProposal({
          id: this.manifest.artifacts.v2Proposal as ProposalId,
          projectId: this.identity.id as ProjectId,
          nodeId: this.identity.nodeId as NodeId,
          expectedCurrentRevisionId: i.revision.id,
          proposedContent: fixtureText("identity-contract/token-contract-v2-proposal.md"),
          sourceReferenceIds: [
            this.source("identity.v2-proposal"),
            this.source("identity.v2-decision"),
          ],
          evidenceReferenceIds: [
            this.evidence("identity.v2-proposal"),
            this.evidence("identity.v2-decision"),
          ],
          proposerId: "identity-maintainer",
          changeReason: "Adopt subject_id terminology",
        });
        this.artifactIds.v2Proposal = proposal.id;
        return;
      }
    }
    const rollback = await this.lifecycle.getRollbackEvent({
      projectId: this.identity.id as ProjectId,
      rollbackEventId: this.manifest.artifacts.rollbackEvent as RollbackEventId,
    });
    if (rollback) {
      const existing = await this.plans.getPlannedKnowledge({
        ownerProjectId: this.portal.id as ProjectId,
        plannedKnowledgeId: this.manifest.artifacts.planned as PlannedKnowledgeId,
      });
      if (!existing) {
        await this.plans.createPlannedKnowledge({
          id: this.manifest.artifacts.planned as PlannedKnowledgeId,
          ownerProjectId: this.portal.id as ProjectId,
          relatedProjectId: this.identity.id as ProjectId,
          relatedNodes: [
            { projectId: this.portal.id as ProjectId, nodeId: this.portal.nodeId as NodeId },
            { projectId: this.identity.id as ProjectId, nodeId: this.identity.nodeId as NodeId },
          ],
          title: "Deferred subject_id migration",
          description: fixtureText("customer-portal/deferred-subject-id-migration.md"),
          status: "Deferred",
          reason: "V2 caused authentication rejection",
          blockingCondition:
            "Token Parser supports subject_id mapping and compatibility tests pass",
          evidence: [this.qe("portal.deferred-plan"), this.qe("portal.401")],
          authorId: "portal-maintainer",
          relatedRevision: {
            projectId: this.identity.id as ProjectId,
            revisionId: rollback.revertedRevisionId,
          },
        });
      }
      const inbox = await new ReviewInboxService(this.store).getReviewInbox({
        projectIds: [this.identity.id as ProjectId],
      });
      const identityCurrent = await this.lifecycle.getCurrentKnowledge({
        projectId: this.identity.id as ProjectId,
        nodeId: this.identity.nodeId as NodeId,
      });
      if (
        identityCurrent?.revision.id === rollback.revertedRevisionId &&
        !inbox.some((x) => x.kind === "KnowledgeProposal" && x.proposal?.kind === "Restoration")
      ) {
        await this.lifecycle.submitRestorationProposal({
          id: this.manifest.artifacts.v3Proposal as ProposalId,
          projectId: this.identity.id as ProjectId,
          rollbackEventId: rollback.id,
          proposedContent: fixtureText("identity-contract/token-contract-v3-restoration.md"),
          sourceReferenceIds: [
            this.source("identity.v3-restoration"),
            this.source("identity.rollback"),
          ],
          evidenceReferenceIds: [
            this.evidence("identity.v3-restoration"),
            this.evidence("identity.rollback"),
          ],
          proposerId: "identity-maintainer",
          changeReason: "Restore customer_id compatibility",
        });
      }
    }
  }
  public async rebuild(): Promise<void> {
    for (const p of Object.values(this.manifest.projects))
      await this.navigation.rebuildNavigationProjection({
        projectId: p.id as ProjectId,
        actorId: this.manifest.reviewer,
      });
  }
  public async validate(stage: DemoStage): Promise<boolean> {
    const current = await this.lifecycle.getCurrentKnowledge({
      projectId: this.identity.id as ProjectId,
      nodeId: this.identity.nodeId as NodeId,
    });
    if (stage === "Prepared") return current === null;
    if (!current) return false;
    if (DEMO_STAGES.indexOf(stage) >= 6) return current.revisionRole === "Restoration";
    if (DEMO_STAGES.indexOf(stage) >= 3) return current.revisionRole === "Successor";
    return true;
  }
  private async acceptKnowledge(id: string): Promise<void> {
    const inbox = await new ReviewInboxService(this.store).getReviewInbox({
      projectIds: [this.identity.id as ProjectId, this.portal.id as ProjectId],
    });
    const item = inbox.find((x) => x.kind === "KnowledgeProposal" && x.id === id);
    if (!item?.proposal) return;
    const result = await this.lifecycle.reviewKnowledgeProposal({
      proposalId: id as ProposalId,
      projectId: item.proposal.projectId,
      reviewerId: this.manifest.reviewer,
      decision: "Accepted",
      reason: `Accepted ${item.proposal.kind} for demo`,
      evidenceReferenceIds: item.proposal.evidenceReferenceIds,
    });
    if (result.revision) this.artifactIds[`revision:${id}`] = result.revision.id;
  }
  private async acceptRelationship(): Promise<void> {
    const inbox = await new ReviewInboxService(this.store).getReviewInbox({
      projectIds: [this.identity.id as ProjectId, this.portal.id as ProjectId],
    });
    const item = inbox.find((x) => x.kind === "CrossProjectRelationshipProposal");
    if (!item?.relationshipProposal) return;
    const result = await this.impact.reviewCrossProjectRelationshipProposal({
      proposalId: item.relationshipProposal.id,
      reviewerId: this.manifest.reviewer,
      decision: "Accepted",
      reason: "Evidence confirms dependency",
      evidence: item.relationshipProposal.evidence,
    });
    if (result.relationship) this.artifactIds.relationship = result.relationship.id;
  }
  private async assess(restoration: boolean): Promise<void> {
    const deps = await this.impact.getProjectDependencies({
      projectId: this.portal.id as ProjectId,
      direction: "Outgoing",
      access: { readableProjectIds: [this.portal.id as ProjectId, this.identity.id as ProjectId] },
    });
    const current = await this.lifecycle.getCurrentKnowledge({
      projectId: this.identity.id as ProjectId,
      nodeId: this.identity.nodeId as NodeId,
    });
    if (!deps[0] || !current) return;
    const result = await this.impact.assessRevisionImpact({
      id: this.manifest.artifacts[
        restoration ? "v3Assessment" : "v2Assessment"
      ] as ImpactAssessmentId,
      relationshipId: deps[0].relationship.id,
      providerRevisionId: current.revision.id,
      evidence: restoration
        ? [this.qe("identity.v3-restoration"), this.qe("portal.requirement")]
        : [this.qe("identity.v2-proposal"), this.qe("portal.401")],
      facts: restoration
        ? {
            changeCompatibility: "Compatible",
            consumerRequirement: "Required",
            operationalCriticality: "Normal",
            observedFailure: false,
            changeSummary: "V3 restores customer_id",
            consumerConstraint: "Parser requires customer_id",
            consequence: "Compatible",
          }
        : {
            changeCompatibility: "Breaking",
            consumerRequirement: "Required",
            operationalCriticality: "Normal",
            observedFailure: true,
            changeSummary: "V2 replaces customer_id",
            consumerConstraint: "Parser requires customer_id",
            consequence: "HTTP 401",
          },
      requestingActorId: this.manifest.reviewer,
    });
    this.artifactIds[restoration ? "v3Assessment" : "v2Assessment"] = result.id;
  }
  private async rollback(): Promise<void> {
    const history = await this.lifecycle.getKnowledgeHistory({
      projectId: this.identity.id as ProjectId,
      nodeId: this.identity.nodeId as NodeId,
    });
    if (!history) return;
    const semanticSource = history.entries[0];
    if (!semanticSource) throw new Error("V1 semantic source is missing");
    await this.lifecycle.recordRollback({
      id: this.manifest.artifacts.rollbackEvent as RollbackEventId,
      projectId: this.identity.id as ProjectId,
      nodeId: this.identity.nodeId as NodeId,
      revertedRevisionId: history.currentRevisionId,
      semanticSourceRevisionId: semanticSource.revision.id,
      actorId: this.manifest.reviewer,
      reason: "V2 breaks customer-portal authentication",
      evidenceReferenceIds: [this.evidence("identity.rollback")],
    });
  }
  private get identity() {
    return this.manifest.projects.identity;
  }
  private artifact(key: string): string {
    const id = this.manifest.artifacts[key];
    if (!id) throw new Error(`Fixture artifact ${key} is missing`);
    return id;
  }
  private get portal() {
    return this.manifest.projects.portal;
  }
  private source(alias: string) {
    return this.manifest.sources.find((s) => s.alias === alias)?.id as never;
  }
  private evidence(alias: string) {
    return this.manifest.sources.find((s) => s.alias === alias)?.evidenceId as EvidenceReferenceId;
  }
  private qe(alias: string) {
    const s = this.manifest.sources.find((x) => x.alias === alias);
    if (!s) throw new Error("Fixture alias missing");
    return {
      projectId: this.manifest.projects[s.project].id as ProjectId,
      evidenceReferenceId: s.evidenceId as EvidenceReferenceId,
    };
  }
}

function actions(stage: DemoStage): string[] {
  switch (stage) {
    case "Prepared":
      return ["Review V1 proposals"];
    case "V1Accepted":
      return ["Review DependsOn"];
    case "DependencyAccepted":
      return ["Review V2"];
    case "V2Accepted":
      return ["Assess V2 impact"];
    case "ImpactAssessed":
      return ["Record rollback"];
    case "RollbackRecorded":
      return ["Review V3 restoration"];
    case "V3Restored":
      return ["Build Context Package", "Run MCP proof"];
    default:
      return ["Reset to Prepared"];
  }
}
function sanitize(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/[A-Z]:\\[^\s]+/g, "[path]")
    : "Unexpected demo failure";
}

function removeSqliteFiles(path: string): void {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    rmSync(candidate, { force: true });
  }
}
