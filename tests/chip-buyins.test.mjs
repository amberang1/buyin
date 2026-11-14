import test from 'node:test';import assert from 'node:assert/strict';
import{buyInChipsToCents,buyInEntryCents,allocateStacks,reconciliation}from'../src/ledger.mjs';
import{mutateRoom}from'../src/mutations.mjs';import{mutateParticipation}from'../src/participation.mjs';
const rate={baseCurrency:20,chips:100,chipValues:{Blue:1}};
const g=(status='active')=>({hostId:'host',status,exchangeRate:rate});
const p={id:'a',name:'Alice',ownerUid:'guest',buyIns:[20],cashOuts:[],finalStackValue:0};
test('100 chip units equals $20 and an alternate table rate is respected',()=>{assert.equal(buyInChipsToCents(100,rate),2000);assert.equal(buyInChipsToCents(50,{...rate,baseCurrency:10}),500);});
test('new chip requests and legacy cash requests are never confused',()=>{assert.equal(buyInEntryCents({amount:100,unit:'chips',rate},rate),2000);assert.equal(buyInEntryCents({amount:100},rate),10000);});
test('invalid, fractional-cent and stale-rate chip inputs are rejected',()=>{
 for(const value of [-1,0,NaN,Infinity,100000001,'100'])assert.throws(()=>buyInChipsToCents(value,rate));
 assert.throws(()=>buyInChipsToCents(1,{...rate,baseCurrency:1,chips:3}));
 assert.throws(()=>buyInEntryCents({amount:100,unit:'chips',rate:{...rate,baseCurrency:10}},rate));
 assert.throws(()=>buyInEntryCents({amount:100,unit:'unknown'},rate));
});
test('host rebuy accepts chip units and appends the converted cash exactly once',()=>{
 const next=mutateRoom(g(),[p],'record',{playerId:'a',type:'buyIn',amount:50,unit:'chips',rate});assert.deepEqual(next.players[0].buyIns,[20,10]);assert.deepEqual(p.buyIns,[20]);
});
test('late direct entry converts chip units to cash',()=>{const next=mutateRoom(g(),[p],'addPlayer',{id:'late',name:'Late',amount:100,unit:'chips',rate});assert.deepEqual(next.players[1].buyIns,[20]);});
test('guest initial chip buy-in preserves both requested chips and cash equivalent',()=>{
 const next=mutateParticipation(g('setup'),[],[],[],'guest','enroll',{name:'Alice',amount:100,unit:'chips',rate},'a','now');
 assert.equal(next.requests[0].amount,20);assert.equal(next.requests[0].chipValue,100);
 const confirmed=mutateParticipation(g('setup'),next.players,next.requests,[],'host','resolve',{id:'a',status:'confirmed'},'confirm','later');assert.deepEqual(confirmed.players[0].buyIns,[20]);
});
test('guest chip rebuy is converted once at request time and confirmed without double conversion',()=>{
 const next=mutateParticipation(g(),[p],[],[],'guest','request',{playerId:'a',kind:'buyIn',amount:50,unit:'chips',rate},'rebuy','now');
 const confirmed=mutateParticipation(g(),next.players,next.requests,[],'host','resolve',{id:'rebuy',status:'confirmed'},'confirm','later');assert.deepEqual(confirmed.players[0].buyIns,[20,10]);
});
test('pending chip buy-in cannot be approved after the rate changes',()=>{
 const pending=mutateParticipation(g('setup'),[p],[],[],'guest','request',{playerId:'a',kind:'buyIn',amount:50,unit:'chips',rate},'rebuy','now');
 assert.throws(()=>mutateParticipation({...g('setup'),exchangeRate:{...rate,baseCurrency:10}},[p],pending.requests,[],'host','resolve',{id:'rebuy',status:'confirmed'},'confirm','later'));
});
test('chip buy-in and chip cash-out reconcile through the complete host workflow',()=>{
 let state=mutateRoom(g(),[p],'record',{playerId:'a',type:'buyIn',amount:50,unit:'chips',rate});
 state=mutateRoom(g(),state.players,'record',{playerId:'a',type:'cashOut',amount:50,rate});
 assert.equal(reconciliation(allocateStacks(state.players,{a:'100'},rate)).difference,0);
});
test('setup edits reject a stale exchange rate instead of silently changing the cash conversion',()=>{
 assert.throws(()=>mutateRoom(g('setup'),[p],'setup',{changes:[{id:'a',before:p,after:{...p,buyIns:[10]}}],rate:{...rate,baseCurrency:10}}));
});
