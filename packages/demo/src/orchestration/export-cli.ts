import { serializeWorkspaceExport, workspaceExportDigest } from "@loxora/core";
import { openSqliteStore } from "@loxora/sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const databasePath = resolve(option("--db") ?? resolve("var", "demo", "loxora-demo.sqlite"));
const outPath = option("--out");
if (!outPath) throw new Error("Usage: npm run export -- [--db <sqlite path>] --out <export.json>");
if (!existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);

const store = await openSqliteStore(databasePath);
try {
  const text = serializeWorkspaceExport(await store.readWorkspaceExport());
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), text, "utf8");
  process.stdout.write(
    `Exported ${databasePath} to ${resolve(outPath)}\nsha256 ${workspaceExportDigest(text)}\n`,
  );
} finally {
  await store.close();
}
