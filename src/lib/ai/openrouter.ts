import { PROVIDERS } from "./providers";
import { openAiCompatDeltas } from "./openai-compat";
import type { ChatMessage } from "@/types/ai";

export function openrouterRequest(
  key: string,
  model: string,
  system: string,
  messages: ChatMessage[]
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    // Optional attribution headers OpenRouter uses for its app leaderboards.
    "X-Title": "Nextvital",
  };
  const referer = process.env.NEXT_PUBLIC_APP_URL;
  if (referer) headers["HTTP-Referer"] = referer;

  return {
    url: PROVIDERS.openrouter.endpoint,
    init: {
      method: "POST",
      headers,
      // Kept deliberately minimal. OpenRouter fronts 400+ models from a dozen
      // upstreams and the model field is free text; every extra parameter is
      // another way for a specific model to reject the request. Breadth is the
      // whole reason to offer OpenRouter, so nothing optional goes in here.
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 4096,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    },
  };
}

/** OpenRouter speaks the OpenAI chat-completions format. */
export { openAiCompatDeltas as openrouterDeltas };
