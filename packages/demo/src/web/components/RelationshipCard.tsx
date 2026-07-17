import { TemporalBadge } from "./TemporalBadge.js";

interface RelationshipSummary {
  readonly direction: string;
  readonly endpointLabel: string;
  readonly severity?: string | null;
  readonly relationshipBindingFreshness: string;
  readonly assessmentFreshness?: string | null;
}

export function RelationshipCard({ relationship }: { relationship: RelationshipSummary }) {
  return (
    <article className="relationship-card">
      <p className="eyebrow">Cross-project relationship</p>
      <h3>
        {relationship.direction === "DependsOn" ? "Uses knowledge from" : "Provides knowledge to"}
      </h3>
      <p className="relationship-endpoint">{relationship.endpointLabel}</p>
      <div className="badge-row">
        <TemporalBadge value={`Relationship ${relationship.relationshipBindingFreshness}`} />
        {relationship.assessmentFreshness ? (
          <TemporalBadge value={`Assessment ${relationship.assessmentFreshness}`} />
        ) : null}
        {relationship.severity ? (
          <span className={`status-badge impact-${relationship.severity.toLowerCase()}`}>
            {relationship.severity} impact
          </span>
        ) : null}
      </div>
      <p className="freshness-explanation">
        {relationship.relationshipBindingFreshness === "Stale"
          ? "The reviewed dependency still records an earlier endpoint revision."
          : "The reviewed dependency still matches both currently valid endpoint revisions."}
        {relationship.assessmentFreshness === "Fresh"
          ? " Impact was assessed for the selected revisions."
          : " A new exact impact assessment may be required."}
      </p>
    </article>
  );
}
