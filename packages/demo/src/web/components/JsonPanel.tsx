interface JsonPanelProps {
  readonly value: unknown;
  readonly title?: string;
}
export function JsonPanel({ value, title }: JsonPanelProps) {
  return (
    <section className="json-panel">
      {title ? <h3>{title}</h3> : null}
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
