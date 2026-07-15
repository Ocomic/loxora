import { Link, useParams } from "react-router-dom";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { useApi } from "../hooks/useApi.js";

interface SpaceResult {
  readonly summary: {
    readonly space: { readonly name: string };
    readonly path: {
      readonly segments: readonly { readonly id: string; readonly label: string }[];
    };
  };
  readonly collections: readonly {
    readonly collection: { readonly id: string; readonly name: string };
  }[];
}

export function SpaceScreen() {
  const { projectId, spaceId } = useParams();
  const { data } = useApi<SpaceResult>(`/api/projects/${projectId}/spaces/${spaceId}`);
  if (!data) return <p>Loading Space…</p>;
  return (
    <>
      <Breadcrumb path={data.summary.path} />
      <h1>{data.summary.space.name}</h1>
      {data.collections.map((item) => (
        <article className="card" key={item.collection.id}>
          <h2>{item.collection.name}</h2>
          <Link to={`/projects/${projectId}/collections/${item.collection.id}`}>
            Open Collection →
          </Link>
        </article>
      ))}
    </>
  );
}
