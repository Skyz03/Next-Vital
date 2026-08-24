import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamAnswer } from "./client";
import type { AnalysisResult } from "@/types/analysis";
import type { StoredCreds } from "@/lib/byok";

const RESULT: AnalysisResult = {
  url: "https://example.com",
  strategy: "mobile",
  performanceScore: 62,
  metrics: [],
  fixes: [
    {
      audit: "unused-javascript",
      title: "Code-split heavy components",
      impact: "high",
      category: "performance",
      savingsMs: 1240,
      problem: "p",
      fix: "f",
    },
  ],
  passingChecks: [],
  cachedAt: "2026-08-25T00:00:00.000Z",
  fromCache: true,
  lighthouseVersion: "13.4.1",
  fetchTimeMs: 5000,
};

const LOCAL: StoredCreds = { provider: "local", key: "", model: "llama3.2" };
const HOSTED: StoredCreds = { provider: "gemini", key: "AIzaKEY", model: "gemini-3.7-flash" };

function sseResponse(chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function textResponse(text: string): Response {
  return new Response(new Blob([text]).stream(), { status: 200 });
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out;
}

const signal = () => new AbortController().signal;

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("hosted transport", () => {
  it("goes through /api/explain with the key in a header", async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse("plan"));
    const out = await collect(
      streamAnswer({ result: RESULT, creds: HOSTED, mode: "plan", signal: signal() })
    );
    expect(out).toBe("plan");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/explain");
    expect((init?.headers as Record<string, string>)["X-Provider-Key"]).toBe("AIzaKEY");
  });

  it("does not send the audit body — the server reads its own cached copy", async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse("plan"));
    await collect(streamAnswer({ result: RESULT, creds: HOSTED, mode: "plan", signal: signal() }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body).toEqual({
      url: "https://example.com",
      strategy: "mobile",
      mode: "plan",
      provider: "gemini",
      model: "gemini-3.7-flash",
      messages: undefined,
    });
  });

  it("surfaces the route's error message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "No cached audit for this URL." }), { status: 409 })
    );
    await expect(
      collect(streamAnswer({ result: RESULT, creds: HOSTED, mode: "plan", signal: signal() }))
    ).rejects.toThrow("No cached audit");
  });
});

describe("local transport", () => {
  it("calls the local endpoint directly, never the server", async () => {
    vi.mocked(fetch).mockResolvedValue(
      sseResponse([{ choices: [{ delta: { content: "Fix LCP" } }] }])
    );
    const out = await collect(
      streamAnswer({ result: RESULT, creds: LOCAL, mode: "plan", signal: signal() })
    );
    expect(out).toBe("Fix LCP");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("honours a custom endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(sseResponse([]));
    await collect(
      streamAnswer({
        result: RESULT,
        creds: { ...LOCAL, baseUrl: "http://192.168.1.5:1234/v1/chat/completions" },
        mode: "plan",
        signal: signal(),
      })
    );
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("http://192.168.1.5:1234/v1/chat/completions");
  });

  it("builds the prompt in the browser, so the report never leaves the machine", async () => {
    vi.mocked(fetch).mockResolvedValue(sseResponse([]));
    await collect(streamAnswer({ result: RESULT, creds: LOCAL, mode: "plan", signal: signal() }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Performance 62/100");
    expect(body.messages[0].content).toContain("est. saving 1240 ms");
    expect(body.stream).toBe(true);
  });

  it("opens a follow-up conversation on a user turn", async () => {
    vi.mocked(fetch).mockResolvedValue(sseResponse([]));
    await collect(
      streamAnswer({
        result: RESULT,
        creds: LOCAL,
        mode: "chat",
        messages: [
          { role: "assistant", content: "## Do this first" },
          { role: "user", content: "why?" },
        ],
        signal: signal(),
      })
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[2].content).toBe("## Do this first");
  });

  it("explains both causes when the connection fails", async () => {
    // A refused connection and a blocked CORS preflight both surface as a bare
    // TypeError, so the message has to cover each.
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const run = () =>
      collect(streamAnswer({ result: RESULT, creds: LOCAL, mode: "plan", signal: signal() }));
    await expect(run()).rejects.toThrow("Ollama is running");
    await expect(run()).rejects.toThrow("OLLAMA_ORIGINS");
  });

  it("tells the user to pull the model on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("model not found", { status: 404 }));
    await expect(
      collect(streamAnswer({ result: RESULT, creds: LOCAL, mode: "plan", signal: signal() }))
    ).rejects.toThrow("ollama pull llama3.2");
  });

  it("propagates an abort rather than reporting it as unreachable", async () => {
    vi.mocked(fetch).mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    await expect(
      collect(streamAnswer({ result: RESULT, creds: LOCAL, mode: "plan", signal: signal() }))
    ).rejects.toThrow("aborted");
  });
});
