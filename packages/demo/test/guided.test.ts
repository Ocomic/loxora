import assert from "node:assert/strict";
import test from "node:test";
import {
  guidedConfiguration,
  preparedInterruption,
  validateReceipt,
} from "../src/orchestration/coordinator.js";
import type { DemoResultReceipt, RuntimeState } from "../src/shared/contracts.js";

const identity = { id: "identity", nodeId: "token-format" };

test("maps every canonical stage to a bounded guided step and server action", () => {
  const expected = [
    ["Prepared", "establish-knowledge", "review-v1"],
    ["V1Accepted", "connect-projects", "review-dependency"],
    ["DependencyAccepted", "breaking-change", "review-v2"],
    ["V2Accepted", "assess-impact", "assess-impact"],
    ["ImpactAssessed", "record-rollback", "record-rollback"],
    ["RollbackRecorded", "restore-knowledge", "review-v3"],
    ["V3Restored", "compare-time", "inspect-temporal"],
    ["Complete", "verify-mcp", "reset"],
  ] as const;
  for (const [stage, step, action] of expected) {
    const result = guidedConfiguration(stage, false, stage === "Complete", identity);
    assert.equal(result.currentStepId, step);
    assert.equal(result.actions[0]?.id, action);
    assert.equal(result.availableStepIds.includes("verify-mcp"), stage === "Complete");
  }
  const contextReady = guidedConfiguration("V3Restored", true, false, identity);
  assert.equal(contextReady.currentStepId, "verify-mcp");
  assert.equal(contextReady.actions[0]?.id, "view-mcp-proof");
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
});
