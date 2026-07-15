import { useState } from "react";
import { post } from "../api.js";
import { JsonPanel } from "../components/JsonPanel.js";
const portal = "20000000-0000-4000-8000-000000000001",
  node = "20000000-0000-4000-8000-000000000004";
export function ContextScreen() {
  const [result, setResult] = useState<unknown>(null);
  return (
    <>
      <h1>Context Package inspector</h1>
      <p>
        Structured Current request; selection, dependency traversal and budget remain Core-owned.
      </p>
      <button
        type="button"
        onClick={async () =>
          setResult(
            await post("/api/context-packages", {
              projectId: portal,
              focusNodeIds: [node],
              temporalViews: ["Current"],
              includeRelatedProjects: true,
              relationshipTypes: ["DependsOn"],
              maxDependencyDepth: 1,
              taskLabel: "Update customer-portal authentication safely",
              estimatedTokenBudget: 12000,
            }),
          )
        }
      >
        Build Current Context Package
      </button>
      {result ? <JsonPanel value={result} /> : null}
    </>
  );
}
