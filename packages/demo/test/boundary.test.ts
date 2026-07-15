import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("browser source cannot import server, Core, SQLite, MCP, or Node APIs", () => {
  const root = resolve(process.cwd(), "packages", "demo", "src", "web");
  const files = walk(root).filter((path) => /\.tsx?$/.test(path));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*(?:@loxora\/(?:core|sqlite|mcp)|node:|\/server\/)/,
      file,
    );
  }
});

function walk(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)],
  );
}
