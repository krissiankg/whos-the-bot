import {guestSetCookie} from "./test-guest-cookie.mjs";
// End-to-end checks against the running Next.js app and its real Supabase backend.
// Uses disposable rooms and random guest credentials; no admin key is needed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(project && key, "Set the two public Supabase environment variables.");
const timeout = () => AbortSignal.timeout(30000);

// next dev compiles routes on demand; warm the route before measuring request
// timeouts. This is not a guest action and doesn't create any database records.
console.log("Waiting for the local API route to finish its first compilation…");
const warmup = await fetch(`${base}/api/lobby?code=TEST`, { signal: AbortSignal.timeout(180000) });
assert.equal(warmup.status, 401, "Expected a configured API with no guest cookie");

function guest() {
  let cookie = "";
  return {
    async request(action, args = {}, origin = base) {
      const response = await fetch(`${base}/api/lobby`, { method: "POST", signal: timeout(), headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ action, args }) });
      const setCookie = guestSetCookie(response.headers);
      if (setCookie) { cookie = setCookie.split(";")[0]; assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=lax/i); }
      return { status: response.status, body: await response.json() };
    },
    async state(code) {
      const response = await fetch(`${base}/api/lobby?code=${code}`, { signal: timeout(), headers: cookie ? { Cookie: cookie } : {} });
      assert.match(response.headers.get("cache-control"), /no-store/);
      return { status: response.status, body: await response.json() };
    },
    async start() { const result = await this.request("session"); assert.equal(result.status, 200, JSON.stringify(result.body)); return this; },
  };
}
function success(result) { assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; }
function safeDTO(state) {
  const serialized = JSON.stringify(state);
  assert(!/session_hash|creator_hash|service_role|sb_secret_|api_key|is_bot|x-guest-token/i.test(serialized), "Snapshot leaked private data");
  assert(state.players.every((player) => !Object.keys(player).some((field) => /session|token|hash|email|ip/i.test(field))));
}

const a = await guest().start();
const b = await guest().start();
const outsider = await guest().start();
const requestId = randomUUID();
const room = success(await a.request("create", { requestId }));
const code = room.room.code;
assert.match(code, /^[A-Z]{4}$/);
assert.equal(room.players.length, 1);
assert.equal(room.players[0].animal, "hidden");
assert.equal(room.players[0].color, "#b6b9ad");
assert.match(room.players[0].name, /^(Player|Joueur) 1$/);
assert.equal(room.room.hostId, room.meId);
assert.equal(Date.parse(room.room.expiresAt) - Date.parse(room.room.createdAt), 86400000);
safeDTO(room);
assert.equal(success(await a.request("create", { requestId })).room.id, room.room.id);
console.log("PASS: room creation, HttpOnly guest, fixed 24-hour lifetime, idempotent retry");

const joined = success(await b.request("join", { code }));
assert.equal(joined.players.length, 2);
assert.notEqual(joined.meId, room.meId);
assert.equal(success(await b.request("join", { code })).players.length, 2);
assert.equal(success(await a.state(code)).players.length, 2);
assert.equal(success(await b.state(code)).meId, joined.meId);
assert.equal((await outsider.state(code)).body.error, "NOT_A_MEMBER");
assert.equal((await guest().state(code)).status, 401);
assert.equal((await b.request("ready", { code, ready: true }, "https://unrelated.example")).status, 403);
assert.equal((await b.request("kick", { code, playerId: room.meId })).body.error, "HOST_ONLY");
console.log("PASS: shared roster, reconnect identity, membership isolation, CSRF and host authorization");

const realtime = createClient(project, key, { auth: { persistSession: false, autoRefreshToken: false } });
let resolveEvent;
const broadcast = new Promise((resolve) => { resolveEvent = resolve; });
const channel = realtime.channel(`lobby:${room.room.id}`).on("broadcast", { event: "changed" }, ({ payload }) => { assert.deepEqual(payload, {}); resolveEvent(); });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Realtime subscription timed out")), 20000);
  channel.subscribe((status) => { if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); } else if (status === "CHANNEL_ERROR") { clearTimeout(timer); reject(new Error("Realtime subscription failed")); } });
});
try {
  success(await b.request("ready", { code, ready: true }));
  let timer;
  try { await Promise.race([broadcast, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("No realtime invalidation received")), 12000); })]); }
  finally { clearTimeout(timer); }
  assert.equal(success(await a.state(code)).players.find((player) => player.id === joined.meId).ready, true);
} finally {
  await realtime.removeChannel(channel);
  await realtime.realtime.disconnect();
}
console.log("PASS: Supabase Realtime notification (empty payload), authorized ready-state refresh");

const others = await Promise.all(Array.from({ length: 5 }, async () => guest().start()));
const joins = await Promise.all(others.map((player) => player.request("join", { code })));
assert.equal(joins.filter((result) => result.status === 200).length, 4);
assert.equal(joins.filter((result) => result.body.error === "ROOM_FULL").length, 1);
const full = success(await a.state(code));
assert.equal(full.players.length, 6);
assert.equal(new Set(full.players.map((player) => player.name)).size, 6);
safeDTO(full);
console.log("PASS: concurrent joins enforce capacity and unique anonymous names");

success(await a.request("kick", { code, playerId: joined.meId }));
assert.equal((await b.state(code)).body.error, "KICKED");
assert.equal((await b.request("join", { code })).body.error, "KICKED");
assert.equal((await a.request("kick", { code, playerId: room.meId })).body.error, "INVALID_TARGET");
console.log("PASS: kicked guest cannot read, reconnect, or rejoin that seat");

success(await a.request("leave", { code }));
const winnerIndex = joins.findIndex((result) => result.status === 200);
const successorState = success(await others[winnerIndex].state(code));
assert(successorState.room.hostId && successorState.room.hostId !== room.meId);
assert.equal((await a.state(code)).body.error, "NOT_A_MEMBER");
console.log("PASS: leaving host transfers hosting; former seat loses read access");

const rpc = await fetch(`${project}/rest/v1/rpc/lobby_command`, { method: "POST", signal: timeout(), headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ p_action: "state", p_args: { code }, p_session_hash: "0".repeat(64), p_ip_hash: "0".repeat(64) }) });
assert(!rpc.ok, "Anonymous key could invoke the privileged RPC");
console.log("PASS: public API key cannot call the private command gateway");

for (let index = 0; index < others.length; index += 1) {
  if (joins[index].status === 200) success(await others[index].request("leave", { code }));
}
console.log(`ALL LOBBY CHECKS PASSED. Disposable test room ${room.room.id} has no active seats and will expire automatically.`);
