import {guestSetCookie} from "./test-guest-cookie.mjs";
// Real Next.js + Supabase, independent guest jars. No model call or admin key.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_BASE_URL || 'http://localhost:3000';
const signal=()=>AbortSignal.timeout(45000);
function guest(locale){let cookie='wtb_language='+locale;return {async request(action,args={}){
  const response=action==='state'?await fetch(base+'/api/lobby?code='+encodeURIComponent(args.code),{headers:{Cookie:cookie},signal:signal()}):await fetch(base+'/api/lobby',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({action,args}),signal:signal()});
  const next=guestSetCookie(response.headers);if(next)cookie+='; '+next.split(';')[0];return {status:response.status,body:await response.json()};
}};}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
for(const locale of ['fr','en'])for(const path of ['/','/how-to-play','/privacy','/admin']){
  const response=await fetch(base+path,{headers:{Cookie:'wtb_language='+locale},signal:signal()});
  const html=await response.text();assert.equal(response.status,200,path);assert(html.includes('<html lang="'+locale+'"'),path);
  if(path==='/')assert(html.includes(locale==='fr'?'Créer un salon':'Create a room'));
  if(path==='/admin')assert(html.includes(locale==='fr'?'Ton jeu. Tes réglages.':'Your game. Your settings.'));
}
console.log('PASS: all pages render in FR and EN with matching document language');
const host=guest('fr'),other=guest('en');ok(await host.request('session'));ok(await other.request('session'));let room;
try{
  const requestId=randomUUID();room=ok(await host.request('create',{requestId,language:'fr'}));const code=room.room.code;
  assert.equal(room.room.language,'fr');assert.equal(ok(await host.request('create',{requestId,language:'en'})).room.language,'fr');
  assert.equal(ok(await other.request('join',{code,language:'en'})).room.language,'fr');
  assert.equal((await other.request('language',{code,language:'en'})).body.error,'HOST_ONLY');
  assert.equal((await host.request('language',{code,language:'xx'})).body.error,'INVALID_REQUEST');
  ok(await host.request('ready',{code,ready:true}));ok(await other.request('ready',{code,ready:true}));
  const changed=ok(await host.request('language',{code,language:'en'}));assert.equal(changed.room.language,'en');assert(changed.players.every(p=>!p.ready));
  assert.equal(ok(await other.request('state',{code})).room.language,'en');
  assert.equal(ok(await host.request('language',{code,language:'fr'})).room.language,'fr');
  assert.equal(ok(await other.request('state',{code})).room.language,'fr');
  console.log('PASS: separate FR host and EN guest, shared room language, host authorization, readiness reset');
  console.log('Real model available:',Boolean(room.aiAvailable));
}finally{if(room){await other.request('leave',{code:room.room.code});await host.request('leave',{code:room.room.code});}}
console.log('ALL LANGUAGE CHECKS PASSED. Disposable room expires automatically. No model called.');
