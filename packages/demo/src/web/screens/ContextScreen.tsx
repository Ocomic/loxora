import { useEffect, useState } from "react";
import { post } from "../api.js";
import {
  ContextPackageSummary,
  type ContextPackageLike,
} from "../components/ContextPackageSummary.js";
import { useDemoState } from "../components/DemoState.js";
import { LoadingState } from "../components/AsyncState.js";

export function ContextScreen() {
  const { status, refresh } = useDemoState();
  const [result, setResult] = useState<ContextPackageLike | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contextReady = status?.guided.contextReady ?? false;
  useEffect(() => {
    if (!contextReady) setResult(null);
  }, [contextReady]);
  if (!status) return <LoadingState label="Loading prepared Context request…" />;
  const action = status.guided.availableActions.find((item) => item.id === "build-context");
  const request = status.preparedContextRequest;
  const build = async () => {
    if (!action?.enabled) return;
    try {
      setPending(true);
      setError(null);
      setResult(await post<ContextPackageLike>("/api/context-packages", request));
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Context Package failed");
      await refresh();
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Task-specific, lifecycle-filtered knowledge</p>
        <h1>Context Package inspector</h1>
        <p>
          The request is explicit and fixture-aware. Core owns Current selection, dependency
          traversal, exact Assessment applicability, ordering, deduplication, and budgeting.
        </p>
      </header>
      <section className="request-card">
        <div>
          <h2>Prepared Current request</h2>
          <p>
            <strong>Task:</strong> {String(request.taskLabel)}
          </p>
          <p>
            {Array.isArray(request.focusNodeIds) ? request.focusNodeIds.length : 0} focus Node ·
            depth {String(request.maxDependencyDepth)} ·{" "}
            {Number(request.estimatedTokenBudget).toLocaleString()} token budget
          </p>
        </div>
        {action ? (
          <button
            className="button primary"
            type="button"
            disabled={pending}
            onClick={() => void build()}
          >
            {pending ? "Building from Core…" : "Build Current Context Package"}
          </button>
        ) : contextReady ? (
          <p className="callout success">
            {result
              ? "This package was built by Core. Continue to the read-only MCP parity proof."
              : "The prepared Context request is ready for the read-only MCP parity proof."}
          </p>
        ) : (
          <p className="callout warning">
            Complete the server-provided lifecycle steps before building Context.
          </p>
        )}
      </section>
      {error ? (
        <p className="callout error" role="alert">
          {error}. Canonical project knowledge is unchanged.
        </p>
      ) : null}
      {result ? (
        <ContextPackageSummary value={result} />
      ) : (
        <p className="callout neutral">
          The human-readable package summary will appear before fingerprints and normalized JSON.
        </p>
      )}
    </>
  );
}
