import test from "node:test";
import assert from "node:assert/strict";
import {botMessage,BotFailure,failureCode,providerFailure} from "../supabase/functions/game-bot/policy.mjs";

test("completed prose is shortened at a safe sentence or word boundary",()=>{
  const completion=text=>({choices:[{finish_reason:"stop",message:{content:text}}]});
  const text="les crêpes du dimanche c’est sacré. "+"et vous vous préférez quoi pour commencer le week-end ? ".repeat(5);
  const result=botMessage(completion(text),"nvidia");
  assert(result.length<=180);assert(text.startsWith(result));assert(result.endsWith("." ) || result.endsWith("?"));
  const words="weekends with pancakes and long walks ".repeat(12);
  const short=botMessage(completion(words),"nvidia");assert(short.length<=180);assert(short.endsWith("…"));
  assert.throws(()=>botMessage(completion("<think>private</think>"+text),"nvidia"));
  assert.throws(()=>botMessage({choices:[{finish_reason:"length",message:{content:"hello"}}]},"nvidia"));
});
test("diagnostics cannot contain raw provider errors, chat or secrets",()=>{
  assert.equal(failureCode(new Error("Bearer secret / private conversation")),"worker_error");
  assert.equal(failureCode({name:"TimeoutError",message:"secret"}),"provider_timeout");
  assert.equal(failureCode(new BotFailure("untrusted secret")),"worker_error");
  for(const [status,expected] of [[401,"provider_auth"],[403,"provider_auth"],[429,"provider_rate_limit"],[503,"provider_unavailable"],[400,"provider_request"]])assert.equal(failureCode(providerFailure(status)),expected);
});

