import { Link } from "react-router-dom";
import { useDemoState } from "./DemoState.js";
import { withMode } from "./DemoActionButton.js";

interface EvidenceLike {
  readonly id: string;
  readonly projectId: string;
  readonly summary: string;
  readonly sourceReferenceId?: string;
}

export function EvidenceSummary({
  evidence,
  title = "Evidence",
}: {
  evidence: readonly EvidenceLike[];
  title?: string;
}) {
  const { mode } = useDemoState();
  if (!evidence.length) return null;
  return (
    <section className="evidence-summary">
      <h3>{title}</h3>
      <ul>
        {evidence.map((item) => (
          <li key={`${item.projectId}:${item.id}`}>
            <Link to={withMode(`/projects/${item.projectId}/evidence/${item.id}`, mode)}>
              {item.summary}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
