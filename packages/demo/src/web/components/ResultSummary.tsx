import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { DemoActionButton } from "./DemoActionButton.js";
import { useDemoState } from "./DemoState.js";

export function ResultSummary() {
  const location = useLocation();
  const status = useDemoState().status;
  const receipt = status?.guided.lastResult;
  const resultRef = useRef<HTMLElement>(null);
  const previousKey = useRef<string | null>(null);
  const hydrated = useRef(false);
  const receiptKey = receipt
    ? `${receipt.actionId}:${receipt.stage}:${receipt.artifactIds.join(":")}`
    : null;
  useEffect(() => {
    if (!status) return;
    if (!hydrated.current) {
      hydrated.current = true;
      previousKey.current = receiptKey;
      return;
    }
    if (receiptKey && previousKey.current !== receiptKey) {
      resultRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
      resultRef.current?.focus({ preventScroll: true });
    }
    previousKey.current = receiptKey;
  }, [receiptKey, status]);
  if (!receipt || location.pathname === "/complete") return null;
  const nextAction =
    status?.guided.primaryAction.id === "reset" ? null : status?.guided.primaryAction;
  return (
    <section
      ref={resultRef}
      tabIndex={-1}
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
      {nextAction ? (
        <div className="result-next-action">
          <div>
            <span className="eyebrow">Next server-authorized step</span>
            <p>The result is verified. Continue without losing the guided story.</p>
          </div>
          <DemoActionButton action={nextAction} />
        </div>
      ) : null}
    </section>
  );
}
