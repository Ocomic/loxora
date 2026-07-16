import { useId } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { DemoActionButton, withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { RelationshipCard } from "../components/RelationshipCard.js";
export function HomeScreen() {
  const { status: data, error, refresh, mode } = useDemoState();
  const projectsHeadingId = useId();
  if (error) return <ErrorState message={error} retry={() => void refresh()} />;
  if (!data) return <LoadingState label="Loading the local demo…" />;
  return (
    <>
      <div className="hero">
        <p className="eyebrow">Local-first, reviewed project knowledge</p>
        <h1>Projects should never lose their memory.</h1>
        <p className="hero-copy">
          Know what is current. Understand what changed. See which projects are affected.
        </p>
        <div className="hero-actions">
          <DemoActionButton action={data.guided.primaryAction} />
          <span className="stage">
            <span>Current demo state</span>
            <strong>{data.guided.progressDetail}</strong>
          </span>
        </div>
      </div>
      <section aria-labelledby={projectsHeadingId}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Two real projects</p>
            <h2 id={projectsHeadingId}>Project knowledge at a glance</h2>
          </div>
        </div>
        <div className="grid project-grid">
          {data.projects.map((project) => (
            <article className="card" key={project.id}>
              <p className="eyebrow">Project Map</p>
              <h2>{project.name}</h2>
              <p>{project.purpose}</p>
              <dl className="compact-facts">
                <div>
                  <dt>Critical knowledge</dt>
                  <dd>{project.nodeTitle}</dd>
                </div>
                <div>
                  <dt>Planned items</dt>
                  <dd>{project.plannedKnowledgeCount}</dd>
                </div>
              </dl>
              {project.relationship ? (
                <RelationshipCard relationship={project.relationship} />
              ) : (
                <p className="callout neutral">Dependency appears after reviewed V1 knowledge.</p>
              )}
              <Link className="text-link" to={withMode(`/projects/${project.id}`, mode)}>
                Open Project Map →
              </Link>
            </article>
          ))}
        </div>
      </section>
      <details className="diagnostics">
        <summary>Local demo diagnostics</summary>
        <dl>
          <div>
            <dt>Fixture</dt>
            <dd>{data.fixtureVersion}</dd>
          </div>
          <div>
            <dt>Migration</dt>
            <dd>{data.highestMigrationId}</dd>
          </div>
          <div>
            <dt>MCP build</dt>
            <dd>{data.mcpReady ? "Ready" : "Build required"}</dd>
          </div>
        </dl>
        <p>Database: {data.databaseConnected ? "Connected" : "Unavailable"}</p>
        {data.lastFailure ? (
          <p className="callout error" role="alert">
            {data.lastFailure}
          </p>
        ) : null}
      </details>
    </>
  );
}
