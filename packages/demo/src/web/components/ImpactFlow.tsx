import { EvidenceSummary } from "./EvidenceSummary.js";
import { TechnicalDetails } from "./TechnicalDetails.js";
import { TemporalBadge } from "./TemporalBadge.js";

export interface ImpactPathLike {
  readonly provider: {
    readonly projectId: string | null;
    readonly revisionId: string | null;
    readonly path: { readonly segments: readonly { readonly label: string }[] } | null;
    readonly temporalClassification: string | null;
  };
  readonly consumer: {
    readonly projectId: string | null;
    readonly revisionId: string | null;
    readonly path: { readonly segments: readonly { readonly label: string }[] } | null;
    readonly temporalClassification: string | null;
  };
  readonly reverseLabel: string;
  readonly relationshipBindingFreshness: string;
  readonly assessmentFreshness: string | null;
  readonly assessment: {
    readonly severity: string;
    readonly facts: Record<string, unknown>;
    readonly basisFingerprint?: string;
  } | null;
  readonly evidence: readonly {
    readonly id: string;
    readonly projectId: string;
    readonly summary: string;
  }[];
  readonly warnings: readonly string[];
}

const endpointName = (endpoint: ImpactPathLike["provider"]) =>
  endpoint.path?.segments
    .map((segment) => segment.label)
    .slice(-2)
    .join(" / ") ?? "Inaccessible endpoint";

export function ImpactFlow({
  path,
  historical = false,
}: {
  path: ImpactPathLike;
  historical?: boolean;
}) {
  return (
    <section className={`impact-flow ${historical ? "historical-impact" : ""}`}>
      <div className="impact-endpoint">
        <span>{path.provider.projectId ? "Provider" : "Restricted provider"}</span>
        <strong>{endpointName(path.provider)}</strong>
        <TemporalBadge value={path.provider.temporalClassification ?? "Unknown"} />
      </div>
      <div className="impact-connector">
        <span>↓</span>
        <strong>{path.reverseLabel}</strong>
      </div>
      <div className="impact-endpoint">
        <span>{path.consumer.projectId ? "Affected consumer" : "Restricted consumer"}</span>
        <strong>{endpointName(path.consumer)}</strong>
        <TemporalBadge value={path.consumer.temporalClassification ?? "Unknown"} />
      </div>
      <div className={`impact-severity ${path.assessment?.severity.toLowerCase() ?? "missing"}`}>
        <span>Compatibility impact</span>
        <strong>{path.assessment?.severity ?? "Not assessed"}</strong>
      </div>
      <div className="badge-row">
        <TemporalBadge value={`Relationship ${path.relationshipBindingFreshness}`} />
        {path.assessmentFreshness ? (
          <TemporalBadge value={`Assessment ${path.assessmentFreshness}`} />
        ) : null}
      </div>
      <p className="freshness-explanation">
        {path.relationshipBindingFreshness === "Stale"
          ? "The accepted dependency remains unchanged and traceable to its earlier reviewed revisions."
          : "The accepted dependency matches the currently selected endpoint revisions."}
        {path.assessmentFreshness === "Fresh"
          ? " The impact assessment applies exactly to the revisions shown here."
          : " No fresh exact assessment applies to both revisions shown here."}
      </p>
      {path.assessment ? (
        <div className="impact-explanation">
          <h3>Why this matters</h3>
          <p>{String(path.assessment.facts.changeSummary ?? "Provider knowledge changed")}</p>
          <p>
            {String(
              path.assessment.facts.consumerConstraint ??
                "The consumer has a compatibility constraint",
            )}
          </p>
          <p>
            <strong>Consequence:</strong>{" "}
            {String(path.assessment.facts.consequence ?? "Review required")}
          </p>
        </div>
      ) : (
        <p className="callout warning">
          No applicable Impact Assessment exists for this exact Revision pair. The dependency path
          remains valid.
        </p>
      )}
      <EvidenceSummary evidence={path.evidence} />
      <TechnicalDetails>
        <pre>{JSON.stringify(path, null, 2)}</pre>
      </TechnicalDetails>
    </section>
  );
}
