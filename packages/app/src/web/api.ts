import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const value = (await response.json()) as { message?: string; error?: string };
  if (!response.ok) {
    throw new ApiError(value.message ?? value.error ?? "Request failed", response.status);
  }
  return value as T;
}

/** Polls a read route (RFC-010, section 6); "Live" in the UI means this polling. */
export function usePolling<T>(path: string, intervalMs = 5000) {
  const [state, setState] = useState<{ path: string; data: T } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      const data = await api<T>(path);
      setState({ path, data });
      setError(null);
      setUpdatedAt(Date.now());
    } catch (value) {
      setError(value instanceof ApiError ? value : new ApiError("Request failed", 0));
    }
  }, [path]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [load, intervalMs]);
  return { data: state?.path === path ? state.data : null, error, updatedAt };
}
