import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { DemoActionButton } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { TemporalBadge, TemporalLegend } from "../components/TemporalBadge.js";
import { useApi } from "../hooks/useApi.js";

interface CurrentResult {
  readonly node: { readonly title: string };
  readonly revision: { readonly id: string; readonly content: string };
  readonly revisionRole: string;
}

interface HistoryResult {
  readonly entries: readonly {
    readonly revision: { readonly id: string };
    readonly revisionRole: string;
    readonly isCurrent: boolean;
  }[];
}

interface PlanResult {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly blockingCondition: string;
}

export function TemporalComparisonScreen() {
  const { status } = useDemoState();
  if (!status) return <LoadingState label="Loading the three temporal views…" />;
  if (!status.guided.availableStepIds.includes("compare-time"))
    return (
      <section className="state-panel warning">
        <strong>This guided step is not available yet</strong>
        <p>Complete the server-provided lifecycle actions before comparing temporal views.</p>
      </section>
    );
  return <TemporalComparisonContent status={status} />;
}

function TemporalComparisonContent({
  status,
}: {
  status: NonNullable<ReturnType<typeof useDemoState>["status"]>;
}) {
  const target = status.guided.temporalReviewTarget;
  const current = useApi<CurrentResult>(
    `/api/projects/${target.historyProjectId}/nodes/${target.historyNodeId}/current`,
  );
  const history = useApi<HistoryResult>(
    `/api/projects/${target.historyProjectId}/nodes/${target.historyNodeId}/history`,
  );
  const planned = useApi<PlanResult[]>(
    `/api/projects/${target.plannedProjectId}/nodes/${target.plannedNodeId}/planned`,
  );
  const error = current.error ?? history.error ?? planned.error;
  if (error)
    return (
      <ErrorState
        message={error}
        retry={() => void Promise.all([current.reload(), history.reload(), planned.reload()])}
      />
    );
  if (!current.data || !history.data || !planned.data)
    return <LoadingState label="Loading the three temporal views…" />;
  const action = status.guided.availableActions.find(
    (item) => item.id === "confirm-temporal-review",
  );
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Past attempts, present guidance, future intent</p>
        <h1>Compare knowledge across time</h1>
        <p>
          Loxora keeps currently valid knowledge, earlier versions, and planned changes separate so
          none can be mistaken for another.
        </p>
      </header>
      <TemporalLegend />
      <section className="temporal-comparison" aria-label="Temporal knowledge comparison">
        <article className="temporal-summary current-view">
          <TemporalBadge value="Current" />
          <p className="plain-state-label">Currently valid knowledge</p>
          <h2>{current.data.node.title} · V3 restoration</h2>
          <p>{current.data.revision.content}</p>
        </article>
        <article className="temporal-summary historical-view">
          <TemporalBadge value="Historical" />
          <p className="plain-state-label">Earlier versions remain traceable</p>
          <h2>V1 → V2 → V3</h2>
          <ol className="compact-lineage">
            {history.data.entries.map((entry, index) => (
              <li key={entry.revision.id}>
                <strong>V{index + 1}</strong>
                <span>{entry.revisionRole}</span>
                <span>{entry.isCurrent ? "Currently valid" : "Earlier version"}</span>
              </li>
            ))}
          </ol>
        </article>
        <article className="temporal-summary planned-view">
          <TemporalBadge value="Planned" />
          <p className="plain-state-label">Planned change, not current guidance</p>
          {planned.data.map((plan) => (
            <div key={plan.id}>
              <h2>{plan.title}</h2>
              <p>
                <strong>{plan.status}:</strong> {plan.blockingCondition}
              </p>
            </div>
          ))}
        </article>
      </section>
      {action ? (
        <section className="next-action-card">
          <div>
            <p className="eyebrow">Separation confirmed from real read APIs</p>
            <h2>Continue with task-specific knowledge</h2>
            <p>The server will revalidate V3, the full lineage, and the Deferred plan.</p>
          </div>
          <DemoActionButton action={action} />
        </section>
      ) : status.guided.temporalReviewComplete ? (
        <p className="callout success">Temporal views are confirmed. Continue to Context.</p>
      ) : (
        <p className="callout warning">Complete the restoration before confirming these views.</p>
      )}
    </>
  );
}
