import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  type AppSettings,
  CliUsageError,
  databasePath,
  enclosingGitRoot,
  initWorkspace,
  isAgentActor,
  loadWorkspaceConfig,
  readSettings,
  WORKSPACE_CONFIG_FILE,
  writeSettings,
} from "@loxora/cli";
import { openSqliteStore } from "@loxora/sqlite";

/**
 * First-launch setup in script mode (RFC-011, Milestones 13 and 14): the answers of the
 * conversation (name, ship, logbook), creating or opening the workspace, and the app settings
 * file. Everything Xora says is a fixed text in the web client; typed answers are placed by
 * the keyword list in `shared/conversation.ts`. The server only stores answers and writes the
 * workspace.
 */

/** A setup request the person can correct; `status` is the HTTP status to answer. */
export class SetupRejected extends Error {
  public constructor(
    public readonly status: number,
    public readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

const MAX_NAME = 80;
const MAX_PATH = 1024;
const MAX_CAPTAIN = 40;

/**
 * Derives the captain's actor id from a name: lower case, umlauts as ae/oe/ue/ss, other
 * accents dropped, everything else becomes "-". Returns null when nothing usable is left
 * or the id would look like an agent.
 */
export function captainId(name: string): string | null {
  const id = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CAPTAIN)
    .replace(/-+$/, "");
  return id && !id.startsWith("agent") ? id : null;
}

/**
 * The user's Documents folder. On Windows it can be redirected (for example to OneDrive),
 * so the system is asked once; elsewhere, and if that fails, `<home>/Documents`.
 */
export function documentsDirectory(home: string, platform = process.platform): string {
  if (platform === "win32") {
    try {
      const path = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Environment]::GetFolderPath('MyDocuments')",
        ],
        { encoding: "utf8", timeout: 10_000, windowsHide: true },
      ).trim();
      if (path && isAbsolute(path)) return path;
    } catch {
      // Fall back to the usual location below.
    }
  }
  return join(home, "Documents");
}

/** True when the path lies in a folder that OneDrive synchronizes to the cloud. */
export function isOneDrivePath(
  path: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const roots = [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(
    (root): root is string => Boolean(root),
  );
  if (roots.some((root) => isInside(root, path))) return true;
  return path.split(/[\\/]/).some((segment) => /^onedrive(\s*-.*)?$/i.test(segment));
}

function isInside(parent: string, path: string): boolean {
  const between = relative(parent.toLowerCase(), path.toLowerCase());
  return between === "" || (!between.startsWith("..") && !isAbsolute(between));
}

export interface SetupEnvironment {
  readonly settingsPath: string;
  /** The CLI default workspace (resolution step 4), offered in scene B0. */
  readonly defaultWorkspace: string;
  readonly documents: () => string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export function loadSettings(path: string): AppSettings {
  return readSettings(path) ?? { configVersion: 1 };
}

function updateSettings(path: string, change: (settings: AppSettings) => AppSettings): void {
  writeSettings(path, change(loadSettings(path)));
}

function hasWorkspace(directory: string): boolean {
  return existsSync(join(directory, WORKSPACE_CONFIG_FILE));
}

/** The human reviewers of a workspace in that folder, to pick the captain from; else []. */
function humanReviewers(directory: string): readonly string[] {
  if (!hasWorkspace(directory)) return [];
  try {
    return loadWorkspaceConfig(directory).reviewers.filter((id) => !isAgentActor(id));
  } catch {
    return [];
  }
}

/** The state of the setup for `GET /api/setup`. */
export function setupState(environment: SetupEnvironment, settings: AppSettings) {
  const documents = environment.documents();
  const defaultLogbook = join(documents, "Loxora");
  const path = settings.setup?.logbookPath ?? defaultLogbook;
  const inDocuments = isInside(documents, path) ? relative(documents, path) : null;
  const existing = [environment.defaultWorkspace, settings.workspacePath]
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter(hasWorkspace)
    .map((candidate) => {
      try {
        const config = loadWorkspaceConfig(candidate);
        return {
          path: candidate,
          name: config.name,
          reviewers: config.reviewers.filter((id) => !isAgentActor(id)),
        };
      } catch {
        return null;
      }
    })
    .find((candidate) => candidate !== null);
  let step: "name" | "ship" | "logbook" = "logbook";
  if (!settings.captain) step = "name";
  else if (!settings.setup?.shipName) step = "ship";
  return {
    step,
    answers: {
      name: settings.displayName ?? null,
      captain: settings.captain ?? null,
      shipName: settings.setup?.shipName ?? null,
      logbookPath: settings.setup?.logbookPath ?? null,
    },
    existing: existing ?? null,
    logbook: {
      path,
      isDefault: path === defaultLogbook,
      documentsPath: inDocuments === null ? null : inDocuments.split(sep).filter(Boolean),
      inRepository: enclosingGitRoot(path) !== null,
      oneDrive: isOneDrivePath(path, environment.env),
      hasWorkspace: hasWorkspace(path),
      reviewers: humanReviewers(path),
    },
    xora: { state: "not_installed" as const },
  };
}

function text(body: Record<string, unknown>, key: string, max: number): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new SetupRejected(400, "Invalid", `${key} must not be empty`);
  }
  if (value.trim().length > max) {
    throw new SetupRejected(400, "Invalid", `${key} is too long`);
  }
  return value.trim();
}

/** `POST /api/setup/answers`: stores the answers of part B (B1 to B3). */
export function storeAnswers(environment: SetupEnvironment, body: Record<string, unknown>): void {
  const name = text(body, "name", MAX_NAME);
  const shortName = text(body, "captain", MAX_NAME);
  const shipName = text(body, "shipName", MAX_NAME);
  const logbookPath = text(body, "logbookPath", MAX_PATH);
  if (logbookPath !== undefined && !isAbsolute(logbookPath)) {
    throw new SetupRejected(400, "Invalid", "The logbook folder must be a full path");
  }
  let captain: string | null | undefined;
  if (shortName !== undefined) captain = captainId(shortName);
  else if (name !== undefined) captain = captainId(name);
  if (captain === null) {
    throw new SetupRejected(400, "CaptainNeeded", "A short name with letters or digits is needed");
  }
  updateSettings(environment.settingsPath, (settings) => ({
    ...settings,
    ...(name !== undefined ? { displayName: name } : {}),
    ...(captain ? { captain } : {}),
    setup: {
      ...settings.setup,
      ...(shipName !== undefined ? { shipName } : {}),
      ...(logbookPath !== undefined ? { logbookPath } : {}),
    },
  }));
}

/**
 * `POST /api/setup/workspace`: creates the workspace in the chosen folder, as `loxora
 * workspace init` does, or opens an existing one in place. Only a newly created workspace
 * gets a store with migrations; an existing workspace is never migrated by the app.
 */
export async function createOrOpenWorkspace(
  environment: SetupEnvironment,
  body: Record<string, unknown>,
): Promise<void> {
  const settings = loadSettings(environment.settingsPath);
  if (body.action === "create") {
    const directory = settings.setup?.logbookPath ?? join(environment.documents(), "Loxora");
    const shipName = settings.setup?.shipName;
    if (!settings.captain || !shipName) {
      throw new SetupRejected(400, "Incomplete", "Name and ship name are needed first");
    }
    if (hasWorkspace(directory)) {
      throw new SetupRejected(409, "WorkspaceExists", "This folder already holds a logbook");
    }
    if (existsSync(databasePath(directory))) {
      throw new SetupRejected(409, "FolderInUse", "This folder already holds a database");
    }
    if (enclosingGitRoot(directory)) {
      throw new SetupRejected(400, "InRepository", "This folder belongs to a code project");
    }
    try {
      initWorkspace({
        directory,
        name: shipName,
        reviewers: [settings.captain],
        allowInRepository: false,
      });
    } catch (error) {
      if (error instanceof CliUsageError) throw new SetupRejected(400, "Invalid", error.message);
      throw error;
    }
    const store = await openSqliteStore(databasePath(directory));
    await store.close();
    writeSettings(environment.settingsPath, {
      ...settings,
      workspacePath: directory,
      xora: { state: "not_installed" },
      setup: {},
    });
    return;
  }
  if (body.action === "open") {
    const path = text(body, "path", MAX_PATH);
    if (!path || !isAbsolute(path) || !hasWorkspace(path)) {
      throw new SetupRejected(400, "NoWorkspace", "There is no logbook in this folder");
    }
    let reviewers: readonly string[];
    try {
      reviewers = loadWorkspaceConfig(path).reviewers.filter((id) => !isAgentActor(id));
    } catch (error) {
      if (error instanceof CliUsageError) throw new SetupRejected(400, "Invalid", error.message);
      throw error;
    }
    const chosen = text(body, "captain", MAX_NAME);
    const captain = chosen ?? (reviewers.length === 1 ? reviewers[0] : undefined);
    if (!captain || !reviewers.includes(captain)) {
      throw new SetupRejected(400, "CaptainNeeded", "Choose who you are on this ship");
    }
    writeSettings(environment.settingsPath, {
      ...settings,
      displayName: settings.displayName ?? captain,
      captain,
      workspacePath: path,
      xora: { state: "not_installed" },
      setup: {},
    });
    return;
  }
  throw new SetupRejected(400, "Invalid", "action must be create or open");
}

/** `POST /api/settings/language`: `de`, `en`, or null to follow the system language. */
export function storeLanguage(settingsPath: string, body: Record<string, unknown>): void {
  const language = body.language;
  if (language !== null && language !== "de" && language !== "en") {
    throw new SetupRejected(400, "Invalid", "language must be de, en, or null");
  }
  updateSettings(settingsPath, (settings) => {
    const { language: _previous, ...rest } = settings;
    return language === null ? rest : { ...rest, language };
  });
}

export function defaultHome(env: Readonly<Record<string, string | undefined>>): string {
  return env.LOXORA_HOME || homedir();
}
