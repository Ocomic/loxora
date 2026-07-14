import type {
  ContextPackageStore,
  CrossProjectImpactStore,
  LifecycleStore,
  NavigationStore,
} from "@loxora/core";
import { SqliteLifecycleStore } from "./adapter.js";

export async function openSqliteLifecycleStore(path: string): Promise<LifecycleStore> {
  return new SqliteLifecycleStore(path);
}

export async function openSqliteStore(
  path: string,
): Promise<LifecycleStore & NavigationStore & CrossProjectImpactStore> {
  return new SqliteLifecycleStore(path);
}

export async function openSqliteReadOnlyContextStore(path: string): Promise<ContextPackageStore> {
  return new SqliteLifecycleStore(
    path,
    {},
    {
      readOnly: true,
      runMigrations: false,
      requiredMigrationId: "004_cross_project_impact",
    },
  );
}
