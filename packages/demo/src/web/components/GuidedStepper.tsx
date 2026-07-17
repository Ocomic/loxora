import { GUIDED_PHASES, GUIDED_STEPS } from "../../shared/contracts.js";
import { useDemoState } from "./DemoState.js";

export function GuidedStepper() {
  const { status, mode } = useDemoState();
  if (mode !== "guided" || !status) return null;
  const guided = status.guided;
  return (
    <nav className="guided-stepper" aria-label="Guided demo progress">
      <div className="guided-phase-summary" aria-live="polite">
        <strong>
          Phase {guided.currentPhase.number} of {GUIDED_PHASES.length} · {guided.currentPhase.title}
        </strong>
        <span>
          Step {GUIDED_STEPS.find((step) => step.id === guided.currentStepId)?.number ?? 1} of{" "}
          {GUIDED_STEPS.length}
        </span>
      </div>
      <ol>
        {GUIDED_STEPS.map((step) => {
          const complete = guided.completedStepIds.includes(step.id);
          const current = guided.currentStepId === step.id;
          const available = guided.availableStepIds.includes(step.id);
          return (
            <li
              className={complete ? "complete" : current ? "current" : "upcoming"}
              aria-current={current ? "step" : undefined}
              aria-disabled={!available}
              key={step.id}
              title={step.title}
            >
              <span>{complete ? "✓" : step.number}</span>
              <strong>{step.title}</strong>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
