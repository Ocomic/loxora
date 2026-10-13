import { cpSync, existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { databasePath } from "@loxora/cli";
import { openSqliteReadOnlyStore, openSqliteStore } from "@loxora/sqlite";

/**
 * Updating an older logbook from the app (Milestone 15 Amendment 1). The app still never
 * migrates on its own: only the captain's click runs this, and it first writes a backup copy
 * of the whole logbook folder next to it. The migrations are the same ones every CLI command
 * applies.
 */

/** The newest migration the app knows; a logbook that has it needs no update. */
export const LATEST_MIGRATION = "008_chat";

const BACKUP_WORD = { de: "Sicherung", en: "backup" } as const;

export type BackupLanguage = keyof typeof BACKUP_WORD;

export class UpdateRejected extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function upToDate(workspaceDirectory: string): Promise<boolean> {
  try {
    const store = await openSqliteReadOnlyStore(databasePath(workspaceDirectory), LATEST_MIGRATION);
    await store.close();
    return true;
  } catch {
    return false;
  }
}

/** A free folder name next to the logbook in local time, such as "Loxora Sicherung 2026-10-13 21-05". */
export function backupDirectory(
  workspaceDirectory: string,
  language: BackupLanguage,
  now: Date,
): string {
  const two = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}-${two(now.getMinutes())}`;
  const base = join(
    dirname(workspaceDirectory),
    `${basename(workspaceDirectory)} ${BACKUP_WORD[language]} ${stamp}`,
  );
  let candidate = base;
  for (let count = 2; existsSync(candidate); count += 1) candidate = `${base} (${count})`;
  return candidate;
}

/**
 * Copies the logbook folder, then applies the pending migrations. The database is copied with
 * SQLite's `VACUUM INTO`, so the copy is consistent even with its write-ahead log; every other
 * file is copied as it is. Without a complete copy nothing is migrated.
 */
export async function updateLogbook(
  workspaceDirectory: string,
  language: BackupLanguage,
  now = new Date(),
): Promise<{ readonly backupPath: string }> {
  const database = databasePath(workspaceDirectory);
  if (!existsSync(database)) {
    throw new UpdateRejected(503, "WorkspaceUnavailable", "No logbook found in this folder");
  }
  if (await upToDate(workspaceDirectory)) {
    throw new UpdateRejected(409, "UpToDate", "The logbook is already up to date");
  }
  const backupPath = backupDirectory(workspaceDirectory, language, now);
  const databaseName = basename(database);
  cpSync(workspaceDirectory, backupPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (source) => !basename(source).startsWith(databaseName),
  });
  const source = new DatabaseSync(database, { readOnly: true });
  try {
    source.prepare("VACUUM INTO ?").run(join(backupPath, databaseName));
  } finally {
    source.close();
  }
  if (!readdirSync(backupPath).includes(databaseName)) {
    throw new UpdateRejected(500, "BackupFailed", "The backup copy is incomplete");
  }
  const store = await openSqliteStore(database);
  await store.close();
  return { backupPath };
}
