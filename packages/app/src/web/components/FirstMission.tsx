import { createContext, type ReactNode, useContext } from "react";
import { post, usePolling } from "../api.js";
import type { FirstSteps, SetupInfo } from "../types.js";

/**
 * The first Mission offer on the bridge (Milestone 14 section 4): the banner and the empty
 * Mission list read it from here. It follows the Mission as it moves on, and it can be
 * dismissed; the dismissal is stored in the settings file.
 */
const FirstMissionContext = createContext<{
  readonly steps: FirstSteps | null;
  readonly dismiss: () => void;
}>({ steps: null, dismiss: () => undefined });

export function FirstMissionProvider({
  initial,
  onDismissed,
  children,
}: {
  initial: FirstSteps | null;
  onDismissed: () => Promise<void>;
  children: ReactNode;
}) {
  const setup = usePolling<SetupInfo>("/api/setup", 5000);
  const steps = setup.data ? (setup.data.firstSteps ?? null) : initial;
  const dismiss = () => {
    void post("/api/setup/finish", { skipped: true })
      .then(() => Promise.all([setup.reload(), onDismissed()]))
      .catch(() => undefined);
  };
  return (
    <FirstMissionContext.Provider value={{ steps, dismiss }}>
      {children}
    </FirstMissionContext.Provider>
  );
}

export function useFirstMission() {
  return useContext(FirstMissionContext);
}
