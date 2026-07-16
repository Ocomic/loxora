import { EvidenceSummary } from "./EvidenceSummary.js";
import { TechnicalDetails } from "./TechnicalDetails.js";
import { TemporalBadge } from "./TemporalBadge.js";

interface ContextEntry {
  readonly id: string;
  readonly kind: string;
  readonly projectId: string | null;
  readonly nodeId: string | null;
  readonly revisionIds: readonly string[];
  readonly temporalClassification: string | null;
  readonly inclusionReasons: readonly string[];
  readonly evidence: readonly {
    readonly id: string;
    readonly projectId: string;
    readonly summary: string;
  }[];
  readonly impactSeverity: string | null;
  readonly relationshipBindingFreshness: string | null;
  readonly assessmentFreshness: string | null;
  readonly estimatedTokens: number;
}
export interface ContextPackageLike {
  readonly fingerprint: string;
  readonly entries: readonly ContextEntry[];
  readonly includedProjectIds: readonly string[];
  readonly followedDependencyPaths: readonly unknown[];
  readonly requestedBudget: number;
  readonly estimatedUsage: number;
  readonly remainingBudget: number;
  readonly budgetStatus: string;
  readonly omissions: readonly unknown[];
  readonly warnings: readonly string[];
}

export function ContextPackageSummary({ value }: { value: ContextPackageLike }) {
  const assessments = value.entries.filter((entry) => entry.impactSeverity).length;
  return (
    <output className="context-result">
      <p className="eyebrow">Core result</p>
      <h2>Context Package ready</h2>
      <div className="summary-metrics">
        <strong>
          {value.entries.length}
          <span>knowledge entries</span>
        </strong>
        <strong>
          {value.includedProjectIds.length}
          <span>projects</span>
        </strong>
        <strong>
          {value.followedDependencyPaths.length}
          <span>dependency paths</span>
        </strong>
        <strong>
          {assessments}
          <span>impact assessments</span>
        </strong>
      </div>
      <div className="budget-summary">
        <span>
          {value.estimatedUsage.toLocaleString()} / {value.requestedBudget.toLocaleString()}{" "}
          estimated tokens
        </span>
        <TemporalBadge value={value.budgetStatus} />
      </div>
      <ol className="context-entries">
        {value.entries.map((entry) => (
          <li key={entry.id}>
            <article className="card">
              <div className="row">
                <span className="status-badge neutral">{entry.kind}</span>
                {entry.temporalClassification ? (
                  <TemporalBadge value={entry.temporalClassification} />
                ) : null}
                {entry.impactSeverity ? (
                  <span className={`status-badge impact-${entry.impactSeverity.toLowerCase()}`}>
                    {entry.impactSeverity} impact
                  </span>
                ) : null}
              </div>
              <h3>{humanEntryTitle(entry)}</h3>
              <p>
                <strong>Included because:</strong>{" "}
                {entry.inclusionReasons.map(humanReason).join(", ")}
              </p>
              {entry.revisionIds.length ? <p>Revisions: {entry.revisionIds.length}</p> : null}
              <EvidenceSummary evidence={entry.evidence} />
              <small>{entry.estimatedTokens} estimated tokens</small>
            </article>
          </li>
        ))}
      </ol>
      {value.omissions.length ? (
        <p className="callout warning">
          {value.omissions.length} optional entries were omitted to respect the budget.
        </p>
      ) : null}
      {value.warnings.map((warning) => (
        <p className="callout warning" key={warning}>
          {warning}
        </p>
      ))}
      <TechnicalDetails label="Package fingerprint, omissions, and normalized JSON">
        <p className="mono">sha256: {value.fingerprint}</p>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </TechnicalDetails>
    </output>
  );
}

function humanEntryTitle(entry: ContextEntry): string {
  if (entry.kind === "Knowledge") return "Current focus knowledge";
  if (entry.kind === "Dependency") return "Accepted dependency and exact impact";
  if (entry.kind === "Evidence") return "Supporting Evidence";
  if (entry.kind === "History") return "Explicit knowledge History";
  return "Inaccessible related knowledge";
}
function humanReason(value: string): string {
  return (
    (
      {
        ExplicitFocusCurrent: "explicit focus Node",
        RelatedCurrentDependency: "accepted DependsOn relationship",
        AllowedOneHopDependency: "allowed one-hop dependency",
        ExplicitHistory: "History was explicitly requested",
        AdditionalAssessmentEvidence: "supports the exact Impact Assessment",
      } as Record<string, string>
    )[value] ?? value
  );
}
