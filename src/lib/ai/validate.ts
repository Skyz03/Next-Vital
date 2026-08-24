import { z } from "zod";
import { UrlSchema } from "@/lib/validate";
import { PROXY_PROVIDER_IDS } from "./providers";

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1, "Message cannot be empty").max(4000, "Message is too long"),
});

/**
 * Extends the audit request schema so the url/strategy transform stays
 * byte-identical to the one /api/analyze used — the cache key is derived from
 * it, and any divergence would turn every lookup into a miss.
 */
export const ExplainSchema = UrlSchema.extend({
  mode: z.enum(["plan", "chat"]).default("plan"),
  // Only proxied providers are accepted. A "local" request has no business
  // reaching this server: the endpoint is on the caller's own machine.
  provider: z.enum(PROXY_PROVIDER_IDS as [string, ...string[]]),
  model: z.string().min(1, "Model is required").max(120),
  // Capped so the proxy cannot be used to relay an unbounded conversation.
  messages: z.array(ChatMessageSchema).max(20, "Conversation is too long").optional(),
}).refine(
  (data) =>
    data.mode !== "chat" ||
    (data.messages != null &&
      data.messages.length > 0 &&
      data.messages[data.messages.length - 1].role === "user"),
  { message: "Chat requires a conversation ending in a user message." }
);
