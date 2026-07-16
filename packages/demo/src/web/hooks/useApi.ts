import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
export function useApi<T>(path: string) {
  const [result, setResult] = useState<{ path: string; value: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setError(null);
      setResult({ path, value: await api<T>(path) });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Request failed");
    }
  }, [path]);
  useEffect(() => {
    void reload();
    return () => {};
  }, [reload]);
  return { data: result?.path === path ? result.value : null, error, reload };
}
