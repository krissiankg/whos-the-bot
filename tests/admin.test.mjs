import test from "node:test";
import assert from "node:assert/strict";
import { adminOrigin } from "../src/lib/server/admin-security.mjs";
import { storedConfiguration, publicAdminStatus, runtimeConfiguration } from "../supabase/functions/_shared/provider-runtime.mjs";
import { functionFiles } from "../scripts/function-files.mjs";

function request(host="localhost:3000",origin="http://localhost:3000",protocol="http") {
  return new Request("http://0.0.0.0:3000/api/admin",{headers:{host,...(origin?{origin}:{}),"x-forwarded-proto":protocol}});
}
test("admin mutations require exact origin; insecure remote and DNS-rebinding hosts are rejected",()=>{
  assert.equal(adminOrigin(request()).origin,"http://localhost:3000");
  assert.equal(adminOrigin(request("game.example","https://game.example","https")).origin,"https://game.example");
  assert.equal(adminOrigin(request("localhost:3000","https://evil.example")),null);
  assert.equal(adminOrigin(request("localhost:3000",null)),null);
  assert(adminOrigin(request("localhost:3000",null),false));
  assert.equal(adminOrigin(request("192.168.0.10:3000","http://192.168.0.10:3000")),null);
  assert.equal(adminOrigin(request("evil.example:3000","http://evil.example:3000")),null);
});
test("stored selection preserves both providers and does not fall back to another key",()=>{
  const env={NVIDIA_API_KEY:"test-nvidia-environment",OPENAI_API_KEY:"test-openai-environment"};
  const get=name=>env[name];
  const settings={managed:true,provider:"openai",apiKey:"test-openai-stored",hasStoredKey:true,model:"gpt-4.1-mini-2025-04-14"};
  assert.equal(storedConfiguration(get,settings).apiKey,"test-openai-stored");
  assert.equal(storedConfiguration(get,{...settings,provider:"nvidia",apiKey:"test-nvidia-stored",model:"nvidia/nemotron-3.5-lightning-30b-a3b"}).apiKey,"test-nvidia-stored");
  assert.equal(storedConfiguration(get,{...settings,apiKey:null}),null,"missing Vault key must not silently restore an old environment key");
  assert.equal(storedConfiguration(get,{...settings,hasStoredKey:false,apiKey:null}).apiKey,"test-openai-environment");
  assert.equal(storedConfiguration(get,{managed:true,provider:null}),null);
  assert.throws(()=>storedConfiguration(get,null));
});
test("runtime storage outage does not fall back to a potentially paid provider",async()=>{
  await assert.rejects(()=>runtimeConfiguration(()=>"test-only-key",async()=>{throw new Error("offline");}));
});
test("admin status allowlist excludes credentials and Vault IDs, including unexpected nested fields",()=>{
  const data={initialized:true,activeProvider:"openai",password_hash:"PASSWORD_HASH",apiKey:"PLAINTEXT_KEY",setup_hash:"SETUP_HASH",
    providers:[{provider:"openai",saved:true,model:"gpt-4.1-mini",apiKey:"PLAINTEXT_KEY",secret_id:"VAULT_ID",lastTestAt:null}],
    usage:{reservedCalls:2,activeRooms:1,secret:"NEVER_RETURN"}};
  const safe=publicAdminStatus(data,()=>undefined);
  const raw=JSON.stringify(safe);
  for(const secret of ["PASSWORD_HASH","PLAINTEXT_KEY","SETUP_HASH","VAULT_ID","NEVER_RETURN"])assert(!raw.includes(secret));
  assert.equal(safe.providers[0].saved,true);assert.equal(safe.usage.reservedCalls,2);
});
test("admin deployment includes shared provider logic but never embeds environment credentials",async()=>{
  const files=await functionFiles("game-admin");
  assert.equal(files.length,4);
  assert(files.some(file=>file.name==="game-admin/index.ts"));
  assert(files.some(file=>file.name==="game-bot/policy.mjs"));
  assert(!files.some(file=>file.name.includes(".env")));
});
