"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Splits a plan string at the `## Follow-ups` section.
 * Returns the plan body (safe to display) and up to 4 chip strings.
 * Exported so it can be unit-tested without React.
 */
export function parseFollowUps(planText: string): { body: string; chips: string[] } {
  const marker = "\n## Follow-ups";
  const idx = planText.indexOf(marker);
  if (idx === -1) return { body: planText, chips: [] };
  const body = planText.slice(0, idx).trim();
  const tail = planText.slice(idx + marker.length);
  const chips = tail
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 4);
  return { body, chips };
}
import type { AnalysisResult } from "@/types/analysis";
import type { AiMode, ChatMessage } from "@/types/ai";
import { streamAnswer } from "@/lib/ai/client";
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

// Mirrors the cap enforced by ExplainSchema on the server.
const MAX_TURNS = 20;

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
  const [copied, setCopied] = useState(false);
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
    // streamAnswer picks the transport: hosted providers go through
    // /api/explain, a local runtime is called straight from the browser.
    for await (const chunk of streamAnswer({
      result,
      creds,
      mode,
      messages,
      signal: controller.signal,
    })) {
      onDelta(chunk);
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

  async function send(question: string) {
    setError("");
    setBusy(true);

    // The plan body (without the Follow-ups section) anchors follow-up context.
    const { body: planBody } = parseFollowUps(plan);
    const full: ChatMessage[] = [
      ...(planBody ? ([{ role: "assistant", content: planBody }] as ChatMessage[]) : []),
      ...chat,
      { role: "user", content: question },
    ];
    // The route caps a conversation at MAX_TURNS. Trim here rather than letting
    // a long chat fail with a validation error the user cannot act on: keep the
    // plan as the anchor and drop the oldest follow-ups.
    const history =
      full.length <= MAX_TURNS
        ? full
        : [full[0], ...full.slice(full.length - (MAX_TURNS - 1))];
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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    await send(question);
  }

  async function copyPlan() {
    const { body: planBody } = parseFollowUps(plan);
    try {
      await navigator.clipboard.writeText(planBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available (non-HTTPS or browser restriction); fail silently.
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
  const { body: planBody, chips: suggestedFollowUps } = parseFollowUps(plan);

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
            Connect Anthropic, Google Gemini or OpenRouter with your own API key — or point it at
            a model running locally on your machine, which needs no key and no account at all.
            Gemini keys are free, and nothing you connect is stored on our side.
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
              <Markdown>{planBody}</Markdown>
              {!busy && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={generatePlan}
                    className="text-xs text-[var(--text-2)] hover:text-[var(--text)]"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={copyPlan}
                    className="text-xs text-[var(--text-2)] hover:text-[var(--text)]"
                  >
                    {copied ? "Copied" : "Copy plan"}
                  </button>
                </div>
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

          {plan !== "" && !busy && suggestedFollowUps.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestedFollowUps.map((chip, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={() => send(chip)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

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
