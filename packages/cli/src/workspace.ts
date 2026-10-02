import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const WORKSPACE_CONFIG_FILE = "workspace.json";
export const WORKSPACE_DATABASE_FILE = "workspace.sqlite";
export const WORKSPACE_CONFIG_VERSION = 1;

export interface WorkspaceConfig {
  readonly configVersion: typeof WORKSPACE_CONFIG_VERSION;
  readonly name: string;
  readonly reviewers: readonly string[];
}

export class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

/** Resolution order (ADR-004): --workspace, then LOXORA_WORKSPACE, then <home>/.loxora/workspaces/default. */
export function resolveWorkspaceDirectory(
  explicit: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (explicit) return resolve(explicit);
  if (env.LOXORA_WORKSPACE) return resolve(env.LOXORA_WORKSPACE);
  return join(
    env.LOXORA_HOME ? resolve(env.LOXORA_HOME) : homedir(),
    ".loxora",
    "workspaces",
    "default",
  );
}

export function databasePath(directory: string): string {
  return join(directory, WORKSPACE_DATABASE_FILE);
}

/** Returns the Git working tree root containing `directory`, if any. */
export function enclosingGitRoot(directory: string): string | null {
  let current = resolve(directory);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function initWorkspace(input: {
  readonly directory: string;
  readonly name: string;
  readonly reviewers: readonly string[];
  readonly allowInRepository: boolean;
}): WorkspaceConfig {
  if (existsSync(join(input.directory, WORKSPACE_CONFIG_FILE))) {
    throw new CliUsageError(`A workspace already exists at ${input.directory}`);
  }
  const gitRoot = enclosingGitRoot(input.directory);
  if (gitRoot && !input.allowInRepository) {
    throw new CliUsageError(
      `Refusing to create a workspace inside the Git working tree ${gitRoot}; project knowledge may be private. Use --allow-in-repository to override.`,
    );
  }
  const config = validateConfig({
    configVersion: WORKSPACE_CONFIG_VERSION,
    name: input.name,
    reviewers: input.reviewers,
  });
  mkdirSync(input.directory, { recursive: true });
  writeFileSync(
    join(input.directory, WORKSPACE_CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
  return config;
}

export function loadWorkspaceConfig(directory: string): WorkspaceConfig {
  const path = join(directory, WORKSPACE_CONFIG_FILE);
  if (!existsSync(path)) {
    throw new CliUsageError(
      `No workspace at ${directory}. Run "loxora workspace init" or pass --workspace.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new CliUsageError(`${path} is not valid JSON`);
  }
  return validateConfig(raw);
}

function validateConfig(value: unknown): WorkspaceConfig {
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  if (record.configVersion !== WORKSPACE_CONFIG_VERSION) {
    throw new CliUsageError(`Unsupported workspace configVersion: ${String(record.configVersion)}`);
  }
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) throw new CliUsageError("Workspace name must not be empty");
  if (!Array.isArray(record.reviewers) || record.reviewers.length === 0) {
    throw new CliUsageError("A workspace needs at least one reviewer (--reviewer <id>)");
  }
  const reviewers = record.reviewers.map((reviewer) => {
    const id = typeof reviewer === "string" ? reviewer.trim() : "";
    if (!id) throw new CliUsageError("Reviewer ids must be non-empty strings");
    if (isAgentActor(id)) throw new CliUsageError(`Agent actor ${id} cannot be a reviewer`);
    return id;
  });
  return Object.freeze({
    configVersion: WORKSPACE_CONFIG_VERSION,
    name,
    reviewers: Object.freeze([...new Set(reviewers)]),
  });
}

export function isAgentActor(actorId: string): boolean {
  return actorId.startsWith("agent:");
}
