import test from "node:test";
import assert from "node:assert/strict";
import {readJsonObject} from "../lib/wire-json.ts";
test("gateway JSON preserves successful object replies",async()=>{assert.deepEqual(await readJsonObject(new Response(JSON.stringify({ok:true,authenticated:false}))),{ok:true,authenticated:false});});
test("gateway JSON preserves structured error replies",async()=>{assert.deepEqual(await readJsonObject(new Response(JSON.stringify({error:"HOST_ONLY"}),{status:403})),{error:"HOST_ONLY"});});
test("gateway JSON rejects null, arrays and primitives",async()=>{for(const value of [null,[],"text",12,true])await assert.rejects(()=>readJsonObject(new Response(JSON.stringify(value))),/Invalid gateway response/);});
test("gateway JSON rejects malformed JSON",async()=>{await assert.rejects(()=>readJsonObject(new Response("not JSON")));});
