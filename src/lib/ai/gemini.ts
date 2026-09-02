import { parseSSE } from "./sse";
import { PROVIDERS } from "./providers";
import type { ChatMessage } from "@/types/ai";

/** Gemini 2.5 Pro supports a dynamic thinking budget; earlier models reject it. */
export function supportsThinking(model: string): boolean {
  return /^gemini-2\.5-pro/.test(model);
}

export function geminiRequest(
  key: string,
  model: string,
  system: string,
  messages: ChatMessage[]
): { url: string; init: RequestInit } {
  // The model is part of the path, so it is encoded rather than interpolated —
  // the field is free text and a slash would otherwise change the endpoint.
  const path = `models/${encodeURIComponent(model)}:streamGenerateContent`;

  return {
    // `alt=sse` switches the response from a JSON array to Server-Sent Events.
    url: `${PROVIDERS.gemini.endpoint}/${path}?alt=sse`,
    init: {
      method: "POST",
      headers: {
        // Gemini also accepts ?key= in the query string. The header is used
        // instead so the key never lands in a URL, where proxies and access
        // logs would capture it.
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        // Gemini calls the assistant role "model".
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: 4096,
          // Lower temperature + topP make the plan consistent across regenerations.
          // This is ranking/summarising a structured payload, not creative writing.
          temperature: 0.4,
          topP: 0.95,
          ...(supportsThinking(model) ? { thinkingConfig: { thinkingBudget: -1 } } : {}),
        },
      }),
    },
  };
}

/** Maps the streamGenerateContent event stream down to plain text deltas. */
export async function* geminiDeltas(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  for await (const payload of parseSSE(body)) {
    let chunk: Record<string, unknown>;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }

    if (chunk.error) {
      const err = chunk.error as Record<string, unknown>;
      const detail = typeof err.message === "string" ? err.message : "unknown error";
      yield `\n\n_The provider ended the response early: ${detail}_`;
      return;
    }

    const candidates = chunk.candidates as Array<Record<string, unknown>> | undefined;
    const candidate = candidates?.[0];
    if (!candidate) continue;

    const content = candidate.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    for (const part of parts ?? []) {
      if (typeof part.text === "string" && part.text.length > 0) yield part.text;
    }

    // STOP is the normal ending. Anything else cut the answer short, and
    // saying so beats a reply that simply stops mid-sentence.
    const finish = candidate.finishReason;
    if (typeof finish === "string" && finish !== "STOP") {
      if (finish === "MAX_TOKENS") {
        yield "\n\n_Response truncated at the token limit._";
      } else if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
        yield "\n\n_The model declined to answer this request._";
      } else {
        yield `\n\n_The response ended early (${finish})._`;
      }
      return;
    }
  }
}
