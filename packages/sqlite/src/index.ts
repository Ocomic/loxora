import type { LifecycleStore, NavigationStore } from "@loxora/core";
import { SqliteLifecycleStore } from "./adapter.js";

export async function openSqliteLifecycleStore(path: string): Promise<LifecycleStore> {
  return new SqliteLifecycleStore(path);
}

export async function openSqliteStore(path: string): Promise<LifecycleStore & NavigationStore> {
  return new SqliteLifecycleStore(path);
}
