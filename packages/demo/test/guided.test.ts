import assert from "node:assert/strict";
import test from "node:test";
import {
  guidedConfiguration,
  preparedInterruption,
  temporalReviewMatches,
  validateReceipt,
} from "../src/orchestration/coordinator.js";
import type {
  DemoResultReceipt,
  RuntimeState,
  TemporalReviewReceipt,
} from "../src/shared/contracts.js";

test("maps every canonical stage to a bounded guided step and server action", () => {
  const expected = [
    ["Prepared", "establish-knowledge", "review-v1"],
    ["V1Accepted", "connect-projects", "review-dependency"],
    ["DependencyAccepted", "breaking-change", "review-v2"],
    ["V2Accepted", "assess-impact", "assess-impact"],
    ["ImpactAssessed", "record-rollback", "record-rollback"],
    ["RollbackRecorded", "restore-knowledge", "review-v3"],
    ["V3Restored", "compare-time", "inspect-temporal"],
    ["Complete", "compare-time", "inspect-temporal"],
  ] as const;
  for (const [stage, step, action] of expected) {
    const result = guidedConfiguration(stage, false, false, stage === "Complete");
    assert.equal(result.currentStepId, step);
    assert.equal(result.actions[0]?.id, action);
    assert.equal(result.availableStepIds.includes("verify-mcp"), false);
  }
  const temporalReady = guidedConfiguration("V3Restored", true, false, false);
  assert.equal(temporalReady.currentStepId, "build-context");
  assert.equal(temporalReady.actions[0]?.id, "build-context");
  const contextReady = guidedConfiguration("V3Restored", true, true, false);
  assert.equal(contextReady.currentStepId, "verify-mcp");
  assert.equal(contextReady.actions[0]?.id, "view-mcp-proof");
  const complete = guidedConfiguration("Complete", true, true, true);
  assert.equal(complete.currentStepId, "verify-mcp");
  assert.equal(complete.actions[0]?.id, "view-demo-complete");
  assert.equal(complete.actions[1]?.id, "reset");
  assert.deepEqual(complete.availableStepIds, complete.completedStepIds);
});

test("Temporal review presentation receipt requires the exact canonical artifacts", () => {
  const receipt: TemporalReviewReceipt = {
    fixtureVersion: "fixture-v1",
    projectId: "project",
    nodeId: "node",
    revisionIds: ["v1", "v2", "v3"],
    plannedKnowledgeId: "plan",
    reviewedAt: "2026-07-17T09:00:00.000Z",
  };
  assert.equal(
    temporalReviewMatches(receipt, { ...receipt, reviewedAt: "2026-07-17T10:00:00.000Z" }),
    true,
  );
  assert.equal(
    temporalReviewMatches(receipt, { ...receipt, revisionIds: ["v1", "v2", "v4"] }),
    false,
  );
  assert.equal(temporalReviewMatches(receipt, { ...receipt, plannedKnowledgeId: "other" }), false);
  assert.equal(temporalReviewMatches(receipt, { ...receipt, fixtureVersion: "fixture-v2" }), false);
  assert.equal(temporalReviewMatches(null, receipt), false);
});

test("Prepared guidance distinguishes zero, one, two, and interrupted V1 states", () => {
  assert.equal(preparedInterruption(0, 2), null);
  assert.equal(preparedInterruption(1, 1), null);
  assert.equal(preparedInterruption(2, 0), null);
  assert.match(preparedInterruption(0, 1) ?? "", /rejected or is missing/);
});

test("Result Receipts require fixture, artifact, and Current-stage agreement", () => {
  const receipt: DemoResultReceipt = {
    fixtureVersion: "fixture-v1",
    actionId: "review-v2",
    stage: "V2Accepted",
    title: "Breaking revision accepted",
    message: "V2 is Current",
    facts: [],
    artifactIds: ["revision-v2"],
    tone: "Success",
  };
  const runtime: RuntimeState = {
    fixtureVersion: "fixture-v1",
    artifactIds: { revision: "revision-v2" },
    lastAction: "review-v2",
    parity: null,
    lastResult: receipt,
  };
  assert.equal(validateReceipt(receipt, "fixture-v1", "V2Accepted", runtime), receipt);
  assert.equal(validateReceipt(receipt, "fixture-v2", "V2Accepted", runtime), null);
  assert.equal(validateReceipt(receipt, "fixture-v1", "V3Restored", runtime), null);
  assert.equal(
    validateReceipt({ ...receipt, artifactIds: ["missing"] }, "fixture-v1", "V2Accepted", runtime),
    null,
  );

  const rejected: DemoResultReceipt = {
    ...receipt,
    actionId: "review-dependency",
    stage: "V1Accepted",
    title: "Proposal rejected",
    message: "No relationship was created",
    artifactIds: [],
    tone: "Warning",
  };
  assert.equal(validateReceipt(rejected, "fixture-v1", "V1Accepted", runtime), rejected);
  assert.equal(validateReceipt(rejected, "fixture-v1", "DependencyAccepted", runtime), null);
  assert.equal(
    validateReceipt(
      { ...rejected, artifactIds: ["rejected-proposal"] },
      "fixture-v1",
      "V1Accepted",
      runtime,
    ),
    null,
  );
});
