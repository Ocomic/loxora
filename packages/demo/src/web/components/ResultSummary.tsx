import { useDemoState } from "./DemoState.js";

export function ResultSummary() {
  const receipt = useDemoState().status?.guided.lastResult;
  if (!receipt) return null;
  return (
    <section
      className={`result-summary ${receipt.tone.toLowerCase()}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="eyebrow">Result confirmed from real state</p>
      <h2>{receipt.title}</h2>
      <p>{receipt.message}</p>
      {receipt.facts.length ? (
        <dl className="fact-grid">
          {receipt.facts.map((fact) => (
            <div key={`${fact.label}:${fact.value}`}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
