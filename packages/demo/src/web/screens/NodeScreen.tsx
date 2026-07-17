import { Link, useParams, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { withMode } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { EvidenceSummary } from "../components/EvidenceSummary.js";
import { TechnicalDetails } from "../components/TechnicalDetails.js";
import { TemporalBadge, TemporalLegend } from "../components/TemporalBadge.js";
import { useApi } from "../hooks/useApi.js";

type View = "current" | "history" | "planned";
interface Evidence {
  readonly id: string;
  readonly projectId: string;
  readonly summary: string;
}
interface Source {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly locator: string;
}
interface Path {
  readonly segments: readonly {
    readonly kind: string;
    readonly id: string;
    readonly label: string;
  }[];
}
interface CurrentResult {
  readonly project: { readonly id: string; readonly name: string };
  readonly node: { readonly id: string; readonly title: string };
  readonly revision: { readonly id: string; readonly content: string; readonly acceptedAt: string };
  readonly revisionRole: string;
  readonly lifecycleState: string;
  readonly temporalClassification: string;
  readonly evidence: readonly Evidence[];
  readonly sources: readonly Source[];
  readonly navigationPath: Path;
  readonly rollbackEvent: unknown;
}
interface HistoryEntry {
  readonly revision: { readonly id: string; readonly content: string; readonly acceptedAt: string };
  readonly revisionRole: string;
  readonly classifications: readonly string[];
  readonly isCurrent: boolean;
  readonly changeReason: string;
  readonly evidence: readonly Evidence[];
  readonly sources: readonly Source[];
  readonly rollbackEvent: unknown;
}
interface HistoryResult {
  readonly project: { readonly id: string; readonly name: string };
  readonly node: { readonly id: string; readonly title: string };
  readonly entries: readonly HistoryEntry[];
  readonly navigationPath: Path;
}
interface PlanResult {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly reason: string;
  readonly blockingCondition: string;
  readonly relatedRevision: { readonly revisionId: string } | null;
  readonly evidenceReferences: readonly Evidence[];
  readonly sources: readonly Source[];
  readonly navigationPaths: readonly Path[];
}

export function NodeScreen() {
  const { projectId, nodeId } = useParams();
  const [params] = useSearchParams();
  const requested = params.get("view");
  const view: View = requested === "history" || requested === "planned" ? requested : "current";
  const { mode } = useDemoState();
  const nodePath = `/projects/${projectId}/nodes/${nodeId}`;
  const { data, error, reload } = useApi<CurrentResult | HistoryResult | PlanResult[]>(
    `/api/projects/${projectId}/nodes/${nodeId}/${view}`,
  );
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data) return <LoadingState label={`Loading ${view} knowledge…`} />;
  const path = Array.isArray(data)
    ? data[0]?.navigationPaths[0]
    : "navigationPath" in data
      ? data.navigationPath
      : null;
  const title = Array.isArray(data)
    ? (path?.segments.find((segment) => segment.kind === "Node")?.label ?? "Knowledge Node")
    : data.node.title;
  return (
    <>
      {path ? (
        <Breadcrumb path={path} />
      ) : (
        <nav className="breadcrumb">
          <Link to={withMode(`/projects/${projectId}`, mode)}>Project Map</Link>
          <span>/</span>
          <span>{title}</span>
        </nav>
      )}
      <header className="page-heading">
        <p className="eyebrow">Knowledge Node</p>
        <h1>{title}</h1>
        <p>One stable subject with explicit Current, Historical, and Planned understanding.</p>
      </header>
      <nav className="tabs" aria-label="Temporal views">
        <Link
          className={view === "current" ? "active current" : "current"}
          to={withMode(`${nodePath}?view=current`, mode)}
        >
          Current · valid now
        </Link>
        <Link
          className={view === "history" ? "active historical" : "historical"}
          to={withMode(`${nodePath}?view=history`, mode)}
        >
          History · earlier versions
        </Link>
        <Link
          className={view === "planned" ? "active planned" : "planned"}
          to={withMode(`${nodePath}?view=planned`, mode)}
        >
          Planned · future intent
        </Link>
      </nav>
      <TemporalLegend />
      {view === "current" ? (
        <CurrentView value={data as CurrentResult} mode={mode} />
      ) : view === "history" ? (
        <HistoryView value={data as HistoryResult} mode={mode} />
      ) : (
        <PlannedView value={data as PlanResult[]} mode={mode} />
      )}
    </>
  );
}

function CurrentView({ value, mode }: { value: CurrentResult; mode: "guided" | "explore" }) {
  return (
    <section className="temporal-view current-view">
      <div className="row">
        <TemporalBadge value="Current" />
        <TemporalBadge value={value.revisionRole} />
      </div>
      <p className="plain-state-label">Currently valid knowledge for tasks and agents</p>
      <h2>
        {value.node.title} · {roleVersion(value.revisionRole)}
      </h2>
      <p className="knowledge-content">{value.revision.content}</p>
      <dl className="compact-facts">
        <div>
          <dt>Accepted</dt>
          <dd>{new Date(value.revision.acceptedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>{value.lifecycleState}</dd>
        </div>
      </dl>
      <EvidenceSummary evidence={value.evidence} />
      <SourceLinks sources={value.sources} mode={mode} />
      <TechnicalDetails>
        <p className="mono">Revision {value.revision.id}</p>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </TechnicalDetails>
    </section>
  );
}

function HistoryView({ value, mode }: { value: HistoryResult; mode: "guided" | "explore" }) {
  return (
    <section className="temporal-view historical-view">
      <div className="row">
        <TemporalBadge value="Historical" />
        <span>{value.entries.length} accepted Revisions in lineage order</span>
      </div>
      <p className="plain-state-label">
        Earlier versions preserved for explanation, not current guidance
      </p>
      <h2>How project understanding changed</h2>
      <ol className="lineage-overview" aria-label="Accepted Revision lineage">
        {value.entries.map((entry, index) => (
          <li key={`overview:${entry.revision.id}`}>
            <span className="lineage-version">V{index + 1}</span>
            <span>{entry.revisionRole}</span>
            <TemporalBadge value={entry.isCurrent ? "Current" : "Historical"} />
          </li>
        ))}
      </ol>
      <ol className="timeline">
        {value.entries.map((entry, index) => (
          <li className={entry.isCurrent ? "is-current" : ""} key={entry.revision.id}>
            <div className="timeline-marker">V{index + 1}</div>
            <article>
              <div className="row">
                <h3>
                  V{index + 1} · {entry.revisionRole}
                </h3>
                <TemporalBadge value={entry.isCurrent ? "Current" : "Historical"} />
              </div>
              <p>{historySummary(entry, index)}</p>
              <p>
                <strong>Why:</strong> {entry.changeReason}
              </p>
              <p className="knowledge-content compact">{entry.revision.content}</p>
              <EvidenceSummary evidence={entry.evidence} />
              <SourceLinks sources={entry.sources} mode={mode} />
              <TechnicalDetails>
                <p className="mono">Revision {entry.revision.id}</p>
                <pre>{JSON.stringify(entry, null, 2)}</pre>
              </TechnicalDetails>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PlannedView({ value, mode }: { value: PlanResult[]; mode: "guided" | "explore" }) {
  if (!value.length)
    return (
      <section className="state-panel empty">
        <strong>No explicit Planned Knowledge</strong>
        <p>Nothing future-facing is presented as Current.</p>
      </section>
    );
  return (
    <section className="temporal-view planned-view">
      <div className="row">
        <TemporalBadge value="Planned" />
        <span>Future intent, never Current instructions</span>
      </div>
      <p className="plain-state-label">Planned change, not implemented or currently valid</p>
      {value.map((plan) => (
        <article className="plan-card" key={plan.id}>
          <div className="row">
            <TemporalBadge value={plan.status} />
            <span>Not implemented</span>
          </div>
          <h2>{plan.title}</h2>
          <p className="knowledge-content">{plan.description}</p>
          <dl className="guidance-list">
            <div>
              <dt>Reason</dt>
              <dd>{plan.reason}</dd>
            </div>
            <div>
              <dt>Blocked by</dt>
              <dd>{plan.blockingCondition}</dd>
            </div>
            {plan.relatedRevision ? (
              <div>
                <dt>Historical direction</dt>
                <dd className="mono">{plan.relatedRevision.revisionId}</dd>
              </div>
            ) : null}
          </dl>
          <EvidenceSummary evidence={plan.evidenceReferences} />
          <SourceLinks sources={plan.sources} mode={mode} />
          <TechnicalDetails>
            <pre>{JSON.stringify(plan, null, 2)}</pre>
          </TechnicalDetails>
        </article>
      ))}
    </section>
  );
}

function SourceLinks({
  sources,
  mode,
}: {
  sources: readonly Source[];
  mode: "guided" | "explore";
}) {
  if (!sources.length) return null;
  return (
    <section className="source-summary">
      <h3>Sources</h3>
      <ul>
        {sources.map((source) => (
          <li key={`${source.projectId}:${source.id}`}>
            <Link to={withMode(`/projects/${source.projectId}/sources/${source.id}`, mode)}>
              {source.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
const roleVersion = (role: string) =>
  role === "Initial" ? "V1" : role === "Successor" ? "V2" : "V3 restoration";
const historySummary = (entry: HistoryEntry, index: number) =>
  entry.isCurrent
    ? "Compatible customer_id semantics are Current through a new restoration Revision."
    : index === 0
      ? "customer_id was required by the original accepted contract."
      : "subject_id replaced customer_id and produced a preserved compatibility failure.";
