import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
const manifest=JSON.parse(await readFile(".openai/hosting.json","utf8"));
assert.equal(manifest.project_id,"appgprj_6ad4f35a7e508191a66a15f1979fce39");
assert.equal(manifest.static,undefined,"This game requires its server Worker");
const sensitiveNames=["WTB_ADMIN_BRIDGE_TOKEN","SUPABASE_SERVICE_ROLE_KEY","x-admin-bridge"];
const bridge=process.env.WTB_ADMIN_BRIDGE_TOKEN;
let files=0;
async function scan(dir, client = true){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){await scan(file,client);continue;}
    if(!/\.(js|mjs|css|html|json|map)$/.test(entry.name))continue;
    const text=await readFile(file,"utf8");
    if(client)for(const name of sensitiveNames)assert(!text.includes(name),"Server-only identifier found in client artifact");
    assert(!bridge||!text.includes(bridge),"Server secret found in client artifact");
    assert(!/(?:sk-[A-Za-z0-9_-]{24,}|nvapi-[A-Za-z0-9_-]{24,})/.test(text),"Potential model key found in client artifact");
    files++;
  }
}
await scan("dist/client");
await scan("dist/server",false);
assert(files>0,"Client artifact missing");
console.log(`PASS: ${files} build artifacts checked; no server bridge or model key exposed.`);
