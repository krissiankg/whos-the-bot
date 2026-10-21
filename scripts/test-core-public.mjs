import {guestSetCookie} from "./test-guest-cookie.mjs";
// Public gateway checks. Never starts a paid model call or supplies an AI key.
import assert from "node:assert/strict";
const base=process.env.TEST_BASE_URL || "http://localhost:3000";
function actor(){
  let cookie="";
  return async (action,args={})=>{
    const response=await fetch(`${base}/api/lobby`,{method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(30000)});
    const set=guestSetCookie(response.headers);if(set)cookie=set.split(";")[0];
    return {status:response.status,body:await response.json()};
  };
}
const a=actor(),b=actor();
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
await a("session");await b("session");
const room=ok(await a("create",{requestId:crypto.randomUUID()}));
const code=room.room.code;
try {
  ok(await b("join",{code}));
  ok(await a("ready",{code,ready:true}));ok(await b("ready",{code,ready:true}));
  assert.equal((await a("message",{code,text:"hello",requestId:crypto.randomUUID()})).body.error,"CHAT_CLOSED");
  assert.equal((await a("vote",{code,targetId:crypto.randomUUID()})).body.error,"VOTE_CLOSED");
  assert.equal((await b("start",{code,practice:true,_aiReady:true})).body.error,"HOST_ONLY");
  if(!room.aiAvailable){
    assert.equal((await a("start",{code,practice:true,_aiReady:true})).body.error,"AI_NOT_CONFIGURED");
    console.log("PASS: browser cannot forge AI availability; real play correctly gated until a key is configured");
  } else console.log("SKIP: key present; not starting a billable round automatically");
  const project=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const forged=await fetch(`${project}/functions/v1/game-bot`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId:crypto.randomUUID(),capability:crypto.randomUUID()}),signal:AbortSignal.timeout(30000)});
  assert.equal(forged.status,204,"Invalid worker capability must not invoke a model or reveal data");
  assert.equal(await forged.text(),"");
  const rpc=await fetch(`${project}/rest/v1/rpc/bot_job_command`,{method:"POST",headers:{apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({p_job:crypto.randomUUID(),p_capability:crypto.randomUUID(),p_action:"claim"})});
  assert(!rpc.ok,"Public key must not invoke bot control RPC");
  console.log("PASS: phase enforcement, host-only start, private worker gateway, no public AI proxy");
} finally {await b("leave",{code});await a("leave",{code});}
