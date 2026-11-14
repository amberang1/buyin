import test from 'node:test';
import assert from 'node:assert/strict';
import {mutateRoom,validatePlayer} from '../src/mutations.mjs';
import {allocateStacks,reconciliation,cashToChips,moneyCents,validateSettings} from '../src/ledger.mjs';
const rate={baseCurrency:20,chips:100,chipValues:{Blue:1,Red:5}};
const player=(id,amount=20)=>({id,name:id,buyIns:[amount],cashOuts:[],finalStackValue:0});
const game=(status='setup')=>({hostId:'host',status,exchangeRate:rate});
test('oversized edit and malformed financial entries rejected before persistence',()=>{
 for(const amount of [100000001,-1,NaN,Infinity,'20',0,1.001]) assert.throws(()=>validatePlayer(player('a',amount)));
});
test('large valid table aggregate does not use single-entry limit',()=>assert.equal(cashToChips(120000000,rate),600000000));
test('all entry paths use consistent half-cent rounding',()=>{assert.equal(moneyCents(1.005),101);assert.equal(moneyCents(10.075),1008);});
test('fractional cents allocate deterministically with exact conservation',()=>{
 const ps=[player('a',0.34),player('b',0.33),player('c',0.33)];
 const r={...rate,baseCurrency:1,chips:3};const stacks={a:'1',b:'1',c:'1'};
 const next=allocateStacks(ps,stacks,r);
 assert.equal(reconciliation(next).difference,0);assert.deepEqual(next.map(p=>p.finalStackValue),[0.34,0.33,0.33]);
 assert.deepEqual(allocateStacks([...ps].reverse(),stacks,r).map(p=>p.finalStackValue),[0.33,0.33,0.34]);
});
test('rounding never hides missing chips',()=>assert.throws(()=>allocateStacks([player('a',1)],{a:'2.99'},{...rate,baseCurrency:1,chips:3})));
test('settings reject duplicate case variants, limits and malformed colors',()=>{
 for(const chipValues of [{Blue:1,blue:2},{Blue:1000001},{constructor:1},Object.fromEntries(Array.from({length:31},(_,i)=>['Color '+String.fromCharCode(65+i),1]))]) assert.throws(()=>validateSettings({...rate,chipValues}));
});
test('settings reject stale scan and preserve concurrent changes',()=>{
 const current={...game(),exchangeRate:{...rate,chipValues:{Blue:2}}};
 assert.throws(()=>mutateRoom(current,[],'settings',{expected:rate,rate:{...rate,chipValues:{Red:5}}}),/Settings changed/);
});
test('start checks authoritative roster including missing buy-ins',()=>{
 for(const ps of [[player('a')],[player('a'),{...player('b'),buyIns:[]}]]) assert.throws(()=>mutateRoom(game(),ps,'phase',{from:'setup',to:'active'}));
 assert.equal(mutateRoom(game(),[player('a'),player('b')],'phase',{from:'setup',to:'active'}).game.status,'active');
});
test('setup rejects stale edits but accepts object key reordering',()=>{
 const p=player('a');const before=Object.fromEntries(Object.entries(p).reverse());
 const data={changes:[{id:'a',before,after:{...p,name:'Alice'}}]};
 assert.equal(mutateRoom(game(),[p],'setup',data).players[0].name,'Alice');
 assert.throws(()=>mutateRoom(game(),[{...p,name:'Other'}],'setup',data));
});
test('successive equal rebuys append without overwriting',()=>{
 let result={game:game('active'),players:[player('a'),player('b')]};
 for(let i=0;i<2;i++)result=mutateRoom(result.game,result.players,'record',{playerId:'a',type:'buyIn',amount:10,rate});
 assert.deepEqual(result.players[0].buyIns,[20,10,10]);
});
test('cashout cannot exceed authoritative remaining table balance',()=>{
 const ps=[{...player('a'),cashOuts:[30]},player('b')];
 assert.throws(()=>mutateRoom(game('active'),ps,'record',{playerId:'b',type:'cashOut',amount:100,rate}),/remaining|balance/);
});
test('undo does not allow a negative table balance',()=>{
 const p={...player('a'),buyIns:[20,20],cashOuts:[30]};
 assert.throws(()=>mutateRoom(game('active'),[p],'undo',{playerId:'a',type:'buyIn',expected:p}));
});
test('finalize verifies complete roster and computes values server-side',()=>{
 const ps=[player('a'),player('b')];const data={expected:ps,rate,stacks:{a:'50',b:'150'},photos:{}};
 const result=mutateRoom(game('settlement'),ps,'finalize',data);
 assert.equal(result.game.status,'results');assert.equal(reconciliation(result.players).difference,0);
 assert.deepEqual(result.players.map(p=>p.finalStackValue),[10,30]);
 assert.throws(()=>mutateRoom(game('settlement'),[...ps,player('c')],'finalize',data));
 assert.throws(()=>mutateRoom(game('results'),ps,'finalize',data));
});
test('finalize rejects malformed photos and unbalanced counts',()=>{
 const ps=[player('a'),player('b')],data={expected:ps,rate,stacks:{a:'50',b:'150'},photos:{a:'bad photo'}};
 assert.throws(()=>mutateRoom(game('settlement'),ps,'finalize',data));
 assert.throws(()=>mutateRoom(game('settlement'),ps,'finalize',{...data,photos:{},stacks:{a:'50',b:'149'}}));
});
test('fractional partial cashouts preserve chip conservation and pay the final cent',()=>{
 const r={...rate,baseCurrency:1,chips:3};
 let state={game:{...game('active'),exchangeRate:r},players:[player('a',1),player('b',1)]};
 for(let i=0;i<5;i++)state=mutateRoom(state.game,state.players,'record',{playerId:'a',type:'cashOut',amount:1,rate:r});
 const finals=allocateStacks(state.players,{a:'0',b:'1'},r);
 assert.equal(reconciliation(finals).difference,0);
 state=mutateRoom(state.game,state.players,'record',{playerId:'b',type:'cashOut',amount:1,rate:r});
 assert.equal(reconciliation(allocateStacks(state.players,{a:'0',b:'0'},r)).difference,0);
});
