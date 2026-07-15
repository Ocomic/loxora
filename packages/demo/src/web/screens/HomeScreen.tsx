import { Link } from "react-router-dom";
import { post } from "../api.js";
import { useApi } from "../hooks/useApi.js";
interface Status {
  stage: string;
  fixtureVersion: string;
  highestMigrationId: string;
  projects: { id: string; name: string; nodeId: string; freshness: unknown }[];
  availableActions: string[];
  mcpReady: boolean;
  lastFailure: string | null;
}
export function HomeScreen() {
  const { data, error, reload } = useApi<Status>("/api/demo/status");
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading diagnostics…</p>;
  return (
    <>
      <div className="hero">
        <p className="eyebrow">Local-first, reviewed project knowledge</p>
        <h1>Final Hackathon Demo</h1>
        <p>Follow the real lifecycle from prepared evidence to MCP-equivalent context.</p>
        <div className="stage">
          <span>Derived stage</span>
          <strong>{data.stage}</strong>
        </div>
      </div>
      <section className="actions">
        <button
          type="button"
          onClick={async () => {
            await post("/api/demo/reset", { stage: "Prepared" });
            await reload();
          }}
        >
          Reset to Prepared
        </button>
        {data.availableActions.map((action) => (
          <span className="pill" key={action}>
            {action}
          </span>
        ))}
      </section>
      <section className="grid">
        {data.projects.map((project) => (
          <article className="card" key={project.id}>
            <p className="eyebrow">Project Map</p>
            <h2>{project.name}</h2>
            <p className="mono">{project.id}</p>
            <Link to={`/projects/${project.id}`}>Open Project Map →</Link>
          </article>
        ))}
      </section>
      <section className="diagnostics">
        <h2>Diagnostics</h2>
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
        {data.lastFailure ? <p role="alert">{data.lastFailure}</p> : null}
      </section>
    </>
  );
}
