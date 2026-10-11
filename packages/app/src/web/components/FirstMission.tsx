import { createContext, type ReactNode, useContext, useState } from "react";
import { post, usePolling } from "../api.js";
import type { FirstSteps, SetupInfo } from "../types.js";

/**
 * The first Mission offer (Milestone 14 section 4), pinned in Xora's direct chat since
 * Milestone 15 section 5. It is shown from the setup state, not stored as chat messages. It
 * follows the Mission as it moves on, and it can be dismissed; the dismissal is stored in
 * the settings file. The hints after the goal is recorded are no longer an offer on the
 * server, so the guide stays open in the browser until the captain closes it.
 */
const FirstMissionContext = createContext<{
  readonly steps: FirstSteps | null;
  /** The guide is pinned in the direct chat: the offer is pending or the hints are open. */
  readonly open: boolean;
  readonly setHints: (open: boolean) => void;
  readonly dismiss: () => void;
}>({ steps: null, open: false, setHints: () => undefined, dismiss: () => undefined });

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
  const [hints, setHints] = useState(false);
  const steps = setup.data ? (setup.data.firstSteps ?? null) : initial;
  const dismiss = () => {
    setHints(false);
    void post("/api/setup/finish", { skipped: true })
      .then(() => Promise.all([setup.reload(), onDismissed()]))
      .catch(() => undefined);
  };
  const open = Boolean(steps?.pending) || hints;
  return (
    <FirstMissionContext.Provider value={{ steps, open, setHints, dismiss }}>
      {children}
    </FirstMissionContext.Provider>
  );
}

export function useFirstMission() {
  return useContext(FirstMissionContext);
}
