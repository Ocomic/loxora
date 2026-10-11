import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { Bridge, MessageLink } from "./components/Bridge.js";
import { FirstMissionProvider, useFirstMission } from "./components/FirstMission.js";
import { FirstSteps } from "./components/FirstSteps.js";
import { MissionOverview } from "./components/MissionOverview.js";
import { Setup } from "./components/Setup.js";
import { Shell } from "./components/Shell.js";
import { useLabels } from "./i18n.js";
import type { SetupInfo } from "./types.js";

/**
 * Without a finished setup the app shows the setup conversation at /setup (Milestone 14);
 * otherwise the bridge, the ship's chat, at /bridge (Milestone 15), with Mission Control at
 * /missions. While the first Mission is offered it is reachable at /first-steps, from a
 * banner and from the empty Mission list.
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
        <section className="panel setup-main" role="alert">
          <p className="setup-warning">{t.setup.unreachable}</p>
          <p className="muted">{t.setup.failed(failed)}</p>
          <button type="button" className="button" onClick={() => void load()}>
            {t.setup.retry}
          </button>
        </section>
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
  const showSetup = setup.mode === "setup" || (setup.mode === "ready" && Boolean(setup.step));
  if (!showSetup && inSetup) return <Navigate to="/bridge" replace />;
  if (showSetup) {
    // The setup state is loaded once, so the conversation continues after the logbook
    // exists; `onDone` reloads it and Mission Control takes over.
    if (!inSetup) return <Navigate to="/setup" replace />;
    return (
      <Shell setup>
        <Setup initial={setup} onDone={load} />
      </Shell>
    );
  }
  const firstStepsOpen = setup.mode === "ready" && setup.firstSteps?.pending === true;
  return (
    <Shell>
      <FirstMissionProvider initial={setup.firstSteps ?? null} onDismissed={load}>
        {location.pathname !== "/first-steps" ? <FirstMissionBanner /> : null}
        <Routes>
          <Route path="/" element={<Navigate to="/bridge" replace />} />
          <Route path="/bridge" element={<Bridge />} />
          <Route path="/bridge/m/:id" element={<MessageLink />} />
          <Route path="/bridge/:address" element={<Bridge />} />
          <Route path="/missions" element={<MissionOverview />} />
          <Route path="/missions/:id" element={<MissionOverview />} />
          <Route
            path="/first-steps"
            element={
              firstStepsOpen ? (
                <FirstSteps
                  onFinished={async () => {
                    await load();
                    navigate("/bridge", { replace: true });
                  }}
                />
              ) : (
                <Navigate to="/bridge" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/bridge" replace />} />
        </Routes>
      </FirstMissionProvider>
    </Shell>
  );
}

/** Offers the first Mission on the bridge while it is open (Milestone 14 section 4). */
function FirstMissionBanner() {
  const t = useLabels();
  const offer = useFirstMission();
  if (!offer.steps?.pending) return null;
  return (
    <aside className="first-steps-banner" aria-label={t.firstSteps.title}>
      <span>{t.firstSteps.banner[offer.steps.stage]}</span>
      <span className="action-row">
        <Link className="button" to="/first-steps">
          {t.firstSteps.continue}
        </Link>
        <button type="button" className="button button-quiet" onClick={offer.dismiss}>
          {t.firstSteps.dismiss}
        </button>
      </span>
    </aside>
  );
}
