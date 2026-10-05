import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, post, usePolling } from "./api.js";
import { FirstSteps } from "./components/FirstSteps.js";
import { MissionOverview } from "./components/MissionOverview.js";
import { Setup } from "./components/Setup.js";
import { Shell } from "./components/Shell.js";
import { XoraProvider } from "./components/XoraBar.js";
import { useLabels } from "./i18n.js";
import type { SetupInfo } from "./types.js";

/**
 * Without a workspace the app shows the first-launch setup at /setup (Milestone 13);
 * otherwise Mission Control with the Xora input bar, and the first steps at /first-steps
 * while they are pending.
 */
export function App() {
  const t = useLabels();
  const location = useLocation();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setSetup(await api<SetupInfo>("/api/setup"));
      setFailed(null);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <Shell setup>
        <p className="action-error" role="alert">
          {t.setup.failed(failed)}
        </p>
      </Shell>
    );
  }
  if (!setup) return <Shell setup>{null}</Shell>;
  if (setup.mode === "settingsError") {
    return (
      <Shell setup>
        <section className="panel setup-main">
          <p className="setup-warning">{t.setup.settingsError}</p>
          <code>{setup.settingsError}</code>
        </section>
      </Shell>
    );
  }
  const inSetup = location.pathname === "/setup";
  const showSetup = setup.mode === "setup" || (setup.mode === "ready" && setup.introPending);
  const firstStepsOpen = setup.mode === "ready" && setup.firstSteps?.pending === true;
  // After part C the setup continues with the first steps while they are pending.
  if (!showSetup && inSetup) {
    return <Navigate to={firstStepsOpen ? "/first-steps" : "/missions"} replace />;
  }
  if (showSetup) {
    // The setup state is loaded once, so the flow continues through part C after the
    // workspace exists; `onDone` reloads it and Mission Control takes over.
    if (!inSetup) return <Navigate to="/setup" replace />;
    return (
      <Shell setup>
        <Setup
          initial={setup}
          onDone={async () => {
            await post("/api/setup/intro", {}).catch(() => undefined);
            await load();
          }}
        />
      </Shell>
    );
  }
  return (
    <Shell>
      <XoraProvider>
        {firstStepsOpen && location.pathname !== "/first-steps" ? <FirstStepsBanner /> : null}
        <Routes>
          <Route path="/" element={<Navigate to="/missions" replace />} />
          <Route path="/missions" element={<MissionOverview />} />
          <Route path="/missions/:id" element={<MissionOverview />} />
          <Route
            path="/first-steps"
            element={
              firstStepsOpen ? (
                <FirstSteps
                  onFinished={async () => {
                    await load();
                    navigate("/missions", { replace: true });
                  }}
                />
              ) : (
                <Navigate to="/missions" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/missions" replace />} />
        </Routes>
      </XoraProvider>
    </Shell>
  );
}

/** Leads back into the first steps while they are pending (Milestone 13 section 3). */
function FirstStepsBanner() {
  const t = useLabels();
  const setup = usePolling<SetupInfo>("/api/setup", 5000);
  const steps = setup.data?.firstSteps;
  if (!steps?.pending) return null;
  return (
    <aside className="first-steps-banner" aria-label={t.firstSteps.title}>
      <span>{t.firstSteps.banner[steps.stage]}</span>
      <Link className="button" to="/first-steps">
        {t.firstSteps.continue}
      </Link>
    </aside>
  );
}
