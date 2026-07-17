import { DemoActionButton } from "../components/DemoActionButton.js";
import { useDemoState } from "../components/DemoState.js";
import { ImpactFlow, type ImpactPathLike } from "../components/ImpactFlow.js";
import { LoadingState } from "../components/AsyncState.js";

interface DependencyResult {
  readonly path: ImpactPathLike;
}

export function ImpactScreen() {
  const { status } = useDemoState();
  if (!status) return <LoadingState label="Loading cross-project impact…" />;
  const current = (status.currentImpact as DependencyResult | null)?.path ?? null;
  const historical = status.historicalV2Impact as ImpactPathLike | null;
  const action = status.guided.availableActions.find(
    (item) => item.id === "assess-impact" || item.id === "record-rollback",
  );
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Evidence-backed cross-project intelligence</p>
        <h1>Cross-project impact</h1>
        <p>
          Relationship bindings remain frozen. Impact Assessments independently bind the exact
          provider and consumer Revisions selected for the question.
        </p>
      </header>
      {action && !status.guided.lastResult ? (
        <section className="next-action-card">
          <div>
            <p className="eyebrow">Next real operation</p>
            <h2>
              {action.id === "assess-impact"
                ? "Assess the breaking V2 change"
                : "Record the rollback decision"}
            </h2>
            <p>
              {action.id === "assess-impact"
                ? "The provider removed customer_id while the consumer still requires it."
                : "Rollback records that V2 is no longer desired. It does not delete V2 or reactivate V1."}
            </p>
          </div>
          <DemoActionButton action={action} />
        </section>
      ) : null}
      {current ? (
        <>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Selected Current dependency state</p>
              <h2>
                {current.assessment?.severity === "Low"
                  ? "Current compatibility restored"
                  : "Current impact path"}
              </h2>
            </div>
          </div>
          <ImpactFlow path={current} />
        </>
      ) : (
        <p className="callout neutral">
          The reviewed dependency becomes available after both V1 revisions are accepted.
        </p>
      )}
      {historical && historical.assessment?.severity === "High" && current !== historical ? (
        <>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Preserved historical assessment</p>
              <h2>V2 High impact was not erased</h2>
            </div>
          </div>
          <ImpactFlow path={historical} historical />
        </>
      ) : null}
    </>
  );
}
