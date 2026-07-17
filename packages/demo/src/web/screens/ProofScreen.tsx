import { Navigate } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { ParityComparison } from "../components/ParityComparison.js";
import { useDemoState } from "../components/DemoState.js";
import { withMode } from "../components/DemoActionButton.js";

export function ProofScreen() {
  const { status, mode } = useDemoState();
  const { data, error, reload } =
    useApi<Parameters<typeof ParityComparison>[0]["proof"]>("/api/demo/mcp-proof");
  if (status?.guided.state === "Complete")
    return <Navigate to={withMode("/complete", mode)} replace />;
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data) return <LoadingState label="Loading MCP proof metadata…" />;
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Same Core operation, two transports</p>
        <h1>MCP parity proof</h1>
        <p>
          The browser is only a proof viewer. The command launches the real read-only stdio server
          and calls its sole tool.
        </p>
      </header>
      <section className="command-card">
        <span>Run from the repository root</span>
        <code>npm run demo:mcp:proof</code>
        <button className="button secondary" type="button" onClick={() => void reload()}>
          Refresh proof
        </button>
      </section>
      <ParityComparison proof={data} />
    </>
  );
}
