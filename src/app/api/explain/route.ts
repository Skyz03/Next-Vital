import { type NextRequest, NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/validate";
import { cacheKey, getCached, checkAiRateLimit } from "@/lib/cache";
import { streamCompletion, type ProxyProviderId } from "@/lib/ai";
import { ExplainSchema } from "@/lib/ai/validate";
import { buildSystemPrompt, openOnUserTurn, PLAN_USER_TURN } from "@/lib/ai/prompt";
import type { AnalysisResult } from "@/types/analysis";
import type { AiError, ChatMessage } from "@/types/ai";

export const maxDuration = 60;

// Mirrors getIP in ../analyze/route.ts: on Vercel x-real-ip is platform-set and
// unspoofable; x-forwarded-for can be prepended by the client, so the last
// entry (the platform hop) is the only trustworthy one.
function getIP(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}

function errorResponse(err: AiError, status: number, headers?: Record<string, string>) {
  return NextResponse.json(err, { status, headers });
}

export async function POST(req: NextRequest) {
  // 1. The caller's key travels in a header rather than the body: it can be
  //    rejected before anything is parsed, and it stays out of the payload
  //    object that a logger or error reporter would be most likely to
  //    serialise. It is never persisted and never echoed back.
  const key = req.headers.get("x-provider-key")?.trim();
  if (!key) {
    return errorResponse(
      { error: true, code: "NO_KEY", message: "Add an API key to use AI analysis." },
      400
    );
  }

  // 2. Parse + validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(
      { error: true, code: "INVALID_REQUEST", message: "Invalid request body." },
      400
    );
  }

  const parsed = ExplainSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      { error: true, code: "INVALID_REQUEST", message: parsed.error.issues[0].message },
      400
    );
  }

  const { url: rawUrl, strategy, mode, provider, model, messages } = parsed.data;
  const url = normalizeUrl(rawUrl);

  // 3. Rate limit. This is not a cost control — the tokens are the caller's —
  //    it stops the route being driven as a general-purpose LLM relay.
  const rateLimit = await checkAiRateLimit(getIP(req));
  if (!rateLimit.allowed) {
    return errorResponse(
      {
        error: true,
        code: "RATE_LIMITED",
        message: `Too many AI requests this hour. Try again in ${Math.ceil(
          rateLimit.retryAfter / 60
        )} minutes.`,
        retryAfter: rateLimit.retryAfter,
      },
      429,
      { "Retry-After": String(rateLimit.retryAfter) }
    );
  }

  // 4. The prompt is built from the cached audit, never from anything the
  //    caller sent. A client chooses *which* report to discuss; it cannot
  //    choose what the model is told about it.
  const cached = (await getCached(cacheKey(url, strategy))) as AnalysisResult | null;
  if (!cached) {
    return errorResponse(
      {
        error: true,
        code: "NO_AUDIT",
        message: "No cached audit for this URL. Run the audit again, then retry.",
      },
      409
    );
  }

  // "plan" discards any caller-supplied turns so the action plan is always
  // generated from the same fixed prompt.
  const turns: ChatMessage[] =
    mode === "plan" ? [{ role: "user", content: PLAN_USER_TURN }] : openOnUserTurn(messages ?? []);

  const result = await streamCompletion({
    provider: provider as ProxyProviderId,
    key,
    model,
    system: buildSystemPrompt(cached),
    messages: turns,
  });

  if (!result.ok) {
    // Provider failures are caught before the streaming Response exists, so
    // they still carry a real status code.
    const status = result.code === "PROVIDER_AUTH" ? 401 : result.code === "AI_TIMEOUT" ? 504 : 502;
    return errorResponse({ error: true, code: result.code, message: result.message }, status);
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Stops intermediary proxies buffering the whole body before flushing.
      "X-Accel-Buffering": "no",
    },
  });
}
