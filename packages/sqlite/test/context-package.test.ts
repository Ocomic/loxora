import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CONTEXT_ESTIMATOR_ID,
  ContextPackageService,
  CrossProjectImpactService,
  LifecycleService,
  Utf8BytesDiv3CeilEstimator,
  stableContextJson,
  type ContextPackageStore,
} from "@loxora/core";
import { SqliteLifecycleStore } from "../src/adapter.js";
import { openSqliteReadOnlyContextStore } from "../src/index.js";

async function fixture(options: { assessment?: boolean; restricted?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "loxora-context-"));
  const path = join(directory, "context.sqlite");
  const store = new SqliteLifecycleStore(path);
  const lifecycle = new LifecycleService(store);
  const impact = new CrossProjectImpactService(store, {
    mayAccept: (reviewer) => reviewer === "Ocomic",
  });

  async function createProject(name: string, content: string) {
    const project = await lifecycle.createProject({
      name,
      purpose: `${name} purpose`,
      actorId: "owner",
    });
    const space = await lifecycle.createKnowledgeSpace({
      projectId: project.id,
      name: "Architecture",
      description: "Architecture",
      actorId: "owner",
    });
    const collection = await lifecycle.createKnowledgeCollection({
      projectId: project.id,
      spaceId: space.id,
      name: "Authentication",
      description: "Authentication",
      actorId: "owner",
    });
    const source = await lifecycle.registerSourceReference({
      projectId: project.id,
      kind: "document",
      locator: `docs/${name}.md`,
      title: `${name} source`,
      actorId: "owner",
    });
    const evidence = await lifecycle.registerEvidenceReference({
      projectId: project.id,
      sourceReferenceId: source.id,
      summary: `${name} evidence`,
      locator: "line:1",
      actorId: "owner",
    });
    const proposal = await lifecycle.submitKnowledgeProposal({
      projectId: project.id,
      spaceId: space.id,
      collectionId: collection.id,
      proposedNodeTitle: `${name} node`,
      proposedContent: content,
      sourceReferenceIds: [source.id],
      evidenceReferenceIds: [evidence.id],
      proposerId: "author",
    });
    const accepted = await lifecycle.reviewKnowledgeProposal({
      projectId: project.id,
      proposalId: proposal.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "initial",
      evidenceReferenceIds: [evidence.id],
    });
    assert(accepted.revision);
    return { project, space, collection, source, evidence, proposal, revision: accepted.revision };
  }

  const consumer = await createProject("consumer", "consumer requires customer_id");
  const provider = await createProject("provider", "V1 requires customer_id");
  const relationshipProposal = await impact.submitCrossProjectRelationshipProposal({
    sourceProjectId: consumer.project.id,
    sourceNodeId: consumer.proposal.proposedNodeId,
    targetProjectId: provider.project.id,
    targetNodeId: provider.proposal.proposedNodeId,
    evidence: [{ projectId: provider.project.id, evidenceReferenceId: provider.evidence.id }],
    confidence: "High",
    reason: "consumer depends on provider",
    visibility: options.restricted ? "Restricted" : "SharedBetweenProjects",
    proposerId: "analyst",
  });
  const reviewedRelationship = await impact.reviewCrossProjectRelationshipProposal({
    proposalId: relationshipProposal.id,
    reviewerId: "Ocomic",
    decision: "Accepted",
    reason: "dependency confirmed",
    evidence: [{ projectId: provider.project.id, evidenceReferenceId: provider.evidence.id }],
  });
  assert(reviewedRelationship.relationship);

  const v2Proposal = await lifecycle.submitSuccessorProposal({
    projectId: provider.project.id,
    nodeId: provider.proposal.proposedNodeId,
    expectedCurrentRevisionId: provider.revision.id,
    proposedContent: "V2 replaces customer_id with subject_id",
    sourceReferenceIds: [provider.source.id],
    evidenceReferenceIds: [provider.evidence.id],
    proposerId: "author",
    changeReason: "identity migration",
  });
  const v2Accepted = await lifecycle.reviewKnowledgeProposal({
    projectId: provider.project.id,
    proposalId: v2Proposal.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "migration",
    evidenceReferenceIds: [provider.evidence.id],
  });
  assert(v2Accepted.revision);
  const rollback = await lifecycle.recordRollback({
    projectId: provider.project.id,
    nodeId: provider.proposal.proposedNodeId,
    revertedRevisionId: v2Accepted.revision.id,
    semanticSourceRevisionId: provider.revision.id,
    actorId: "operator",
    reason: "consumer rejected authentication",
    evidenceReferenceIds: [provider.evidence.id],
  });
  const v3Proposal = await lifecycle.submitRestorationProposal({
    projectId: provider.project.id,
    rollbackEventId: rollback.rollbackEvent.id,
    proposedContent: "V3 restores customer_id compatibility",
    sourceReferenceIds: [provider.source.id],
    evidenceReferenceIds: [provider.evidence.id],
    proposerId: "author",
    changeReason: "restore compatibility",
  });
  const v3Accepted = await lifecycle.reviewKnowledgeProposal({
    projectId: provider.project.id,
    proposalId: v3Proposal.id,
    reviewerId: "reviewer",
    decision: "Accepted",
    reason: "restored",
    evidenceReferenceIds: [provider.evidence.id],
  });
  assert(v3Accepted.revision);

  const assessment =
    options.assessment === false
      ? null
      : await impact.assessRevisionImpact({
          relationshipId: reviewedRelationship.relationship.id,
          providerRevisionId: v3Accepted.revision.id,
          evidence: [{ projectId: consumer.project.id, evidenceReferenceId: consumer.evidence.id }],
          facts: {
            changeCompatibility: "Compatible",
            consumerRequirement: "Required",
            operationalCriticality: "Critical",
            observedFailure: false,
            changeSummary: "customer_id is restored",
            consumerConstraint: "consumer requires customer_id",
            consequence: "authentication remains compatible",
          },
          requestingActorId: "operator",
        });
  return {
    directory,
    path,
    store,
    lifecycle,
    context: new ContextPackageService(store),
    consumer,
    provider,
    relationship: reviewedRelationship.relationship,
    assessment,
    v1: provider.revision,
    v2: v2Accepted.revision,
    v3: v3Accepted.revision,
  };
}

async function cleanup(value: Awaited<ReturnType<typeof fixture>>) {
  try {
    await value.store.close();
  } catch {
    // A persistence test may already have closed the original store.
  }
  rmSync(value.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function request(
  value: Awaited<ReturnType<typeof fixture>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: value.provider.project.id,
    focusNodeIds: [value.provider.proposal.proposedNodeId],
    taskLabel: "Update authentication",
    estimatedTokenBudget: 100_000,
    visibility: {
      readableProjectIds: [value.provider.project.id, value.consumer.project.id],
    },
    ...overrides,
  } as Parameters<ContextPackageService["buildContextPackage"]>[0];
}

test("selects V3 Current by default and includes explicit History only", async () => {
  const value = await fixture();
  try {
    const current = await value.context.buildContextPackage(
      request(value, {
        focusNodeIds: [
          value.provider.proposal.proposedNodeId,
          value.provider.proposal.proposedNodeId,
        ],
      }),
    );
    assert.equal(Object.isFrozen(current), true);
    assert.equal(current.entries.filter((entry) => entry.kind === "Knowledge").length, 1);
    assert.deepEqual(current.includedRevisionIds, [value.v3.id]);
    assert(!JSON.stringify(current.entries).includes(value.v1.content));
    assert(!JSON.stringify(current.entries).includes(value.v2.content));
    assert.equal(
      current.entries.some((entry) => entry.kind === "Dependency"),
      false,
    );

    const withHistory = await value.context.buildContextPackage(
      request(value, { temporalViews: ["History"] }),
    );
    const history = withHistory.entries.find((entry) => entry.kind === "History");
    assert.deepEqual(history?.revisionIds, [value.v1.id, value.v2.id, value.v3.id]);
    assert.deepEqual(
      history?.revisions.map((revision) => revision.temporalClassification),
      ["Historical", "Historical", "Current"],
    );
  } finally {
    await cleanup(value);
  }
});

test("follows exactly one allowed dependency and exact Assessment", async () => {
  const value = await fixture();
  try {
    const depthZero = await value.context.buildContextPackage(
      request(value, {
        includeRelatedProjects: true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: 0,
      }),
    );
    assert.equal(depthZero.followedDependencyPaths.length, 0);
    const depthOne = await value.context.buildContextPackage(
      request(value, {
        includeRelatedProjects: true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: 1,
      }),
    );
    const dependency = depthOne.entries.find((entry) => entry.kind === "Dependency");
    assert.equal(dependency?.impactAssessmentId, value.assessment?.id);
    assert.equal(dependency?.assessmentFreshness, "Fresh");
    assert.equal(dependency?.relationshipBindingFreshness, "Stale");
    assert(depthOne.includedProjectIds.includes(value.consumer.project.id));
    assert(depthOne.staleInputs.includes(`relationship:${value.relationship.id}`));
    assert(depthOne.entries.some((entry) => entry.sources.length > 0));
    await assert.rejects(
      value.context.buildContextPackage(request(value, { maxDependencyDepth: 2 as never })),
      /zero or one/,
    );
    await assert.rejects(
      value.context.buildContextPackage(
        request(value, { relationshipTypes: ["DependedOnBy" as never] }),
      ),
      /Unsupported relationship type/,
    );
  } finally {
    await cleanup(value);
  }
});

test("preserves stale Assessment labeling supplied by the impact contract", async () => {
  const value = await fixture();
  try {
    const store: ContextPackageStore = {
      getCurrentKnowledge: (input) => value.store.getCurrentKnowledge(input),
      getKnowledgeHistory: (input) => value.store.getKnowledgeHistory(input),
      getEvidenceNavigation: (input) => value.store.getEvidenceNavigation(input),
      close: () => value.store.close(),
      getProjectDependencies: async (input) =>
        (await value.store.getProjectDependencies(input)).map((dependency) => ({
          ...dependency,
          assessmentFreshness: "Stale" as const,
          path: {
            ...dependency.path,
            assessmentFreshness: "Stale" as const,
          },
        })),
    };
    const result = await new ContextPackageService(store).buildContextPackage(
      request(value, {
        includeRelatedProjects: true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: 1,
      }),
    );
    const dependency = result.entries.find((entry) => entry.kind === "Dependency");
    assert.equal(dependency?.assessmentFreshness, "Stale");
    assert(result.staleInputs.includes(`assessment:${value.assessment?.id}`));
  } finally {
    await cleanup(value);
  }
});

test("preserves dependency when no exact Assessment exists and redacts Restricted data", async () => {
  const missing = await fixture({ assessment: false });
  try {
    const result = await missing.context.buildContextPackage(
      request(missing, {
        includeRelatedProjects: true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: 1,
      }),
    );
    assert.equal(result.followedDependencyPaths.length, 1);
    assert(result.warnings.includes("NoApplicableImpactAssessment"));
    assert.equal(
      result.entries.find((entry) => entry.kind === "Dependency")?.impactAssessmentId,
      null,
    );
  } finally {
    await cleanup(missing);
  }

  const restricted = await fixture({ restricted: true });
  try {
    const result = await restricted.context.buildContextPackage(
      request(restricted, {
        includeRelatedProjects: true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: 1,
        visibility: { readableProjectIds: [restricted.provider.project.id] },
      }),
    );
    assert(result.warnings.includes("InaccessibleEndpoint"));
    assert(result.entries.some((entry) => entry.kind === "Inaccessible"));
    const dependency = result.entries.find((entry) => entry.kind === "Dependency");
    assert.equal(dependency?.dependencyPath?.consumer.content, null);
    assert.equal(dependency?.dependencyPath?.relationship.reason, "");
    assert.equal(dependency?.evidence.length, 0);
    assert(!JSON.stringify(result).includes(restricted.consumer.revision.content));
  } finally {
    await cleanup(restricted);
  }
});

test("enforces deterministic budgets, Evidence, no writes, and stable fingerprints", async () => {
  const value = await fixture();
  try {
    const full = await value.context.buildContextPackage(
      request(value, {
        includeRelatedProjects: true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: 1,
        explicitEvidenceReferenceIds: [value.provider.evidence.id],
      }),
    );
    const optional = full.entries.filter((entry) => !entry.mandatory);
    assert.equal(optional.length, 1);
    const mandatoryUsage = full.entries
      .filter((entry) => entry.mandatory)
      .reduce((sum, entry) => sum + entry.estimatedTokens, 0);
    const budgeted = await value.context.buildContextPackage(
      request(value, {
        includeRelatedProjects: true,
        relationshipTypes: ["DependsOn"],
        maxDependencyDepth: 1,
        explicitEvidenceReferenceIds: [value.provider.evidence.id],
        estimatedTokenBudget: mandatoryUsage,
      }),
    );
    assert.equal(budgeted.budgetStatus, "WithinBudgetWithOmissions");
    assert.deepEqual(
      budgeted.omissions.map((item) => item.candidateId),
      [optional[0]?.id],
    );
    const over = await value.context.buildContextPackage(
      request(value, { estimatedTokenBudget: 1 }),
    );
    assert.equal(over.budgetStatus, "OverBudgetMandatory");
    assert(over.entries.some((entry) => entry.revisionIds.includes(value.v3.id)));

    const before = value.store.unsafeGetForTest("SELECT COUNT(*) count FROM audit_events") as {
      count: number;
    };
    const first = await value.context.buildContextPackage(request(value));
    const after = value.store.unsafeGetForTest("SELECT COUNT(*) count FROM audit_events") as {
      count: number;
    };
    assert.equal(after.count, before.count);
    await value.store.close();
    const reopenedStore = await openSqliteReadOnlyContextStore(value.path);
    const second = await new ContextPackageService(reopenedStore).buildContextPackage(
      request(value),
    );
    assert.equal(second.fingerprint, first.fingerprint);
    await assert.rejects(
      async () =>
        (reopenedStore as SqliteLifecycleStore).unsafeExecForTest(
          "INSERT INTO projects(id,name,purpose,created_at) VALUES('x','x','','x')",
        ),
      /readonly|read-only|query_only/i,
    );
    await reopenedStore.close();
  } finally {
    await cleanup(value);
  }
});

test("estimator is stable for ASCII and Unicode", () => {
  const estimator = new Utf8BytesDiv3CeilEstimator();
  for (const value of [{ text: "abc" }, { text: "Loxora 🧠 Wissen" }]) {
    assert.equal(
      estimator.estimate(value),
      Math.ceil(Buffer.byteLength(stableContextJson(value), "utf8") / 3),
    );
  }
  assert.equal(estimator.id, CONTEXT_ESTIMATOR_ID);
});
