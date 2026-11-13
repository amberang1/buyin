import test from 'node:test';import assert from 'node:assert/strict';
import {canScanRoom} from '../src/scan-policy.mjs';
import {chipCheckSummary,readChipCheck} from '../src/chip-check.mjs';
const rate={baseCurrency:20,chips:100,chipValues:{Black:50,Red:10,Green:5,Blue:1}};
test('hosts and guests can privately check chips at every game stage',()=>{
 for(const stage of ['setup','active','settlement','results'])for(const host of [true,false])assert.equal(canScanRoom('check',stage,host,true),true);
});
test('strangers and invalid stages cannot access a chip check',()=>{
 for(const stage of ['setup','active','settlement','results'])assert.equal(canScanRoom('check',stage,true,false),false);
 assert.equal(canScanRoom('check','home',false,true),false);assert.equal(canScanRoom('unknown','active',true,true),false);
});
test('quick check does not widen access to host-only settlement or settings scans',()=>{
 assert.equal(canScanRoom('stack','settlement',false,true),false);assert.equal(canScanRoom('colors','setup',false,true),false);
 assert.equal(canScanRoom('stack','active',true,true),false);assert.equal(canScanRoom('stack','settlement',true,true),true);
 assert.equal(canScanRoom('colors','setup',true,true),true);
});
test('color counts calculate total chip value and cash separately',()=>{
 const counts={Black:2,Red:3,Green:4,Blue:5};assert.deepEqual(chipCheckSummary(counts,rate),{units:155,cents:3100});assert.deepEqual(counts,{Black:2,Red:3,Green:4,Blue:5});
});
test('review retains AI warnings, rejects invalid counts and supports an edited empty stack',()=>{
 const response={counts:{Black:2,Red:1},warnings:['Some chips are obscured'],context:rate};
 const review=readChipCheck(JSON.stringify(response),rate);assert.deepEqual(review.warnings,response.warnings);
 assert.deepEqual(chipCheckSummary({Black:0},rate),{units:0,cents:0});
 for(const counts of [{Black:-1},{Red:1.5},{Blue:NaN},{Purple:1},{Black:10001},null])assert.throws(()=>chipCheckSummary(counts,rate));
 assert.throws(()=>readChipCheck(JSON.stringify({...response,warnings:[5]}),rate));
});
test('stale scans cannot be priced with a different rate or denomination',()=>{
 const response=JSON.stringify({counts:{Black:2},warnings:[],context:rate});
 assert.throws(()=>readChipCheck(response,{...rate,baseCurrency:10}));
 assert.throws(()=>readChipCheck(response,{...rate,chipValues:{...rate.chipValues,Black:100}}));
 assert.throws(()=>readChipCheck(JSON.stringify({counts:{Black:2},warnings:[]}),rate));
 assert.doesNotThrow(()=>readChipCheck(response,{...rate,chipValues:{Blue:1,Green:5,Red:10,Black:50,Yellow:0}}));
});
