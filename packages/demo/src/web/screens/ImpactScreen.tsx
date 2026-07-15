import { post } from "../api.js";
import { useApi } from "../hooks/useApi.js";
import { JsonPanel } from "../components/JsonPanel.js";
interface ImpactStatus {
  readonly stage: string;
  readonly [key: string]: unknown;
}
export function ImpactScreen() {
  const { data, reload } = useApi<ImpactStatus>("/api/demo/status");
  const stage = data?.stage;
  return (
    <>
      <h1>Cross-project impact</h1>
      <p>Relationship bindings remain frozen; assessments bind the exact selected revisions.</p>
      <div className="actions">
        {stage === "V2Accepted" ? (
          <button
            type="button"
            onClick={async () => {
              await post("/api/demo/assess-impact");
              await reload();
            }}
          >
            Create High V2 assessment
          </button>
        ) : null}
        {stage === "ImpactAssessed" ? (
          <button
            type="button"
            onClick={async () => {
              await post("/api/demo/rollback");
              await reload();
            }}
          >
            Record rollback
          </button>
        ) : null}
      </div>
      <JsonPanel value={data} />
    </>
  );
}
