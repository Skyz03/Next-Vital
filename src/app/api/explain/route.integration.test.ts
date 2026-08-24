import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { AnalysisResult } from "@/types/analysis";

// Only the network boundary is faked here. The route, streamCompletion, both
// provider adapters and the SSE parser all run for real, so this is the one
// test that exercises the whole chain end to end.
vi.mock("@/lib/cache", () => ({
  cacheKey: vi.fn((url: string, strategy: string) => `analysis:${strategy}:${url}`),
  getCached: vi.fn(),
  checkAiRateLimit: vi.fn(),
}));

const cache = await import("@/lib/cache");
const { POST } = await import("./route");

const CACHED: AnalysisResult = {
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
  cachedAt: "2026-08-24T00:00:00.000Z",
  fromCache: true,
  lighthouseVersion: "13.4.1",
  fetchTimeMs: 5000,
};

/** Delivers the payload in awkward chunks, the way a real socket would. */
function chunkedResponse(raw: string, chunkSize: number): Response {
  const encoder = new TextEncoder();
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= raw.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(raw.slice(offset, offset + chunkSize)));
      offset += chunkSize;
    },
  });
  return new Response(body, { status: 200 });
}

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Provider-Key": "sk-ant-test-key-value" },
    body: JSON.stringify(body),
  });
}

const PLAN_REQUEST = {
  url: "https://example.com",
  strategy: "mobile",
  mode: "plan",
  provider: "anthropic",
  model: "claude-opus-5",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(cache.getCached).mockResolvedValue(CACHED);
  vi.mocked(cache.checkAiRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 59,
    retryAfter: 3600,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("end-to-end streaming", () => {
  const ANTHROPIC_SSE = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"## Do this first\\n\\n"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"- Split the 1240 ms bundle with `next/dynamic`."}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
    "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
  ].join("");

  it("streams a plan end to end, whatever the chunk boundaries", async () => {
    // 7 bytes splits mid-JSON, mid-field-name and mid-escape sequence.
    for (const size of [7, 64, 100_000]) {
      vi.mocked(fetch).mockResolvedValue(chunkedResponse(ANTHROPIC_SSE, size));
      const res = await POST(request(PLAN_REQUEST));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(
        "## Do this first\n\n- Split the 1240 ms bundle with `next/dynamic`."
      );
    }
  });

  it("sends the real audit numbers to the provider", async () => {
    vi.mocked(fetch).mockResolvedValue(chunkedResponse(ANTHROPIC_SSE, 64));
    await POST(request(PLAN_REQUEST));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.system[0].text).toContain("Performance 62/100");
    expect(body.system[0].text).toContain("est. saving 1240 ms");
    expect(body.stream).toBe(true);
  });

  it("streams an OpenRouter conversation through the identical contract", async () => {
    const raw = [
      ": OPENROUTER PROCESSING\n\n",
      'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Because the CSS "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"blocks render."}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    vi.mocked(fetch).mockResolvedValue(chunkedResponse(raw, 11));

    const res = await POST(
      request({
        ...PLAN_REQUEST,
        provider: "openrouter",
        model: "z-ai/glm-5.2:free",
        mode: "chat",
        messages: [{ role: "user", content: "why is LCP slow?" }],
      })
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Because the CSS blocks render.");
  });

  it("surfaces a provider error as a status code, not as text in a 200", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":{"message":"credit balance too low"}}', { status: 400 })
    );
    const res = await POST(request(PLAN_REQUEST));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.message).toContain("credit balance too low");
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-key-value");
  });
});
