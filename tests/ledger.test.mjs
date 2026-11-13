import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyCents, sumCents, chipsToCents, cashToChips, chipTotal, ledger } from '../src/ledger.mjs';
const rate = {baseCurrency:20,chips:100,chipValues:{Red:5,Green:25,Black:100}};
const players = [{id:'a',name:'A',buyIns:[20,20],cashOuts:[10],finalStackValue:50},{id:'b',name:'B',buyIns:[20],cashOuts:[],finalStackValue:0}];
test('denomination math and cash conversion',()=>{assert.equal(chipTotal({Red:10,Green:2,Black:1},rate.chipValues),200);assert.equal(chipsToCents(200,rate),4000);assert.equal(cashToChips(40,rate),200)});
test('rebuy and mid-game cash-out are accounted once',()=>{const result=ledger(players);assert.equal(result.tableCents,5000);assert.equal(result.differenceCents,0);assert.deepEqual(result.balances.map(p=>p.netCents),[2000,-2000])});
test('cent precision and one-cent mismatch',()=>{assert.equal(sumCents([.1,.2]),30);assert.equal(ledger([{...players[0],finalStackValue:49.99},players[1]]).differenceCents,1)});
test('zero stack allowed; invalid rate, negative/fractional counts and unknown colors rejected',()=>{assert.equal(chipsToCents(0,rate),0);assert.throws(()=>chipsToCents(1,{...rate,chips:0}));assert.throws(()=>chipTotal({Red:-1},rate.chipValues));assert.throws(()=>chipTotal({Red:1.5},rate.chipValues));assert.throws(()=>chipTotal({Pink:1},rate.chipValues));assert.throws(()=>moneyCents(-1))});
