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
import {
  DEMO_STAGES,
  GUIDED_PHASES,
  GUIDED_STEPS,
  type ContextNarrative,
  type DemoAction,
  type DemoActionId,
  type DemoResultReceipt,
  type DemoStage,
  type GuidedDemoState,
  type RuntimeState,
  type TemporalReviewReceipt,
} from "../shared/contracts.js";
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
  readonly projects: readonly {
    id: string;
    name: string;
    purpose: string;
    nodeId: string;
    nodeTitle: string;
    plannedKnowledgeCount: number;
    freshness: unknown;
    relationship: {
      direction: "DependsOn" | "DependedOnBy";
      severity: string | null;
      relationshipBindingFreshness: string;
      assessmentFreshness: string | null;
      endpointLabel: string;
    } | null;
  }[];
  readonly availableActions: readonly DemoAction[];
  readonly guided: GuidedDemoState;
  readonly preparedContextRequest: Readonly<Record<string, unknown>>;
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
        lastResult: null,
        temporalReview: null,
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
    const maps = await Promise.all(
      Object.values(this.manifest.projects).map((project) =>
        navigation.getProjectMap({ projectId: project.id as ProjectId }),
      ),
    );
    const projects = Object.values(this.manifest.projects).map((project, index) => {
      const map = maps[index];
      const relation = map?.outgoingDependencies[0] ?? map?.incomingDependents[0] ?? null;
      return {
        id: project.id,
        name: project.name,
        purpose: map?.purpose ?? project.purpose,
        nodeId: project.nodeId,
        nodeTitle: project.node,
        plannedKnowledgeCount: map?.plannedKnowledgeCount ?? 0,
        freshness: map?.freshness ?? null,
        relationship: relation
          ? {
              direction: relation.direction,
              severity: relation.latestSeverity,
              relationshipBindingFreshness: relation.relationshipBindingFreshness,
              assessmentFreshness: relation.assessmentFreshness,
              endpointLabel:
                relation.endpointPath?.segments.map((segment) => segment.label).join(" / ") ??
                "Restricted endpoint",
            }
          : null,
      };
    });
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
    const guided = await this.guidedState(stage);
    void lifecycle;
    return Object.freeze({
      fixtureVersion: this.manifest.fixtureVersion,
      stage,
      databaseConnected: true,
      highestMigrationId: "005_planned_knowledge",
      projects: Object.freeze(projects),
      availableActions: guided.availableActions,
      guided,
      preparedContextRequest: Object.freeze(this.defaultContextRequest()),
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
      await this.resumeAfterCanonicalTransition();
      if (result.proposal.kind === "Restoration") await this.assessImpact(false);
    }
    await this.recordReceipt(
      result.proposal.kind === "Successor"
        ? "review-v2"
        : result.proposal.kind === "Restoration"
          ? "review-v3"
          : "review-v1",
      decision === "Accepted" ? [result.revision?.id ?? ""] : [],
      decision,
    );
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
    if (decision === "Accepted") await this.resumeAfterCanonicalTransition();
    await this.recordReceipt(
      "review-dependency",
      result.relationship ? [result.relationship.id] : [],
      decision,
    );
    return result;
  }

  public async assessImpact(recordReceipt = true): Promise<unknown> {
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
    if (recordReceipt) await this.recordReceipt("assess-impact", [assessment.id]);
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
    await this.resumeAfterCanonicalTransition();
    await this.recordReceipt("record-rollback", [result.rollbackEvent.id]);
    return result;
  }

  public async resume(): Promise<DemoStatus> {
    await this.prepareNextArtifact();
    this.lastFailure = null;
    return this.status();
  }

  public async confirmTemporalReview(): Promise<DemoStatus> {
    const receipt = await this.currentTemporalReviewReceipt();
    if (!receipt) throw new Error("Current, History, and Planned knowledge are not ready");
    const runtime = this.readRuntime();
    this.writeRuntime({
      ...runtime,
      lastAction: "confirm-temporal-review",
      temporalReview: receipt,
      lastResult: {
        fixtureVersion: this.manifest.fixtureVersion,
        actionId: "confirm-temporal-review",
        stage: "V3Restored",
        title: "Temporal views confirmed",
        message:
          "Currently valid knowledge, earlier versions, and the planned migration remain explicitly separate.",
        facts: [
          { label: "Currently valid", value: "V3 restoration" },
          { label: "Earlier versions", value: "V1 → V2 → V3" },
          { label: "Planned change", value: "Deferred subject_id migration" },
        ],
        artifactIds: [...receipt.revisionIds, receipt.plannedKnowledgeId],
        tone: "Success",
      },
    });
    return this.status();
  }

  private async prepareNextArtifact(): Promise<void> {
    const session = new SeedSession(
      this.requiredStore(),
      this.manifest,
      this.readRuntime().artifactIds,
      false,
    );
    await session.resumeOne();
    this.mergeArtifacts(session.artifactIds, "resume");
    await this.rebuild();
  }

  private async resumeAfterCanonicalTransition(): Promise<void> {
    try {
      await this.prepareNextArtifact();
      this.lastFailure = null;
    } catch (error) {
      this.lastFailure = `Next artifact preparation failed: ${sanitize(error)}`;
    }
  }

  public async buildContextPackage(input?: Record<string, unknown>): Promise<ContextPackage> {
    const transportRequest = input ?? this.defaultContextRequest();
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
    await this.recordReceipt("build-context", [result.fingerprint]);
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

  private defaultContextRequest(): Record<string, unknown> {
    return {
      projectId: this.portal.id,
      focusNodeIds: [this.portal.nodeId],
      temporalViews: ["Current"],
      includeRelatedProjects: true,
      relationshipTypes: ["DependsOn"],
      maxDependencyDepth: 1,
      taskLabel: "Update customer-portal authentication safely",
      estimatedTokenBudget: 12000,
    };
  }

  private async guidedState(stage: DemoStage): Promise<GuidedDemoState> {
    const runtime = this.readRuntime();
    const contextReady =
      existsSync(this.contextRequestPath) && Boolean(runtime.artifactIds.lastContextFingerprint);
    const parity = existsSync(this.proofPath)
      ? (JSON.parse(readFileSync(this.proofPath, "utf8")) as { passed?: boolean }).passed === true
      : false;
    const temporalReviewComplete = await this.validateTemporalReview(
      runtime.temporalReview ?? null,
    );
    const lifecycle = new LifecycleService(this.requiredStore());
    const inbox = await new ReviewInboxService(this.requiredStore()).getReviewInbox({
      projectIds: [this.identity.id as ProjectId, this.portal.id as ProjectId],
    });
    const currents = await Promise.all([
      lifecycle.getCurrentKnowledge({
        projectId: this.identity.id as ProjectId,
        nodeId: this.identity.nodeId as NodeId,
      }),
      lifecycle.getCurrentKnowledge({
        projectId: this.portal.id as ProjectId,
        nodeId: this.portal.nodeId as NodeId,
      }),
    ]);
    const acceptedV1 = currents.filter(Boolean).length;
    const initialSubmitted = inbox.filter(
      (item) => item.kind === "KnowledgeProposal" && item.proposal?.kind === "Initial",
    ).length;
    let interrupted: string | null =
      stage === "Prepared" ? preparedInterruption(acceptedV1, initialSubmitted) : null;
    const configuration = guidedConfiguration(stage, temporalReviewComplete, contextReady, parity);
    if (!interrupted && configuration.requiresProposal) {
      const expected = configuration.requiresProposal;
      const exists = inbox.some((item) =>
        expected === "Relationship"
          ? item.kind === "CrossProjectRelationshipProposal"
          : item.kind === "KnowledgeProposal" && item.proposal?.kind === expected,
      );
      if (!exists)
        interrupted =
          "The next prepared artifact is missing. Resume preparation after revalidating canon.";
    }
    const state =
      parity && contextReady && temporalReviewComplete
        ? "Complete"
        : interrupted
          ? "Interrupted"
          : "Active";
    const actions = interrupted
      ? [action("resume", "Resume preparation", "/", "Mutation", "/api/demo/resume"), resetAction()]
      : configuration.actions;
    const primaryAction = interrupted ? actions[0] : configuration.actions[0];
    if (!primaryAction) throw new Error("Guided presentation has no primary action");
    const receipt = parity
      ? proofReceipt(this.manifest.fixtureVersion, stage, this.proofPath)
      : validateReceipt(runtime.lastResult ?? null, this.manifest.fixtureVersion, stage, runtime);
    const currentPhase =
      GUIDED_PHASES.find((phase) => phase.stepIds.includes(configuration.currentStepId)) ??
      GUIDED_PHASES[0];
    if (!currentPhase) throw new Error("Guided presentation has no phase");
    return Object.freeze({
      canonicalStage: stage,
      currentStepId: configuration.currentStepId,
      currentPhase,
      completedStepIds: Object.freeze(configuration.completedStepIds),
      availableStepIds: Object.freeze(configuration.availableStepIds),
      state,
      progressDetail:
        stage === "Prepared"
          ? `${acceptedV1} of 2 initial revisions accepted`
          : configuration.detail,
      primaryAction,
      secondaryAction: interrupted ? resetAction() : (configuration.actions[1] ?? null),
      availableActions: Object.freeze(actions),
      interruption: interrupted,
      contextReady,
      temporalReviewComplete,
      temporalReviewTarget: Object.freeze({
        historyProjectId: this.identity.id,
        historyNodeId: this.identity.nodeId,
        plannedProjectId: this.portal.id,
        plannedNodeId: this.portal.nodeId,
      }),
      contextNarrative: this.contextNarrative(),
      parityPassed: parity,
      lastResult: receipt,
    });
  }

  private contextNarrative(): ContextNarrative {
    return Object.freeze({
      task: "Update customer-portal authentication safely",
      summary:
        "Use Token Format V3 when updating the Token Parser. V2 remains preserved as an earlier version and is not included as currently valid guidance.",
      currentKnowledge: "Token Format V3 restoration and the current Token Parser requirement",
      affectedProjects: Object.freeze([this.portal.name, this.identity.name]),
      dependency: "Token Parser uses knowledge from Token Format",
      assessment: "The exact V3/consumer assessment reports compatible Low impact",
      historicalExclusion: "V1 and V2 remain traceable but are not Current instructions",
    });
  }

  private async currentTemporalReviewReceipt(): Promise<TemporalReviewReceipt | null> {
    const lifecycle = new LifecycleService(this.requiredStore());
    const [current, history, plans] = await Promise.all([
      lifecycle.getCurrentKnowledge({
        projectId: this.identity.id as ProjectId,
        nodeId: this.identity.nodeId as NodeId,
      }),
      lifecycle.getKnowledgeHistory({
        projectId: this.identity.id as ProjectId,
        nodeId: this.identity.nodeId as NodeId,
      }),
      new PlannedKnowledgeService(this.requiredStore()).getProjectPlans({
        projectId: this.portal.id as ProjectId,
        nodeId: this.portal.nodeId as NodeId,
      }),
    ]);
    const plan = plans.find(
      (entry) =>
        entry.id === (this.manifest.artifacts.planned as PlannedKnowledgeId) &&
        entry.status === "Deferred",
    );
    if (
      !current ||
      current.revisionRole !== "Restoration" ||
      !history ||
      history.entries.length !== 3 ||
      !plan
    )
      return null;
    const revisionIds = history.entries.map((entry) => entry.revision.id);
    if (
      !revisionIds[0] ||
      !revisionIds[1] ||
      !revisionIds[2] ||
      current.revision.id !== revisionIds[2]
    )
      return null;
    return Object.freeze({
      fixtureVersion: this.manifest.fixtureVersion,
      projectId: this.identity.id,
      nodeId: this.identity.nodeId,
      revisionIds: Object.freeze([revisionIds[0], revisionIds[1], revisionIds[2]]) as readonly [
        string,
        string,
        string,
      ],
      plannedKnowledgeId: plan.id,
      reviewedAt: new Date().toISOString(),
    });
  }

  private async validateTemporalReview(receipt: TemporalReviewReceipt | null): Promise<boolean> {
    if (
      !receipt ||
      receipt.fixtureVersion !== this.manifest.fixtureVersion ||
      receipt.projectId !== this.identity.id ||
      receipt.nodeId !== this.identity.nodeId
    )
      return false;
    const actual = await this.currentTemporalReviewReceipt();
    return temporalReviewMatches(receipt, actual);
  }

  private async recordReceipt(
    actionId: DemoActionId,
    artifactIds: readonly string[],
    decision: "Accepted" | "Rejected" = "Accepted",
  ): Promise<void> {
    const stage = await this.deriveStage();
    const copy = receiptCopy(actionId, decision);
    const runtime = this.readRuntime();
    this.writeRuntime({
      ...runtime,
      lastAction: actionId,
      lastResult: {
        fixtureVersion: this.manifest.fixtureVersion,
        actionId,
        stage,
        title: copy.title,
        message: copy.message,
        facts: copy.facts,
        artifactIds: Object.freeze(artifactIds.filter(Boolean)),
        tone: decision === "Rejected" ? "Warning" : "Success",
      },
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

interface GuidedConfiguration {
  readonly currentStepId: string;
  readonly completedStepIds: string[];
  readonly availableStepIds: string[];
  readonly detail: string;
  readonly actions: DemoAction[];
  readonly requiresProposal?: "Initial" | "Successor" | "Restoration" | "Relationship";
}

export function guidedConfiguration(
  stage: DemoStage,
  temporalReviewComplete: boolean,
  contextReady: boolean,
  parity: boolean,
): GuidedConfiguration {
  const ids = GUIDED_STEPS.map((step) => step.id);
  const step = (index: number, actions: DemoAction[], detail: string): GuidedConfiguration => ({
    currentStepId: ids[index] ?? ids[0] ?? "establish-knowledge",
    completedStepIds: ids.slice(0, index),
    availableStepIds: ids.slice(0, index + 1),
    detail,
    actions,
  });
  switch (stage) {
    case "Prepared":
      return {
        ...step(
          0,
          [action("review-v1", "Review the next V1 Proposal", "/reviews"), resetAction()],
          "Establish both V1 revisions",
        ),
        requiresProposal: "Initial",
      };
    case "V1Accepted":
      return {
        ...step(
          1,
          [
            action("review-dependency", "Review the DependsOn relationship", "/reviews"),
            resetAction(),
          ],
          "Both projects have Current V1 knowledge",
        ),
        requiresProposal: "Relationship",
      };
    case "DependencyAccepted":
      return {
        ...step(
          2,
          [action("review-v2", "Review breaking V2", "/reviews"), resetAction()],
          "The projects are connected",
        ),
        requiresProposal: "Successor",
      };
    case "V2Accepted":
      return step(
        3,
        [
          action(
            "assess-impact",
            "Create the High impact assessment",
            "/impact",
            "Mutation",
            "/api/demo/assess-impact",
          ),
          resetAction(),
        ],
        "V2 is Current and the relationship binding is Stale",
      );
    case "ImpactAssessed":
      return step(
        4,
        [
          action(
            "record-rollback",
            "Record the rollback",
            "/impact",
            "Mutation",
            "/api/demo/rollback",
          ),
          resetAction(),
        ],
        "The V2 compatibility impact is High",
      );
    case "RollbackRecorded":
      return {
        ...step(
          5,
          [action("review-v3", "Review restoration V3", "/reviews"), resetAction()],
          "Rollback is recorded; V2 remains Current until V3 is accepted",
        ),
        requiresProposal: "Restoration",
      };
    case "V3Restored":
      if (contextReady)
        return step(
          8,
          [action("view-mcp-proof", "Verify MCP parity", "/proof"), resetAction()],
          "Current Context is ready for the real MCP proof",
        );
      if (temporalReviewComplete)
        return step(
          7,
          [action("build-context", "Build the Current Context Package", "/context"), resetAction()],
          "Currently valid, earlier, and planned knowledge were compared",
        );
      return step(
        6,
        [
          action("inspect-temporal", "Compare Current, History, and Planned", "/guided/temporal"),
          resetAction(),
          action(
            "confirm-temporal-review",
            "Confirm the temporal separation",
            "/context",
            "Mutation",
            "/api/demo/temporal-reviewed",
          ),
        ],
        "Compatibility is restored through a new V3 Revision",
      );
    case "Complete":
      if (!temporalReviewComplete)
        return step(
          6,
          [
            action("inspect-temporal", "Compare Current, History, and Planned", "/guided/temporal"),
            resetAction(),
            action(
              "confirm-temporal-review",
              "Confirm the temporal separation",
              "/context",
              "Mutation",
              "/api/demo/temporal-reviewed",
            ),
          ],
          "Reconfirm temporal separation before using the prepared Context and proof",
        );
      if (!contextReady)
        return step(
          7,
          [action("build-context", "Build the Current Context Package", "/context"), resetAction()],
          "Currently valid, earlier, and planned knowledge were compared",
        );
      if (!parity)
        return step(
          8,
          [action("view-mcp-proof", "Verify MCP parity", "/proof"), resetAction()],
          "Current Context is ready for the real MCP proof",
        );
      return {
        ...step(
          8,
          [action("view-demo-complete", "View the demo conclusion", "/complete"), resetAction()],
          "UI and MCP Context match exactly",
        ),
        completedStepIds: ids,
        availableStepIds: ids,
      };
    default:
      return step(0, [resetAction()], parity ? "Demo complete" : "Guided state unavailable");
  }
}

function action(
  id: DemoActionId,
  label: string,
  href: string,
  intent: "Navigate" | "Mutation" = "Navigate",
  endpoint?: string,
): DemoAction {
  return Object.freeze({
    id,
    label,
    href,
    intent,
    ...(endpoint ? { endpoint } : {}),
    enabled: true,
  });
}

function resetAction(): DemoAction {
  return action("reset", "Reset to Prepared", "/", "Mutation", "/api/demo/reset");
}

function receiptCopy(actionId: DemoActionId, decision: "Accepted" | "Rejected") {
  if (decision === "Rejected")
    return {
      title: "Proposal rejected",
      message:
        "No canonical Revision or Relationship was created. Reset to resume the guided path.",
      facts: [{ label: "Knowledge safety", value: "Current knowledge is unchanged" }],
    };
  const copies: Record<
    DemoActionId,
    { title: string; message: string; facts: { label: string; value: string }[] }
  > = {
    "review-v1": {
      title: "Knowledge accepted",
      message: "The Proposal, Review Decision, Evidence, and immutable Revision are traceable.",
      facts: [{ label: "Current", value: "A reviewed V1 Revision" }],
    },
    "review-dependency": {
      title: "Projects connected",
      message: "The accepted DependsOn relationship preserves both reviewed endpoint Revisions.",
      facts: [{ label: "Direction", value: "Token Parser DependsOn Token Format" }],
    },
    "review-v2": {
      title: "Breaking revision accepted",
      message: "Current changed from V1 to V2 while V1 remains preserved in History.",
      facts: [
        { label: "Current changed", value: "V1 → V2" },
        { label: "Cross-project consequence", value: "Relationship binding is Stale" },
      ],
    },
    "assess-impact": {
      title: "High compatibility impact detected",
      message: "The consumer still requires customer_id while provider V2 supplies subject_id.",
      facts: [
        { label: "Severity", value: "High" },
        { label: "Observed result", value: "Authentication rejects the token" },
      ],
    },
    "record-rollback": {
      title: "Rollback recorded",
      message: "V2 was not deleted and V1 was not reactivated. Restoration now requires review.",
      facts: [{ label: "Canonical state", value: "V2 remains Current until V3 acceptance" }],
    },
    "review-v3": {
      title: "Compatibility restored",
      message: "V3 is a new restoration Revision; V1 and V2 remain Historical.",
      facts: [
        { label: "Current", value: "V3 Restoration" },
        { label: "History", value: "V1 → V2 → V3" },
      ],
    },
    "build-context": {
      title: "Context Package ready",
      message: "Core selected Current knowledge, the dependency path, Evidence, and budget result.",
      facts: [{ label: "Temporal safety", value: "V1 and V2 are not Current instructions" }],
    },
    "view-mcp-proof": {
      title: "UI and MCP context match exactly",
      message: "The normalized read-only MCP result matches direct Core output.",
      facts: [{ label: "Tool", value: "loxora_get_context" }],
    },
    "view-demo-complete": {
      title: "Demo complete",
      message: "The reviewed lifecycle and equivalent UI/MCP Context proof are complete.",
      facts: [],
    },
    "inspect-temporal": {
      title: "Temporal views inspected",
      message: "Current, History, and Planned remain separate.",
      facts: [],
    },
    "confirm-temporal-review": {
      title: "Temporal views confirmed",
      message: "Currently valid knowledge, earlier versions, and planned changes remain separate.",
      facts: [],
    },
    resume: {
      title: "Preparation resumed",
      message: "The missing next artifact was prepared from canonical state.",
      facts: [],
    },
    reset: {
      title: "Demo reset",
      message: "The deterministic Prepared state is active.",
      facts: [],
    },
  };
  return copies[actionId];
}

export function validateReceipt(
  receipt: DemoResultReceipt | null,
  fixtureVersion: string,
  stage: DemoStage,
  runtime: RuntimeState,
): DemoResultReceipt | null {
  if (!receipt || receipt.fixtureVersion !== fixtureVersion) return null;
  const allowed: Partial<Record<DemoActionId, readonly DemoStage[]>> = {
    "review-v1": ["Prepared", "V1Accepted"],
    "review-dependency": ["DependencyAccepted"],
    "review-v2": ["V2Accepted"],
    "assess-impact": ["ImpactAssessed"],
    "record-rollback": ["RollbackRecorded"],
    "review-v3": ["V3Restored"],
    "build-context": ["V3Restored"],
    "confirm-temporal-review": ["V3Restored"],
  };
  if (!(allowed[receipt.actionId] ?? [receipt.stage]).includes(stage)) return null;
  const known = new Set(Object.values(runtime.artifactIds));
  if (receipt.artifactIds.some((id) => !known.has(id))) return null;
  return receipt;
}

export function temporalReviewMatches(
  receipt: TemporalReviewReceipt | null,
  actual: TemporalReviewReceipt | null,
): boolean {
  return Boolean(
    receipt &&
      actual &&
      receipt.fixtureVersion === actual.fixtureVersion &&
      receipt.projectId === actual.projectId &&
      receipt.nodeId === actual.nodeId &&
      receipt.plannedKnowledgeId === actual.plannedKnowledgeId &&
      actual.revisionIds.every((id, index) => id === receipt.revisionIds[index]),
  );
}

export function preparedInterruption(acceptedV1: number, initialSubmitted: number): string | null {
  return acceptedV1 + initialSubmitted < 2
    ? "A required V1 Proposal was rejected or is missing. Reset restores the guided path."
    : null;
}

function proofReceipt(
  fixtureVersion: string,
  stage: DemoStage,
  proofPath: string,
): DemoResultReceipt | null {
  if (!existsSync(proofPath)) return null;
  const proof = JSON.parse(readFileSync(proofPath, "utf8")) as {
    passed?: boolean;
    fingerprint?: string;
  };
  if (!proof.passed) return null;
  const copy = receiptCopy("view-mcp-proof", "Accepted");
  return Object.freeze({
    fixtureVersion,
    actionId: "view-mcp-proof",
    stage,
    title: copy.title,
    message: copy.message,
    facts: Object.freeze([
      ...copy.facts,
      { label: "Fingerprint", value: proof.fingerprint ?? "Matched" },
    ]),
    artifactIds: Object.freeze([]),
    tone: "Success",
  });
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
