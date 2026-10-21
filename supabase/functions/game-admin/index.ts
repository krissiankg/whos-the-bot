import { storedConfiguration, publicAdminStatus } from "../_shared/provider-runtime.mjs";
import { botRequest, botMessage } from "../game-bot/policy.mjs";
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
const getEnv=(name:string)=>Deno.env.get(name);
const url=getEnv("SUPABASE_URL")!;
const key=JSON.parse(getEnv("SUPABASE_SECRET_KEYS") || "{}").default || getEnv("SUPABASE_SERVICE_ROLE_KEY")!;
const headers:Record<string,string>={apikey:key,"Content-Type":"application/json"};
if(!key.startsWith("sb_secret_"))headers.Authorization=`Bearer ${key}`;
const encoder=new TextEncoder();
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))),b=>b.toString(16).padStart(2,"0")).join("");}
function json(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
const allowed=new Set(["bootstrap_status","setup","login","logout","status","save","activate","test"]);

Deno.serve(async request=>{
  if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  try{
    const bridge=request.headers.get("x-admin-bridge") || "";
    const session=request.headers.get("x-admin-session") || "";
    if(!/^[a-f0-9]{64}$/.test(bridge) || !/^[a-f0-9]{64}$/.test(session))return json({error:"ADMIN_FORBIDDEN"},403);
    if(Number(request.headers.get("content-length"))>8192)return json({error:"INVALID_REQUEST"},413);
    const text=await request.text();if(text.length>8192)return json({error:"INVALID_REQUEST"},413);
    const input=JSON.parse(text);
    if(!input || !allowed.has(input.action) || !input.args || typeof input.args!=="object" || Array.isArray(input.args))return json({error:"INVALID_REQUEST"},400);
    const args={...input.args};
    if(input.action==="setup"){
      if(typeof args.setupCode!=="string" || !/^[a-f0-9]{64}$/.test(args.setupCode))return json({error:"ADMIN_SETUP_REJECTED"},403);
      args.setupHash=await hash(args.setupCode);delete args.setupCode;
    }
    const address=request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const hmac=await crypto.subtle.importKey("raw",encoder.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const ipHash=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",hmac,encoder.encode(`${new Date().toISOString().slice(0,10)}:${address}`))),b=>b.toString(16).padStart(2,"0")).join("");
    const bridgeHash=await hash(bridge),sessionHash=await hash(session);
    async function rpc(action:string,payload:Record<string,unknown>={}){
      const response=await fetch(`${url}/rest/v1/rpc/admin_command`,{method:"POST",headers,body:JSON.stringify({p_bridge_hash:bridgeHash,p_session_hash:sessionHash,p_action:action,p_args:payload,p_ip_hash:ipHash}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error("Admin service unavailable");
      return response.json();
    }
    // Public transport never accepts the internal test_result command.
    if(input.action==="activate"){
      if((args.provider==="nvidia" && args.confirmTrial!==true) || (args.provider==="openai" && args.confirmCosts!==true))return json({error:"ADMIN_CONFIRM_REQUIRED"},400);
    }
    const data=await rpc(input.action,args);
    if(data?.error)return json({error:data.error},data.status || 400);
    if(input.action==="bootstrap_status")return json({initialized:Boolean(data.initialized)});
    if(input.action==="logout")return json({ok:true});
    if(input.action==="test"){
      let ok=false,reason="unavailable";
      try{
        const config=storedConfiguration(getEnv,data);
        if(!config)reason="missing";
        else{
          const payload=botRequest("You are a provider connectivity check for a disclosed AI party game. Reply with exactly the single word OK. Do not use tools, reveal reasoning, or add any other content.",{},config.model,config.provider);
          const response=await fetch(config.endpoint,{method:"POST",headers:{Authorization:`Bearer ${config.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
          if(response.ok){botMessage(await response.json(),config.provider);ok=true;reason="ok";}
          else reason=response.status===429?"quota":[401,403].includes(response.status)?"credentials":"unavailable";
        }
      }catch{/* No provider bodies, credentials or diagnostic payloads in logs. */}
      const updated=await rpc("test_result",{provider:args.provider,ok});
      if(updated?.error)return json({error:updated.error},updated.status || 400);
      return json({...publicAdminStatus(updated,getEnv),testResult:{provider:args.provider,ok,reason}});
    }
    return json(publicAdminStatus(data,getEnv));
  }catch{return json({error:"ADMIN_UNAVAILABLE"},503);}
});
