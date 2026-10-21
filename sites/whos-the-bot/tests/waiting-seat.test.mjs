import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {translate,playerName} from "../lib/translations.mjs";
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function load(file,modules){const out={}; vm.runInNewContext(compile(await readFile(new URL(file,import.meta.url),"utf8")),{exports:out,require:name=>{assert(name in modules,name);return modules[name];}}); return out;}
const {waitingSeat}=await load("../lib/waiting-seat.ts",{"./translations.mjs":{translate}});
const {Avatar}=await load("../components/avatar.tsx",{"react/jsx-runtime":jsx});
const players=[{id:"host-seat",name:"Lilac Cat",animal:"cat",color:"#c9b1ff",ready:true,online:true},{id:"guest-seat",name:"Mint Frog",animal:"frog",color:"#9cddba",ready:false,online:true}];
test("cached lobby assignments are neutralized without changing controls or the source state",()=>{
 for(const language of ["fr","en"]){
  const seat=waitingSeat(players[0],0,language);
  assert.equal(seat.name,language==="fr"?"Joueur 1":"Player 1");
  assert.equal(seat.animal,"hidden");assert.equal(seat.color,"#b6b9ad");
  assert.equal(seat.id,players[0].id);assert.equal(seat.ready,true);assert.equal(seat.online,true);
  assert.equal(players[0].animal,"cat");assert.equal(players[0].name,"Lilac Cat");
 }
});
test("real waiting screen hides cached avatars and names in both languages, preserving readiness and host moderation",async()=>{
 for(const locale of ["fr","en"]){
  let hook=0;
  const state={room:{id:"test-room",code:"TEST",hostId:players[0].id,language:locale,expiresAt:"2030-01-01T00:00:00Z"},players,meId:players[0].id,aiAvailable:true};
  const modules={"react":{...React,useState:initial=>React.useState(hook++===0?state:hook===4?false:initial)},"react/jsx-runtime":jsx,"lucide-react":icons,
   "@supabase/supabase-js":{},"@/lib/wire-json":{},"@/lib/lobby":{},"@/lib/waiting-seat":{waitingSeat},"@/lib/translations.mjs":{playerName},
   "./language-provider":{useLanguage:()=>({locale,t:(s,v)=>translate(locale,s,v)}),LanguageSwitcher:()=>null},
   "@/components/home-link":{HomeLink:props=>React.createElement("a",{...props,href:"/"})},"./avatar":{Avatar},"./live-round":{LiveRound:()=>null}};
  const {LiveLobby}=await load("../components/live-lobby.tsx",modules);
  const html=renderToStaticMarkup(React.createElement(LiveLobby,{code:"TEST",supabaseUrl:"https://example.invalid",publishableKey:"public-test"}));
  for(const old of ["Lilac Cat","Mint Frog","Chat lilas","Grenouille menthe","#c9b1ff","#9cddba"])assert(!html.includes(old),old);
  assert(html.includes(locale==="fr"?"Joueur 1":"Player 1"));assert(html.includes(locale==="fr"?"Joueur 2":"Player 2"));
  assert(html.includes(translate(locale,"Kick {0}",{0:locale==="fr"?"Joueur 2":"Player 2"})));
  assert(html.includes(translate(locale,"HOST")));assert(html.includes(translate(locale,"Ready")));
  assert(html.includes(translate(locale,"At every round, humans and the AI receive shuffled names, avatars and colors. Waiting seat numbers do not carry over.")));
 }
});

