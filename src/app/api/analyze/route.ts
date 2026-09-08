import { type NextRequest, NextResponse } from "next/server";
import { UrlSchema } from "@/lib/validate";
import { analyze } from "@/lib/analyze";
import type { AnalysisError } from "@/types/analysis";

export const maxDuration = 60;

// On Vercel, x-real-ip is the authoritative client IP set by the platform and
// cannot be spoofed by the client. x-forwarded-for is also set by Vercel but
// clients can prepend values — take the last entry (the platform-injected hop)
// only as a last resort.
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

function errorResponse(err: AnalysisError, status: number, headers?: Record<string, string>) {
  return NextResponse.json(err, { status, headers });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ error: true, code: "INVALID_URL", message: "Invalid request body." }, 400);
  }

  const parsed = UrlSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      { error: true, code: "INVALID_URL", message: parsed.error.issues[0].message },
      400
    );
  }

  const outcome = await analyze({
    url: parsed.data.url,
    strategy: parsed.data.strategy,
    ip: getIP(req),
  });

  if (!outcome.ok) {
    return errorResponse(outcome.error, outcome.status, outcome.headers);
  }

  return NextResponse.json(outcome.result, { headers: outcome.headers });
}
