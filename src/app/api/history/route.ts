import { type NextRequest, NextResponse } from "next/server";
import { getCached, setHistoryCache, delCache, historyKey } from "@/lib/cache";
import type { HistoryEntry } from "@/lib/history";

const SESSION_COOKIE = "nextvital_sid";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const MAX_ENTRIES = 20;

function getOrCreateSid(req: NextRequest): { sid: string; isNew: boolean } {
  const existing = req.cookies.get(SESSION_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing)) {
    return { sid: existing, isNew: false };
  }
  const sid = crypto.randomUUID().replace(/-/g, "");
  return { sid, isNew: true };
}

function applySidCookie(res: NextResponse, sid: string): void {
  res.cookies.set(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

export async function GET(req: NextRequest) {
  const { sid, isNew } = getOrCreateSid(req);
  const res = NextResponse.json({ entries: [] as HistoryEntry[] });

  if (isNew) {
    applySidCookie(res, sid);
    return res;
  }

  const raw = await getCached(historyKey(sid));
  const entries = raw ? (raw as HistoryEntry[]) : [];
  const result = NextResponse.json({ entries });
  if (isNew) applySidCookie(result, sid);
  return result;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { sid, isNew } = getOrCreateSid(req);
  const entry = body as HistoryEntry;

  const raw = isNew ? [] : ((await getCached(historyKey(sid))) as HistoryEntry[] | null) ?? [];
  const filtered = raw.filter(
    (e) => !(e.url === entry.url && e.strategy === entry.strategy)
  );
  const updated = [{ ...entry, savedAt: Date.now() }, ...filtered].slice(0, MAX_ENTRIES);

  await setHistoryCache(historyKey(sid), updated);

  const res = NextResponse.json({ ok: true });
  if (isNew) applySidCookie(res, sid);
  return res;
}

export async function DELETE(req: NextRequest) {
  const { sid, isNew } = getOrCreateSid(req);
  if (!isNew) await delCache(historyKey(sid));
  const res = NextResponse.json({ ok: true });
  if (isNew) applySidCookie(res, sid);
  return res;
}
