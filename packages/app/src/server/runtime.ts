import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { freemem } from "node:os";
import { dirname, join } from "node:path";
import {
  type AppSettings,
  isLoopbackUrl,
  readSettings,
  SettingsUnreadable,
  writeSettings,
  type XoraLocalModel,
  type XoraStartResult,
} from "@loxora/cli";

/**
 * Xora's model runtime (ADR-008 sections 3 and 4, Milestone 16 section 2). The app server
 * starts `llama-server` as a child process on 127.0.0.1 (managed), or connects to a runtime
 * that already runs on this computer (attached). It never downloads a model, never retries
 * a failed start by itself, and never stops a runtime it did not start.
 */

export type XoraState = "off" | "starting" | "ready" | "scriptMode";

/** Why Xora is in script mode. */
export type ScriptReason =
  | "notConfigured"
  | "lowMemory"
  | "timeout"
  | "exited"
  | "declined"
  | "failedBefore"
  | "missingFile"
  | "notLocal";

export interface XoraStatus {
  readonly state: XoraState;
  readonly reason?: ScriptReason;
  readonly modelLabel?: string;
  readonly mode?: XoraLocalModel["mode"];
  /** A confirmed model that did not start; Xora went back to the previous one. */
  readonly failedChange?: string;
}

export interface RuntimeOptions {
  /** The settings file, where the start result is recorded; null in a fixed workspace. */
  readonly settingsPath: string | null;
  /** `--xora-url`: attach for this session only, without reading or writing the settings. */
  readonly attachUrl?: string;
  readonly readyTimeoutMs?: number;
  readonly pollMs?: number;
  /** Free memory needed before a managed start (Milestone 16 section 9). */
  readonly minFreeBytes?: number;
  readonly freeMemory?: () => number;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly spawn?: typeof spawn;
  readonly platform?: NodeJS.Platform;
}

export const READY_TIMEOUT_MS = 60_000;
export const POLL_MS = 500;
/** Until the decision owner has measured Gemma 4 E2B on Windows (Milestone 16 section 9). */
export const MIN_FREE_BYTES = 4 * 1024 ** 3;
const HEALTH_TIMEOUT_MS = 2_000;
export const DEV_MODEL_LABEL = "Gemma 4 E2B";

/** The model a session uses: from `--xora-url`, or from the settings file. */
export function configuredModel(
  settings: AppSettings | null,
  attachUrl: string | undefined,
): XoraLocalModel | null {
  if (attachUrl !== undefined) {
    return { mode: "attached", url: attachUrl, modelLabel: DEV_MODEL_LABEL };
  }
  const xora = settings?.xora;
  if (!xora || xora.enabled === false || !xora.local) return null;
  return xora.local;
}

export class XoraRuntime {
  private current: XoraStatus = { state: "off" };
  private child: ChildProcess | null = null;
  private base: string | null = null;
  private stopping = false;
  /** Counts starts, so a start that was replaced by a restart stops waiting. */
  private generation = 0;
  /** `--xora-url` until the captain confirms another model in this session. */
  private attach: string | undefined;
  private failedChange: string | undefined;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  public constructor(private readonly options: RuntimeOptions) {
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.attach = options.attachUrl;
  }

  public status(): XoraStatus {
    return this.failedChange ? { ...this.current, failedChange: this.failedChange } : this.current;
  }

  /** True when the server can write a model change (not with a fixed workspace). */
  public canChange(): boolean {
    return this.options.settingsPath !== null;
  }

  /**
   * "Start Xora again" (Milestone 16 sections 5 and 6): stops the runtime this session
   * started, forgets the failed start and a "Continue without Xora", and starts again.
   */
  public restart(options: { readonly keepLastStart?: boolean } = {}): Promise<XoraStatus> {
    this.stop();
    this.stopping = false;
    this.base = null;
    this.current = { state: "off" };
    if (!options.keepLastStart) {
      this.forgetLastStart();
      this.failedChange = undefined;
    }
    return this.start();
  }

  /**
   * Switches to a model the captain confirmed on the card (Milestone 16 section 7): writes
   * the `xora` entry, starts it, and goes back to the previous model if it does not start
   * (RFC-011 Amendment 3 section 3). Resolves when Xora is ready or back.
   */
  public async switchTo(local: XoraLocalModel): Promise<XoraStatus> {
    const path = this.options.settingsPath;
    const before = this.settings();
    if (!path || !before) throw new Error("A model change needs a usable settings file");
    const previous = before.xora;
    const previousAttach = this.attach;
    writeSettings(path, { ...before, xora: { provider: "local", local } });
    this.attach = undefined;
    this.failedChange = undefined;
    const result = await this.restart({ keepLastStart: true });
    if (result.state === "ready") return result;
    const latest = this.settings() ?? before;
    const { xora: _failed, ...rest } = latest;
    writeSettings(path, previous ? { ...rest, xora: previous } : rest);
    this.attach = previousAttach;
    await this.restart({ keepLastStart: true });
    this.failedChange = local.modelLabel;
    return this.status();
  }

  /** The runtime's address while Xora is ready; null otherwise. */
  public url(): string | null {
    return this.current.state === "ready" ? this.base : null;
  }

  /**
   * Starts in the background; resolves when the runtime is ready or Xora is in script mode.
   * The setup does not wait for it (RFC-011 part B).
   */
  public async start(): Promise<XoraStatus> {
    const generation = ++this.generation;
    const settings = this.attach === undefined ? this.settings() : null;
    const model = configuredModel(settings, this.attach);
    if (!model) {
      return this.set({
        state: "scriptMode",
        reason: settings?.xora?.enabled === false ? "declined" : "notConfigured",
      });
    }
    const label = { modelLabel: model.modelLabel, mode: model.mode };
    const last = settings?.xora?.lastStart;
    if (this.attach === undefined && last && last.result !== "ready") {
      // No automatic retry after a failed start (RFC-011 section 2).
      return this.set({ state: "scriptMode", reason: "failedBefore", ...label });
    }
    if (model.mode === "attached") {
      if (!isLoopbackUrl(model.url))
        return this.set({ state: "scriptMode", reason: "notLocal", ...label });
      this.base = model.url.replace(/\/$/, "");
      this.set({ state: "starting", ...label });
      return this.waitReady(label, false, generation);
    }
    if (!existsSync(model.runtimePath) || !existsSync(model.modelPath)) {
      return this.set({ state: "scriptMode", reason: "missingFile", ...label });
    }
    const free = (this.options.freeMemory ?? freemem)();
    if (free < (this.options.minFreeBytes ?? MIN_FREE_BYTES)) {
      this.record("lowMemory");
      return this.set({ state: "scriptMode", reason: "lowMemory", ...label });
    }
    const port = await freePort();
    if (generation !== this.generation) return this.current;
    this.base = `http://127.0.0.1:${port}`;
    this.set({ state: "starting", ...label });
    const log = this.options.settingsPath
      ? openSync(join(dirname(this.options.settingsPath), "xora-runtime.log"), "w")
      : "ignore";
    let child: ChildProcess;
    try {
      child = (this.options.spawn ?? spawn)(
        model.runtimePath,
        [
          "-m",
          model.modelPath,
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--jinja",
          "-c",
          "8192",
          "--no-mmproj",
        ],
        { stdio: ["ignore", log, log], windowsHide: true },
      );
    } finally {
      if (typeof log === "number") closeSync(log);
    }
    this.child = child;
    // Only the current child counts: an old one ending after a restart changes nothing.
    child.on("error", () => this.child === child && this.exited(label));
    child.on("exit", () => this.child === child && this.exited(label));
    return this.waitReady(label, true, generation);
  }

  /** A failed answer during a session: Xora stays in script mode until a restart. */
  public fail(reason: "timeout" | "exited"): void {
    if (this.current.state !== "ready") return;
    this.set({ ...this.current, state: "scriptMode", reason });
  }

  /** Stops the runtime this session started, with its whole process tree; never another. */
  public stop(): void {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null || child.pid === undefined) return;
    if ((this.options.platform ?? process.platform) === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill("SIGTERM");
    }
  }

  private exited(label: Pick<XoraStatus, "modelLabel" | "mode">): void {
    const wasStarting = this.current.state === "starting";
    this.child = null;
    if (this.stopping) return;
    if (wasStarting) this.record("exited");
    if (this.current.state === "starting" || this.current.state === "ready") {
      this.set({ state: "scriptMode", reason: "exited", ...label });
    }
  }

  private async waitReady(
    label: Pick<XoraStatus, "modelLabel" | "mode">,
    managed: boolean,
    generation: number,
  ): Promise<XoraStatus> {
    const started = this.now();
    const timeout = this.options.readyTimeoutMs ?? READY_TIMEOUT_MS;
    const poll = this.options.pollMs ?? POLL_MS;
    while (this.current.state === "starting" && generation === this.generation) {
      const healthy = await this.healthy();
      if (generation !== this.generation) break;
      if (healthy) {
        const seconds = Math.round((this.now() - started) / 100) / 10;
        if (managed || this.attach === undefined) this.record("ready", seconds);
        return this.set({ state: "ready", ...label });
      }
      if (this.now() - started >= timeout) {
        if (managed || this.attach === undefined) this.record("timeout");
        this.stop();
        this.stopping = false;
        return this.set({ state: "scriptMode", reason: "timeout", ...label });
      }
      await new Promise((done) => setTimeout(done, poll));
    }
    return this.current;
  }

  private async healthy(): Promise<boolean> {
    try {
      const response = await this.fetch(`${this.base}/health`, {
        redirect: "manual",
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private set(status: XoraStatus): XoraStatus {
    this.current = status;
    return status;
  }

  private settings(): AppSettings | null {
    if (!this.options.settingsPath) return null;
    try {
      return readSettings(this.options.settingsPath);
    } catch (error) {
      if (error instanceof SettingsUnreadable) return null;
      throw error;
    }
  }

  /** Drops `lastStart` and `enabled: false`, so the next start is not blocked. */
  private forgetLastStart(): void {
    const path = this.options.settingsPath;
    if (!path || this.attach !== undefined) return;
    const settings = this.settings();
    if (!settings?.xora) return;
    const { lastStart: _last, enabled: _enabled, ...xora } = settings.xora;
    writeSettings(path, { ...settings, xora });
  }

  /** Records the start result (`xora.lastStart`); an unusable settings file stays untouched. */
  private record(result: XoraStartResult, seconds?: number): void {
    const path = this.options.settingsPath;
    if (!path || this.attach !== undefined) return;
    const settings = this.settings();
    if (!settings) return;
    writeSettings(path, {
      ...settings,
      xora: {
        ...settings.xora,
        lastStart: {
          at: new Date(this.now()).toISOString(),
          result,
          ...(seconds === undefined ? {} : { seconds }),
        },
      },
    });
  }
}

/** A free port on 127.0.0.1, for the managed runtime. */
function freePort(): Promise<number> {
  return new Promise((done, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
}
