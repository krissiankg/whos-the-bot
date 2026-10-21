// Explicit projection: never serialize chat, room codes, guest IDs or secrets.
export function resultCardData(rows,practice=false) {
  if(!Array.isArray(rows) || rows.length<2 || rows.length>6)throw new Error('Invalid results');
  return {rounds:3,practice:Boolean(practice),players:rows.map(row=>{
    if(!Number.isInteger(row.score) || !Number.isInteger(row.rank) || !Number.isInteger(row.found) || row.rank<1 || row.rank>6 || row.found<0 || row.found>3 || row.score < -3 || row.score>3)throw new Error('Invalid score');
    return {name:String(row.name).slice(0,40),score:row.score,rank:row.rank,found:row.found,me:row.me===true};
  })};
}
