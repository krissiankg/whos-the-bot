import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(base && key, "Load .env.local before running this probe.");
const a = randomBytes(32).toString("hex");
const b = randomBytes(32).toString("hex");
async function call(token, action, args) {
  const response = await fetch(`${base}/functions/v1/game-lobby`, {
    method: "POST", signal: AbortSignal.timeout(30000),
    headers: { apikey: key, "x-guest-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
const room = await call(a, "create", { requestId: randomUUID() });
const code = room.room.code;
const joined = await call(b, "join", { code });
assert.equal(joined.players.length, 2);
assert.equal(room.room.hostId, room.meId);
await call(b, "ready", { code, ready: true });
const state = await call(a, "state", { code });
assert.equal(state.players.find((player) => player.id === joined.meId).ready, true);
await call(a, "leave", { code });
assert.equal((await call(b, "state", { code })).room.hostId, joined.meId);
await call(b, "leave", { code });
console.log("PASS: deployed guest Edge Function, shared state, readiness and host transfer");
