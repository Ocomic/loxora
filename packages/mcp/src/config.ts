import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { ProjectId } from "@loxora/core";

export interface McpConfiguration {
  readonly dataRoot: string;
  readonly databasePath: string;
  readonly allowedProjectIds: readonly ProjectId[];
}

export class McpConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "McpConfigurationError";
  }
}

export function loadMcpConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): McpConfiguration {
  const rootInput = required(environment.LOXORA_DATA_ROOT, "LOXORA_DATA_ROOT");
  const databaseInput = required(environment.LOXORA_DB_PATH, "LOXORA_DB_PATH");
  const allowedInput = required(
    environment.LOXORA_ALLOWED_PROJECT_IDS,
    "LOXORA_ALLOWED_PROJECT_IDS",
  );
  let dataRoot: string;
  let databasePath: string;
  try {
    dataRoot = realpathSync(resolve(rootInput));
    databasePath = realpathSync(
      isAbsolute(databaseInput) ? databaseInput : resolve(dataRoot, databaseInput),
    );
    if (!statSync(databasePath).isFile()) throw new Error("not a file");
  } catch {
    throw new McpConfigurationError("Configured data root or database is unavailable");
  }
  const within = relative(dataRoot, databasePath);
  if (within === "" || within === ".") {
    throw new McpConfigurationError("Database path must name a file inside the data root");
  }
  if (within.startsWith("..") || isAbsolute(within)) {
    throw new McpConfigurationError("Database path escapes the configured data root");
  }
  const allowedProjectIds = [...new Set(allowedInput.split(",").map((value) => value.trim()))]
    .filter(Boolean)
    .sort() as ProjectId[];
  if (allowedProjectIds.length === 0)
    throw new McpConfigurationError("LOXORA_ALLOWED_PROJECT_IDS must contain a Project ID");
  return Object.freeze({
    dataRoot,
    databasePath,
    allowedProjectIds: Object.freeze(allowedProjectIds),
  });
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new McpConfigurationError(`${name} is required`);
  return value.trim();
}
