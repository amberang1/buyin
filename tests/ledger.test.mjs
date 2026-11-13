import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyCents, sumCents, chipsToCents, cashToChips, chipTotal, ledger } from '../src/ledger.mjs';
const rate = {baseCurrency:20,chips:100,chipValues:{Red:5,Green:25,Black:100}};
const players = [{id:'a',name:'A',buyIns:[20,20],cashOuts:[10],finalStackValue:50},{id:'b',name:'B',buyIns:[20],cashOuts:[],finalStackValue:0}];
test('denomination math and cash conversion',()=>{assert.equal(chipTotal({Red:10,Green:2,Black:1},rate.chipValues),200);assert.equal(chipsToCents(200,rate),4000);assert.equal(cashToChips(40,rate),200)});
test('rebuy and mid-game cash-out are accounted once',()=>{const result=ledger(players);assert.equal(result.tableCents,5000);assert.equal(result.differenceCents,0);assert.deepEqual(result.balances.map(p=>p.netCents),[2000,-2000])});
test('cent precision and one-cent mismatch',()=>{assert.equal(sumCents([.1,.2]),30);assert.equal(ledger([{...players[0],finalStackValue:49.99},players[1]]).differenceCents,1)});
test('zero stack allowed; invalid rate, negative/fractional counts and unknown colors rejected',()=>{assert.equal(chipsToCents(0,rate),0);assert.throws(()=>chipsToCents(1,{...rate,chips:0}));assert.throws(()=>chipTotal({Red:-1},rate.chipValues));assert.throws(()=>chipTotal({Red:1.5},rate.chipValues));assert.throws(()=>chipTotal({Pink:1},rate.chipValues));assert.throws(()=>moneyCents(-1))});

import { balance, chipCents, reconciliation, stackTotal, parseStackScan } from '../src/ledger.mjs';
test('photo counts use configured denominations',()=>{
  assert.equal(stackTotal({Red:10,Green:4,Black:1},rate.chipValues),250);
  assert.equal(chipCents(250,rate),5000);
});
test('scan rejects unknown, duplicate, fractional, negative and empty counts',()=>{
  for(const rows of [[{color:'Blue',count:1}],[{color:'Red',count:1},{color:'Red',count:2}],[{color:'Red',count:1.5}],[{color:'Red',count:-1}],[]]){
    assert.throws(()=>parseStackScan(JSON.stringify({counts:rows,warnings:[]}),rate.chipValues));
  }
});
test('scan counts and warnings are independently reviewable',()=>{
  const result=parseStackScan(JSON.stringify({counts:[{color:'Red',count:10},{color:'Green',count:4}],warnings:['One stack is partly hidden.']}),rate.chipValues);
  assert.equal(result.total,150);assert.equal(result.warnings.length,1);
});
test('all player balances and mismatch are deterministic',()=>{
  assert.equal(balance(players[0]).netCents,2000);
  assert.deepEqual(reconciliation(players),{totalIn:6000,totalOut:6000,difference:0});
});
