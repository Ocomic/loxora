import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { useApi } from "../hooks/useApi.js";

interface CollectionResult {
  readonly summary: {
    readonly collection: { readonly name: string };
    readonly description: string;
    readonly path: {
      readonly segments: readonly {
        readonly kind: string;
        readonly id: string;
        readonly label: string;
      }[];
    };
  };
  readonly nodes: readonly {
    readonly node: { readonly id: string; readonly title: string };
    readonly currentPreview: string | null;
    readonly acceptedRevisionCount: number;
    readonly historicalRevisionCount: number;
  }[];
}

export function CollectionScreen() {
  const { projectId, collectionId } = useParams();
  const { mode } = useDemoState();
  const { data, error, reload } = useApi<CollectionResult>(
    `/api/projects/${projectId}/collections/${collectionId}`,
  );
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data) return <LoadingState label="Loading Knowledge Collection…" />;
  return (
    <>
      <Breadcrumb path={data.summary.path} />
      <header className="page-heading">
        <p className="eyebrow">Knowledge Collection</p>
        <h1>{data.summary.collection.name}</h1>
        <p>{data.summary.description}</p>
      </header>
      <div className="grid">
        {data.nodes.map((item) => (
          <article className="card" key={item.node.id}>
            <h2>{item.node.title}</h2>
            <p>{item.currentPreview ?? "No Current preview"}</p>
            <p>
              {item.acceptedRevisionCount} accepted · {item.historicalRevisionCount} historical
            </p>
            <Link
              className="text-link"
              to={withMode(`/projects/${projectId}/nodes/${item.node.id}`, mode)}
            >
              Open Node →
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
