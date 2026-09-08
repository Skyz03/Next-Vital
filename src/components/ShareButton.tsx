"use client";

import { useState } from "react";

interface Props {
  url: string;
  strategy: "mobile" | "desktop";
  /** Pre-existing permalink ID (used on /r/[id] pages — no need to re-mint). */
  existingId?: string;
}

type State = "idle" | "loading" | "copied" | "error";

export default function ShareButton({ url, strategy, existingId }: Props) {
  const [id, setId] = useState<string | null>(existingId ?? null);
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleClick() {
    setState("loading");
    setErrorMsg("");

    try {
      let permalinkId = id;

      if (!permalinkId) {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, strategy }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Failed to create link.");
        permalinkId = data.id as string;
        setId(permalinkId);
      }

      const shareUrl = `${window.location.origin}/r/${permalinkId}`;
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 2200);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  const label =
    state === "loading" ? "Creating…" :
    state === "copied"  ? "Link copied" :
    state === "error"   ? "Try again" :
    "Copy share link";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "loading"}
      title={state === "error" ? errorMsg : "Copy a shareable link to this report"}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs text-[var(--text-2)] hover:text-[var(--text)] transition-colors disabled:opacity-50 focus-brand"
    >
      {state === "copied" ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      )}
      {label}
    </button>
  );
}
