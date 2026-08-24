import { PROVIDERS } from "./providers";
import { openAiCompatDeltas } from "./openai-compat";
import { buildSystemPrompt, openOnUserTurn, PLAN_USER_TURN } from "./prompt";
import type { StoredCreds } from "@/lib/byok";
import type { AnalysisResult } from "@/types/analysis";
import type { AiMode, ChatMessage } from "@/types/ai";

export interface AnswerRequest {
  result: AnalysisResult;
  creds: StoredCreds;
  mode: AiMode;
  messages?: ChatMessage[];
  signal: AbortSignal;
}

function turnsFor(mode: AiMode, messages: ChatMessage[] | undefined): ChatMessage[] {
  return mode === "plan"
    ? [{ role: "user", content: PLAN_USER_TURN }]
    : openOnUserTurn(messages ?? []);
}

/**
 * Streams the model's answer, whichever transport the chosen provider uses.
 *
 * Hosted providers go through /api/explain, which holds the key for one request
 * and builds the prompt from the server's own cached copy of the audit. A local
 * runtime is the opposite case: the endpoint is on the user's machine, so this
 * server cannot reach it and there is no reason to relay through it. Nothing
 * leaves the machine at all, which is also why the prompt is assembled here —
 * there is no trust boundary to defend on that path.
 */
export async function* streamAnswer(req: AnswerRequest): AsyncGenerator<string> {
  const provider = PROVIDERS[req.creds.provider];
  if (provider.transport === "browser") {
    yield* streamLocal(req);
    return;
  }

  const res = await fetch("/api/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Header rather than body — see the comment in the route handler.
      "X-Provider-Key": req.creds.key,
    },
    body: JSON.stringify({
      url: req.result.url,
      strategy: req.result.strategy,
      mode: req.mode,
      provider: req.creds.provider,
      model: req.creds.model,
      messages: req.messages,
    }),
    signal: req.signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? "Something went wrong.");
  }
  if (!res.body) throw new Error("The server returned an empty response.");

  // The route already normalises every provider to plain text.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    yield decoder.decode(value, { stream: true });
  }
}

async function* streamLocal(req: AnswerRequest): AsyncGenerator<string> {
  const endpoint = req.creds.baseUrl?.trim() || PROVIDERS.local.endpoint;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.creds.model,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(req.result) },
          ...turnsFor(req.mode, req.messages),
        ],
      }),
      signal: req.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    // A refused connection and a blocked CORS preflight are indistinguishable
    // from here — both surface as a bare TypeError — so name both causes.
    throw new Error(
      `Could not reach a local model at ${endpoint}. Check that Ollama is running, ` +
        `that you have pulled "${req.creds.model}", and that this site is allowed via ` +
        `OLLAMA_ORIGINS.`
    );
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 404) {
      throw new Error(
        `The local runtime does not have "${req.creds.model}". Run: ollama pull ${req.creds.model}`
      );
    }
    throw new Error(`The local model returned ${res.status}. ${detail}`.trim());
  }
  if (!res.body) throw new Error("The local model returned an empty response.");

  // Ollama and LM Studio both expose an OpenAI-compatible endpoint, so this is
  // the same parser OpenRouter uses.
  yield* openAiCompatDeltas(res.body);
}
