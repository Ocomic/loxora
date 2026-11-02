import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * The per-user app settings file (RFC-011 section 3, Milestone 13). `@loxora/app` reads and
 * writes it; the CLI only reads `workspacePath` for its workspace resolution. It holds no
 * secrets and no project knowledge.
 */
export const SETTINGS_CONFIG_VERSION = 2;

export type SettingsLanguage = "de" | "en";

/** How Xora's last start ended (ADR-008 section 4). */
export const XORA_START_RESULTS = ["ready", "timeout", "exited", "lowMemory", "declined"] as const;
export type XoraStartResult = (typeof XORA_START_RESULTS)[number];

/** Xora's local model (ADR-008 section 3): started by Loxora, or a runtime that already runs. */
export type XoraLocalModel =
  | {
      readonly mode: "managed";
      readonly runtimePath: string;
      readonly modelPath: string;
      readonly modelLabel: string;
    }
  | { readonly mode: "attached"; readonly url: string; readonly modelLabel: string };

/** Xora's model settings (settings version 2, ADR-008 section 5). Never holds a key. */
export interface XoraSettings {
  /** false: "Continue without Xora". */
  readonly enabled?: boolean;
  readonly provider?: "local";
  readonly local?: XoraLocalModel;
  readonly lastStart?: {
    readonly at: string;
    readonly result: XoraStartResult;
    readonly seconds?: number;
  };
}

export interface AppSettings {
  readonly configVersion: typeof SETTINGS_CONFIG_VERSION;
  readonly displayName?: string;
  readonly captain?: string;
  readonly workspacePath?: string;
  readonly language?: SettingsLanguage;
  readonly xora?: XoraSettings;
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

/** Version 1 files are read as version 2 (Milestone 16) and written as version 2. */
export type SettingsInput = Omit<AppSettings, "configVersion"> & {
  readonly configVersion: 1 | typeof SETTINGS_CONFIG_VERSION;
};

/** `http` on this computer only (ADR-008 section 3); no user, no path beyond `/`. */
export function isLoopbackUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password &&
    (url.pathname === "/" || url.pathname === "") &&
    !url.search &&
    !url.hash
  );
}

/** Writes atomically: a temporary file next to the target, then a rename. */
export function writeSettings(path: string, settings: SettingsInput): void {
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
  if (record.configVersion !== 1 && record.configVersion !== SETTINGS_CONFIG_VERSION) {
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
  const xora = validateXora(path, record.xora, record.configVersion === 1);
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
    ...optionalField("xora", xora),
    ...(setup !== undefined ? { setup: setupValue } : {}),
  };
}

const MAX_MODEL_LABEL = 60;

/**
 * Settings version 1 knew only `{ state: "not_installed" }`, which means "no model chosen".
 * Version 2 rejects any field it does not know, so a key can never be stored by accident.
 */
function validateXora(path: string, value: unknown, legacy: boolean): XoraSettings | undefined {
  if (value === undefined) return undefined;
  const fail = (message: string): never => {
    throw new SettingsUnreadable(path, `Settings field xora${message}`);
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(" must be an object");
  }
  const record = value as Record<string, unknown>;
  if (legacy || "state" in record) {
    if (record.state !== "not_installed" || Object.keys(record).length !== 1) {
      return fail(".state is unknown");
    }
    return undefined;
  }
  only(record, ["enabled", "provider", "local", "lastStart"], "", fail);
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") {
    fail(".enabled must be true or false");
  }
  if (record.provider !== undefined && record.provider !== "local") {
    fail(".provider must be local");
  }
  const label = (source: Record<string, unknown>) => {
    const entry = source.modelLabel;
    if (typeof entry !== "string" || !entry.trim() || entry.trim().length > MAX_MODEL_LABEL) {
      return fail(`.local.modelLabel must be 1 to ${MAX_MODEL_LABEL} characters`);
    }
    return entry.trim();
  };
  let local: XoraLocalModel | undefined;
  if (record.local !== undefined) {
    if (typeof record.local !== "object" || record.local === null) fail(".local must be an object");
    const source = record.local as Record<string, unknown>;
    if (source.mode === "managed") {
      only(source, ["mode", "runtimePath", "modelPath", "modelLabel"], ".local", fail);
      const file = (key: "runtimePath" | "modelPath") => {
        const entry = source[key];
        if (typeof entry !== "string" || !isAbsolute(entry)) {
          return fail(`.local.${key} must be an absolute path`);
        }
        return entry;
      };
      const modelPath = file("modelPath");
      if (!modelPath.toLowerCase().endsWith(".gguf")) fail(".local.modelPath must end in .gguf");
      local = {
        mode: "managed",
        runtimePath: file("runtimePath"),
        modelPath,
        modelLabel: label(source),
      };
    } else if (source.mode === "attached") {
      only(source, ["mode", "url", "modelLabel"], ".local", fail);
      if (typeof source.url !== "string" || !isLoopbackUrl(source.url)) {
        fail(".local.url must be an http address on this computer");
      }
      local = { mode: "attached", url: source.url as string, modelLabel: label(source) };
    } else {
      fail(".local.mode must be managed or attached");
    }
  }
  let lastStart: XoraSettings["lastStart"];
  if (record.lastStart !== undefined) {
    const source = record.lastStart as Record<string, unknown>;
    if (typeof source !== "object" || source === null) fail(".lastStart must be an object");
    only(source, ["at", "result", "seconds"], ".lastStart", fail);
    if (typeof source.at !== "string" || Number.isNaN(Date.parse(source.at))) {
      fail(".lastStart.at must be a time");
    }
    if (!XORA_START_RESULTS.includes(source.result as XoraStartResult)) {
      fail(".lastStart.result is unknown");
    }
    if (
      source.seconds !== undefined &&
      (typeof source.seconds !== "number" || !Number.isFinite(source.seconds) || source.seconds < 0)
    ) {
      fail(".lastStart.seconds must be a number");
    }
    lastStart = {
      at: source.at as string,
      result: source.result as XoraStartResult,
      ...optionalField("seconds", source.seconds as number | undefined),
    };
  }
  return {
    ...optionalField("enabled", record.enabled as boolean | undefined),
    ...optionalField("provider", record.provider as "local" | undefined),
    ...optionalField("local", local),
    ...optionalField("lastStart", lastStart),
  };
}

function only(
  record: Record<string, unknown>,
  keys: readonly string[],
  prefix: string,
  fail: (message: string) => never,
): void {
  const unknown = Object.keys(record).find((key) => !keys.includes(key));
  if (unknown !== undefined) fail(`${prefix}.${unknown} is not a known field`);
}

function optionalField<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}
