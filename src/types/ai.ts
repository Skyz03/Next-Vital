export type AiProviderId = "anthropic" | "openrouter";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * "plan" ignores any client-supplied messages and uses a fixed user turn, so
 * the action plan is always generated from the same prompt. "chat" appends the
 * caller's conversation after that same system prompt.
 */
export type AiMode = "plan" | "chat";

export interface AiRequest {
  url: string;
  strategy: "mobile" | "desktop";
  mode: AiMode;
  provider: AiProviderId;
  model: string;
  messages?: ChatMessage[];
}

export type AiErrorCode =
  | "NO_KEY"
  | "INVALID_REQUEST"
  | "NO_AUDIT"
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "AI_TIMEOUT"
  | "RATE_LIMITED";

export interface AiError {
  error: true;
  code: AiErrorCode;
  message: string;
  retryAfter?: number;
}
