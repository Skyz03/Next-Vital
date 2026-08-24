"use client";

import { useState } from "react";
import { PROVIDERS, PROVIDER_IDS } from "@/lib/ai/providers";
import { maskKey, type StoredCreds } from "@/lib/byok";
import type { AiProviderId } from "@/types/ai";

interface Props {
  creds: StoredCreds | null;
  onSave: (creds: StoredCreds) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function AiSettings({ creds, onSave, onClear, onClose }: Props) {
  const [provider, setProvider] = useState<AiProviderId>(creds?.provider ?? "anthropic");
  const [model, setModel] = useState(creds?.model ?? PROVIDERS.anthropic.defaultModel);
  const [baseUrl, setBaseUrl] = useState(creds?.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  const def = PROVIDERS[provider];

  function selectProvider(next: AiProviderId) {
    setProvider(next);
    // Carrying a model slug across providers is always wrong — "claude-opus-5"
    // is not a valid OpenRouter id, and vice versa.
    setModel(PROVIDERS[next].defaultModel);
    setError("");
  }

  function handleSave() {
    if (!model.trim()) {
      setError("Choose or type a model.");
      return;
    }

    // A local runtime authenticates nothing, so there is no key to demand.
    if (!def.requiresKey) {
      setError("");
      onSave({ provider, key: "", model: model.trim(), baseUrl: baseUrl.trim() || undefined });
      return;
    }

    const trimmed = key.trim();
    // An existing key can be kept while only the model changes.
    const effectiveKey = trimmed || (creds?.provider === provider ? creds.key : "");
    if (!effectiveKey) {
      setError("Paste an API key to continue.");
      return;
    }
    setError("");
    onSave({ provider, key: effectiveKey, model: model.trim() });
    setKey("");
  }

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 space-y-4 bg-[var(--surface-2)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">AI provider</p>
          <p className="text-xs text-[var(--text-2)] mt-0.5">
            Settings stay in this browser and are used only for your own requests.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-[var(--text-2)] hover:text-[var(--text)] shrink-0"
        >
          Close
        </button>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => selectProvider(id)}
              className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                provider === id
                  ? "border-[var(--brand)] text-[var(--brand)] bg-[var(--surface)]"
                  : "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--text-2)]"
              }`}
            >
              {PROVIDERS[id].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-2)] mt-2 leading-relaxed">{def.blurb}</p>
      </div>

      {def.requiresKey ? (
        <div className="space-y-1.5">
          <label
            htmlFor="ai-key"
            className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide block"
          >
            API key
          </label>
          <input
            id="ai-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              creds?.provider === provider && creds.key ? `Saved: ${maskKey(creds.key)}` : def.keyHint
            }
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[var(--brand)] text-[var(--text)] placeholder:text-[var(--text-2)] font-mono"
          />
          <a
            href={def.keyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--brand)] hover:underline inline-block"
          >
            Get a {def.label} key →
          </a>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label
            htmlFor="ai-base-url"
            className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide block"
          >
            Endpoint
          </label>
          <input
            id="ai-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={PROVIDERS.local.endpoint}
            spellCheck={false}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[var(--brand)] text-[var(--text)] placeholder:text-[var(--text-2)] font-mono"
          />
          <p className="text-xs text-[var(--text-2)] leading-relaxed">
            Your browser talks to this address directly — the request never touches our server, so
            the report never leaves your machine. Install{" "}
            <a
              href={def.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--brand)] hover:underline"
            >
              Ollama
            </a>
            , run <code className="font-mono">ollama pull {model || "llama3.2"}</code>, and if this
            page is not on localhost start it with{" "}
            <code className="font-mono">OLLAMA_ORIGINS=&quot;*&quot; ollama serve</code>.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="ai-model"
          className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide block"
        >
          Model
        </label>
        {/* Free text with suggestions rather than a fixed dropdown — OpenRouter
            alone carries 400+ models and rotates its free tier. */}
        <input
          id="ai-model"
          list="ai-model-options"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          spellCheck={false}
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[var(--brand)] text-[var(--text)] font-mono"
        />
        <datalist id="ai-model-options">
          {def.suggestedModels.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>

      {error && <p className="text-sm text-[var(--poor)]">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--brand)" }}
        >
          Save
        </button>
        {creds && (
          <button
            onClick={onClear}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-2)] hover:border-[var(--poor)] hover:text-[var(--poor)] transition-colors"
          >
            {creds.key ? "Remove key" : "Disconnect"}
          </button>
        )}
      </div>
    </div>
  );
}
