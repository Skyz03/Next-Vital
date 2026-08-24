import { parseSSE } from "./sse";
import { PROVIDERS } from "./providers";
import type { ChatMessage } from "@/types/ai";

/**
 * `output_config.effort` is rejected outright on models that predate it
 * (Sonnet 4.5, Haiku 4.5). The model field is free text, so gate on a pattern
 * rather than assuming whatever the user typed accepts it.
 */
export function supportsEffort(model: string): boolean {
  return /^claude-(opus-5|opus-4-[5-8]|sonnet-5|sonnet-4-6|fable-5|mythos-5)/.test(model);
}

export function anthropicRequest(
  key: string,
  model: string,
  system: string,
  messages: ChatMessage[]
): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    stream: true,
    // Marking the system block cacheable pays off across the action plan and
    // every chat turn, which share a byte-identical prefix. Below the model's
    // minimum cacheable length this is silently ignored rather than an error.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  };

  // Adaptive thinking is left on (it is the default on Opus 5). Disabling it is
  // a documented source of `<thinking>` tag leakage into visible output, which
  // would land straight in the user's action plan. Low effort is the right fit
  // anyway: this is ranking and summarising a small structured payload.
  if (supportsEffort(model)) body.output_config = { effort: "low" };

  return {
    url: PROVIDERS.anthropic.endpoint,
    init: {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  };
}

/** Maps the Messages API event stream down to plain text deltas. */
export async function* anthropicDeltas(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  for await (const payload of parseSSE(body)) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload);
    } catch {
      continue; // a malformed frame is not worth killing the response over
    }

    switch (event.type) {
      case "content_block_delta": {
        const delta = event.delta as Record<string, unknown> | undefined;
        // Only text_delta — thinking blocks stream with empty text when
        // `display` is omitted, which is the default on current models.
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          yield delta.text;
        }
        break;
      }
      case "message_delta": {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.stop_reason === "refusal") {
          yield "\n\n_The model declined to answer this request._";
        } else if (delta?.stop_reason === "max_tokens") {
          yield "\n\n_Response truncated at the token limit._";
        }
        break;
      }
      case "error": {
        const err = event.error as Record<string, unknown> | undefined;
        const detail = typeof err?.message === "string" ? err.message : "unknown error";
        yield `\n\n_The provider ended the response early: ${detail}_`;
        return;
      }
    }
  }
}
