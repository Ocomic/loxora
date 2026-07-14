import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  readonly id: string;
  readonly sql: string;
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

export function runMigrations(
  database: DatabaseSync,
  migrations: readonly Migration[] = [initialMigration()],
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT
  `);

  const hasMigration = database.prepare("SELECT 1 FROM schema_migrations WHERE id = ?");
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (hasMigration.get(migration.id) !== undefined) {
      continue;
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      recordMigration.run(migration.id, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      if (database.isTransaction) {
        database.exec("ROLLBACK");
      }
      throw error;
    }
  }
}
