import { useApi } from "../hooks/useApi.js";
import { JsonPanel } from "../components/JsonPanel.js";
export function ProofScreen() {
  const { data } = useApi("/api/demo/mcp-proof");
  return (
    <>
      <h1>MCP parity proof</h1>
      <p>
        Run <code>npm run demo:mcp:proof</code>. It launches the real read-only stdio server
        exposing only <code>loxora_get_context</code>.
      </p>
      <p className="mono">
        LOXORA_DATA_ROOT=&lt;repo&gt;/var/demo
        <br />
        LOXORA_DB_PATH=loxora-demo.sqlite
      </p>
      <JsonPanel value={data} />
    </>
  );
}
