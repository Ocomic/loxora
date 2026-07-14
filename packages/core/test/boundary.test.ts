import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Core has no SQLite or adapter dependency", () => {
  const sourceDirectory = join(process.cwd(), "packages", "core", "src");
  const source = readdirSync(sourceDirectory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(sourceDirectory, name), "utf8"))
    .join("\n");
  const packageJson = readFileSync(join(process.cwd(), "packages", "core", "package.json"), "utf8");

  for (const forbidden of ["node:sqlite", "@loxora/sqlite", "DatabaseSync"]) {
    assert.equal(source.includes(forbidden), false, `Core must not contain ${forbidden}`);
    assert.equal(
      packageJson.includes(forbidden),
      false,
      `Core package must not contain ${forbidden}`,
    );
  }
});
