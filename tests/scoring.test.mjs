import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreRound} from '../src/lib/scoring.mjs';
const humans=['a','b','c','d'];const botId='bot';
const run=(votes,other={})=>scoreRound({humans,botId,votes:votes.map(([voterId,targetId])=>({voterId,targetId})),...other});
test('correct guesses earn +1, missing votes abstain',()=>{
  assert.deepEqual(run([['a','bot']]).scores.map(s=>s.delta),[1,0,0,0]);
  assert.equal(run([]).aiWon,false);
});
test('majority is strictly more than half, counting abstentions',()=>{
  assert.equal(run([['a','b'],['b','a']]).aiWon,false);
  assert.equal(run([['a','b'],['b','a'],['c','a']]).aiWon,true);
  assert.deepEqual(run([['a','b'],['b','a'],['c','a']]).scores.map(s=>s.delta),[-1,0,0,0]);
});
test('all tied most accused humans lose a point when AI wins',()=>{
  assert.deepEqual(run([['a','b'],['b','c'],['c','a']],{humans:['a','b','c']}).scores.map(s=>s.delta),[-1,-1,-1]);
});
test('correct guess and accusation penalty may cancel each other',()=>{
  assert.deepEqual(run([['a','bot'],['b','a'],['c','a']],{humans:['a','b','c']}).scores.map(s=>s.delta),[0,0,0]);
});
test('practice is unranked for both successful and failed guesses',()=>{
  assert(run([['a','bot'],['b','a']],{humans:['a','b'],practice:true}).scores.every(s=>s.delta===0));
});
test('invalid, self, bot and duplicate ballots are rejected',()=>{
  assert.throws(()=>run([['a','a']]));assert.throws(()=>run([['bot','a']]));
  assert.throws(()=>run([['a','bot'],['a','b']]));assert.throws(()=>run([['a','unknown']]));
});
