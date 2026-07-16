import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { useApi } from "../hooks/useApi.js";

interface SpaceResult {
  readonly summary: {
    readonly space: { readonly name: string };
    readonly description: string;
    readonly path: {
      readonly segments: readonly {
        readonly kind: string;
        readonly id: string;
        readonly label: string;
      }[];
    };
  };
  readonly collections: readonly {
    readonly collection: { readonly id: string; readonly name: string };
    readonly description?: string;
    readonly currentNodeCount?: number;
    readonly historicalRevisionCount?: number;
  }[];
}

export function SpaceScreen() {
  const { projectId, spaceId } = useParams();
  const { mode } = useDemoState();
  const { data, error, reload } = useApi<SpaceResult>(
    `/api/projects/${projectId}/spaces/${spaceId}`,
  );
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data) return <LoadingState label="Loading Knowledge Space…" />;
  return (
    <>
      <Breadcrumb path={data.summary.path} />
      <header className="page-heading">
        <p className="eyebrow">Knowledge Space</p>
        <h1>{data.summary.space.name}</h1>
        <p>{data.summary.description}</p>
      </header>
      <div className="grid">
        {data.collections.map((item) => (
          <article className="card" key={item.collection.id}>
            <h2>{item.collection.name}</h2>
            <p>{item.description}</p>
            {item.currentNodeCount !== undefined ? (
              <p>
                {item.currentNodeCount} Current Nodes · {item.historicalRevisionCount} historical
                Revisions
              </p>
            ) : null}
            <Link
              className="text-link"
              to={withMode(`/projects/${projectId}/collections/${item.collection.id}`, mode)}
            >
              Open Collection →
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
