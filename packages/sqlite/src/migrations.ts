import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  readonly id: string;
  readonly sql: string;
  readonly rebuildsReferencedTable?: boolean;
}

function initialMigration(): Migration {
  return {
    id: "001_initial_lifecycle",
    sql: readFileSync(
      new URL("../../migrations/001_initial_lifecycle.sql", import.meta.url),
      "utf8",
    ),
  };
}

function lineageMigration(): Migration {
  return {
    id: "002_lifecycle_lineage",
    sql: readFileSync(
      new URL("../../migrations/002_lifecycle_lineage.sql", import.meta.url),
      "utf8",
    ),
    rebuildsReferencedTable: true,
  };
}

function navigationMigration(): Migration {
  return {
    id: "003_navigation_foundation",
    sql: readFileSync(
      new URL("../../migrations/003_navigation_foundation.sql", import.meta.url),
      "utf8",
    ),
  };
}

function crossProjectImpactMigration(): Migration {
  return {
    id: "004_cross_project_impact",
    sql: readFileSync(
      new URL("../../migrations/004_cross_project_impact.sql", import.meta.url),
      "utf8",
    ),
  };
}

export function migrationCatalog(): readonly Migration[] {
  return [
    initialMigration(),
    lineageMigration(),
    navigationMigration(),
    crossProjectImpactMigration(),
  ];
}

export function runMigrations(
  database: DatabaseSync,
  migrations: readonly Migration[] = migrationCatalog(),
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT
  `);

  for (const migration of migrations) {
    if (
      database.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(migration.id) !==
      undefined
    ) {
      continue;
    }
    const foreignKeys = Number(
      (database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys,
    );
    if (migration.rebuildsReferencedTable && foreignKeys === 1) {
      database.exec("PRAGMA foreign_keys = OFF");
    }
    try {
      database.exec("BEGIN IMMEDIATE");
      database.exec(migration.sql);
      if (migration.rebuildsReferencedTable) {
        const violations = database.prepare("PRAGMA foreign_key_check").all();
        if (violations.length > 0) {
          throw new Error(`Migration ${migration.id} failed foreign_key_check`);
        }
      }
      database
        .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      if (database.isTransaction) {
        database.exec("ROLLBACK");
      }
      throw error;
    } finally {
      if (migration.rebuildsReferencedTable && foreignKeys === 1) {
        database.exec("PRAGMA foreign_keys = ON");
      }
    }
  }
}
