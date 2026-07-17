import { useId } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { DemoActionButton, withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { ParityComparison } from "../components/ParityComparison.js";
import { useApi } from "../hooks/useApi.js";

export function CompletionScreen() {
  const completionTitleId = useId();
  const provedTitleId = useId();
  const roadmapTitleId = useId();
  const { status, mode } = useDemoState();
  const {
    data: proof,
    error,
    reload,
  } = useApi<Parameters<typeof ParityComparison>[0]["proof"]>("/api/demo/mcp-proof");
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!status || !proof) return <LoadingState label="Verifying the completed demo…" />;
  if (status.guided.state !== "Complete" || !proof.passed)
    return (
      <section className="empty-state">
        <p className="eyebrow">Proof still required</p>
        <h1>The demo is not complete yet</h1>
        <p>Run the real MCP proof, then verify parity before opening the conclusion.</p>
        <Link className="button primary" to={withMode("/proof", mode)}>
          Return to MCP proof
        </Link>
      </section>
    );
  const reset = status.guided.availableActions.find((action) => action.id === "reset");
  return (
    <>
      <section
        className="completion-hero"
        data-guided-action-target="true"
        tabIndex={-1}
        aria-labelledby={completionTitleId}
      >
        <p className="eyebrow">Guided demo complete</p>
        <h1 id={completionTitleId}>Project knowledge survived change—and stayed usable.</h1>
        <p className="completion-lead">
          The demo flow proved reviewed canon, preserved history, planned intent, evidence-backed
          cross-project impact, restoration, and identical task context for the UI and MCP agent
          surface.
        </p>
        <div className="completion-actions">
          {status.projects.map((project) => (
            <Link
              className="button secondary"
              key={project.id}
              to={withMode(`/projects/${project.id}`, mode)}
            >
              Explore {project.name}
            </Link>
          ))}
          {reset ? <DemoActionButton action={reset} secondary /> : null}
        </div>
      </section>

      <section className="section-block" aria-labelledby={provedTitleId}>
        <p className="eyebrow">What was proven</p>
        <h2 id={provedTitleId}>One continuous, inspectable knowledge story</h2>
        <div className="completion-grid">
          <article className="card">
            <span className="status-badge current">Currently valid knowledge</span>
            <h3>Review before canon</h3>
            <p>Every accepted change created an immutable Revision with Evidence and provenance.</p>
          </article>
          <article className="card">
            <span className="status-badge historical">Earlier versions preserved</span>
            <h3>Change without forgetting</h3>
            <p>V1, breaking V2, rollback, and V3 restoration remain traceable in one lineage.</p>
          </article>
          <article className="card">
            <span className="status-badge impact-high">Evidence-backed impact</span>
            <h3>Consequences across projects</h3>
            <p>The dependency and exact Revision-bound impact explained why V2 caused rejection.</p>
          </article>
          <article className="card">
            <span className="status-badge impact-low">UI and MCP match</span>
            <h3>One Context operation</h3>
            <p>The local UI and read-only agent tool returned equivalent lifecycle-safe Context.</p>
          </article>
        </div>
      </section>

      <ParityComparison proof={proof} />

      <section className="section-block roadmap-preview" aria-labelledby={roadmapTitleId}>
        <p className="eyebrow">Roadmap preview · not implemented in this demo</p>
        <h2 id={roadmapTitleId}>Where Loxora can go next</h2>
        <div className="roadmap-grid">
          <article>
            <span>01</span>
            <h3>Project-owned portability</h3>
            <p>
              Add deterministic export and reconstruction to close the explicit portability gap.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Broader evidence ingestion</h3>
            <p>Connect repositories and documents while preserving review and provenance.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Production collaboration</h3>
            <p>
              Add permission-aware teamwork and synchronization without weakening local ownership.
            </p>
          </article>
          <article>
            <span>04</span>
            <h3>Continuity beyond software</h3>
            <p>Validate the model with a separately approved novel-canon demonstration.</p>
          </article>
        </div>
      </section>
    </>
  );
}
