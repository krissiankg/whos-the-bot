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
const lobby={};
vm.runInNewContext(compile(await readFile(new URL("../lib/lobby.ts",import.meta.url),"utf8")),{exports:lobby,require:()=>({})});
const source=compile(await readFile(new URL("../components/live-round.tsx",import.meta.url),"utf8"));
test("actual interruption screen renders safe, translated reasons and a native way home",()=>{
  for(const locale of ["fr","en"]){
    const out={};
    const modules={"react":React,"react/jsx-runtime":jsx,"lucide-react":icons,
      "@/lib/lobby":lobby,"@/lib/translations.mjs":{playerName},"@/lib/preview":{formatTime:()=>"00:00"},
      "./language-provider":{useLanguage:()=>({locale,t:(s,v)=>translate(locale,s,v)})},
      "@/components/home-link":{HomeLink:props=>React.createElement("a",{...props,href:"/"})},
      "./avatar":{Avatar:()=>null},"./leaderboard":{Leaderboard:()=>null}};
    vm.runInNewContext(source,{exports:out,require:name=>{assert(name in modules,name);return modules[name];}});
    for(const [cancelReason,message] of Object.entries(lobby.ROUND_INTERRUPTION_MESSAGES)){
      const state={room:{language:locale,deadline:null},serverNow:new Date().toISOString(),players:[],meId:"test-seat",
        round:{number:1,topic:"test",phase:"cancelled",cancelReason,practice:false,pausedUntil:null,myVote:null,messages:[],reportedIds:[],hostReportIds:[]}};
      const html=renderToStaticMarkup(React.createElement(out.LiveRound,{state,pending:false,onAction:async()=>true,onRefresh:async()=>{},onKick:()=>{}}));
      assert(html.includes(translate(locale,message)));assert.match(html,/href="[/]"/);
      assert.doesNotMatch(html,/apiKey|capability|provider_timeout/);
      if(locale==="fr")assert.notEqual(translate(locale,message),message);
    }
  }
});
