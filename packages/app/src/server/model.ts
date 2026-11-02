/**
 * One adapter for every model (ADR-008 section 2, Milestone 16 section 3): the
 * OpenAI-compatible route `POST /v1/chat/completions` with tools. It returns at most one
 * text and at most one action call; identical repeated calls count once, different calls
 * are dropped. It never follows a redirect.
 */

export interface ModelTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface ModelMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface ModelRequest {
  readonly system: string;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ModelTool[];
}

export interface ModelTurn {
  readonly text?: string;
  readonly call?: { readonly name: string; readonly arguments: Record<string, unknown> };
}

/** The model did not answer usably; `reason` tells the runtime what happened. */
export class ModelUnavailable extends Error {
  public constructor(public readonly reason: "timeout" | "exited") {
    super(`The model did not answer (${reason})`);
    this.name = "ModelUnavailable";
  }
}

export const ANSWER_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 300;
const TEMPERATURE = 0.2;

export async function chatCompletion(
  baseUrl: string,
  request: ModelRequest,
  options: { readonly fetch?: typeof fetch; readonly timeoutMs?: number } = {},
): Promise<ModelTurn> {
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? ANSWER_TIMEOUT_MS),
      body: JSON.stringify({
        model: "xora",
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "system", content: request.system }, ...request.messages],
        ...(request.tools.length > 0
          ? {
              tools: request.tools.map((tool) => ({
                type: "function",
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
            }
          : {}),
        // Small Qwen models answer without thinking with this; other templates ignore it.
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new ModelUnavailable(
      name === "TimeoutError" || name === "AbortError" ? "timeout" : "exited",
    );
  }
  if (response.status !== 200) throw new ModelUnavailable("exited");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ModelUnavailable("exited");
  }
  return parseCompletion(body);
}

interface RawCall {
  readonly function?: { readonly name?: unknown; readonly arguments?: unknown };
}

/** Reads the first choice; exported for tests. */
export function parseCompletion(body: unknown): ModelTurn {
  const message = (body as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]
    ?.message;
  if (!message) return {};
  const content = typeof message.content === "string" ? cleanText(message.content) : "";
  const raw = Array.isArray(message.tool_calls) ? (message.tool_calls as RawCall[]) : [];
  const distinct = raw.filter(
    (candidate, index) =>
      raw.findIndex(
        (other) =>
          other.function?.name === candidate.function?.name &&
          other.function?.arguments === candidate.function?.arguments,
      ) === index,
  );
  let call: ModelTurn["call"];
  if (distinct.length === 1) {
    const only = distinct[0]?.function;
    const args = parseArguments(only?.arguments);
    if (typeof only?.name === "string" && args) call = { name: only.name, arguments: args };
  }
  return { ...(content ? { text: content } : {}), ...(call ? { call } : {}) };
}

function parseArguments(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === "") return {};
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Removes a thinking block some models emit, and surrounding space. */
function cleanText(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export const MAX_REPLY_WORDS = 60;

/** Cuts a reply at 60 words (Milestone 16 section 3). */
export function limitWords(text: string, max = MAX_REPLY_WORDS): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  return `${words.slice(0, max).join(" ")} …`;
}
