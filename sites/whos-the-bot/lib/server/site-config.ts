import "server-only";
import { env } from "cloudflare:workers";
// Read the deployed Worker binding rather than relying on a Node process shim.
export function adminBridgeToken(): string | undefined {
  const value = (env as unknown as Record<string, unknown>).WTB_ADMIN_BRIDGE_TOKEN;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
