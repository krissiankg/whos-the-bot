// Guest authorization is performed here and in the private command RPC.
// verify_jwt is false because these guests deliberately have no Auth accounts.
import { runtimeConfiguration } from "../_shared/provider-runtime.mjs";
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

const url = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const serviceKey: string = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceHeaders: Record<string, string> = { apikey: serviceKey, "Content-Type": "application/json" };
if (!serviceKey.startsWith("sb_secret_")) serviceHeaders.Authorization = `Bearer ${serviceKey}`;
const encoder = new TextEncoder();
const actions = new Set(["create", "join", "state", "ready", "kick", "leave", "start", "message", "vote", "report", "language", "next"]);

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    if (Number(request.headers.get("content-length")) > 4096) return response({ error: "INVALID_REQUEST" }, 413);
    const text = await request.text();
    if (text.length > 4096) return response({ error: "INVALID_REQUEST" }, 413);
    const input = JSON.parse(text);
    if (!input || typeof input !== "object" || Array.isArray(input)) return response({ error: "INVALID_REQUEST" }, 400);
    const token = request.headers.get("x-guest-token") || "";
    if (!/^[a-f0-9]{64}$/.test(token)) return response({ error: "INVALID_SESSION" }, 401);
    if (!actions.has(input.action) || !input.args || typeof input.args !== "object" || Array.isArray(input.args)) return response({ error: "INVALID_REQUEST" }, 400);
    const day = new Date().toISOString().slice(0, 10);
    // Use the last proxy-added address, never a client-supplied custom IP header.
    // This is a best-effort network quota, backed by independent guest quotas.
    const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const hmacKey = await crypto.subtle.importKey("raw", encoder.encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(`${day}:${ip}`)));
    const ipHash = Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const aiAvailable = Boolean(await runtimeConfiguration((name:string)=>Deno.env.get(name),async (name:string,args:unknown)=>{
      const result=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:serviceHeaders,body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
      if(!result.ok)throw new Error("Settings unavailable");
      return result.json();
    }));
    const rpc = await fetch(`${url}/rest/v1/rpc/lobby_command`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ p_action: input.action, p_args: { ...input.args, _aiReady: aiAvailable }, p_session_hash: await digest(token), p_ip_hash: ipHash }),
      signal: AbortSignal.timeout(8000),
    });
    if (!rpc.ok) return response({ error: "SERVER_UNAVAILABLE" }, 503);
    const data = await rpc.json();
    if (data?.error) return response({ error: data.error }, data.status || 400);
    if (!data) return response({ error: "ROOM_NOT_FOUND" }, 404);
    // Only ephemeral invalidation, never names, credentials, votes or chat.
    // REST broadcasts aren't persisted in realtime.messages (unlike DB sends).
    const roomId = data.room?.id || data.roomId;
    if (input.action !== "state" && roomId) {
      try {
        await fetch(`${url}/realtime/v1/api/broadcast`, {
          method: "POST", headers: serviceHeaders,
          body: JSON.stringify({ messages: [{ topic: `lobby:${roomId}`, event: "changed", payload: {} }] }),
          signal: AbortSignal.timeout(2000),
        });
      } catch { /* Periodic authenticated refresh recovers a lost broadcast. */ }
    }
    return response({ ...data, aiAvailable });
  } catch (error) {
    return response({ error: error instanceof SyntaxError ? "INVALID_REQUEST" : "SERVER_UNAVAILABLE" }, error instanceof SyntaxError ? 400 : 503);
  }
});

export {};

