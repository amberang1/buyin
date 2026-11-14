import test from 'node:test';import assert from 'node:assert/strict';
import {mutateRoom} from '../src/mutations.mjs';
import {mutateParticipation,participationActions,canAccessLedger,assertNoPending} from '../src/participation.mjs';
import {ledger,reconciliation} from '../src/ledger.mjs';
const rate={baseCurrency:20,chips:100,chipValues:{Blue:1,Red:5}};
const player=(id,name)=>({id,name,buyIns:[20],cashOuts:[],finalStackValue:0});
function room(){
 let state={game:{hostId:'host',status:'setup',exchangeRate:rate},players:[],requests:[],payments:[]},sequence=0;
 const members=new Set(['alice-device','bob-device','charlie-device']);
 return {get state(){return structuredClone(state)},step(uid,action,data={},id='op-'+ ++sequence){
  assert.ok(canAccessLedger(state.game,uid,members.has(uid),action),'server access policy denied this actor');
  const original=[...state.players].sort((a,b)=>a.id.localeCompare(b.id));
  let next;
  if(participationActions.includes(action))next=mutateParticipation(state.game,original,state.requests,state.payments,uid,action,data,id,'2026-11-13');
  else{assertNoPending(state.requests,action,data);next=mutateRoom(state.game,original,action,action==='addPlayer'?{...data,id}:data);}
  state={...state,...next};return structuredClone(state);
 }};
}
function finalizeAndPay(r){
 r.step('host','phase',{from:'active',to:'settlement'});
 const ps=r.state.players,units={Alice:'175',Bob:'25',Charlie:'100'};
 r.step('host','finalize',{expected:ps,rate,stacks:Object.fromEntries(ps.map(p=>[p.id,units[p.name]])),photos:{}});
 assert.equal(r.state.game.status,'results');assert.equal(reconciliation(r.state.players).difference,0);
 for(const p of r.state.players)r.step('host','payment',{playerId:p.id,amount:p.finalStackValue,expectedCents:0});
 assert.equal(r.state.payments.reduce((sum,p)=>sum+p.paidCents,0),6000);
 return ledger(r.state.players).balances.map(p=>({name:p.name,net:p.netCents,out:p.outCents})).sort((a,b)=>a.name.localeCompare(b.name));
}
function singleDevice(){
 const r=room();
 r.step('host','setup',{changes:[player('alice','Alice'),player('bob','Bob')].map(p=>({id:p.id,before:null,after:p}))});
 r.step('host','phase',{from:'setup',to:'active'});
 r.step('host','record',{playerId:'alice',type:'buyIn',amount:10,rate});
 r.step('host','addPlayer',{name:'Charlie',amount:20},'charlie');
 r.step('host','record',{playerId:'bob',type:'cashOut',amount:50,rate});
 assert.equal(r.state.requests.length,0);assert.ok(r.state.players.every(p=>!p.ownerUid));
 return finalizeAndPay(r);
}
function sharedDevices(){
 const r=room();
 for(const name of ['Alice','Bob']){
  const uid=name.toLowerCase()+'-device',id=name.toLowerCase();
  r.step(uid,'enroll',{name,amount:20},id);
  r.step('host','resolve',{id,status:'confirmed'});
 }
 r.step('host','phase',{from:'setup',to:'active'});
 r.step('alice-device','request',{playerId:'alice',kind:'buyIn',amount:10},'alice-rebuy');
 r.step('charlie-device','enroll',{name:'Charlie',amount:20},'charlie');
 r.step('bob-device','request',{playerId:'bob',kind:'cashOut',amount:50},'bob-out');
 assert.throws(()=>r.step('host','phase',{from:'active',to:'settlement'}));
 r.step('host','resolve',{id:'charlie',status:'confirmed'});
 r.step('host','resolve',{id:'bob-out',status:'confirmed',expectedPaidCents:1000});
 r.step('host','resolve',{id:'alice-rebuy',status:'confirmed'});
 assert.ok(r.state.requests.every(r=>r.status==='confirmed'));
 const restored=JSON.parse(JSON.stringify(r.state));assert.equal(restored.players.find(p=>p.ownerUid==='alice-device').id,'alice');
 return finalizeAndPay(r);
}
test('one operator can manage setup, rebuys, late arrival, cash-out, settlement and payouts without registering a seat',()=>assert.deepEqual(singleDevice(),[{name:'Alice',net:500,out:3500},{name:'Bob',net:-500,out:1500},{name:'Charlie',net:0,out:2000}]));
test('multiple device identities can interleave requests and produce identical financial results',()=>assert.deepEqual(sharedDevices(),singleDevice()));
test('server access policy permits members to request but rejects direct edits and strangers',()=>{
 const g={hostId:'host'};
 for(const action of ['record','undo','setup','phase','finalize','addPlayer','settings'])assert.equal(canAccessLedger(g,'guest',true,action),false);
 for(const action of participationActions){assert.equal(canAccessLedger(g,'guest',true,action),true);assert.equal(canAccessLedger(g,'stranger',false,action),false);}
 assert.equal(canAccessLedger(g,'host',false,'addPlayer'),true);assert.equal(canAccessLedger(null,'guest',true,'enroll'),false);
});
test('late direct entry rejects duplicate names, zero or excessive buy-in, wrong stage and duplicate ID',()=>{
 for(const data of [{id:'late',name:'A',amount:20},{id:'late',name:'Late',amount:0},{id:'late',name:'Late',amount:100000001},{id:'a',name:'Late',amount:20}])assert.throws(()=>mutateRoom({status:'active',exchangeRate:rate},[player('a','A')],'addPlayer',data));
 for(const status of ['setup','settlement','results'])assert.throws(()=>mutateRoom({status,exchangeRate:rate},[],'addPlayer',{id:'late',name:'Late',amount:20}));
});
test('two host tabs cannot overwrite a setup edit or overwrite a payout total from an older snapshot',()=>{
 const g={hostId:'host',status:'setup',exchangeRate:rate},p=player('a','Alice');
 const updated=mutateRoom(g,[p],'setup',{changes:[{id:'a',before:p,after:{...p,name:'Alice updated'}}]});
 assert.throws(()=>mutateRoom(g,updated.players,'setup',{changes:[{id:'a',before:p,after:{...p,buyIns:[30]}}]}));
 const results={...g,status:'results'},ps=[{...p,finalStackValue:20}];
 const paid=mutateParticipation(results,ps,[],[],'host','payment',{playerId:'a',amount:10,expectedCents:0},'paid','now');
 assert.throws(()=>mutateParticipation(results,ps,[],paid.payments,'host','payment',{playerId:'a',amount:20,expectedCents:0},'stale','later'));
});
