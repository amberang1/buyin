import test from 'node:test';import assert from 'node:assert/strict';
import{isRoomCode,createRoomCode}from'../src/room-codes.mjs';
import{replaceInitialBuyIn,sumCents}from'../src/ledger.mjs';
test('four-digit codes retain leading zeros and six-digit rooms remain joinable',()=>{for(const c of ['0000','0007','1234','9999','000007','123456'])assert.equal(isRoomCode(c),true);for(const c of ['123','12345','1234567','12a4',' 1234',1234,null])assert.equal(isRoomCode(c),false);});
test('new codes are allocated from the four-digit namespace',()=>{for(const n of [0,7,9999]){const c=createRoomCode((min,max)=>{assert.equal(min,0);assert.equal(max,10000);return n;});assert.equal(c.length,4);assert.equal(isRoomCode(c),true);assert.equal(Number(c),n);}});
test('editing initial buy-in preserves later confirmed entries',()=>{const entries=[20,10,5];const next=replaceInitialBuyIn(entries,30);assert.deepEqual(next,[30,10,5]);assert.equal(sumCents(next),4500);assert.deepEqual(entries,[20,10,5]);assert.deepEqual(replaceInitialBuyIn([],20),[20]);});
