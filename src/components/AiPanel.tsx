"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AnalysisResult } from "@/types/analysis";
import type { AiMode, ChatMessage } from "@/types/ai";
import {
  subscribeCreds,
  getCredsSnapshot,
  getServerCredsSnapshot,
  saveCreds,
  clearCreds,
  type StoredCreds,
} from "@/lib/byok";
import { PROVIDERS } from "@/lib/ai/providers";
import AiSettings from "./AiSettings";
import Markdown from "./Markdown";

interface Props {
  result: AnalysisResult;
}

export default function AiPanel({ result }: Props) {
  // localStorage is an external store, so it is subscribed to rather than
  // copied into state on mount: SSR renders the empty state via the server
  // snapshot, and a key saved in another tab shows up here too.
  const creds = useSyncExternalStore(subscribeCreds, getCredsSnapshot, getServerCredsSnapshot);
  const [showSettings, setShowSettings] = useState(false);
  const [plan, setPlan] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // A stream left running after navigation would keep spending the user's tokens.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function runStream(
    mode: AiMode,
    messages: ChatMessage[] | undefined,
    onDelta: (chunk: string) => void
  ) {
    if (!creds) return;
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch("/api/explain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header rather than body — see the comment in the route handler.
        "X-Provider-Key": creds.key,
      },
      body: JSON.stringify({
        url: result.url,
        strategy: result.strategy,
        mode,
        provider: creds.provider,
        model: creds.model,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message ?? "Something went wrong.");
    }
    if (!res.body) throw new Error("The server returned an empty response.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      onDelta(decoder.decode(value, { stream: true }));
    }
  }

  async function generatePlan() {
    setError("");
    setPlan("");
    setBusy(true);
    try {
      await runStream("plan", undefined, (chunk) => setPlan((p) => p + chunk));
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    setError("");
    setInput("");
    setBusy(true);

    // The plan is the opening assistant turn so follow-ups can refer to it.
    const history: ChatMessage[] = [
      ...(plan ? ([{ role: "assistant", content: plan }] as ChatMessage[]) : []),
      ...chat,
      { role: "user", content: question },
    ];
    setChat((c) => [...c, { role: "user", content: question }, { role: "assistant", content: "" }]);

    try {
      await runStream("chat", history, (chunk) => {
        setChat((c) => {
          const next = [...c];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
        // Drop the empty assistant bubble so the transcript is not misleading.
        setChat((c) => (c[c.length - 1]?.content === "" ? c.slice(0, -1) : c));
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSave(next: StoredCreds) {
    saveCreds(next);
    setShowSettings(false);
    setError("");
  }

  function handleClear() {
    clearCreds();
    setPlan("");
    setChat([]);
    setShowSettings(false);
  }

  const waitingForPlan = busy && plan === "";

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)]">
          AI analysis
        </h2>
        {creds && !showSettings && (
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs text-[var(--text-2)] hover:text-[var(--text)]"
          >
            {PROVIDERS[creds.provider].label} · {creds.model} · change
          </button>
        )}
      </div>

      {showSettings && (
        <AiSettings
          creds={creds}
          onSave={handleSave}
          onClear={handleClear}
          onClose={() => setShowSettings(false)}
        />
      )}

      {!creds && !showSettings && (
        <div className="border border-dashed border-[var(--border)] rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-[var(--text)]">
            Turn this report into a prioritised plan, and ask follow-up questions.
          </p>
          <p className="text-xs text-[var(--text-2)] leading-relaxed max-w-md mx-auto">
            Bring your own Anthropic or OpenRouter API key. It stays in your browser and is
            used only for your requests — OpenRouter has free models if you would rather not
            spend anything.
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--brand)" }}
          >
            Connect a model
          </button>
        </div>
      )}

      {creds && (
        <div className="space-y-4">
          {plan === "" && !busy && (
            <button
              onClick={generatePlan}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--brand)" }}
            >
              Generate action plan
            </button>
          )}

          {waitingForPlan && (
            <p className="text-sm text-[var(--text-2)] animate-pulse py-3">
              Thinking through the audit…
            </p>
          )}

          {plan !== "" && (
            <div className="border border-[var(--border)] rounded-xl p-4">
              <Markdown>{plan}</Markdown>
              {!busy && (
                <button
                  onClick={generatePlan}
                  className="text-xs text-[var(--text-2)] hover:text-[var(--text)] mt-4"
                >
                  Regenerate
                </button>
              )}
            </div>
          )}

          {chat.map((message, i) => (
            <div
              key={i}
              className={
                message.role === "user"
                  ? "bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3"
                  : "border border-[var(--border)] rounded-xl p-4"
              }
            >
              {message.role === "user" ? (
                <p className="text-sm text-[var(--text)] leading-relaxed">{message.content}</p>
              ) : message.content === "" ? (
                <p className="text-sm text-[var(--text-2)] animate-pulse">Thinking…</p>
              ) : (
                <Markdown>{message.content}</Markdown>
              )}
            </div>
          ))}

          {plan !== "" && (
            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a follow-up about this report…"
                disabled={busy}
                aria-label="Ask a follow-up question"
                className="flex-1 min-w-0 px-4 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[var(--brand)] text-[var(--text)] placeholder:text-[var(--text-2)]"
              />
              <button
                type="submit"
                disabled={busy || input.trim() === ""}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ background: "var(--brand)" }}
              >
                Ask
              </button>
            </form>
          )}

          {error && <p className="text-sm text-[var(--poor)]">{error}</p>}
        </div>
      )}
    </section>
  );
}
