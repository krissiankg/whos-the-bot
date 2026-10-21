import { providerDefinition } from "../_shared/bot-provider.mjs";

const failureCodes = new Set(["provider_auth", "provider_rate_limit", "provider_unavailable", "provider_request", "provider_timeout", "output_invalid", "output_incomplete", "configuration", "worker_error"]);
export class BotFailure extends Error {
  constructor(code) { super(failureCodes.has(code) ? code : "worker_error"); this.code = this.message; }
}
export function failureCode(error) {
  if (error instanceof BotFailure) return error.code;
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "provider_timeout";
  return "worker_error";
}
export function providerFailure(status) {
  return new BotFailure(status === 401 || status === 403 ? "provider_auth" : status === 429 ? "provider_rate_limit" : status >= 500 ? "provider_unavailable" : "provider_request");
}
function shortMessage(text) {
  if (!text || /<\/?think\b/i.test(text)) throw new BotFailure("output_invalid");
  if (text.length <= 180) return text;
  // Completed prose may exceed the prompt's character budget despite the token
  // cap. Keep one complete sentence or shorten at a word boundary, never tokens
  // such as an unbroken identifier. The authoritative SQL safety filter still runs.
  const head = text.slice(0, 178);
  const sentence = head.match(/^.*[.!?](?=\s|$)/s)?.[0];
  const boundary = head.lastIndexOf(" ");
  if (sentence && sentence.length >= 15) return sentence.trim();
  if (boundary >= 25) return head.slice(0, boundary).trimEnd() + "…";
  throw new BotFailure("output_invalid");
}

export function botRequest(systemPrompt, context, model, provider = "openai") {
  if (!providerDefinition(provider).models.includes(model)) throw new Error("Unbudgeted model");
  if (typeof systemPrompt !== "string" || systemPrompt.length < 100 || systemPrompt.length > 4000) throw new Error("Invalid prompt");
  // Language comes only from the capability-authorized database claim, never a
  // chat message or public request. Missing language keeps legacy jobs in EN.
  if (context.language !== undefined && !["fr", "en"].includes(context.language)) throw new Error("Invalid room language");
  systemPrompt += context.language === "fr"
    ? "\nTrusted room language: French. Réponds uniquement en français naturel."
    : "\nTrusted room language: English. Reply only in English.";
  const input = JSON.stringify(context);
  if (new TextEncoder().encode(systemPrompt + input).length > 10000) throw new Error("Context limit");
  if (provider === "nvidia") return {
    model,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: input }],
    max_tokens: 80, temperature: 1, top_p: 0.95, stream: false,
    // Disable hidden reasoning: all 80 tokens are for the short visible reply.
    chat_template_kwargs: { enable_thinking: false },
  };
  return { model, instructions: systemPrompt, input, max_output_tokens: 80, store: false };
}

export function botMessage(data, provider = "openai") {
  providerDefinition(provider);
  if (provider === "nvidia") {
    const choice = data?.choices?.[0];
    const message = choice?.message;
    const text = typeof message?.content === "string" ? message.content.trim() : "";
    if (choice?.finish_reason !== "stop") throw new BotFailure("output_incomplete");
    if (message?.refusal || message?.tool_calls?.length) throw new BotFailure("output_invalid");
    // Never publish reasoning/reasoning_content, only final assistant content.
    return shortMessage(text);
  }
  const parts = [];
  for (const item of data.output || []) for (const part of item.content || []) {
    if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
  }
  const text = parts.join("").trim();
  if (data.status !== "completed") throw new BotFailure("output_incomplete");
  return shortMessage(text);
}
