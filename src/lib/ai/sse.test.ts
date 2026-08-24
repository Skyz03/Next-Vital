import { describe, it, expect } from "vitest";
import { parseSSE } from "./sse";

/** Emits exactly the given chunks, so tests control where the split lands. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<string[]> {
  const out: string[] = [];
  for await (const payload of parseSSE(streamOf(chunks))) out.push(payload);
  return out;
}

describe("parseSSE", () => {
  it("yields the payload of each data field", async () => {
    expect(await collect(['data: {"a":1}\n\n', 'data: {"b":2}\n\n'])).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it("reassembles a payload split across chunks mid-JSON", async () => {
    expect(await collect(['data: {"te', 'xt":"hello"}\n\n'])).toEqual(['{"text":"hello"}']);
  });

  it("reassembles a payload split inside the field name", async () => {
    expect(await collect(["dat", 'a: {"x":1}\n\n'])).toEqual(['{"x":1}']);
  });

  it("skips comment keepalives", async () => {
    // OpenRouter sends these while an upstream model warms up.
    expect(await collect([": OPENROUTER PROCESSING\n\n", 'data: {"x":1}\n\n'])).toEqual([
      '{"x":1}',
    ]);
  });

  it("ignores non-data fields", async () => {
    expect(await collect(['event: message_delta\ndata: {"x":1}\n\n'])).toEqual(['{"x":1}']);
  });

  it("stops at [DONE] and drops anything after it", async () => {
    expect(await collect(['data: {"x":1}\n\n', "data: [DONE]\n\n", 'data: {"y":2}\n\n'])).toEqual([
      '{"x":1}',
    ]);
  });

  it("emits a trailing event that has no closing blank line", async () => {
    expect(await collect(['data: {"x":1}\n'])).toEqual(['{"x":1}']);
  });

  it("handles CRLF line endings", async () => {
    expect(await collect(['data: {"x":1}\r\n\r\n'])).toEqual(['{"x":1}']);
  });

  it("tolerates a missing space after the colon", async () => {
    expect(await collect(['data:{"x":1}\n\n'])).toEqual(['{"x":1}']);
  });

  it("joins a payload spread over multiple data lines", async () => {
    expect(await collect(["data: line one\ndata: line two\n\n"])).toEqual(["line one\nline two"]);
  });
});
