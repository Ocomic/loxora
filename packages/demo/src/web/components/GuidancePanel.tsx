import { GUIDED_STEPS } from "../../shared/contracts.js";
import { DemoActionButton } from "./DemoActionButton.js";
import { useDemoState } from "./DemoState.js";

export function GuidancePanel() {
  const { status, mode } = useDemoState();
  if (mode !== "guided" || !status) return null;
  const guided = status.guided;
  const step = GUIDED_STEPS.find((entry) => entry.id === guided.currentStepId) ?? GUIDED_STEPS[0];
  if (!step) return null;
  const content = (
    <div className="guidance-content">
      <p className="eyebrow">
        Step {step.number} of {GUIDED_STEPS.length}
      </p>
      <h2>{step.title}</h2>
      <p className="stage-progress">{guided.progressDetail}</p>
      <p>{step.objective}</p>
      <dl className="guidance-list">
        <div>
          <dt>What changes</dt>
          <dd>{step.whatChanges}</dd>
        </div>
        <div>
          <dt>Why it matters</dt>
          <dd>{step.whyItMatters}</dd>
        </div>
        <div>
          <dt>Expected result</dt>
          <dd>{step.expectedResult}</dd>
        </div>
      </dl>
      {guided.interruption ? (
        <p className="callout warning" role="alert">
          {guided.interruption}
        </p>
      ) : null}
      <div className="actions">
        <DemoActionButton action={guided.primaryAction} />
        {guided.secondaryAction ? (
          <DemoActionButton action={guided.secondaryAction} secondary />
        ) : null}
      </div>
    </div>
  );
  return (
    <aside className="guidance-panel" aria-label="Current guided step">
      <details open>
        <summary>Guided demo · {step.title}</summary>
        {content}
      </details>
    </aside>
  );
}
