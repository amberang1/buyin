import test from 'node:test';import assert from 'node:assert/strict';
import {roomScreen} from '../src/navigation.mjs';
test('live updates cannot pull the user away from Home',()=>{for(const status of ['setup','active','settlement','results'])assert.equal(roomScreen('home',status,true),'home');});
test('a refreshed Home preference stays Home and resume uses the latest room stage',()=>{assert.equal(roomScreen('home','settlement',true),'home');assert.equal(roomScreen('home','settlement',false),'settlement');});
test('room updates preserve Settings and track server stage while viewing a game',()=>{assert.equal(roomScreen('settings','results',true),'settings');assert.equal(roomScreen('active','settlement',false),'settlement');});
