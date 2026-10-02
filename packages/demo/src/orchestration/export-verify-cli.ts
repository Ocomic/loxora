import {
  parseWorkspaceExport,
  serializeWorkspaceExport,
  workspaceExportDigest,
} from "@loxora/core";
import { openSqliteStore } from "@loxora/sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const index = process.argv.indexOf("--in");
const inPath = index >= 0 ? process.argv[index + 1] : undefined;
if (!inPath) throw new Error("Usage: npm run export:verify -- --in <export.json>");

const original = readFileSync(resolve(inPath), "utf8");
const document = parseWorkspaceExport(original);
const directory = mkdtempSync(join(tmpdir(), "loxora-export-verify-"));
try {
  const store = await openSqliteStore(join(directory, "restored.sqlite"));
  let roundTrip: string;
  try {
    await store.restoreWorkspaceExport(document);
    roundTrip = serializeWorkspaceExport(await store.readWorkspaceExport());
  } finally {
    await store.close();
  }
  const digest = workspaceExportDigest(original);
  if (roundTrip !== original) {
    process.stderr.write(
      `Round trip differs: input sha256 ${digest}, restored sha256 ${workspaceExportDigest(roundTrip)}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(`Round trip identical\nsha256 ${digest}\n`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
