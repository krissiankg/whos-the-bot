// The deploy helper bundles the editable Markdown prompt as a text module.
import { systemPrompt } from "./system-prompt.ts";
import { botRequest, botMessage, BotFailure, failureCode, providerFailure } from "./policy.mjs";
import { runtimeConfiguration } from "../_shared/provider-runtime.mjs";
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

const url = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const key: string = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers: Record<string,string> = { apikey:key,"Content-Type":"application/json" };
if (!key.startsWith("sb_secret_")) headers.Authorization=`Bearer ${key}`;

async function rpc(job: string, capability: string, action: string, body: string | null = null) {
  const result=await fetch(`${url}/rest/v1/rpc/bot_job_command`,{
    method:"POST",headers,body:JSON.stringify({p_job:job,p_capability:capability,p_action:action,p_body:body}),
    signal:AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error("Worker command failed");
  return result.json();
}

Deno.serve(async (request) => {
  if (request.method!=="POST") return new Response(null,{status:405});
  let job="", capability="", claimed=false, provider="unknown";
  const started=Date.now();
  try {
    const raw=await request.text();
    if(raw.length>512) return new Response(null,{status:413});
    const input=JSON.parse(raw);
    job=input.jobId; capability=input.capability;
    const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    if(typeof job!=="string" || typeof capability!=="string" || !uuid.test(job) || !uuid.test(capability)) return new Response(null,{status:400});
    const context=await rpc(job,capability,"claim");
    if(!context) return new Response(null,{status:204});
    claimed=true;
    const config=await runtimeConfiguration((name:string)=>Deno.env.get(name),async (name:string,args:unknown)=>{
      const result=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers,body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
      if(!result.ok)throw new Error("Settings unavailable");
      return result.json();
    });
    if(!config) throw new BotFailure("configuration");
    provider=config.provider;
    const payload=botRequest(systemPrompt,context,config.model,config.provider);
    const generated=await fetch(config.endpoint,{
      method:"POST",headers:{Authorization:`Bearer ${config.apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(15000),
    });
    if(!generated.ok) { await generated.body?.cancel(); throw providerFailure(generated.status); }
    const data=await generated.json();
    const message=botMessage(data,config.provider);
    await rpc(job,capability,"finish",message);
    return new Response(null,{status:204});
  } catch (error) {
    // Only categorical metadata. No chat, model output, provider response body,
    // raw exception, key, prompt, guest credential or job capability in logs.
    if(claimed) {
      const code=failureCode(error);
      console.warn(JSON.stringify({event:"bot_attempt_failed",job,provider,code,elapsedMs:Date.now()-started}));
      try { await rpc(job,capability,"fail",code); } catch { /* bounded cron timeout recovers */ }
    }
    return new Response(null,{status:204});
  }
});
