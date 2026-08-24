import { parseSSE } from "./sse";

/**
 * Delta parser for the OpenAI chat-completions wire format.
 *
 * Shared by OpenRouter and by local runtimes (Ollama, LM Studio), which both
 * expose an OpenAI-compatible endpoint — so supporting local models cost one
 * request builder rather than a second parser.
 */
export async function* openAiCompatDeltas(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  for await (const payload of parseSSE(body)) {
    let chunk: Record<string, unknown>;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }

    // Failures arrive as an error object mid-stream rather than a status code.
    if (chunk.error) {
      const err = chunk.error as Record<string, unknown> | string;
      const detail =
        typeof err === "string"
          ? err
          : typeof err.message === "string"
            ? err.message
            : "unknown error";
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
