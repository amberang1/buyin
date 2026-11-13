import test from 'node:test';
import assert from 'node:assert/strict';
import {mutateParticipation,assertNoPending} from '../src/participation.mjs';
import {mutateRoom} from '../src/mutations.mjs';
const rate={baseCurrency:20,chips:100,chipValues:{Blue:1}};
const game=(status='setup')=>({hostId:'host',status,exchangeRate:rate});
const player=(id='a')=>({id,name:id,buyIns:[20],cashOuts:[],finalStackValue:0});
const apply=(g,ps,rs,uid,action,data,id='operation',payments=[])=>mutateParticipation(g,ps,rs,payments,uid,action,data,id,'2026-11-13T12:00:00Z');
test('new guest enrolls with persistent seat identity and pending initial buy-in',()=>{
 const result=apply(game(),[],[],'guest','enroll',{name:'Amber',amount:20});
 assert.equal(result.players[0].ownerUid,'guest');assert.deepEqual(result.players[0].buyIns,[]);
 assert.equal(result.requests[0].status,'requested');assert.equal(result.requests[0].amount,20);
 assert.throws(()=>apply(game(),result.players,result.requests,'guest','enroll',{name:'Second'}));
});
test('late arrival can enroll and have initial buy-in confirmed during play',()=>{
 const g=game('active'),result=apply(g,[player()],[],'guest','enroll',{name:'Late',amount:10});
 const next=apply(g,result.players,result.requests,'host','resolve',{id:'operation',status:'confirmed'});
 assert.deepEqual(next.players[1].buyIns,[10]);assert.equal(next.requests[0].status,'confirmed');
});
test('seat linking requires host approval and survives a fresh state read',()=>{
 const result=apply(game(),[player()],[],'guest','request',{kind:'claim',playerId:'a'});
 assert.equal(result.players[0].ownerUid,undefined);
 assert.throws(()=>apply(game(),result.players,result.requests,'guest','resolve',{id:'operation',status:'confirmed'}));
 const next=apply(game(),result.players,result.requests,'host','resolve',{id:'operation',status:'confirmed'});
 const restored=JSON.parse(JSON.stringify(next.players));assert.equal(restored.find(p=>p.ownerUid==='guest').id,'a');
 assert.throws(()=>apply(game(),restored,[],'other','request',{kind:'claim',playerId:'a'}));
});
test('one guest cannot take multiple seats or submit for another player',()=>{
 const own={...player(),ownerUid:'guest'},other=player('b');
 assert.throws(()=>apply(game(),[own,other],[],'guest','request',{kind:'buyIn',playerId:'b',amount:20}));
 assert.throws(()=>apply(game(),[own,other],[],'guest','request',{kind:'claim',playerId:'b'}));
});
test('rejected transaction stays visible and never changes the ledger',()=>{
 const ps=[{...player(),ownerUid:'guest'}];
 const pending=apply(game(),ps,[],'guest','request',{kind:'buyIn',playerId:'a',amount:10});
 const rejected=apply(game(),pending.players,pending.requests,'host','resolve',{id:'operation',status:'rejected',reason:'No payment received'});
 assert.deepEqual(rejected.players,ps);assert.equal(rejected.requests[0].reason,'No payment received');
 assert.equal(rejected.requests[0].status,'rejected');
 assert.throws(()=>apply(game(),ps,rejected.requests,'host','resolve',{id:'operation',status:'confirmed'}));
});
test('a pending request cannot be confirmed twice or replaced by a second request',()=>{
 const ps=[{...player(),ownerUid:'guest'}];
 const pending=apply(game('active'),ps,[],'guest','request',{kind:'buyIn',playerId:'a',amount:10});
 assert.throws(()=>apply(game('active'),ps,pending.requests,'guest','request',{kind:'buyIn',playerId:'a',amount:10},'second'));
 const confirmed=apply(game('active'),ps,pending.requests,'host','resolve',{id:'operation',status:'confirmed'});
 assert.deepEqual(confirmed.players[0].buyIns,[20,10]);
 assert.throws(()=>apply(game('active'),confirmed.players,confirmed.requests,'host','resolve',{id:'operation',status:'confirmed'}));
});
test('pending requests block start, settlement and finalization',()=>{
 const rs=[{status:'requested'}];
 for(const [action,data] of [['phase',{from:'setup',to:'active'}],['phase',{from:'active',to:'settlement'}],['finalize',{}]])assert.throws(()=>assertNoPending(rs,action,data));
 assert.doesNotThrow(()=>assertNoPending([{status:'rejected'}],'finalize',{}));
});
test('settlement and results reject new seats and transactions',()=>{
 for(const status of ['settlement','results']){
  assert.throws(()=>apply(game(status),[],[],'guest','enroll',{name:'Late'}));
  assert.throws(()=>apply(game(status),[{...player(),ownerUid:'guest'}],[],'guest','request',{playerId:'a',kind:'buyIn',amount:10}));
 }
});
test('payout tracking permits partial/full payments without changing financial results',()=>{
 const ps=[{...player(),finalStackValue:30}];
 let next=apply(game('results'),ps,[],'host','payment',{playerId:'a',amount:10,expectedCents:0});
 assert.equal(next.payments[0].paidCents,1000);assert.deepEqual(next.players,ps);
 next=apply(game('results'),ps,[],'host','payment',{playerId:'a',amount:30,expectedCents:1000},'second',next.payments);
 assert.equal(next.payments[0].paidCents,3000);assert.deepEqual(next.players,ps);
});
test('payout tracking rejects guests, excess payment, negative amounts, stale edits and wrong phase',()=>{
 const ps=[{...player(),finalStackValue:30}];
 for(const [uid,g,amount,expectedCents] of [['guest',game('results'),10,0],['host',game('active'),10,0],['host',game('results'),31,0],['host',game('results'),-1,0],['host',game('results'),10,100]])assert.throws(()=>apply(g,ps,[],uid,'payment',{playerId:'a',amount,expectedCents}));
});
test('host setup edits cannot forge or remove seat identity',()=>{
 const p={...player(),ownerUid:'guest'};
 assert.throws(()=>mutateRoom(game(),[p],'setup',{changes:[{id:'a',before:p,after:{...p,ownerUid:'host'}}]}));
});
test('invalid initial entry is atomic and cannot create an unpaid duplicate seat',()=>{
 const ps=[player()];assert.throws(()=>apply(game(),ps,[],'guest','enroll',{name:'New',amount:-1}));assert.equal(ps.length,1);
 assert.throws(()=>apply(game(),ps,[],'guest','enroll',{name:'A',amount:20}));
});
test('cash-out approval records the exact paid amount and rejects stale previews',()=>{
 const g=game('active'),ps=[{...player(),ownerUid:'guest'},player('b')];
 const pending=apply(g,ps,[],'guest','request',{kind:'cashOut',playerId:'a',amount:50});
 assert.throws(()=>apply(g,ps,pending.requests,'host','resolve',{id:'operation',status:'confirmed',expectedPaidCents:999}));
 const confirmed=apply(g,ps,pending.requests,'host','resolve',{id:'operation',status:'confirmed',expectedPaidCents:1000});
 assert.equal(confirmed.requests[0].confirmedAmount,10);assert.deepEqual(confirmed.players[0].cashOuts,[10]);
});
test('two guests claiming one seat cannot both be approved',()=>{
 const first=apply(game(),[player()],[],'one','request',{kind:'claim',playerId:'a'},'first');
 const second=apply(game(),first.players,first.requests,'two','request',{kind:'claim',playerId:'a'},'second');
 const confirmed=apply(game(),second.players,second.requests,'host','resolve',{id:'first',status:'confirmed'});
 assert.throws(()=>apply(game(),confirmed.players,confirmed.requests,'host','resolve',{id:'second',status:'confirmed'}));
 assert.equal(confirmed.players[0].ownerUid,'one');
});
test('guests cannot overwrite existing seats or requests by reusing another identifier',()=>{
 assert.throws(()=>apply(game(),[player('operation')],[],'guest','enroll',{name:'New'}));
 const pending=apply(game(),[player()],[],'first','request',{kind:'claim',playerId:'a'});
 assert.throws(()=>apply(game(),pending.players,pending.requests,'second','request',{kind:'claim',playerId:'a'}));
});
test('manual transactions cannot accidentally duplicate a pending guest entry',()=>{
 assert.throws(()=>assertNoPending([{status:'requested',playerId:'a',kind:'buyIn'}],'record',{playerId:'a'}));
 assert.throws(()=>assertNoPending([{status:'requested',playerId:'a',kind:'cashOut'}],'undo',{playerId:'a'}));
 assert.doesNotThrow(()=>assertNoPending([{status:'requested',playerId:'a',kind:'buyIn'}],'record',{playerId:'b'}));
});
test('undoing an approved guest buy-in marks its request reversed',async()=>{
 const {reverseUndoneRequest}=await import('../src/participation.mjs');
 const g=game('active'),ps=[{...player(),ownerUid:'guest'},player('b')];
 const pending=apply(g,ps,[],'guest','request',{kind:'buyIn',playerId:'a',amount:10});
 const confirmed=apply(g,ps,pending.requests,'host','resolve',{id:'operation',status:'confirmed'});
 assert.equal(confirmed.requests[0].entryIndex,1);
 const data={playerId:'a',type:'buyIn',expected:confirmed.players[0]};
 const undone=mutateRoom(g,confirmed.players,'undo',data);
 const requests=reverseUndoneRequest(confirmed.requests,confirmed.players,data,'host','now');
 assert.deepEqual(undone.players[0].buyIns,[20]);assert.equal(requests[0].status,'reversed');
 assert.equal(confirmed.requests[0].status,'confirmed');
});
