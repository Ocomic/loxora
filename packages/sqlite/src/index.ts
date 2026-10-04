import type {
  ContextPackageStore,
  CrossProjectImpactStore,
  LifecycleStore,
  MissionStore,
  NodeKeyStore,
  NavigationStore,
  PlannedKnowledgeStore,
  ReviewInboxStore,
  WorkspaceExportStore,
} from "@loxora/core";
import { SqliteLifecycleStore } from "./adapter.js";

export async function openSqliteLifecycleStore(path: string): Promise<LifecycleStore> {
  return new SqliteLifecycleStore(path);
}

export async function openSqliteStore(
  path: string,
): Promise<
  LifecycleStore &
    NavigationStore &
    CrossProjectImpactStore &
    PlannedKnowledgeStore &
    ReviewInboxStore &
    NodeKeyStore &
    MissionStore &
    WorkspaceExportStore
> {
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

/**
 * Opens a workspace store writable for the product UI's write path (Milestone 12). Like the
 * read-only store, it never runs migrations and fails with IntegrityError when
 * `requiredMigrationId` is missing.
 */
export async function openSqliteWritableStore(
  path: string,
  requiredMigrationId: string,
): Promise<LifecycleStore & MissionStore & WorkspaceExportStore> {
  return new SqliteLifecycleStore(path, {}, { runMigrations: false, requiredMigrationId });
}

/**
 * Opens a workspace store read-only for the product UI (RFC-010): it never runs migrations
 * and fails with IntegrityError when `requiredMigrationId` is missing.
 */
export async function openSqliteReadOnlyStore(
  path: string,
  requiredMigrationId: string,
): Promise<
  LifecycleStore &
    NavigationStore &
    PlannedKnowledgeStore &
    ReviewInboxStore &
    NodeKeyStore &
    MissionStore &
    WorkspaceExportStore
> {
  return new SqliteLifecycleStore(
    path,
    {},
    { readOnly: true, runMigrations: false, requiredMigrationId },
  );
}
