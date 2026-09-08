import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeUrl } from "@/lib/validate";
import {
  cacheKey,
  getCached,
  generatePermalinkId,
  setPermalink,
  checkAiRateLimit,
} from "@/lib/cache";
import type { AnalysisResult } from "@/types/analysis";

const ShareSchema = z.object({
  url: z.string().url(),
  strategy: z.enum(["mobile", "desktop"]).default("mobile"),
});

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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: true, message: "Invalid request body." }, { status: 400 });
  }

  const parsed = ShareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: true, message: parsed.error.issues[0].message }, { status: 400 });
  }

  // Reuse the AI hourly bucket — minting a permalink is cheap Redis, not PSI,
  // so it shouldn't burn the caller's 5/hr PSI quota. Uses the same key namespace
  // as AI so a single caller can't spam either surface.
  const ip = getIP(req);
  const limit = await checkAiRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: true, message: `Too many share requests. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }
  const url = normalizeUrl(parsed.data.url);
  const key = cacheKey(url, parsed.data.strategy);
  const cached = await getCached(key);

  if (!cached) {
    return NextResponse.json(
      {
        error: true,
        message: "This report is no longer in the cache. Please re-run the audit and share again.",
      },
      { status: 404 }
    );
  }

  const id = generatePermalinkId();
  await setPermalink(id, cached as AnalysisResult);

  return NextResponse.json({ id });
}
