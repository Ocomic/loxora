import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CrossProjectImpactService,
  ImpactAssessmentBuilder,
  LifecycleService,
  NavigationService,
  ValidationError,
  type ProjectId,
} from "@loxora/core";
import { SqliteLifecycleStore, type SqliteFaults } from "../src/adapter.js";

async function createHarness(faults: SqliteFaults = {}) {
  const directory = mkdtempSync(join(tmpdir(), "loxora-impact-"));
  const path = join(directory, "impact.sqlite");
  const store = new SqliteLifecycleStore(path, faults);
  const lifecycle = new LifecycleService(store);
  const navigation = new NavigationService(store);
  const impact = new CrossProjectImpactService(store, {
    mayAccept: (reviewerId) => reviewerId === "Ocomic",
  });

  async function project(name: string) {
    const project = await lifecycle.createProject({
      name,
      purpose: `${name} purpose`,
      actorId: "author",
    });
    const space = await lifecycle.createKnowledgeSpace({
      projectId: project.id,
      name: "Architecture",
      description: "Architecture knowledge",
      actorId: "author",
    });
    const collection = await lifecycle.createKnowledgeCollection({
      projectId: project.id,
      spaceId: space.id,
      name: "Authentication",
      description: "Authentication contracts",
      actorId: "author",
    });
    const source = await lifecycle.registerSourceReference({
      projectId: project.id,
      kind: "document",
      locator: `docs/${name}.md`,
      title: `${name} contract`,
      actorId: "author",
    });
    const evidence = await lifecycle.registerEvidenceReference({
      projectId: project.id,
      sourceReferenceId: source.id,
      summary: `${name} evidence`,
      locator: "line:1",
      actorId: "author",
    });
    const proposal = await lifecycle.submitKnowledgeProposal({
      projectId: project.id,
      spaceId: space.id,
      collectionId: collection.id,
      proposedNodeTitle: `${name} token behavior`,
      proposedContent: `${name} requires customer_id`,
      sourceReferenceIds: [source.id],
      evidenceReferenceIds: [evidence.id],
      proposerId: "author",
    });
    const accepted = await lifecycle.reviewKnowledgeProposal({
      projectId: project.id,
      proposalId: proposal.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "initial canon",
      evidenceReferenceIds: [evidence.id],
    });
    assert(accepted.revision);
    return { project, space, collection, source, evidence, proposal, revision: accepted.revision };
  }

  const consumer = await project("consumer");
  const provider = await project("provider");
  return { directory, path, store, lifecycle, navigation, impact, consumer, provider };
}

async function close(value: Awaited<ReturnType<typeof createHarness>>) {
  await value.lifecycle.close();
  rmSync(value.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

async function acceptedRelationship(value: Awaited<ReturnType<typeof createHarness>>) {
  const proposal = await value.impact.submitCrossProjectRelationshipProposal({
    sourceProjectId: value.consumer.project.id,
    sourceNodeId: value.consumer.proposal.proposedNodeId,
    targetProjectId: value.provider.project.id,
    targetNodeId: value.provider.proposal.proposedNodeId,
    evidence: [
      {
        projectId: value.consumer.project.id,
        evidenceReferenceId: value.consumer.evidence.id,
      },
      {
        projectId: value.provider.project.id,
        evidenceReferenceId: value.provider.evidence.id,
      },
    ],
    confidence: "High",
    reason: "Consumer authentication client uses provider token contract",
    visibility: "SharedBetweenProjects",
    proposerId: "analyst",
  });
  const reviewed = await value.impact.reviewCrossProjectRelationshipProposal({
    proposalId: proposal.id,
    reviewerId: "Ocomic",
    decision: "Accepted",
    reason: "Evidence confirms dependency",
    evidence: [
      {
        projectId: value.consumer.project.id,
        evidenceReferenceId: value.consumer.evidence.id,
      },
    ],
  });
  assert(reviewed.relationship);
  return { proposal, relationship: reviewed.relationship };
}

const facts = {
  changeCompatibility: "Breaking" as const,
  consumerRequirement: "Required" as const,
  operationalCriticality: "Critical" as const,
  observedFailure: true,
  changeSummary: "customer_id was replaced by subject_id",
  consumerConstraint: "authentication client requires customer_id",
  consequence: "authentication is rejected with 401",
};

test("reviews an immutable dependency and exposes it from both Project Maps", async () => {
  const value = await createHarness();
  try {
    const { proposal, relationship } = await acceptedRelationship(value);
    assert.equal(relationship.source.revisionId, value.consumer.revision.id);
    assert.equal(relationship.target.revisionId, value.provider.revision.id);
    assert.equal(
      (
        value.store.unsafeGetForTest(
          "SELECT status FROM cross_project_relationship_proposals WHERE id=?",
          proposal.id,
        ) as { status: string }
      ).status,
      "Accepted",
    );
    const outgoing = await value.impact.getProjectDependencies({
      projectId: value.consumer.project.id,
      direction: "Outgoing",
      access: { readableProjectIds: [value.consumer.project.id, value.provider.project.id] },
    });
    const incoming = await value.impact.getProjectDependencies({
      projectId: value.provider.project.id,
      direction: "Incoming",
      access: { readableProjectIds: [value.consumer.project.id, value.provider.project.id] },
    });
    assert.equal(outgoing[0]?.path.canonicalLabel, "DependsOn");
    assert.equal(incoming[0]?.path.reverseLabel, "DependedOnBy");
    assert(outgoing[0]?.path.warnings.includes("NoApplicableImpactAssessment"));

    const consumerMap = await value.navigation.getProjectMap({
      projectId: value.consumer.project.id,
    });
    const providerMap = await value.navigation.getProjectMap({
      projectId: value.provider.project.id,
    });
    assert.equal(consumerMap?.outgoingDependencies[0]?.relationshipId, relationship.id);
    assert.equal(providerMap?.incomingDependents[0]?.relationshipId, relationship.id);
    assert.equal(
      (
        value.store.unsafeGetForTest(
          "SELECT COUNT(*) count FROM current_revisions WHERE project_id=?",
          value.provider.project.id,
        ) as { count: number }
      ).count,
      1,
    );
    assert.throws(
      () =>
        value.store.unsafeExecForTest(
          `UPDATE cross_project_relationships SET reason='changed' WHERE id='${relationship.id}'`,
        ),
      /immutable/,
    );
  } finally {
    await close(value);
  }
});

test("keeps frozen relationship bindings while selecting exact fresh assessments", async () => {
  const value = await createHarness();
  try {
    const { relationship } = await acceptedRelationship(value);
    const first = await value.impact.assessRevisionImpact({
      relationshipId: relationship.id,
      providerRevisionId: value.provider.revision.id,
      evidence: [
        { projectId: value.consumer.project.id, evidenceReferenceId: value.consumer.evidence.id },
      ],
      facts,
      requestingActorId: "operator-a",
    });
    assert.equal(first.severity, "Critical");
    const successor = await value.lifecycle.submitSuccessorProposal({
      projectId: value.provider.project.id,
      nodeId: value.provider.proposal.proposedNodeId,
      expectedCurrentRevisionId: value.provider.revision.id,
      proposedContent: "provider now emits subject_id",
      sourceReferenceIds: [value.provider.source.id],
      evidenceReferenceIds: [value.provider.evidence.id],
      proposerId: "provider-author",
      changeReason: "token migration",
    });
    const accepted = await value.lifecycle.reviewKnowledgeProposal({
      projectId: value.provider.project.id,
      proposalId: successor.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "migration accepted",
      evidenceReferenceIds: [value.provider.evidence.id],
    });
    assert(accepted.revision);

    const without = await value.impact.getRevisionImpact({
      providerProjectId: value.provider.project.id,
      providerNodeId: value.provider.proposal.proposedNodeId,
      providerRevisionId: accepted.revision.id,
      access: { readableProjectIds: [value.provider.project.id, value.consumer.project.id] },
    });
    assert.equal(without[0]?.relationshipBindingFreshness, "Stale");
    assert.equal(without[0]?.assessment, null);
    assert(without[0]?.warnings.includes("NoApplicableImpactAssessment"));

    const second = await value.impact.assessRevisionImpact({
      relationshipId: relationship.id,
      providerRevisionId: accepted.revision.id,
      evidence: [
        { projectId: value.provider.project.id, evidenceReferenceId: value.provider.evidence.id },
        { projectId: value.consumer.project.id, evidenceReferenceId: value.consumer.evidence.id },
      ],
      facts,
      requestingActorId: "operator-b",
    });
    const withAssessment = await value.impact.getRevisionImpact({
      providerProjectId: value.provider.project.id,
      providerNodeId: value.provider.proposal.proposedNodeId,
      providerRevisionId: accepted.revision.id,
      access: { readableProjectIds: [value.provider.project.id, value.consumer.project.id] },
    });
    assert.equal(withAssessment[0]?.assessment?.id, second.id);
    assert.equal(withAssessment[0]?.assessmentFreshness, "Fresh");
    assert.equal(relationship.target.revisionId, value.provider.revision.id);

    const builder = new ImpactAssessmentBuilder();
    assert.equal(
      builder.fingerprint({
        relationshipId: relationship.id,
        providerRevisionId: accepted.revision.id,
        consumerRevisionId: value.consumer.revision.id,
        facts,
        evidence: second.evidence,
      }),
      second.basisFingerprint,
    );
  } finally {
    await close(value);
  }
});

test("stale endpoint acceptance rolls back and leaves Proposal reviewable", async () => {
  const value = await createHarness();
  try {
    const proposal = await value.impact.submitCrossProjectRelationshipProposal({
      sourceProjectId: value.consumer.project.id,
      sourceNodeId: value.consumer.proposal.proposedNodeId,
      targetProjectId: value.provider.project.id,
      targetNodeId: value.provider.proposal.proposedNodeId,
      evidence: [
        {
          projectId: value.consumer.project.id,
          evidenceReferenceId: value.consumer.evidence.id,
        },
      ],
      confidence: "High",
      reason: "dependency awaiting review",
      visibility: "SharedBetweenProjects",
      proposerId: "analyst",
    });
    const successor = await value.lifecycle.submitSuccessorProposal({
      projectId: value.provider.project.id,
      nodeId: value.provider.proposal.proposedNodeId,
      expectedCurrentRevisionId: value.provider.revision.id,
      proposedContent: "provider changed before relationship review",
      sourceReferenceIds: [value.provider.source.id],
      evidenceReferenceIds: [value.provider.evidence.id],
      proposerId: "provider-author",
      changeReason: "provider update",
    });
    await value.lifecycle.reviewKnowledgeProposal({
      projectId: value.provider.project.id,
      proposalId: successor.id,
      reviewerId: "reviewer",
      decision: "Accepted",
      reason: "accepted",
      evidenceReferenceIds: [value.provider.evidence.id],
    });
    await assert.rejects(
      value.impact.reviewCrossProjectRelationshipProposal({
        proposalId: proposal.id,
        reviewerId: "Ocomic",
        decision: "Accepted",
        reason: "now stale",
        evidence: [
          {
            projectId: value.consumer.project.id,
            evidenceReferenceId: value.consumer.evidence.id,
          },
        ],
      }),
      /Expected Current Revision/,
    );
    assert.equal(
      (
        value.store.unsafeGetForTest(
          "SELECT status FROM cross_project_relationship_proposals WHERE id=?",
          proposal.id,
        ) as { status: string }
      ).status,
      "Submitted",
    );
    const rejected = await value.impact.reviewCrossProjectRelationshipProposal({
      proposalId: proposal.id,
      reviewerId: "Ocomic",
      decision: "Rejected",
      reason: "frozen endpoint became stale",
      evidence: [
        {
          projectId: value.consumer.project.id,
          evidenceReferenceId: value.consumer.evidence.id,
        },
      ],
    });
    assert.equal(rejected.relationship, null);
    assert.equal(rejected.proposal.status, "Rejected");
  } finally {
    await close(value);
  }
});

test("enforces review policy, Evidence ownership, redaction, atomicity, and reload", async () => {
  const value = await createHarness();
  try {
    const foreignProject = "00000000-0000-4000-8000-999999999999" as ProjectId;
    await assert.rejects(
      value.impact.submitCrossProjectRelationshipProposal({
        sourceProjectId: value.consumer.project.id,
        sourceNodeId: value.consumer.proposal.proposedNodeId,
        targetProjectId: value.provider.project.id,
        targetNodeId: value.provider.proposal.proposedNodeId,
        evidence: [{ projectId: foreignProject, evidenceReferenceId: value.consumer.evidence.id }],
        confidence: "Low",
        reason: "invalid evidence",
        visibility: "SharedBetweenProjects",
        proposerId: "analyst",
      }),
      /endpoint Project/,
    );
    const proposal = await value.impact.submitCrossProjectRelationshipProposal({
      sourceProjectId: value.consumer.project.id,
      sourceNodeId: value.consumer.proposal.proposedNodeId,
      targetProjectId: value.provider.project.id,
      targetNodeId: value.provider.proposal.proposedNodeId,
      evidence: [
        { projectId: value.consumer.project.id, evidenceReferenceId: value.consumer.evidence.id },
      ],
      confidence: "Medium",
      reason: "restricted dependency",
      visibility: "Restricted",
      proposerId: "analyst",
    });
    await assert.rejects(
      value.impact.reviewCrossProjectRelationshipProposal({
        proposalId: proposal.id,
        reviewerId: "not-owner",
        decision: "Accepted",
        reason: "unauthorized",
        evidence: [
          { projectId: value.consumer.project.id, evidenceReferenceId: value.consumer.evidence.id },
        ],
      }),
      ValidationError,
    );
    const reviewed = await value.impact.reviewCrossProjectRelationshipProposal({
      proposalId: proposal.id,
      reviewerId: "Ocomic",
      decision: "Accepted",
      reason: "approved",
      evidence: [
        { projectId: value.consumer.project.id, evidenceReferenceId: value.consumer.evidence.id },
      ],
    });
    assert(reviewed.relationship);
    const restricted = await value.impact.getProjectDependencies({
      projectId: value.consumer.project.id,
      direction: "Outgoing",
      access: { readableProjectIds: [value.consumer.project.id] },
    });
    assert.equal(restricted[0]?.path.provider.projectId, null);
    assert.equal(restricted[0]?.path.provider.content, null);
    assert.equal(restricted[0]?.path.evidence.length, 0);
    assert.equal(restricted[0]?.path.sources.length, 0);
    assert.equal(restricted[0]?.path.relationship.reason, "");

    await value.lifecycle.close();
    const reopened = new SqliteLifecycleStore(value.path);
    const impact = new CrossProjectImpactService(reopened, { mayAccept: () => true });
    const after = await impact.getProjectDependencies({
      projectId: value.consumer.project.id,
      direction: "Outgoing",
      access: { readableProjectIds: [value.consumer.project.id, value.provider.project.id] },
    });
    assert.equal(after[0]?.relationship.id, reviewed.relationship.id);
    await reopened.close();
  } finally {
    try {
      await value.store.close();
    } catch {
      // The original connection is already closed before the reload assertion.
    }
    try {
      rmSync(value.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Windows may retain a WAL handle briefly after a close; cleanup is best effort.
    }
  }
});

test("fault injection rolls back relationship and assessment artifacts", async () => {
  let failRelationship = true;
  const value = await createHarness({
    afterRelationshipInserted: () => {
      if (failRelationship) throw new Error("relationship fault");
    },
  });
  try {
    const proposal = await value.impact.submitCrossProjectRelationshipProposal({
      sourceProjectId: value.consumer.project.id,
      sourceNodeId: value.consumer.proposal.proposedNodeId,
      targetProjectId: value.provider.project.id,
      targetNodeId: value.provider.proposal.proposedNodeId,
      evidence: [
        { projectId: value.consumer.project.id, evidenceReferenceId: value.consumer.evidence.id },
      ],
      confidence: "High",
      reason: "dependency",
      visibility: "SharedBetweenProjects",
      proposerId: "analyst",
    });
    await assert.rejects(
      value.impact.reviewCrossProjectRelationshipProposal({
        proposalId: proposal.id,
        reviewerId: "Ocomic",
        decision: "Accepted",
        reason: "accepted",
        evidence: [
          { projectId: value.consumer.project.id, evidenceReferenceId: value.consumer.evidence.id },
        ],
      }),
      /relationship fault/,
    );
    assert.equal(
      (
        value.store.unsafeGetForTest("SELECT COUNT(*) count FROM cross_project_relationships") as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(
      (
        value.store.unsafeGetForTest(
          "SELECT status FROM cross_project_relationship_proposals WHERE id=?",
          proposal.id,
        ) as { status: string }
      ).status,
      "Submitted",
    );
    failRelationship = false;
  } finally {
    await close(value);
  }
});

test("assessment fault leaves no Assessment, Evidence, or Audit Events", async () => {
  const value = await createHarness({
    afterAssessmentInserted: () => {
      throw new Error("assessment fault");
    },
  });
  try {
    const { relationship } = await acceptedRelationship(value);
    const beforeAudit = (
      value.store.unsafeGetForTest("SELECT COUNT(*) count FROM audit_events") as { count: number }
    ).count;
    await assert.rejects(
      value.impact.assessRevisionImpact({
        relationshipId: relationship.id,
        providerRevisionId: value.provider.revision.id,
        evidence: [
          {
            projectId: value.consumer.project.id,
            evidenceReferenceId: value.consumer.evidence.id,
          },
        ],
        facts,
        requestingActorId: "operator",
      }),
      /assessment fault/,
    );
    assert.equal(
      (
        value.store.unsafeGetForTest("SELECT COUNT(*) count FROM impact_assessments") as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(
      (
        value.store.unsafeGetForTest("SELECT COUNT(*) count FROM impact_assessment_evidence") as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(
      (value.store.unsafeGetForTest("SELECT COUNT(*) count FROM audit_events") as { count: number })
        .count,
      beforeAudit,
    );
  } finally {
    await close(value);
  }
});
