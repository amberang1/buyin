import test from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import Panel from '../src/components/ParticipationPanel.tsx';import PaymentTracker from '../src/components/PaymentTracker.tsx';
const player={id:'a',name:'Amber',ownerUid:'guest',buyIns:[20],cashOuts:[],finalStackValue:30};
const props={uid:'guest',host:false,phase:'active',players:[player],requests:[],rate:{baseCurrency:20,chips:100,chipValues:{Blue:1}},ready:true,onAction:async()=>true};
test('restored guest sees their own seat and request form',()=>{const html=renderToStaticMarkup(React.createElement(Panel,props));assert.match(html,/Your seat · Amber/);assert.match(html,/Send to host/);assert.doesNotMatch(html,/Your name<input/);});
test('guest sees their request status and cannot approve requests or view another guest history',()=>{
 const requests=[{id:'one',uid:'guest',playerId:'a',playerName:'Amber',kind:'buyIn',amount:20,status:'rejected',reason:'Not received',createdAt:'2026-11-13'}, {id:'two',uid:'other',playerId:'b',playerName:'PrivateOther',kind:'claim',amount:0,status:'requested',createdAt:'2026-11-13'}];
 const html=renderToStaticMarkup(React.createElement(Panel,{...props,requests}));assert.match(html,/Rejected/);assert.match(html,/Not received/);assert.doesNotMatch(html,/PrivateOther/);assert.doesNotMatch(html,/>Confirm<\/button>/);
});
test('new late arrival can enter a name and initial buy-in',()=>{const html=renderToStaticMarkup(React.createElement(Panel,{...props,uid:'late'}));assert.match(html,/Your name/);assert.match(html,/Initial buy-in/);assert.match(html,/Join as a player/);});
test('partial payout shows actual unpaid balance and guest has no payment controls',()=>{const html=renderToStaticMarkup(React.createElement(PaymentTracker,{player,payment:{paidCents:1000},canEdit:false}));assert.match(html,/Partly paid/);assert.match(html,/\$20\.00/);assert.doesNotMatch(html,/Mark fully paid|Save amount/);});
test('fully paid and zero payout states are distinct',()=>{assert.match(renderToStaticMarkup(React.createElement(PaymentTracker,{player,payment:{paidCents:3000},canEdit:false})),/>Paid</);assert.match(renderToStaticMarkup(React.createElement(PaymentTracker,{player:{...player,finalStackValue:0},canEdit:false})),/No payout due/);});
test('one-device operator is not required to register their own player seat',()=>{
 const html=renderToStaticMarkup(React.createElement(Panel,{...props,uid:'host',host:true}));
 assert.match(html,/Manage the table/);assert.match(html,/Link my own player seat \(optional\)/);assert.doesNotMatch(html,/Join as a player|Initial buy-in/);
});
