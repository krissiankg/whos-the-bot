// Explicit opt-in integration test: creates only its own room and temporary
// guests. At most 3 rounds / 18 bounded provider attempts under server quotas.
import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";
import {guestSetCookie} from "./test-guest-cookie.mjs";
const base=process.env.TEST_BASE_URL;
assert.equal(process.env.ALLOW_LIVE_AI_TEST,"1","Live AI tests require explicit opt-in");
assert.equal(base,"https://whos-the-bot.grassyhake7.chatgpt.site","Test only the selected site");
function actor(){let cookie="";return async(action,args={})=>{
  const r=await fetch(base+"/api/lobby"+(action==="state"?"?code="+encodeURIComponent(args.code):""),action==="state"
    ? {headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)}
    : {method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(30000)});
  const next=guestSetCookie(r.headers);if(next)cookie=next.split(";")[0];
  const data=await r.json();assert.equal(r.status,200,action+": "+(data.error||"Gateway failure"));return data;
};}
const guests=[actor(),actor(),actor()];let code="";let interrupted=false;
process.once("SIGINT",()=>{interrupted=true;});process.once("SIGTERM",()=>{interrupted=true;});
const start=Date.now();let n=0;
try{
  for(const guest of guests)await guest("session");
  let state=await guests[0]("create",{requestId:crypto.randomUUID(),language:"fr"});code=state.room.code;
  console.log("Test room created:",code);
  for(const guest of guests.slice(1))await guest("join",{code});
  for(const guest of guests)await guest("ready",{code,ready:true});
  state=await guests[0]("start",{code});
  for(n=1;n<=3;n++){
    assert.equal(state.round.number,n);assert.equal(state.round.phase,"chat");
    assert.equal(state.round.practice,false);assert.equal(state.players.length,4);
    const ids=(await Promise.all(guests.map(g=>g("state",{code})))).map(s=>s.meId);
    const lines=["pour moi le plus important c’est de passer un bon moment", "je préfère les idées simples et un peu drôles", "et vous, vous choisiriez quoi ?"];
    for(let i=0;i<guests.length;i++)await guests[i]("message",{code,text:lines[i],requestId:crypto.randomUUID()});
    let last="",voted=false,lastLog=0;
    while(true){
      assert(!interrupted,"Test interrupted");assert(Date.now()-start<13*60*1000,"Match exceeded bounded timeout");
      const states=await Promise.all(guests.map(g=>g("state",{code})));state=states[0];
      assert.equal(state.round.number,n);assert.notEqual(state.round.phase,"cancelled",state.round.cancelReason||"Round interrupted");
      // Requests can straddle a deadline; wait for convergence, not impossible
      // atomic snapshots across independent clients.
      if(!states.every(s=>s.round.phase===state.round.phase)){await delay(1000);continue;}
      if(state.round.phase!==last || Date.now()-lastLog>30000){console.log("Round",n,"phase",state.round.phase,"messages",state.round.messages.length);last=state.round.phase;lastLog=Date.now();}
      if(state.round.phase==="chat"){
        assert(states.every(s=>!s.round.reveal && !s.round.result && !s.round.cancelReason),"No identities, points or failure hints before reveal");
        assert(state.round.messages.length>=3,"Shared messages reach all sessions");
      }else if(state.round.phase==="vote" && !voted){
        for(let i=0;i<guests.length;i++){
          const target=states[i].players.find(p=>p.id!==ids[i]);
          const ballot=await guests[i]("vote",{code,targetId:target.id});
          assert.equal(ballot.round.myVote,target.id);assert(!ballot.round.reveal);
        }voted=true;
      }else if(state.round.phase==="reveal"){
        assert(voted);assert.equal(state.round.reveal.votes.length,3);
        const bot=state.round.reveal.botId;
        assert(!ids.includes(bot));
        const botMessages=state.round.messages.filter(m=>m.playerId===bot).length;
        assert(botMessages>0,"Real AI must have participated");
        assert.equal(state.round.result.scores.length,3);
        const votes=state.round.reveal.votes;
        const aiWon=votes.filter(v=>v.targetId && v.targetId!==bot).length*2>3;
        assert.equal(state.round.result.aiWon,aiWon);
        const counts=Object.fromEntries(ids.map(id=>[id,votes.filter(v=>v.targetId===id).length]));
        const most=Math.max(...Object.values(counts));
        for(const row of state.round.result.scores){
          const found=votes.some(v=>v.voterId===row.participantId && v.targetId===bot);
          assert.equal(row.delta,Number(found)-Number(aiWon && most>0 && counts[row.participantId]===most));
        }
        console.log("Round",n,"verified:",botMessages,"real AI messages, private votes and scores OK");break;
      }
      await delay(4000);
    }
    if(n<3)state=await guests[0]("next",{code,roundId:state.round.id});
  }
  assert.equal(state.room.phase,"finished");assert.equal(state.leaderboard.length,3);
  console.log("PASS: 3 real live rounds, shared chat, AI, voting, reveals, scores and leaderboard.");
}finally{
  if(code)for(const guest of guests)try{await guest("leave",{code});}catch{}
  console.log("Test seats released; room expires automatically after 24h.");
}

