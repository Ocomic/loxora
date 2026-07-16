import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GuidedDemoState } from "../../shared/contracts.js";
import { api } from "../api.js";

export interface DemoProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly plannedKnowledgeCount: number;
  readonly freshness: unknown;
  readonly relationship: {
    readonly direction: "DependsOn" | "DependedOnBy";
    readonly severity: string | null;
    readonly relationshipBindingFreshness: string;
    readonly assessmentFreshness: string | null;
    readonly endpointLabel: string;
  } | null;
}

export interface DemoStatus {
  readonly fixtureVersion: string;
  readonly stage: string;
  readonly databaseConnected: boolean;
  readonly highestMigrationId: string;
  readonly projects: readonly DemoProjectSummary[];
  readonly guided: GuidedDemoState;
  readonly preparedContextRequest: Readonly<Record<string, unknown>>;
  readonly mcpReady: boolean;
  readonly lastFailure: string | null;
  readonly currentImpact: unknown;
  readonly historicalV2Impact: unknown;
}

type DemoMode = "guided" | "explore";
interface DemoStateValue {
  readonly status: DemoStatus | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly mode: DemoMode;
  readonly refresh: () => Promise<void>;
  readonly setMode: (mode: DemoMode) => void;
}

const DemoContext = createContext<DemoStateValue | null>(null);

export function DemoStateProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryMode = new URLSearchParams(location.search).get("mode");
  const [mode, setModeValue] = useState<DemoMode>(() =>
    queryMode === "explore" || queryMode === "guided"
      ? queryMode
      : localStorage.getItem("loxora-demo-mode") === "explore"
        ? "explore"
        : "guided",
  );
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setError(null);
      setStatus(await api<DemoStatus>("/api/demo/status"));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Demo status could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (queryMode === "guided" || queryMode === "explore") {
      setModeValue(queryMode);
      localStorage.setItem("loxora-demo-mode", queryMode);
    }
  }, [queryMode]);
  const setMode = useCallback(
    (next: DemoMode) => {
      setModeValue(next);
      localStorage.setItem("loxora-demo-mode", next);
      const params = new URLSearchParams(location.search);
      params.set("mode", next);
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    },
    [location.pathname, location.search, navigate],
  );
  const value = useMemo(
    () => ({ status, error, loading, mode, refresh, setMode }),
    [status, error, loading, mode, refresh, setMode],
  );
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoState(): DemoStateValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoStateProvider is missing");
  return value;
}
