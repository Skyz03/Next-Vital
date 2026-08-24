import { anthropicRequest, anthropicDeltas } from "./anthropic";
import { openrouterRequest, openrouterDeltas } from "./openrouter";
import { geminiRequest, geminiDeltas } from "./gemini";
import type { AiErrorCode, AiProviderId, ChatMessage } from "@/types/ai";

// Well under the route's maxDuration so a hung provider surfaces as our own
// timeout rather than the platform severing the connection.
const PROVIDER_TIMEOUT_MS = 55_000;

/** Only proxied providers reach this module; "local" never leaves the browser. */
export type ProxyProviderId = Exclude<AiProviderId, "local">;

export interface CompletionRequest {
  provider: ProxyProviderId;
  key: string;
  model: string;
  system: string;
  messages: ChatMessage[];
}

export type CompletionResult =
  | { ok: true; stream: ReadableStream<Uint8Array> }
  | { ok: false; code: AiErrorCode; message: string };

/**
 * The user's key must never reach a log, a response body or Redis. Provider
 * error bodies are echoed back to help people debug a bad model name, so scrub
 * the key out of that text before it leaves the server.
 */
function scrub(text: string, key: string): string {
  return key.length >= 8 ? text.split(key).join("[redacted]") : text;
}

/**
 * Every provider here nests its human-readable text at error.message, so one
 * extractor covers all three. Falls back to the raw body, which is what a
 * gateway or proxy error looks like.
 */
function extractProviderMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // not JSON
  }
  return text;
}

function mapStatus(status: number, detail: string): AiErrorCode {
  if (status === 401 || status === 403) return "PROVIDER_AUTH";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  // Gemini answers a bad key with 400 rather than 401, so status alone would
  // send the user a generic "provider error" for the one failure they are most
  // likely to hit and can actually fix.
  if (status === 400 && /api[ _-]?key/i.test(detail)) return "PROVIDER_AUTH";
  return "PROVIDER_ERROR";
}

function friendly(code: AiErrorCode, status: number, detail: string): string {
  switch (code) {
    case "PROVIDER_AUTH":
      return "The provider rejected that API key. Check it was copied in full and has not been revoked.";
    case "PROVIDER_RATE_LIMITED":
      return "The provider rate-limited this key. Wait a moment and try again.";
    default:
      return `The provider returned ${status}. ${detail}`.trim();
  }
}

/** Converts an async iterator of text into a byte stream, per the Next.js route docs. */
function toStream(iterator: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(value));
      } catch {
        // Headers are long gone by now, so the status cannot be changed. Tell
        // the reader in-band instead of dropping the connection silently.
        controller.enqueue(encoder.encode("\n\n_The response was interrupted._"));
        controller.close();
      }
    },
    cancel() {
      iterator.return(undefined as never).catch(() => {});
    },
  });
}

export async function streamCompletion(req: CompletionRequest): Promise<CompletionResult> {
  const build =
    req.provider === "anthropic"
      ? anthropicRequest
      : req.provider === "gemini"
        ? geminiRequest
        : openrouterRequest;
  const { url, init } = build(req.key, req.model, req.system, req.messages);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "AI_TIMEOUT", message: "The model took too long to respond." };
    }
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: "Could not reach the provider. Check your connection and try again.",
    };
  }

  // The upstream status is checked before any streaming Response is returned,
  // so provider failures still arrive as a real status code rather than as
  // text spliced into a 200 the client has already started rendering.
  if (!res.ok) {
    clearTimeout(timeout);
    const raw = scrub(await res.text().catch(() => ""), req.key);
    const detail = extractProviderMessage(raw).slice(0, 300);
    const code = mapStatus(res.status, detail);
    return { ok: false, code, message: friendly(code, res.status, detail) };
  }

  if (!res.body) {
    clearTimeout(timeout);
    return { ok: false, code: "PROVIDER_ERROR", message: "The provider returned an empty response." };
  }

  const toDeltas =
    req.provider === "anthropic"
      ? anthropicDeltas
      : req.provider === "gemini"
        ? geminiDeltas
        : openrouterDeltas;
  const deltas = toDeltas(res.body);

  // Only clear the timeout once the body is fully consumed — aborting mid-stream
  // is exactly what we want if a provider stalls halfway through.
  async function* withCleanup() {
    try {
      yield* deltas;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: true, stream: toStream(withCleanup()) };
}
