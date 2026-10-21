import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GUEST_COOKIE, guestToken, lobbyConfigured, roomCommand } from "@/lib/server/lobby";

export const runtime = "nodejs";

function sameOrigin(request: Request): URL | null {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.slice(0, -1);
    const host = request.headers.get("host");
    if (!host || !["http", "https"].includes(protocol)) return null;
    // Next can construct request.url with its internal listen address (0.0.0.0).
    // Host is the browser's target authority; the hosting proxy supplies proto.
    const expected = new URL(`${protocol}://${host}`).origin;
    return origin.origin === expected ? origin : null;
  } catch { return null; }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" } });
}

export async function GET(request: Request) {
  if (!lobbyConfigured()) return json({ error: "NOT_CONFIGURED" }, 503);
  const token = await guestToken();
  if (!token) return json({ error: "INVALID_SESSION" }, 401);
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() || "";
  if (!/^[A-Z]{4}$/.test(code)) return json({ error: "INVALID_CODE" }, 400);
  try {
    const result = await roomCommand("state", { code }, token);
    return json(result.body, result.status);
  } catch { return json({ error: "SERVER_UNAVAILABLE" }, 503); }
}

export async function POST(request: Request) {
  const origin = sameOrigin(request);
  if (!origin) return json({ error: "ORIGIN_REJECTED" }, 403);
  if (!lobbyConfigured()) return json({ error: "NOT_CONFIGURED" }, 503);
  try {
    if (Number(request.headers.get("content-length")) > 4096) return json({ error: "INVALID_REQUEST" }, 413);
    const text = await request.text();
    if (text.length > 4096) return json({ error: "INVALID_REQUEST" }, 413);
    const input = JSON.parse(text);
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "INVALID_REQUEST" }, 400);
    const token = await guestToken();
    if (input.action === "session") {
      const result = json({ ok: true });
      if (!token) result.cookies.set(GUEST_COOKIE, randomBytes(32).toString("hex"), {
        httpOnly: true, sameSite: "lax", secure: origin.protocol === "https:",
        path: "/", maxAge: 24 * 60 * 60,
      });
      return result;
    }
    if (!token) return json({ error: "INVALID_SESSION" }, 401);
    if (!["create", "join", "ready", "kick", "leave", "start", "message", "vote", "report", "language", "next"].includes(input.action) || !input.args || typeof input.args !== "object" || Array.isArray(input.args)) return json({ error: "INVALID_REQUEST" }, 400);
    const result = await roomCommand(input.action, input.args, token);
    return json(result.body, result.status);
  } catch (error) { return json({ error: error instanceof SyntaxError ? "INVALID_REQUEST" : "SERVER_UNAVAILABLE" }, error instanceof SyntaxError ? 400 : 503); }
}
