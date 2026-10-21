import test from 'node:test';
import assert from 'node:assert/strict';
import {resultCardData} from '../src/lib/result-card.mjs';
test('result cards project only anonymous results, never chat or credentials',()=>{
  const row={id:'private-id',name:'Orange Fox',score:2,rank:1,found:2,me:true,apiKey:'secret',messages:['private chat']};
  const card=resultCardData([row,{...row,name:'Lilac Cat',me:false}]);
  assert.deepEqual(Object.keys(card.players[0]),['name','score','rank','found','me']);
  assert(!/secret|private|messages|apiKey/.test(JSON.stringify(card)));
  assert.equal(card.rounds,3);
});
test('result card bounds reject impossible scores or oversized rosters',()=>{
  assert.throws(()=>resultCardData([]));
  assert.throws(()=>resultCardData(Array.from({length:7},()=>({}))));
  assert.throws(()=>resultCardData([{score:999,rank:1,found:2},{}]));
});
