import type { LifecycleStore } from "@loxora/core";
import { SqliteLifecycleStore } from "./adapter.js";

export async function openSqliteLifecycleStore(path: string): Promise<LifecycleStore> {
  return new SqliteLifecycleStore(path);
}
