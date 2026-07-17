import { type PropsWithChildren, useEffect, useId, useLayoutEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BrandLogo } from "./BrandLogo.js";
import { DemoActionButton, withMode } from "./DemoActionButton.js";
import { DemoStateProvider, useDemoState } from "./DemoState.js";
import { GuidancePanel } from "./GuidancePanel.js";
import { GuidedStepper } from "./GuidedStepper.js";
import { ResultSummary } from "./ResultSummary.js";
export function Layout({ children }: PropsWithChildren) {
  return (
    <DemoStateProvider>
      <ScrollToTop />
      <DemoShell>{children}</DemoShell>
    </DemoStateProvider>
  );
}

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);
  return <RouteScrollReset key={`${location.pathname}${location.search}`} />;
}

function RouteScrollReset() {
  useLayoutEffect(() => {
    const previousBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.style.scrollBehavior = previousBehavior;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.documentElement.style.scrollBehavior = previousBehavior;
    };
  }, []);
  return null;
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
        <NavLink to={withMode("/", mode)} className="brand" aria-label="Loxora home">
          <BrandLogo />
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
          <strong>{humanStage(status?.stage)}</strong>
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

function humanStage(stage: string | undefined): string {
  const labels: Record<string, string> = {
    Prepared: "Prepared for review",
    V1Accepted: "Both V1 revisions accepted",
    DependencyAccepted: "Projects connected",
    V2Accepted: "Breaking V2 is current",
    ImpactAssessed: "High impact assessed",
    RollbackRecorded: "Rollback recorded",
    V3Restored: "Compatibility restored",
    Complete: "Demo proof complete",
  };
  return stage ? (labels[stage] ?? stage) : "Loading";
}
