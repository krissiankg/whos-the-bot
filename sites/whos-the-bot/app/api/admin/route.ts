import { adminBridgeToken } from "@/lib/server/site-config";
import { readJsonObject } from "@/lib/wire-json";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminOrigin } from "@/lib/server/admin-security.mjs";

export const runtime="nodejs";
const cookieName="wtb_admin";
const cookiePath="/api/admin";
const allowed=new Set(["setup","login","logout","save","activate","test"]);
const noStore={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:noStore});}
function configured(){return Boolean(adminBridgeToken() && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);}
async function session(){const value=(await cookies()).get(cookieName)?.value;return value && /^[a-f0-9]{64}$/.test(value)?value:null;}
async function command(action:string,args:Record<string,unknown>,token:string){
  const result=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/game-admin`,{
    method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      "x-admin-bridge":adminBridgeToken()!,"x-admin-session":token},
    body:JSON.stringify({action,args}),signal:AbortSignal.timeout(40000),
  });
  return {status:result.status,body:await readJsonObject<Record<string,unknown>>(result)};
}

export async function GET(request:Request){
  if(!adminOrigin(request,false))return json({error:"ADMIN_HTTPS_REQUIRED"},403);
  if(!configured())return json({error:"ADMIN_SETUP_REQUIRED"},503);
  try{
    const token=await session();
    if(token){
      const current=await command("status",{},token);
      if(current.status===200)return json({...current.body,authenticated:true});
      if(current.status!==401)return json(current.body,current.status);
    }
    const initial=await command("bootstrap_status",{},randomBytes(32).toString("hex"));
    return json({...initial.body,authenticated:false},initial.status);
  }catch{return json({error:"ADMIN_UNAVAILABLE"},503);}
}

export async function POST(request:Request){
  const origin=adminOrigin(request);
  if(!origin)return json({error:"ADMIN_ORIGIN_REJECTED"},403);
  if(!configured())return json({error:"ADMIN_SETUP_REQUIRED"},503);
  try{
    if(Number(request.headers.get("content-length"))>8192)return json({error:"INVALID_REQUEST"},413);
    const text=await request.text();if(text.length>8192)return json({error:"INVALID_REQUEST"},413);
    const input=JSON.parse(text);
    if(!input || !allowed.has(input.action) || !input.args || typeof input.args!=="object" || Array.isArray(input.args))return json({error:"INVALID_REQUEST"},400);
    const login=input.action==="setup" || input.action==="login";
    const token=login?randomBytes(32).toString("hex"):await session();
    if(!token)return json({error:"ADMIN_UNAUTHORIZED"},401);
    const result=await command(input.action,input.args,token);
    const response=json(result.body,result.status);
    if(result.status===200 && login)response.cookies.set(cookieName,token,{httpOnly:true,sameSite:"strict",secure:origin.protocol==="https:",path:cookiePath,maxAge:8*60*60});
    if(input.action==="logout" || result.status===401)response.cookies.set(cookieName,"",{httpOnly:true,sameSite:"strict",secure:origin.protocol==="https:",path:cookiePath,maxAge:0});
    return response;
  }catch(error){return json({error:error instanceof SyntaxError?"INVALID_REQUEST":"ADMIN_UNAVAILABLE"},error instanceof SyntaxError?400:503);}
}
