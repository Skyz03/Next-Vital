import { describe, it, expect } from "vitest";
import { geminiRequest, geminiDeltas } from "./gemini";

function sse(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.close();
    },
  });
}

async function text(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out;
}

const part = (t: string) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });

describe("geminiRequest", () => {
  it("puts the model in the path and asks for SSE", () => {
    const { url } = geminiRequest("AIzaKEY", "gemini-3.7-flash", "SYS", []);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:streamGenerateContent?alt=sse"
    );
  });

  it("sends the key as a header, never in the URL", () => {
    // A key in the query string is captured by every proxy and access log
    // between here and Google.
    const { url, init } = geminiRequest("AIzaSECRET", "gemini-3.7-flash", "SYS", []);
    expect(url).not.toContain("AIzaSECRET");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIzaSECRET");
  });

  it("encodes the model, since the field is free text", () => {
    const { url } = geminiRequest("k", "../../evil", "SYS", []);
    expect(url).toContain("models/..%2F..%2Fevil:streamGenerateContent");
  });

  it("uses systemInstruction rather than a system turn", () => {
    const body = JSON.parse(geminiRequest("k", "m", "SYS", []).init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("SYS");
  });

  it("renames the assistant role to model", () => {
    const body = JSON.parse(
      geminiRequest("k", "m", "SYS", [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]).init.body as string
    );
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "hi" }] });
    expect(body.contents[1]).toEqual({ role: "model", parts: [{ text: "hello" }] });
  });
});

describe("geminiDeltas", () => {
  it("concatenates text parts", async () => {
    expect(await text(geminiDeltas(sse([part("Fix "), part("LCP")])))).toBe("Fix LCP");
  });

  it("handles a chunk carrying several parts", async () => {
    const multi = { candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] };
    expect(await text(geminiDeltas(sse([multi])))).toBe("ab");
  });

  it("ignores a normal STOP finish", async () => {
    const done = { candidates: [{ content: { parts: [{ text: "done" }] }, finishReason: "STOP" }] };
    expect(await text(geminiDeltas(sse([done])))).toBe("done");
  });

  it("flags a safety stop instead of ending mid-sentence", async () => {
    const blocked = { candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] };
    expect(await text(geminiDeltas(sse([blocked])))).toContain("declined");
  });

  it("flags a token-limit stop", async () => {
    const cut = { candidates: [{ content: { parts: [{ text: "x" }] }, finishReason: "MAX_TOKENS" }] };
    expect(await text(geminiDeltas(sse([cut])))).toContain("truncated");
  });

  it("surfaces an error object and stops", async () => {
    const out = await text(
      geminiDeltas(
        sse([part("partial"), { error: { code: 429, message: "Quota exceeded" } }, part("gone")])
      )
    );
    expect(out).toContain("partial");
    expect(out).toContain("Quota exceeded");
    expect(out).not.toContain("gone");
  });

  it("survives a chunk with no candidates", async () => {
    expect(await text(geminiDeltas(sse([{ usageMetadata: { totalTokenCount: 5 } }, part("ok")])))).toBe(
      "ok"
    );
  });
});
