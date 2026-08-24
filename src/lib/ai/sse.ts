/**
 * Minimal Server-Sent Events reader.
 *
 * Both providers stream SSE but disagree on the payload shape, so this yields
 * raw `data:` payloads and leaves interpretation to the per-provider adapter.
 *
 * Two things it has to get right:
 *  - Chunk boundaries. A TCP chunk can split a line anywhere, including
 *    mid-JSON, so lines are buffered until a newline actually arrives.
 *  - Comment lines. OpenRouter emits ": OPENROUTER PROCESSING" keepalives
 *    while a model warms up; parsing one as JSON would throw.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);

        // A blank line terminates the event; emit whatever data it carried.
        if (line === "") {
          if (dataLines.length > 0) {
            const payload = dataLines.join("\n");
            dataLines = [];
            if (payload === "[DONE]") return;
            yield payload;
          }
          continue;
        }

        if (line.startsWith(":")) continue; // keepalive comment
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        // "event:", "id:" and "retry:" are ignored — every payload we care
        // about names its own type inside the JSON.
      }
    }

    // A final event with no trailing blank line still counts.
    if (dataLines.length > 0) {
      const payload = dataLines.join("\n");
      if (payload !== "[DONE]") yield payload;
    }
  } finally {
    // Cancels upstream if the consumer bailed early, and releases the lock.
    reader.cancel().catch(() => {});
  }
}
