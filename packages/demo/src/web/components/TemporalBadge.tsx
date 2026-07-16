export function TemporalBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized.includes("current") || normalized.includes("canonical")
      ? "current"
      : normalized.includes("planned") || normalized.includes("deferred")
        ? "planned"
        : normalized.includes("histor") ||
            normalized.includes("supersed") ||
            normalized.includes("revert")
          ? "historical"
          : "neutral";
  return <span className={`status-badge ${tone}`}>{value}</span>;
}

export function TemporalLegend() {
  return (
    <aside className="temporal-legend" aria-label="Temporal state legend">
      <div>
        <TemporalBadge value="Current" />
        <span>Active project understanding</span>
      </div>
      <div>
        <TemporalBadge value="Historical" />
        <span>Preserved previous understanding</span>
      </div>
      <div>
        <TemporalBadge value="Planned" />
        <span>Intended future change</span>
      </div>
    </aside>
  );
}
