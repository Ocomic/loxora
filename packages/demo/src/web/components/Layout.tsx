import { type PropsWithChildren, useId } from "react";
import { NavLink } from "react-router-dom";
import { DemoActionButton, withMode } from "./DemoActionButton.js";
import { DemoStateProvider, useDemoState } from "./DemoState.js";
import { GuidancePanel } from "./GuidancePanel.js";
import { GuidedStepper } from "./GuidedStepper.js";
import { ResultSummary } from "./ResultSummary.js";
export function Layout({ children }: PropsWithChildren) {
  return (
    <DemoStateProvider>
      <DemoShell>{children}</DemoShell>
    </DemoStateProvider>
  );
}

function DemoShell({ children }: PropsWithChildren) {
  const { status, mode, setMode, loading, error } = useDemoState();
  const mainId = useId();
  return (
    <>
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to={withMode("/", mode)} className="brand">
          Loxora
        </NavLink>
        <fieldset className="mode-switch">
          <legend className="sr-only">Demo mode</legend>
          <button type="button" aria-pressed={mode === "guided"} onClick={() => setMode("guided")}>
            Guided Demo
          </button>
          <button
            type="button"
            aria-pressed={mode === "explore"}
            onClick={() => setMode("explore")}
          >
            Explore
          </button>
        </fieldset>
        <div className="stage-chip">
          <span>Canonical stage</span>
          <strong>{status?.stage ?? "Loading"}</strong>
        </div>
        {status ? (
          <DemoActionButton
            action={
              status.guided.availableActions.find((action) => action.id === "reset") ??
              status.guided.primaryAction
            }
            secondary
          />
        ) : null}
      </header>
      <nav className="primary-nav" aria-label="Product navigation">
        {[
          ["/", "Home"],
          ["/reviews", "Review Inbox"],
          ["/impact", "Impact"],
          ["/context", "Context Package"],
          ["/proof", "MCP Proof"],
        ].map(([path, label]) => (
          <NavLink key={path} to={withMode(path ?? "/", mode)}>
            {label}
          </NavLink>
        ))}
      </nav>
      <GuidedStepper />
      {error ? (
        <p className="global-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="app-layout">
        <main id={mainId} data-main-content aria-busy={loading}>
          {children}
          <ResultSummary />
        </main>
        <GuidancePanel />
      </div>
    </>
  );
}
