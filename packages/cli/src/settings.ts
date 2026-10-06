import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * The per-user app settings file (RFC-011 section 3, Milestone 13). `@loxora/app` reads and
 * writes it; the CLI only reads `workspacePath` for its workspace resolution. It holds no
 * secrets and no project knowledge.
 */
export const SETTINGS_CONFIG_VERSION = 1;

export type SettingsLanguage = "de" | "en";

export interface AppSettings {
  readonly configVersion: typeof SETTINGS_CONFIG_VERSION;
  readonly displayName?: string;
  readonly captain?: string;
  readonly workspacePath?: string;
  readonly language?: SettingsLanguage;
  readonly xora?: { readonly state: "not_installed" };
  readonly setup?: {
    /** Answers of part B kept until the workspace exists. */
    readonly shipName?: string;
    readonly logbookPath?: string;
    /**
     * When the Milestone 13 orientation was shown to the end. No longer written since
     * Milestone 14; kept so older settings files still load.
     */
    readonly introducedAt?: string;
    /**
     * What the first steps (parts D and E) already wrote, so a repeated step continues
     * instead of creating duplicates.
     */
    readonly purpose?: string;
    readonly projectId?: string;
    readonly spaceIds?: readonly string[];
    readonly collectionId?: string;
    readonly missionId?: string;
    readonly sourceId?: string;
    readonly evidenceId?: string;
    readonly proposalId?: string;
    /** When the setup conversation ended (Milestone 14) or the first steps ended (13). */
    readonly completedAt?: string;
    /** When the person dismissed the first Mission offer on the bridge (Milestone 14). */
    readonly firstMissionDismissedAt?: string;
  };
}

/** The settings file exists but cannot be used; it is never overwritten then. */
export class SettingsUnreadable extends Error {
  public constructor(
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "SettingsUnreadable";
  }
}

/**
 * Location: `<LOXORA_HOME>/.loxora/settings.json` when LOXORA_HOME is set (tests), else
 * `%APPDATA%\Loxora\settings.json` on Windows, else the XDG config directory.
 */
export function settingsPath(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.LOXORA_HOME) return join(resolve(env.LOXORA_HOME), ".loxora", "settings.json");
  if (platform === "win32") {
    return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "Loxora", "settings.json");
  }
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "loxora", "settings.json");
}

/** Returns null when the file does not exist; throws SettingsUnreadable when it is unusable. */
export function readSettings(path: string): AppSettings | null {
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new SettingsUnreadable(path, `${path} is not valid JSON`);
  }
  return validateSettings(path, raw);
}

/** Writes atomically: a temporary file next to the target, then a rename. */
export function writeSettings(path: string, settings: AppSettings): void {
  const valid = validateSettings(path, settings);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function validateSettings(path: string, value: unknown): AppSettings {
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  if (record.configVersion !== SETTINGS_CONFIG_VERSION) {
    throw new SettingsUnreadable(
      path,
      `Unsupported settings configVersion: ${String(record.configVersion)}`,
    );
  }
  const text = (key: string, source: Record<string, unknown> = record) => {
    const entry = source[key];
    if (entry === undefined) return undefined;
    if (typeof entry !== "string" || !entry.trim()) {
      throw new SettingsUnreadable(path, `Settings field ${key} must be a non-empty string`);
    }
    return entry.trim();
  };
  const textList = (key: string, source: Record<string, unknown>) => {
    const entry = source[key];
    if (entry === undefined) return undefined;
    if (!Array.isArray(entry) || entry.some((item) => typeof item !== "string" || !item)) {
      throw new SettingsUnreadable(path, `Settings field ${key} must be a list of strings`);
    }
    return entry as readonly string[];
  };
  const absolute = (key: string, source?: Record<string, unknown>) => {
    const entry = text(key, source);
    if (entry !== undefined && !isAbsolute(entry)) {
      throw new SettingsUnreadable(path, `Settings field ${key} must be an absolute path`);
    }
    return entry;
  };
  const language = record.language;
  if (language !== undefined && language !== "de" && language !== "en") {
    throw new SettingsUnreadable(path, "Settings field language must be de or en");
  }
  const xora = record.xora as Record<string, unknown> | undefined;
  if (xora !== undefined && xora?.state !== "not_installed") {
    throw new SettingsUnreadable(path, "Settings field xora.state is unknown");
  }
  const setup = record.setup;
  if (setup !== undefined && (typeof setup !== "object" || setup === null)) {
    throw new SettingsUnreadable(path, "Settings field setup must be an object");
  }
  const setupRecord = (setup ?? {}) as Record<string, unknown>;
  const setupValue = {
    ...optionalField("shipName", text("shipName", setupRecord)),
    ...optionalField("logbookPath", absolute("logbookPath", setupRecord)),
    ...optionalField("introducedAt", text("introducedAt", setupRecord)),
    ...optionalField("purpose", text("purpose", setupRecord)),
    ...optionalField("projectId", text("projectId", setupRecord)),
    ...optionalField("spaceIds", textList("spaceIds", setupRecord)),
    ...optionalField("collectionId", text("collectionId", setupRecord)),
    ...optionalField("missionId", text("missionId", setupRecord)),
    ...optionalField("sourceId", text("sourceId", setupRecord)),
    ...optionalField("evidenceId", text("evidenceId", setupRecord)),
    ...optionalField("proposalId", text("proposalId", setupRecord)),
    ...optionalField("completedAt", text("completedAt", setupRecord)),
    ...optionalField("firstMissionDismissedAt", text("firstMissionDismissedAt", setupRecord)),
  };
  return {
    configVersion: SETTINGS_CONFIG_VERSION,
    ...optionalField("displayName", text("displayName")),
    ...optionalField("captain", text("captain")),
    ...optionalField("workspacePath", absolute("workspacePath")),
    ...optionalField("language", language as SettingsLanguage | undefined),
    ...(xora !== undefined ? { xora: { state: "not_installed" as const } } : {}),
    ...(setup !== undefined ? { setup: setupValue } : {}),
  };
}

function optionalField<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}
