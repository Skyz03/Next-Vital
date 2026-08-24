import type { AiProviderId } from "@/types/ai";

export interface ProviderDef {
  id: AiProviderId;
  label: string;
  /**
   * Fixed endpoint. There is deliberately no user-supplied base URL: the SSRF
   * blocklist in @/lib/validate guards the PSI path only, and letting a caller
   * choose where this server sends a request would be a fresh hole.
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
}

export const PROVIDERS: Record<AiProviderId, ProviderDef> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-opus-5",
    suggestedModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    keyHint: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "anthropic/claude-sonnet-5",
    // Verified against https://openrouter.ai/api/v1/models. The ":free" entries
    // let someone try the feature without spending anything.
    suggestedModels: [
      "anthropic/claude-sonnet-5",
      "anthropic/claude-opus-5",
      "z-ai/glm-5.2:free",
      "google/gemma-4-31b-it:free",
    ],
    keyHint: "sk-or-v1-…",
    keyUrl: "https://openrouter.ai/keys",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as AiProviderId[];

export function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && value in PROVIDERS;
}
