import { Link, useParams } from "react-router-dom";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { useApi } from "../hooks/useApi.js";

interface CollectionResult {
  readonly summary: {
    readonly collection: { readonly name: string };
    readonly path: {
      readonly segments: readonly { readonly id: string; readonly label: string }[];
    };
  };
  readonly nodes: readonly {
    readonly node: { readonly id: string; readonly title: string };
    readonly currentPreview: string | null;
  }[];
}

export function CollectionScreen() {
  const { projectId, collectionId } = useParams();
  const { data } = useApi<CollectionResult>(
    `/api/projects/${projectId}/collections/${collectionId}`,
  );
  if (!data) return <p>Loading Collection…</p>;
  return (
    <>
      <Breadcrumb path={data.summary.path} />
      <h1>{data.summary.collection.name}</h1>
      {data.nodes.map((item) => (
        <article className="card" key={item.node.id}>
          <h2>{item.node.title}</h2>
          <p>{item.currentPreview}</p>
          <Link to={`/projects/${projectId}/nodes/${item.node.id}`}>Open Node →</Link>
        </article>
      ))}
    </>
  );
}
