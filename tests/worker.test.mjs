// Execute the actual worker with mocked transport and fake keys. No network,
// provider credits, real credentials or Supabase state are used by these tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as policy from "../supabase/functions/game-bot/policy.mjs";
import * as configuration from "../supabase/functions/_shared/bot-provider.mjs";
import * as storedConfiguration from "../supabase/functions/_shared/provider-runtime.mjs";

const source=await readFile(new URL("../supabase/functions/game-bot/index.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function worker(env,{claim=true,modelStatus=200,modelBody,modelError}={}) {
  let handler;
  const calls=[];
  const logs=[];
  const fakeFetch=async (url,options)=>{
    const body=JSON.parse(options.body);
    calls.push({url,headers:options.headers,body});
    if(url.endsWith("/rpc/provider_runtime"))return Response.json({managed:false});
    if(url.endsWith("/rpc/bot_job_command")) return Response.json(body.p_action==="claim"?(claim?{topic:"weekend",nickname:"Orange Fox",messages:[]}:null):{ok:true});
    if(modelError) throw modelError;
    if(modelStatus!==200) return Response.json({error:"upstream quota reached"},{status:modelStatus});
    if(modelBody) return Response.json(modelBody);
    if(url==="https://integrate.api.nvidia.com/v1/chat/completions") return Response.json({choices:[{finish_reason:"stop",message:{content:"pancakes win lol",reasoning_content:"never publish this"}}]});
    if(url==="https://api.openai.com/v1/responses") return Response.json({status:"completed",output:[{content:[{type:"output_text",text:"pancakes win lol"}]}]});
    throw new Error("Unexpected endpoint");
  };
  vm.runInNewContext(compiled,{
    exports:{},Request,Response,AbortSignal,TextEncoder,fetch:fakeFetch,console:{warn:text=>logs.push(JSON.parse(text))},
    Deno:{env:{get:name=>({SUPABASE_URL:"https://unit-project.invalid",SUPABASE_SERVICE_ROLE_KEY:"sb_secret_test-only",...env})[name]},serve:fn=>{handler=fn;}},
    require:name=>{
      if(name==="./system-prompt.ts") return {systemPrompt:"safe system instructions ".repeat(12)};
      if(name==="./policy.mjs") return policy;
      if(name==="../_shared/bot-provider.mjs") return configuration;
      if(name==="../_shared/provider-runtime.mjs") return storedConfiguration;
      throw new Error("Unexpected import");
    },
  });
  return {calls,logs,run:()=>handler(new Request("https://unit-project.invalid/functions/v1/game-bot",{method:"POST",body:JSON.stringify({jobId:"11111111-1111-4111-8111-111111111111",capability:"22222222-2222-4222-8222-222222222222"})}))};
}

test("actual worker routes NVIDIA-only key to NVIDIA and finishes one private job",async()=>{
  const w=worker({BOT_PROVIDER:"nvidia",NVIDIA_API_KEY:"test-only-nvidia-key"});
  const result=await w.run();
  assert.equal(result.status,204);assert.equal(await result.text(),"");
  assert.equal(w.calls.length,4);
  assert.equal(w.calls[0].body.p_action,"claim");
  assert.equal(w.calls[2].url,"https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(w.calls[2].headers.Authorization,"Bearer test-only-nvidia-key");
  assert.equal(w.calls[2].body.max_tokens,80);
  assert.equal(w.calls[2].body.chat_template_kwargs.enable_thinking,false);
  assert.equal(w.calls[3].body.p_action,"finish");
  assert.equal(w.calls[3].body.p_body,"pancakes win lol");
  assert(!JSON.stringify(w.calls[2].body).includes("test-only-nvidia-key"));
});
test("NVIDIA rate limit records a categorical failure without immediate retries or OpenAI fallback",async()=>{
  const w=worker({BOT_PROVIDER:"nvidia",NVIDIA_API_KEY:"test-only-nvidia-key",OPENAI_API_KEY:"test-only-openai-key"},{modelStatus:429});
  assert.equal((await w.run()).status,204);
  assert.equal(w.calls.length,4);
  assert.equal(w.calls.filter(call=>call.url.includes("api.openai.com")).length,0);
  assert.equal(w.calls[3].body.p_action,"fail");
  assert.equal(w.calls[3].body.p_body,"provider_rate_limit");
  assert.equal(w.logs[0].code,"provider_rate_limit");
  for(const forbidden of ["test-only-nvidia-key","upstream quota","22222222-2222-4222-8222-222222222222","pancakes"]) assert(!JSON.stringify(w.logs).includes(forbidden));
});
test("invalid job claim never calls a model",async()=>{
  const w=worker({NVIDIA_API_KEY:"test-only-nvidia-key"},{claim:false});
  assert.equal((await w.run()).status,204);assert.equal(w.calls.length,1);
});
test("explicit NVIDIA with a missing key never falls back to an existing OpenAI key",async()=>{
  const w=worker({BOT_PROVIDER:"nvidia",OPENAI_API_KEY:"test-only-openai-key"});
  assert.equal((await w.run()).status,204);
  assert.equal(w.calls.length,3);assert.equal(w.calls[2].body.p_body,"configuration");
});
test("OpenAI remains an explicit compatible alternative",async()=>{
  const w=worker({BOT_PROVIDER:"openai",OPENAI_API_KEY:"test-only-openai-key",NVIDIA_API_KEY:"test-only-nvidia-key"});
  assert.equal((await w.run()).status,204);
  assert.equal(w.calls[2].url,"https://api.openai.com/v1/responses");
  assert.equal(w.calls[2].headers.Authorization,"Bearer test-only-openai-key");
  assert.equal(w.calls[2].body.store,false);assert.equal(w.calls[2].body.max_output_tokens,80);
  assert.equal(w.calls[3].body.p_body,"pancakes win lol");
});
