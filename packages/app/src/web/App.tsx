import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api.js";
import { Bridge, bridgePath, MessageLink, XORA_ADDRESS } from "./components/Bridge.js";
import { FirstMissionProvider } from "./components/FirstMission.js";
import { MissionOverview } from "./components/MissionOverview.js";
import { Setup } from "./components/Setup.js";
import { Shell } from "./components/Shell.js";
import { useLabels } from "./i18n.js";
import type { SetupInfo } from "./types.js";

/**
 * Without a finished setup the app shows the setup conversation at /setup (Milestone 14);
 * otherwise the bridge, the ship's chat, at /bridge (Milestone 15), with Mission Control at
 * /missions. While the first Mission is offered it is pinned in Xora's direct chat, where the
 * end of the setup leads (Milestone 15 section 5); /first-steps leads there too.
 */
export function App() {
  const t = useLabels();
  const location = useLocation();
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
  const firstStepsOpen = setup.mode === "ready" && setup.firstSteps?.pending === true;
  const guide = bridgePath(XORA_ADDRESS);
  if (!showSetup && inSetup) return <Navigate to={firstStepsOpen ? guide : "/bridge"} replace />;
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
  return (
    <Shell>
      <FirstMissionProvider initial={setup.firstSteps ?? null} onDismissed={load}>
        <Routes>
          <Route path="/" element={<Navigate to="/bridge" replace />} />
          <Route path="/bridge" element={<Bridge />} />
          <Route path="/bridge/m/:id" element={<MessageLink />} />
          <Route path="/bridge/:address" element={<Bridge />} />
          <Route path="/missions" element={<MissionOverview />} />
          <Route path="/missions/:id" element={<MissionOverview />} />
          <Route path="/first-steps" element={<Navigate to={guide} replace />} />
          <Route path="*" element={<Navigate to="/bridge" replace />} />
        </Routes>
      </FirstMissionProvider>
    </Shell>
  );
}
