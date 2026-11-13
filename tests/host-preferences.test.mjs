import test from 'node:test';
import assert from 'node:assert/strict';
import {roomRateForHost,hostRateToRemember} from '../src/host-preferences.mjs';
const a={baseCurrency:20,chips:100,chipValues:{Black:50,Red:10}};
const b={baseCurrency:50,chips:100,chipValues:{Blue:1,Green:5}};
test('a host reuses personal defaults without linking room objects',()=>{
 const room=roomRateForHost(a,b);assert.deepEqual(room,a);
 room.chipValues.Black=200;assert.equal(a.chipValues.Black,50);
 assert.deepEqual(roomRateForHost(null,b),b);
 assert.deepEqual(roomRateForHost({chips:0},b),b);
});
test('joining and guest actions never replace personal host defaults',()=>{
 const game={hostId:'host-a',exchangeRate:a};const next={...game,exchangeRate:b};
 assert.equal(hostRateToRemember(game,'guest-b','settings',next),null);
 assert.equal(hostRateToRemember(game,'host-a','enroll',next),null);
 assert.equal(hostRateToRemember(game,'host-a','phase',next),null);
 assert.deepEqual(hostRateToRemember(game,'host-a','settings',next),b);
 assert.deepEqual(game.exchangeRate,a);
});
