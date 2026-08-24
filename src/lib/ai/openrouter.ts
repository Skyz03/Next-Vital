import { parseSSE } from "./sse";
import { PROVIDERS } from "./providers";
import type { ChatMessage } from "@/types/ai";

export function openrouterRequest(
  key: string,
  model: string,
  system: string,
  messages: ChatMessage[]
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    // Optional attribution headers OpenRouter uses for its app leaderboards.
    "X-Title": "Nextvital",
  };
  const referer = process.env.NEXT_PUBLIC_APP_URL;
  if (referer) headers["HTTP-Referer"] = referer;

  return {
    url: PROVIDERS.openrouter.endpoint,
    init: {
      method: "POST",
      headers,
      // Kept deliberately minimal. OpenRouter fronts 400+ models from a dozen
      // upstreams and the model field is free text; every extra parameter is
      // another way for a specific model to reject the request. Breadth is the
      // whole reason to offer OpenRouter, so nothing optional goes in here.
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 4096,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    },
  };
}

/** Maps the OpenAI-shaped chunk stream down to plain text deltas. */
export async function* openrouterDeltas(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  for await (const payload of parseSSE(body)) {
    let chunk: Record<string, unknown>;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }

    // OpenRouter reports upstream failures as an error object mid-stream.
    if (chunk.error) {
      const err = chunk.error as Record<string, unknown>;
      const detail = typeof err.message === "string" ? err.message : "unknown error";
      yield `\n\n_The provider ended the response early: ${detail}_`;
      return;
    }

    const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
    const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
    // `delta.reasoning` is skipped: reasoning models emit it alongside content
    // and it is not part of the answer.
    if (typeof delta?.content === "string" && delta.content.length > 0) {
      yield delta.content;
    }
  }
}
