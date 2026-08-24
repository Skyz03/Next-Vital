import type { AiProviderId, AiTransport } from "@/types/ai";

export interface ProviderDef {
  id: AiProviderId;
  label: string;
  transport: AiTransport;
  /** False only for models running on the user's own machine. */
  requiresKey: boolean;
  /**
   * Fixed endpoint. For proxied providers there is deliberately no
   * user-supplied base URL: the SSRF blocklist in @/lib/validate guards the PSI
   * path only, and letting a caller choose where this *server* sends a request
   * would be a fresh hole. Browser-transport providers are different — the
   * request never originates here, so the URL is an editable default.
   */
  endpoint: string;
  defaultModel: string;
  /**
   * Suggestions only — the model field is free text. Provider catalogues move
   * (OpenRouter carries 400+ models and rotates its ":free" tier), so a fixed
   * dropdown would be wrong within weeks.
   */
  suggestedModels: string[];
  keyHint: string;
  keyUrl: string;
  /** One line shown under the provider picker. */
  blurb: string;
}

export const PROVIDERS: Record<AiProviderId, ProviderDef> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    transport: "proxy",
    requiresKey: true,
    endpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-opus-5",
    suggestedModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    keyHint: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    blurb: "Pay-as-you-go. Requires billing on your Anthropic account.",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    transport: "proxy",
    requiresKey: true,
    // Model-specific path is appended by the adapter.
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.7-flash",
    // Verified against ai.google.dev/gemini-api/docs/models.
    suggestedModels: [
      "gemini-3.7-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-pro",
    ],
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    blurb: "Free tier available — a key costs nothing and needs no card.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    transport: "proxy",
    requiresKey: true,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "anthropic/claude-sonnet-5",
    // Verified against https://openrouter.ai/api/v1/models. The ":free" entries
    // let someone try the feature without spending anything.
    suggestedModels: [
      "anthropic/claude-sonnet-5",
      "google/gemini-3.7-flash",
      "z-ai/glm-5.2:free",
      "google/gemma-4-31b-it:free",
    ],
    keyHint: "sk-or-v1-…",
    keyUrl: "https://openrouter.ai/keys",
    blurb: "One key reaches 400+ models. Slugs ending in :free cost nothing.",
  },
  local: {
    id: "local",
    label: "Local (Ollama)",
    transport: "browser",
    requiresKey: false,
    endpoint: "http://localhost:11434/v1/chat/completions",
    defaultModel: "llama3.2",
    suggestedModels: ["llama3.2", "qwen2.5-coder", "mistral", "phi4"],
    keyHint: "",
    keyUrl: "https://ollama.com/download",
    blurb: "No key, no account, no cost. Runs entirely on your machine.",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as AiProviderId[];

/**
 * The only providers /api/explain will relay to. "local" is excluded by
 * construction: the endpoint lives on the user's machine, which this server
 * cannot reach and should not be asked to try.
 */
export const PROXY_PROVIDER_IDS = PROVIDER_IDS.filter(
  (id) => PROVIDERS[id].transport === "proxy"
);

export function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && value in PROVIDERS;
}
