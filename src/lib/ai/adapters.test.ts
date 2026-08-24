import { describe, it, expect } from "vitest";
import { anthropicDeltas, anthropicRequest, supportsEffort } from "./anthropic";
import { openrouterDeltas, openrouterRequest } from "./openrouter";

function sse(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      }
      controller.close();
    },
  });
}

async function text(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out;
}

describe("supportsEffort", () => {
  // output_config.effort is rejected outright by models that predate it, and
  // the model field is free text, so this gate is load-bearing.
  it.each(["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6"])(
    "allows %s",
    (model) => expect(supportsEffort(model)).toBe(true)
  );

  it.each(["claude-haiku-4-5", "claude-sonnet-4-5", "claude-3-haiku"])(
    "excludes %s",
    (model) => expect(supportsEffort(model)).toBe(false)
  );
});

describe("anthropicRequest", () => {
  it("authenticates with x-api-key and pins the API version", () => {
    const { url, init } = anthropicRequest("sk-ant-test", "claude-opus-5", "SYS", []);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("marks the system block cacheable and requests a stream", () => {
    const { init } = anthropicRequest("k", "claude-opus-5", "SYS", []);
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
    expect(body.system[0].text).toBe("SYS");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("omits output_config on a model that would reject it", () => {
    const body = JSON.parse(
      anthropicRequest("k", "claude-haiku-4-5", "SYS", []).init.body as string
    );
    expect(body.output_config).toBeUndefined();
  });

  it("sends low effort on a model that supports it", () => {
    const body = JSON.parse(anthropicRequest("k", "claude-opus-5", "SYS", []).init.body as string);
    expect(body.output_config).toEqual({ effort: "low" });
  });
});

describe("anthropicDeltas", () => {
  it("emits text_delta content and nothing else", async () => {
    const out = await text(
      anthropicDeltas(
        sse([
          { type: "message_start" },
          { type: "content_block_start", content_block: { type: "text" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "Hello " } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "world" } },
          { type: "content_block_stop" },
        ])
      )
    );
    expect(out).toBe("Hello world");
  });

  it("ignores thinking deltas", async () => {
    const out = await text(
      anthropicDeltas(
        sse([
          { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "hmm" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "answer" } },
        ])
      )
    );
    expect(out).toBe("answer");
  });

  it("reports a refusal instead of ending silently", async () => {
    const out = await text(
      anthropicDeltas(sse([{ type: "message_delta", delta: { stop_reason: "refusal" } }]))
    );
    expect(out).toContain("declined");
  });

  it("flags a truncated response", async () => {
    const out = await text(
      anthropicDeltas(sse([{ type: "message_delta", delta: { stop_reason: "max_tokens" } }]))
    );
    expect(out).toContain("truncated");
  });

  it("surfaces a mid-stream error and stops", async () => {
    const out = await text(
      anthropicDeltas(
        sse([
          { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } },
          { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "unreachable" } },
        ])
      )
    );
    expect(out).toContain("partial");
    expect(out).toContain("Overloaded");
    expect(out).not.toContain("unreachable");
  });

  it("survives a malformed frame", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: {not json\n\n"));
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "content_block_delta",
              delta: { type: "text_delta", text: "ok" },
            })}\n\n`
          )
        );
        controller.close();
      },
    });
    expect(await text(anthropicDeltas(stream))).toBe("ok");
  });
});

describe("openrouterRequest", () => {
  it("authenticates with a bearer token", () => {
    const { url, init } = openrouterRequest("sk-or-v1-test", "z-ai/glm-5.2:free", "SYS", []);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-test");
  });

  it("puts the system prompt in the messages array", () => {
    const body = JSON.parse(
      openrouterRequest("k", "m", "SYS", [{ role: "user", content: "hi" }]).init.body as string
    );
    expect(body.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
    expect(body.stream).toBe(true);
  });

  it("sends nothing optional, for compatibility across the catalogue", () => {
    const body = JSON.parse(openrouterRequest("k", "m", "SYS", []).init.body as string);
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "stream"]);
  });
});

describe("openrouterDeltas", () => {
  it("emits choice content", async () => {
    const out = await text(
      openrouterDeltas(
        sse([
          { choices: [{ delta: { role: "assistant", content: "" } }] },
          { choices: [{ delta: { content: "Hello " } }] },
          { choices: [{ delta: { content: "world" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ])
      )
    );
    expect(out).toBe("Hello world");
  });

  it("skips reasoning tokens", async () => {
    const out = await text(
      openrouterDeltas(
        sse([
          { choices: [{ delta: { reasoning: "thinking out loud" } }] },
          { choices: [{ delta: { content: "answer" } }] },
        ])
      )
    );
    expect(out).toBe("answer");
  });

  it("surfaces a mid-stream error and stops", async () => {
    const out = await text(
      openrouterDeltas(
        sse([
          { choices: [{ delta: { content: "partial" } }] },
          { error: { message: "Upstream is down", code: 502 } },
          { choices: [{ delta: { content: "unreachable" } }] },
        ])
      )
    );
    expect(out).toContain("partial");
    expect(out).toContain("Upstream is down");
    expect(out).not.toContain("unreachable");
  });
});
