import { useId } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { RelationshipCard } from "../components/RelationshipCard.js";
import { TechnicalDetails } from "../components/TechnicalDetails.js";
import { useApi } from "../hooks/useApi.js";

export function ProjectScreen() {
  const { id } = useParams();
  const spacesHeadingId = useId();
  const relationshipsHeadingId = useId();
  const { mode } = useDemoState();
  const { data, error, reload } = useApi<ProjectMapResult>(`/api/projects/${id}/map`);
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data) return <LoadingState label="Loading Project Map…" />;
  const relationships = [...data.outgoingDependencies, ...data.incomingDependents];
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to={withMode("/", mode)}>Home</Link>
        <span aria-hidden="true">/</span>
        <span>{data.project.name}</span>
      </nav>
      <header className="page-heading">
        <p className="eyebrow">Project Map</p>
        <h1>{data.project.name}</h1>
        <p>{data.purpose}</p>
      </header>
      <div className="summary-metrics">
        <strong>
          {data.currentNodeCount}
          <span>Current Nodes</span>
        </strong>
        <strong>
          {data.acceptedRevisionCount}
          <span>accepted Revisions</span>
        </strong>
        <strong>
          {data.historicalRevisionCount}
          <span>historical Revisions</span>
        </strong>
        <strong>
          {data.plannedKnowledgeCount}
          <span>Planned items</span>
        </strong>
      </div>
      <section aria-labelledby={spacesHeadingId}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Navigate before loading</p>
            <h2 id={spacesHeadingId}>Knowledge Spaces</h2>
          </div>
        </div>
        <div className="grid">
          {data.spaces.map((space) => (
            <article className="card" key={space.space.id}>
              <h3>{space.space.name}</h3>
              <p>{space.description}</p>
              <p>
                {space.currentNodeCount} Current Nodes · {space.historicalRevisionCount} historical
                Revisions
              </p>
              <Link
                className="text-link"
                to={withMode(`/projects/${id}/spaces/${space.space.id}`, mode)}
              >
                Open Space →
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby={relationshipsHeadingId}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cross-project intelligence</p>
            <h2 id={relationshipsHeadingId}>Relationships</h2>
          </div>
        </div>
        {relationships.length ? (
          <div className="grid">
            {relationships.map((relationship) => (
              <RelationshipCard
                relationship={{
                  direction: relationship.direction,
                  endpointLabel:
                    relationship.endpointPath?.segments
                      .map((segment) => segment.label)
                      .join(" / ") ?? "Restricted endpoint",
                  severity: relationship.latestSeverity,
                  relationshipBindingFreshness: relationship.relationshipBindingFreshness,
                  assessmentFreshness: relationship.assessmentFreshness,
                }}
                key={relationship.relationshipId}
              />
            ))}
          </div>
        ) : (
          <p className="callout neutral">
            No reviewed cross-project relationship is available yet.
          </p>
        )}
      </section>
      {data.warnings.length ? (
        <section>
          <h2>Navigation health</h2>
          {data.warnings.map((warning) => (
            <p className="callout warning" key={`${warning.code}:${warning.entityId}`}>
              {warning.detail}
            </p>
          ))}
        </section>
      ) : null}
      <TechnicalDetails label="Project Map projection details">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </TechnicalDetails>
    </>
  );
}

interface ProjectMapResult {
  readonly project: { readonly name: string };
  readonly purpose: string;
  readonly currentNodeCount: number;
  readonly acceptedRevisionCount: number;
  readonly historicalRevisionCount: number;
  readonly plannedKnowledgeCount: number;
  readonly spaces: readonly {
    readonly space: { readonly id: string; readonly name: string };
    readonly description: string;
    readonly currentNodeCount: number;
    readonly historicalRevisionCount: number;
  }[];
  readonly warnings: readonly {
    readonly code: string;
    readonly entityId: string;
    readonly detail: string;
  }[];
  readonly outgoingDependencies: readonly Dependency[];
  readonly incomingDependents: readonly Dependency[];
}
interface Dependency {
  readonly relationshipId: string;
  readonly direction: "DependsOn" | "DependedOnBy";
  readonly endpointPath: { readonly segments: readonly { readonly label: string }[] } | null;
  readonly latestSeverity: string | null;
  readonly relationshipBindingFreshness: string;
  readonly assessmentFreshness: string | null;
}
