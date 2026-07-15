import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { JsonPanel } from "../components/JsonPanel.js";
export function NodeScreen() {
  const { projectId, nodeId } = useParams();
  const [params] = useSearchParams();
  const view = params.get("view") ?? "current";
  const { data } = useApi<unknown>(`/api/projects/${projectId}/nodes/${nodeId}/${view}`);
  return (
    <>
      <nav className="breadcrumb">
        <Link to={`/projects/${projectId}`}>Project Map</Link>
        <span>/ Node</span>
      </nav>
      <h1>Knowledge Node</h1>
      <nav className="tabs">
        <Link className={view === "current" ? "active" : ""} to={`?view=current`}>
          Current
        </Link>
        <Link
          className={view === "history" ? "active historical" : "historical"}
          to="?view=history"
        >
          History
        </Link>
        <Link className={view === "planned" ? "active planned" : "planned"} to="?view=planned">
          Planned
        </Link>
      </nav>
      <JsonPanel title={view} value={data} />
    </>
  );
}
