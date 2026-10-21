import { botConfiguration, providerDefinition } from "./bot-provider.mjs";

// Stored settings are consulted on the server for both start availability and
// actual generation. Never let an outage fall back to a different paid service.
export function storedConfiguration(getEnvironment, settings) {
  if (!settings || typeof settings !== "object") throw new Error("Settings unavailable");
  if (settings.managed === false) return botConfiguration(getEnvironment);
  if (settings.managed !== true || !settings.provider) return null;
  const definition = providerDefinition(settings.provider);
  const key = settings.hasStoredKey ? settings.apiKey : getEnvironment(definition.keyVariable);
  return botConfiguration(name => {
    if (name === "BOT_PROVIDER") return settings.provider;
    if (name === definition.keyVariable) return key;
    if (name === definition.modelVariable) return settings.model;
    return undefined;
  });
}

export async function runtimeConfiguration(getEnvironment, rpc) {
  const settings = await rpc("provider_runtime", {});
  return storedConfiguration(getEnvironment, settings);
}

// Strict allowlist. Passwords, hashes, session tokens, Vault IDs and API keys
// must never be forwarded from privileged RPC results, even after admin login.
export function publicAdminStatus(data, getEnvironment) {
  return {
    initialized: Boolean(data.initialized),
    activeProvider: data.activeProvider,
    effectiveProvider: data.activeProvider === "environment" ? botConfiguration(getEnvironment)?.provider || null : data.activeProvider === "disabled" ? null : data.activeProvider,
    updatedAt: data.updatedAt,
    providers: (data.providers || []).map(item => {
      const definition = providerDefinition(item.provider);
      return { provider:item.provider, saved:Boolean(item.saved), model:item.model,
        environmentConfigured:Boolean(getEnvironment(definition.keyVariable)),
        lastTestAt:item.lastTestAt || null, lastTestOk:item.lastTestOk ?? null };
    }),
    usage: { reservedCalls:Number(data.usage?.reservedCalls || 0), callLimit:200,
      resetsAt:data.usage?.resetsAt || null, activeRooms:Number(data.usage?.activeRooms || 0) },
  };
}
