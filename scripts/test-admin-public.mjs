// Non-mutating security checks against the live local owner gateway.
// Does not initialize the owner, enter API keys, or call a model.
import assert from "node:assert/strict";
const base=process.env.TEST_BASE_URL || "http://localhost:3000";
const status=await fetch(`${base}/api/admin`,{signal:AbortSignal.timeout(120000)});
assert.equal(status.status,200);
assert.match(status.headers.get("cache-control"),/no-store/);
const initial=await status.json();
assert.equal(initial.authenticated,false);
assert.deepEqual(Object.keys(initial).sort(),["authenticated","initialized"]);
async function post(action,args,origin=base){
  const response=await fetch(`${base}/api/admin`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(45000)});
  return {status:response.status,body:await response.json(),headers:response.headers};
}
assert.equal((await post("save",{provider:"nvidia",apiKey:"test-only-not-saved-key"})).status,401);
assert.equal((await post("activate",{provider:"openai",confirmCosts:true})).status,401);
assert.equal((await post("test",{provider:"nvidia"})).status,401);
assert.equal((await post("save",{provider:"nvidia"},"https://unrelated.example")).status,403);
const page=await fetch(`${base}/admin`,{headers:{"Accept-Language":"fr"},signal:AbortSignal.timeout(120000)});
assert.equal(page.status,200);
assert.equal(page.headers.get("x-frame-options"),"DENY");
assert.equal(page.headers.get("referrer-policy"),"no-referrer");
const html=await page.text();
assert(html.includes("Ton jeu. Tes"));
assert(!html.includes("WTB_ADMIN_BRIDGE_TOKEN="));
if(process.env.WTB_ADMIN_BRIDGE_TOKEN)assert(!html.includes(process.env.WTB_ADMIN_BRIDGE_TOKEN),"Server bridge leaked into HTML");
const project=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(project && key){
  for(const [name,body] of [["provider_runtime",{}],["admin_command",{p_bridge_hash:"a".repeat(64),p_session_hash:"b".repeat(64),p_action:"status",p_args:{},p_ip_hash:"c".repeat(64)}]]){
    const response=await fetch(`${project}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body)});
    assert(!response.ok,`Public key could call privileged ${name}`);
  }
  const bridge=await fetch(`${project}/functions/v1/game-admin`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"status",args:{}})});
  assert.equal(bridge.status,403);
}
console.log("PASS: private admin bootstrap metadata, unauthenticated writes denied, CSRF, anti-framing, private RPCs and server bridge");
