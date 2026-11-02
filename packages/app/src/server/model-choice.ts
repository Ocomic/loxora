import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { isLoopbackUrl, type XoraLocalModel } from "@loxora/cli";
import { type FileKind, type SetupEnvironment, SetupRejected } from "./setup.js";

/**
 * Choosing another model for Xora (RFC-011 Amendment 3 section 3, Milestone 16 sections 5
 * to 7): a model file on this computer that Loxora starts, or a model program that already
 * runs here. `POST /api/xora/model` only checks the choice and returns what would be written;
 * the settings change after the captain confirms the card.
 */

export const MAX_MODEL_LABEL = 60;
const MAX_PATH = 1024;

/** The confirmed change: exactly the `xora` entry written to the settings file. */
export interface ModelChange {
  readonly kind: "changeModel";
  readonly writes: { readonly provider: "local"; readonly local: XoraLocalModel };
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function pathField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_PATH) {
    throw new SetupRejected(400, "Invalid", `${key} must be a full path`);
  }
  // Windows "Copy as path" puts quotes around it.
  const path = value.trim().replace(/^"(.*)"$/, "$1");
  if (!isAbsolute(path)) throw new SetupRejected(400, "NotFullPath", `${key} must be a full path`);
  if (!isFile(path)) throw new SetupRejected(400, "MissingFile", `There is no file at ${path}`);
  return path;
}

/** A label for a model file: its name without `.gguf`, at most 60 characters. */
export function labelFromFile(path: string): string {
  const name =
    basename(path)
      .replace(/\.gguf$/i, "")
      .trim() || "GGUF";
  return name.length > MAX_MODEL_LABEL ? `${name.slice(0, MAX_MODEL_LABEL - 1)}…` : name;
}

function labelField(body: Record<string, unknown>, fallback: string | null): string {
  const value = body.modelLabel;
  if (value === undefined && fallback) return fallback;
  if (typeof value !== "string" || !value.trim()) {
    throw new SetupRejected(400, "Invalid", "modelLabel must not be empty");
  }
  if (value.trim().length > MAX_MODEL_LABEL) {
    throw new SetupRejected(
      400,
      "Invalid",
      `modelLabel must be at most ${MAX_MODEL_LABEL} characters`,
    );
  }
  return value.trim();
}

/** `POST /api/xora/model`: checks a model choice; never writes. */
export function proposeModelChange(body: Record<string, unknown>): ModelChange {
  if (body.provider === "openai" || body.provider === "anthropic") {
    throw new SetupRejected(409, "CloudUnavailable", "Cloud models come in a later version");
  }
  if (body.provider !== undefined && body.provider !== "local") {
    throw new SetupRejected(400, "Invalid", "provider must be local");
  }
  if (body.mode === "managed") {
    const runtimePath = pathField(body, "runtimePath");
    const modelPath = pathField(body, "modelPath");
    if (!modelPath.toLowerCase().endsWith(".gguf")) {
      throw new SetupRejected(400, "NotGguf", "The model file must end in .gguf");
    }
    return {
      kind: "changeModel",
      writes: {
        provider: "local",
        local: {
          mode: "managed",
          runtimePath,
          modelPath,
          modelLabel: labelField(body, labelFromFile(modelPath)),
        },
      },
    };
  }
  if (body.mode === "attached") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!isLoopbackUrl(url)) {
      throw new SetupRejected(
        400,
        "NotLocal",
        "The address must be an http address on this computer, for example http://127.0.0.1:8080",
      );
    }
    return {
      kind: "changeModel",
      writes: {
        provider: "local",
        local: { mode: "attached", url, modelLabel: labelField(body, null) },
      },
    };
  }
  throw new SetupRejected(400, "Invalid", "mode must be managed or attached");
}

let picking = false;

/**
 * Where the file window starts: for the model file the folder where `llama-server -hf`
 * keeps its downloads on Windows, if it exists; otherwise the window's own default.
 */
function startFolder(kind: FileKind, env: Readonly<Record<string, string | undefined>>) {
  if (kind !== "model") return null;
  const candidates = [
    env.LLAMA_CACHE,
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "llama.cpp") : null,
  ];
  return (
    candidates.find((folder): folder is string => Boolean(folder && existsSync(folder))) ?? null
  );
}

/** `POST /api/xora/pick`: opens the file window (Windows only) and returns the chosen file. */
export async function pickModelFile(
  environment: SetupEnvironment,
  body: Record<string, unknown>,
): Promise<{ readonly path: string } | { readonly cancelled: true }> {
  const pick = environment.pickFile;
  if (!pick) throw new SetupRejected(409, "NoPicker", "Type the full path of the file instead");
  if (body.kind !== "runtime" && body.kind !== "model") {
    throw new SetupRejected(400, "Invalid", "kind must be runtime or model");
  }
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 320)
      : "Loxora";
  if (picking) throw new SetupRejected(409, "Picking", "The file window is already open");
  picking = true;
  try {
    const chosen = await pick(
      body.kind,
      startFolder(body.kind, environment.env ?? process.env),
      title,
    );
    return chosen ? { path: chosen } : { cancelled: true };
  } finally {
    picking = false;
  }
}
