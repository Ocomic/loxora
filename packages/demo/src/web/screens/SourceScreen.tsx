import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { TechnicalDetails } from "../components/TechnicalDetails.js";
import { useApi } from "../hooks/useApi.js";

interface SourceResult {
  readonly source: {
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
    readonly kind: string;
    readonly locator: string;
  };
  readonly evidence: readonly {
    readonly evidence: { readonly id: string; readonly summary: string };
    readonly backlinks: readonly unknown[];
  }[];
}

export function SourceScreen() {
  const { projectId, sourceId } = useParams();
  const { mode } = useDemoState();
  const { data, error, reload } = useApi<SourceResult>(
    `/api/projects/${projectId}/sources/${sourceId}`,
  );
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data) return <LoadingState label="Loading Source reference…" />;
  return (
    <>
      <nav className="breadcrumb">
        <Link to={withMode(`/projects/${projectId}`, mode)}>Project Map</Link>
        <span>/</span>
        <span>Source</span>
      </nav>
      <header className="page-heading">
        <p className="eyebrow">Inspectable Source reference</p>
        <h1>{data.source.title}</h1>
        <p>The locator is preserved as provenance and is never fetched by the demo.</p>
      </header>
      <section className="card">
        <dl className="compact-facts">
          <div>
            <dt>Kind</dt>
            <dd>{data.source.kind}</dd>
          </div>
          <div>
            <dt>Evidence references</dt>
            <dd>{data.evidence.length}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>Evidence from this Source</h2>
        <div className="stack">
          {data.evidence.map((item) => (
            <article className="card" key={item.evidence.id}>
              <h3>{item.evidence.summary}</h3>
              <p>{item.backlinks.length} knowledge backlinks</p>
              <Link
                className="text-link"
                to={withMode(`/projects/${projectId}/evidence/${item.evidence.id}`, mode)}
              >
                Open Evidence →
              </Link>
            </article>
          ))}
        </div>
      </section>
      <TechnicalDetails>
        <p className="mono">Source {data.source.id}</p>
        <p className="mono">Locator reference: {data.source.locator}</p>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </TechnicalDetails>
    </>
  );
}
