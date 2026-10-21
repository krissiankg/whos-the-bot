// Real Next route implementation with mocked Next cookies and Edge transport.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as security from "../src/lib/server/admin-security.mjs";
const source=await readFile(new URL("../src/app/api/admin/route.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function route({cookie=null,upstreamStatus=200}={}){
  const calls=[],cookieWrites=[],exports={};
  class NextResponse extends Response {
    constructor(body,init){super(body,init);this.cookies={set:(...args)=>cookieWrites.push(args)};}
    static json(body,init){return new NextResponse(JSON.stringify(body),init);}
  }
  vm.runInNewContext(compiled,{exports,process:{env:{WTB_ADMIN_BRIDGE_TOKEN:"a".repeat(64),NEXT_PUBLIC_SUPABASE_URL:"https://unit-project.invalid",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"test-only-publishable"}},Request,Response,URL,AbortSignal,
    fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return Response.json(upstreamStatus===200?{initialized:body.action!=="bootstrap_status",providers:[]}:{error:"ADMIN_BAD_PASSWORD"},{status:upstreamStatus});},
    require:name=>{
      if(name==="node:crypto")return {randomBytes};
      if(name==="next/server")return {NextResponse};
      if(name==="next/headers")return {cookies:async()=>({get:()=>cookie?{value:cookie}:undefined})};
      if(name==="@/lib/server/admin-security.mjs")return security;
      throw new Error("Unexpected import");
    },
  });
  return {...exports,calls,cookieWrites};
}
function post(action,args={},origin="http://localhost:3000",host="localhost:3000",proto="http"){
  return new Request("http://0.0.0.0:3000/api/admin",{method:"POST",headers:{host,origin,"x-forwarded-proto":proto,"Content-Type":"application/json"},body:JSON.stringify({action,args})});
}
test("admin login keeps random session and server bridge out of response JSON",async()=>{
  const r=route();const response=await r.POST(post("login",{password:"test-only-long-password"}));
  assert.equal(response.status,200);assert.equal(r.cookieWrites.length,1);
  const [name,token,options]=r.cookieWrites[0];
  assert.equal(name,"wtb_admin");assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal(options.httpOnly,true);assert.equal(options.sameSite,"strict");assert.equal(options.path,"/api/admin");assert.equal(options.maxAge,28800);
  assert.equal(r.calls[0].options.headers["x-admin-bridge"],"a".repeat(64));
  assert.equal(r.calls[0].options.headers["x-admin-session"],token);
  const body=await response.text();assert(!body.includes(token));assert(!body.includes("a".repeat(64)));
});
test("production HTTPS admin cookie is Secure",async()=>{
  const r=route();await r.POST(post("login",{password:"test-only-long-password"},"https://game.example","game.example","https"));
  assert.equal(r.cookieWrites[0][2].secure,true);
});
test("unauthenticated config writes and cross-origin requests never reach Edge",async()=>{
  const r=route();assert.equal((await r.POST(post("save",{provider:"nvidia",apiKey:"not-saved"}))).status,401);
  assert.equal((await r.POST(post("login",{password:"test-only-long-password"},"https://evil.example"))).status,403);
  assert.equal(r.calls.length,0);
});
test("failed login never installs an authorized session",async()=>{
  const r=route({upstreamStatus:401});assert.equal((await r.POST(post("login",{password:"test-only-wrong-password"}))).status,401);
  assert(r.cookieWrites.every(([,value,options])=>value==="" && options.maxAge===0));
});
test("logout clears the path-scoped cookie and revokes the backend session",async()=>{
  const r=route({cookie:"b".repeat(64)});assert.equal((await r.POST(post("logout"))).status,200);
  assert.equal(r.calls[0].body.action,"logout");assert.equal(r.cookieWrites[0][2].maxAge,0);assert.equal(r.cookieWrites[0][2].path,"/api/admin");
});
