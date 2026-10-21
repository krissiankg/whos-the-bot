// Server-only provider configuration. Never import this module into src/.
// Endpoints and model lists are fixed: neither player text nor HTTP parameters
// may redirect a secret key or silently select a billable fallback.
const providers = Object.freeze({
  nvidia: {
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    keyVariable: "NVIDIA_API_KEY",
    modelVariable: "NVIDIA_BOT_MODEL",
    defaultModel: "nvidia/nemotron-3.5-lightning-30b-a3b",
    models: ["nvidia/nemotron-3.5-lightning-30b-a3b"],
  },
  openai: {
    endpoint: "https://api.openai.com/v1/responses",
    keyVariable: "OPENAI_API_KEY",
    modelVariable: "OPENAI_BOT_MODEL",
    defaultModel: "gpt-4.1-mini-2025-04-14",
    models: ["gpt-4.1-mini-2025-04-14", "gpt-4.1-mini"],
  },
});

export function providerDefinition(provider) {
  if (!Object.hasOwn(providers, provider)) throw new Error("Unsupported provider");
  return providers[provider];
}

export function botConfiguration(getEnvironment) {
  const read = name => {
    const value = getEnvironment(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const explicit = read("BOT_PROVIDER").toLowerCase();
  // NVIDIA is preferred when both keys exist, unless explicitly overridden.
  const provider = explicit || (read("NVIDIA_API_KEY") ? "nvidia" : "openai");
  if (!Object.hasOwn(providers, provider)) return null;
  const definition = providers[provider];
  const apiKey = read(definition.keyVariable);
  const model = read(definition.modelVariable) || definition.defaultModel;
  if (!apiKey || !definition.models.includes(model)) return null;
  return { provider, model, apiKey, endpoint: definition.endpoint };
}
