import type { AiProviderId } from "@/types/ai";
import { PROVIDERS, isProviderId } from "@/lib/ai/providers";

export interface StoredCreds {
  provider: AiProviderId;
  key: string;
  model: string;
}

const STORAGE_KEY = "nextvital_ai_v1";

/**
 * The one piece of client-side persistence in the app.
 *
 * Audit results are deliberately *not* stored (see the comment in
 * src/app/results/page.tsx) because the server can always re-serve them. A key
 * is different: re-pasting it on every page load would make the feature not
 * worth using, so it is persisted.
 *
 * The trade-off is real and documented in the README — with no `script-src`
 * CSP on this origin, an XSS here could read the stored key. That is inherent
 * to any browser-held credential. The key is scoped to the user's own provider
 * account and can be revoked from their dashboard.
 *
 * Exposed as a useSyncExternalStore source rather than a mount effect, since
 * localStorage genuinely is an external store — which also means a key saved
 * in one tab shows up in the others.
 */

const listeners = new Set<() => void>();

// useSyncExternalStore compares snapshots by reference and will loop forever if
// getSnapshot allocates a fresh object each call. Cache against the raw string
// so a re-render with unchanged storage returns the identical object.
let lastRaw: string | null = null;
let lastParsed: StoredCreds | null = null;

function parse(raw: string | null): StoredCreds | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { provider, key, model } = value as Record<string, unknown>;
    // Guard the shape: an entry written by an older version should read as
    // "no key configured" rather than produce a malformed request.
    if (!isProviderId(provider)) return null;
    if (typeof key !== "string" || key.length === 0) return null;
    return {
      provider,
      key,
      model:
        typeof model === "string" && model.length > 0 ? model : PROVIDERS[provider].defaultModel,
    };
  } catch {
    return null;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeCreds(onChange: () => void): () => void {
  listeners.add(onChange);
  // "storage" only fires in *other* tabs, which is exactly the case the local
  // listener set does not cover.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getCredsSnapshot(): StoredCreds | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastParsed = parse(raw);
  }
  return lastParsed;
}

/** There is no key during SSR, so the server always renders the empty state. */
export function getServerCredsSnapshot(): StoredCreds | null {
  return null;
}

export function saveCreds(creds: StoredCreds): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // Private-browsing quota errors are non-fatal; the key just won't persist.
  }
  notify();
}

export function clearCreds(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
  notify();
}

/** Shows enough to recognise which key is stored, never enough to use it. */
export function maskKey(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
