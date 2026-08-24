import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamCompletion } from "./index";

const KEY = "sk-ant-supersecretvalue12345";

function base(overrides: Partial<Parameters<typeof streamCompletion>[0]> = {}) {
  return {
    provider: "anthropic" as const,
    key: KEY,
    model: "claude-opus-5",
    system: "SYS",
    messages: [{ role: "user" as const, content: "hi" }],
    ...overrides,
  };
}

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamCompletion error mapping", () => {
  it("maps 401 to an auth error with actionable wording", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("bad key", { status: 401 }));
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PROVIDER_AUTH");
    expect(result.message).toContain("rejected that API key");
  });

  it("maps 429 to a rate-limit error", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("slow down", { status: 429 }));
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_RATE_LIMITED");
  });

  it("passes a 400 body through so a bad model name is debuggable", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":{"message":"model: nonexistent not found"}}', { status: 400 })
    );
    const result = await streamCompletion(base({ model: "nonexistent" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROVIDER_ERROR");
      expect(result.message).toContain("model: nonexistent not found");
    }
  });

  it("scrubs the key out of an echoed provider error", async () => {
    // Some providers quote the offending credential back in their error body.
    // A 500 keeps the detail in the message, so this proves the scrub itself
    // rather than the auth path that replaces the text wholesale.
    vi.mocked(fetch).mockResolvedValue(
      new Response(`upstream failure for credential ${KEY}`, { status: 500 })
    );
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain(KEY);
      expect(result.message).toContain("[redacted]");
    }
  });

  it("never leaks the key on the auth path either", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(`invalid api key: ${KEY}`, { status: 401 }));
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain(KEY);
  });

  it("treats Gemini's 400-for-a-bad-key as an auth failure", async () => {
    // Gemini answers an invalid key with 400, not 401. Status alone would hand
    // the user a generic "provider error" for the one thing they can fix.
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 400, message: "API key not valid. Pass a valid API key." } }),
        { status: 400 }
      )
    );
    const result = await streamCompletion(base({ provider: "gemini", model: "gemini-3.7-flash" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROVIDER_AUTH");
      expect(result.message).toContain("rejected that API key");
    }
  });

  it("does not mistake an unrelated 400 for an auth failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "contents is required" } }), { status: 400 })
    );
    const result = await streamCompletion(base({ provider: "gemini" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });

  it("unwraps the provider message instead of echoing raw JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "credit balance too low" } }), { status: 402 })
    );
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("credit balance too low");
      expect(result.message).not.toContain("{");
    }
  });

  it("reports an aborted request as a timeout", async () => {
    vi.mocked(fetch).mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AI_TIMEOUT");
  });

  it("reports a network failure without leaking internals", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROVIDER_ERROR");
      expect(result.message).toContain("Could not reach the provider");
    }
  });

  it("rejects an empty body rather than returning a dead stream", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const result = await streamCompletion(base());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

describe("streamCompletion success", () => {
  it("streams Anthropic text deltas as plain text", async () => {
    vi.mocked(fetch).mockResolvedValue(
      sseResponse([
        { type: "content_block_delta", delta: { type: "text_delta", text: "Fix " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "LCP" } },
      ])
    );
    const result = await streamCompletion(base());
    expect(result.ok).toBe(true);
    if (result.ok) expect(await readAll(result.stream)).toBe("Fix LCP");
  });

  it("streams OpenRouter deltas through the same plain-text contract", async () => {
    vi.mocked(fetch).mockResolvedValue(
      sseResponse([
        { choices: [{ delta: { content: "Fix " } }] },
        { choices: [{ delta: { content: "LCP" } }] },
      ])
    );
    const result = await streamCompletion(base({ provider: "openrouter", model: "z-ai/glm-5.2:free" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(await readAll(result.stream)).toBe("Fix LCP");
  });

  it("routes to the provider's own endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(sseResponse([]));
    await streamCompletion(base({ provider: "openrouter" }));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });
});
