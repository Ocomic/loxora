import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { TechnicalDetails } from "../components/TechnicalDetails.js";
import { TemporalBadge } from "../components/TemporalBadge.js";
import { useApi } from "../hooks/useApi.js";

interface EvidenceResult {
  readonly evidence: {
    readonly id: string;
    readonly projectId: string;
    readonly summary: string;
    readonly locator: string;
  };
  readonly source: {
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
    readonly kind: string;
    readonly locator: string;
  };
  readonly backlinks: readonly {
    readonly proposalId: string | null;
    readonly plannedKnowledgeId: string | null;
    readonly revisionId: string | null;
    readonly temporalView: string | null;
    readonly path: {
      readonly segments: readonly {
        readonly kind: string;
        readonly id: string;
        readonly label: string;
      }[];
    };
  }[];
}

export function EvidenceScreen() {
  const { projectId, evidenceId } = useParams();
  const { mode } = useDemoState();
  const { data, error, reload } = useApi<EvidenceResult>(
    `/api/projects/${projectId}/evidence/${evidenceId}`,
  );
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data) return <LoadingState label="Loading Evidence…" />;
  return (
    <>
      <nav className="breadcrumb">
        <Link to={withMode(`/projects/${projectId}`, mode)}>Project Map</Link>
        <span>/</span>
        <span>Evidence</span>
      </nav>
      <header className="page-heading">
        <p className="eyebrow">Traceable Evidence</p>
        <h1>{data.evidence.summary}</h1>
        <p>
          This persisted reference supports the knowledge paths below. Loxora does not dereference
          its locator.
        </p>
      </header>
      <section className="card evidence-card">
        <div className="row">
          <span className="status-badge evidence">Evidence</span>
          <span>{data.source.kind}</span>
        </div>
        <h2>Source: {data.source.title}</h2>
        <Link
          className="text-link"
          to={withMode(`/projects/${projectId}/sources/${data.source.id}`, mode)}
        >
          Open Source reference →
        </Link>
      </section>
      <section>
        <h2>Knowledge backlinks</h2>
        <div className="stack">
          {data.backlinks.map((backlink, index) => (
            <article
              className="card"
              key={`${backlink.revisionId}:${backlink.plannedKnowledgeId}:${index}`}
            >
              <Breadcrumb path={backlink.path} />
              {backlink.temporalView ? <TemporalBadge value={backlink.temporalView} /> : null}
              <p>
                {backlink.revisionId
                  ? "Supports an accepted Revision"
                  : backlink.plannedKnowledgeId
                    ? "Supports explicit Planned Knowledge"
                    : "Supports a submitted Proposal"}
              </p>
            </article>
          ))}
        </div>
      </section>
      <TechnicalDetails>
        <p className="mono">Evidence {data.evidence.id}</p>
        <p className="mono">Locator reference: {data.evidence.locator}</p>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </TechnicalDetails>
    </>
  );
}
