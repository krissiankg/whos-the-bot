// Pure reference implementation for rule tests and the LOCAL developer demo.
// Live points are computed independently and authoritatively in Postgres.
export function scoreRound({humans,botId,votes,practice=false}) {
  const ids=new Set(humans);
  if(ids.size!==humans.length || ids.has(botId) || humans.length<2 || humans.length>6)throw new Error('Invalid roster');
  const ballot=new Map();const accusations=new Map(humans.map(id=>[id,0]));let humanVotes=0;
  for(const {voterId,targetId} of votes){
    if(!ids.has(voterId) || ballot.has(voterId) || voterId===targetId || (targetId!==null && targetId!==botId && !ids.has(targetId)))throw new Error('Invalid ballot');
    ballot.set(voterId,targetId);
    if(ids.has(targetId)){humanVotes++;accusations.set(targetId,accusations.get(targetId)+1);}
  }
  const aiWon=humanVotes*2>humans.length;
  const max=Math.max(...accusations.values());
  return {aiWon,scores:humans.map(participantId=>{
    const foundBot=ballot.get(participantId)===botId;const accused=accusations.get(participantId);
    return {participantId,foundBot,accusations:accused,delta:practice?0:Number(foundBot)-Number(aiWon && max>0 && accused===max)};
  })};
}
