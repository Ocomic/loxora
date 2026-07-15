import { Link, useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
export function ProjectScreen() {
  const { id } = useParams();
  const { data, error } = useApi<ProjectMapResult>(`/api/projects/${id}/map`);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading Project Map…</p>;
  return (
    <>
      <nav className="breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>{data.project.name}</span>
      </nav>
      <h1>{data.project.name}</h1>
      <p>{data.purpose}</p>
      <div className="metrics">
        <span>
          Current Nodes <strong>{data.currentNodeCount}</strong>
        </span>
        <span>
          Historical Revisions <strong>{data.historicalRevisionCount}</strong>
        </span>
        <span>
          Planned <strong className="planned">{data.plannedKnowledgeCount}</strong>
        </span>
      </div>
      {data.spaces.map((space) => (
        <section className="card" key={space.space.id}>
          <h2>{space.space.name}</h2>
          <p>{space.description}</p>
          <Link to={`/projects/${id}/spaces/${space.space.id}`}>Open Space →</Link>
        </section>
      ))}
      <section className="grid">
        <article className="card">
          <h2>Outgoing dependencies</h2>
          <pre>{JSON.stringify(data.outgoingDependencies, null, 2)}</pre>
        </article>
        <article className="card">
          <h2>Incoming dependents</h2>
          <pre>{JSON.stringify(data.incomingDependents, null, 2)}</pre>
        </article>
      </section>
    </>
  );
}

interface ProjectMapResult {
  readonly project: { readonly name: string };
  readonly purpose: string;
  readonly currentNodeCount: number;
  readonly historicalRevisionCount: number;
  readonly plannedKnowledgeCount: number;
  readonly spaces: readonly {
    readonly space: { readonly id: string; readonly name: string };
    readonly description: string;
  }[];
  readonly outgoingDependencies: unknown;
  readonly incomingDependents: unknown;
}
