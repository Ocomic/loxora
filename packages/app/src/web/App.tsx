import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { MissionOverview } from "./components/MissionOverview.js";
import { Setup } from "./components/Setup.js";
import { Shell } from "./components/Shell.js";
import { useLabels } from "./i18n.js";
import type { SetupInfo } from "./types.js";

/**
 * Without a workspace the app shows the first-launch setup at /setup (Milestone 13);
 * otherwise Mission Control.
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
  if (setup.mode !== "setup" && inSetup) return <Navigate to="/missions" replace />;
  if (setup.mode === "setup") {
    // The setup state is loaded once, so the flow continues through part C after the
    // workspace exists; `onDone` reloads it and Mission Control takes over.
    if (!inSetup) return <Navigate to="/setup" replace />;
    return (
      <Shell setup>
        <Setup
          initial={setup}
          onDone={async () => {
            await load();
            navigate("/missions", { replace: true });
          }}
        />
      </Shell>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/missions" replace />} />
        <Route path="/missions" element={<MissionOverview />} />
        <Route path="/missions/:id" element={<MissionOverview />} />
        <Route path="*" element={<Navigate to="/missions" replace />} />
      </Routes>
    </Shell>
  );
}
