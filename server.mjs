import { canScanRoom } from './src/scan-policy.mjs';
import { isRoomCode, createRoomCode } from './src/room-codes.mjs';
import { mutateParticipation, participationActions, assertNoPending, reverseUndoneRequest, canAccessLedger } from './src/participation.mjs';
import { validateSettings } from './src/ledger.mjs';
import { mutateRoom } from './src/mutations.mjs';
import 'dotenv/config';
import express from 'express';
import { parseStackScan } from './src/ledger.mjs';
import { GoogleAuth } from 'google-auth-library';
import { randomInt } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(root, 'firebase-applet-config.json'), 'utf8'));
const app = express();
app.disable('x-powered-by');
const roomPattern = /^[a-f0-9]{32}$/;
const types = new Set(['image/jpeg','image/png','image/webp']);
const colorPattern = /^[A-Za-z][A-Za-z -]{0,29}$/;
const buckets = new Map();
let windowStart = Date.now(), total = 0, inFlight = 0;
function take(uid) {
  const now = Date.now();
  if (now - windowStart >= 60000) { buckets.clear(); total = 0; windowStart = now; }
  const count = buckets.get(uid) || 0;
  if (count >= 6 || total >= 30 || inFlight >= 3) return false;
  buckets.set(uid, count + 1); total++; return true;
}

// The server alone can allocate or redeem short codes. ADC uses the runtime's
// service account; never place credentials in the browser or repository.
const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore'] });
const dbName = 'projects/' + config.projectId + '/databases/' + (config.firestoreDatabaseId || '(default)');
const documents = 'https://firestore.googleapis.com/v1/' + dbName + '/documents';
const fullName = name => dbName + '/documents/' + name;

const sv = stringValue => ({ stringValue });
const nv = n => ({ doubleValue: n });
async function firestoreRequest(url, method = 'GET', data) {
  const client = await googleAuth.getClient();
  return (await client.request({ url, method, data, timeout: 10000, retry: false })).data;
}
async function readDocument(name) {
  try { return await firestoreRequest(documents + '/' + name); }
  catch (error) { if (error.response?.status === 404) return null; throw error; }
}
function writeDocument(name, fields, mustBeNew = false) {
  return { update: { name: fullName(name), fields }, ...(mustBeNew ? { currentDocument: { exists: false } } : {}) };
}
async function commit(writes) { return firestoreRequest(documents + ':commit', 'POST', { writes }); }
function conflict(error) {
  return ['ALREADY_EXISTS', 'ABORTED', 'FAILED_PRECONDITION'].includes(error.response?.data?.error?.status) || error.response?.status === 409;
}
async function identify(req) {
  const token = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '')?.[1];
  if (!token || token.length > 8192) return null;
  const result = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(config.apiKey), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(8000)
  });
  if (!result.ok) return null;
  const user = (await result.json()).users?.[0];
  return user?.localId && !user.disabled ? user.localId : null;
}
function validRate(rate) {try{validateSettings(rate);return true;}catch{return false;}}
function rateFields(rate) {
  return { mapValue: { fields: { baseCurrency: nv(rate.baseCurrency), chips: nv(rate.chips),
    chipValues: { mapValue: { fields: Object.fromEntries(Object.entries(rate.chipValues).map(([k,v]) => [k,nv(v)])) } } } } };
}
// Limits are intentionally conservative for a private MVP. Use a gateway or
// shared rate-limit store before running more than one production instance.
const roomLimits = new Map();
let roomWindow = Date.now();
function permit(key, limit) {
  const now = Date.now();
  if (now - roomWindow >= 60000) { roomWindow = now; roomLimits.clear(); }
  const count = roomLimits.get(key) || 0;
  if (count >= limit) return false;
  roomLimits.set(key, count + 1); return true;
}
app.post('/api/rooms/:action', express.json({ limit: '16kb' }), async (req,res) => {
  res.set('Cache-Control','no-store');
  const action = req.params.action;
  if (!['create','join'].includes(action)) return res.status(404).json({ error: 'Not found.' });
  if (!permit('global:' + action, action === 'join' ? 30 : 15) ||
      !permit('ip:' + action + ':' + req.ip, 15)) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  try {
    const uid = await identify(req);
    if (!uid) return res.status(401).json({ error: 'Could not connect securely. Reload and retry.' });
    if (!permit('user:' + action + ':' + uid, action === 'join' ? 5 : 3)) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
    if (action === 'create') {
      const { gameId, exchangeRate } = req.body || {};
      if (typeof gameId !== 'string' || !roomPattern.test(gameId) || !validRate(exchangeRate)) return res.status(400).json({ error: 'Invalid room settings.' });
      const gamePath = 'games/' + gameId;
      const existing = await readDocument(gamePath);
      if (existing) {
        if (existing.fields?.hostId?.stringValue !== uid) return res.status(409).json({ error: 'Room ID unavailable.' });
        const existingCode = existing.fields?.roomCode?.stringValue;
        if (!isRoomCode(existingCode || '')) return res.status(409).json({ error: 'Existing room uses an older invitation format.' });
        return res.json({ gameId, roomCode: existingCode });
      }
      for (let i=0; i<64; i++) {
        const roomCode = createRoomCode(randomInt);
        try {
          await commit([
            writeDocument(gamePath, { hostId: sv(uid), roomCode: sv(roomCode), status: sv('setup'),
              createdAt: sv(new Date().toISOString()), exchangeRate: rateFields(exchangeRate) }, true),
            writeDocument('roomCodes/' + roomCode, { gameId: sv(gameId) }, true)
          ]);
          return res.json({ gameId, roomCode });
        } catch (error) {
          if (!conflict(error)) throw error;
          const created = await readDocument(gamePath);
          if (created?.fields?.hostId?.stringValue === uid && isRoomCode(created.fields?.roomCode?.stringValue || '')) {
            return res.json({ gameId, roomCode: created.fields.roomCode.stringValue });
          }
          if (created) return res.status(409).json({ error: 'Room ID unavailable.' });
        }
      }
      return res.status(503).json({ error: 'Could not allocate a room code. Try again.' });
    }
    const { code } = req.body || {};
    if (typeof code !== 'string' || !isRoomCode(code)) return res.status(400).json({ error: 'Enter a four-digit room code (existing six-digit codes also work).' });
    const invitation = await readDocument('roomCodes/' + code);
    const gameId = invitation?.fields?.gameId?.stringValue;
    if (!gameId || !roomPattern.test(gameId)) return res.status(404).json({ error: 'Room not found or closed.' });
    const gamePath = 'games/' + gameId;
    const memberPath = gamePath + '/members/' + uid;
    for (let i=0; i<3; i++) {
      const room = await readDocument(gamePath);
      if (!room || room.fields?.roomCode?.stringValue !== code) break;
      if (room.fields?.hostId?.stringValue === uid || await readDocument(memberPath)) return res.json({ gameId, roomCode: code });
      if (room.fields?.status?.stringValue === 'results') break;
      try {
        await commit([
          { update: { name: fullName(gamePath), fields: { roomCode: sv(code) } }, updateMask: { fieldPaths: ['roomCode'] }, currentDocument: { updateTime: room.updateTime } },
          writeDocument(memberPath, { uid: sv(uid) })
        ]);
        return res.json({ gameId, roomCode: code });
      } catch (error) { if (!conflict(error)) throw error; }
    }
    return res.status(404).json({ error: 'Room not found or closed.' });
  } catch {
    return res.status(503).json({ error: 'Room service unavailable. Please retry.' });
  }
});

// Financial writes are server-only and serialize against the complete room roster.
function decode(value) {
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values||[]).map(decode);
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  return null;
}
function encode(value) {
  if(value===null)return {nullValue:null};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='number')return {doubleValue:value};
  if(typeof value==='boolean')return {booleanValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
}
app.post('/api/ledger', express.json({limit:'6mb'}), async(req,res)=>{
  res.set('Cache-Control','no-store');
  let transaction;
  try {
    const uid=await identify(req);
    if(!uid)return res.status(401).json({error:'Reconnect before editing.'});
    const {gameId,requestId,action,data}=req.body||{};
    if(!roomPattern.test(gameId||'')||!/^[a-f0-9-]{36}$/.test(requestId||'')||!data)return res.status(400).json({error:'Invalid ledger request.'});
    for(let attempt=0;attempt<4;attempt++){
      transaction=(await firestoreRequest(documents+':beginTransaction','POST',{options:{readWrite:{}}})).transaction;
      try {
        const read=async name=>{
          try{return await firestoreRequest(documents+'/'+name+'?transaction='+encodeURIComponent(transaction));}
          catch(e){if(e.response?.status===404)return null;throw e;}
        };
        const gameDoc=await read('games/'+gameId);
        const game=gameDoc?decode({mapValue:{fields:gameDoc.fields}}):null;
        if(!canAccessLedger(game,uid,!!(game&&game.hostId!==uid&&await read('games/'+gameId+'/members/'+uid)),action)){await firestoreRequest(documents+':rollback','POST',{transaction});transaction=null;return res.status(403).json({error:'Room access denied.'});}
        const receipt='games/'+gameId+'/operations/'+uid+'-'+requestId;
        if(await read(receipt)||(game.hostId===uid&&await read('games/'+gameId+'/operations/'+requestId))){await firestoreRequest(documents+':rollback','POST',{transaction});transaction=null;return res.json({ok:true});}
        const query=await firestoreRequest(documents+'/games/'+gameId+':runQuery','POST',{transaction,structuredQuery:{from:[{collectionId:'players'}]}});
        const original=query.filter(r=>r.document).map(r=>decode({mapValue:{fields:r.document.fields}})).sort((a,b)=>a.id.localeCompare(b.id));
        const readCollection=async collectionId=>{
          const rows=await firestoreRequest(documents+'/games/'+gameId+':runQuery','POST',{transaction,structuredQuery:{from:[{collectionId}]}});
          return rows.filter(r=>r.document).map(r=>decode({mapValue:{fields:r.document.fields}}));
        };
        const requests=await readCollection('requests');
        const payments=action==='payment'?await readCollection('payments'):[];
        let next;
        if(participationActions.includes(action))next=mutateParticipation(game,original,requests,payments,uid,action,data,requestId,new Date().toISOString());
        else {assertNoPending(requests,action,data);next=mutateRoom(game,original,action,action==='addPlayer'?{...data,id:requestId}:data);if(action==='undo')next.requests=reverseUndoneRequest(requests,original,data,uid,new Date().toISOString());}

        const writes=[writeDocument('games/'+gameId,encode(next.game).mapValue.fields)];
        for(const player of next.players){
          if(JSON.stringify(player)!==JSON.stringify(original.find(p=>p.id===player.id)))writes.push(writeDocument('games/'+gameId+'/players/'+player.id,encode(player).mapValue.fields));
        }
        for(const player of original)if(!next.players.some(p=>p.id===player.id))writes.push({delete:fullName('games/'+gameId+'/players/'+player.id)});
        for(const item of next.requests||[])if(JSON.stringify(item)!==JSON.stringify(requests.find(r=>r.id===item.id)))writes.push(writeDocument('games/'+gameId+'/requests/'+item.id,encode(item).mapValue.fields));
        for(const item of next.payments||[])if(JSON.stringify(item)!==JSON.stringify(payments.find(p=>p.playerId===item.playerId)))writes.push(writeDocument('games/'+gameId+'/payments/'+item.playerId,encode(item).mapValue.fields));
        writes.push(writeDocument(receipt,{action:sv(action),createdAt:sv(new Date().toISOString())},true));
        await firestoreRequest(documents+':commit','POST',{transaction,writes});transaction=null;
        return res.json({ok:true});
      } catch(error){
        if(transaction)await firestoreRequest(documents+':rollback','POST',{transaction}).catch(()=>{});transaction=null;
        if(conflict(error)&&attempt<3)continue;
        if(!error.response)return res.status(400).json({error:error.message||'Invalid ledger change.'});
        throw error;
      }
    }
  }catch{ return res.status(503).json({error:'Could not save. Retry the same action; duplicate requests are ignored.'}); }
});

app.post('/api/scan', express.json({ limit: '4100kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '')?.[1];
  if (!token || token.length > 8192) return res.status(401).json({ error: 'Authentication required.' });
  const { gameId, mode, mimeType, image } = req.body || {};
  if (typeof gameId !== 'string' || !roomPattern.test(gameId) || !['colors','stack','check'].includes(mode) ||
      !types.has(mimeType) || typeof image !== 'string' || image.length < 16 || image.length > 4000000 ||
      image.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return res.status(400).json({ error: 'Invalid scan input.' });
  try {
    // Validate the Firebase ID token against this project using Identity Toolkit.
    const identity = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(config.apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(8000)
    });
    if (!identity.ok) return res.status(401).json({ error: 'Invalid or expired sign-in.' });
    const account = (await identity.json()).users?.[0];
    if (!account?.localId || account.disabled) return res.status(401).json({ error: 'Invalid account.' });
    // Use the caller's token so Firestore authorization rules also apply.
    const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(config.projectId) +
      '/databases/' + encodeURIComponent(config.firestoreDatabaseId || '(default)') + '/documents/games/' + gameId;
    const room = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
    if (!room.ok) return res.status(403).json({ error: 'Room access denied.' });
    const fields = (await room.json()).fields || {};
    if (!canScanRoom(mode,fields.status?.stringValue,fields.hostId?.stringValue === account.localId,true)) return res.status(403).json({ error: 'This scan is not available for your role or game stage.' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI scanning is not configured.' });
    let prompt = 'Identify the distinct main poker chip colors in this photo. Return only a comma-separated list of color names.';
    let denominations;
    if (mode === 'stack' || mode === 'check') {
      const values = fields.exchangeRate?.mapValue?.fields?.chipValues?.mapValue?.fields || {};
      const entries = Object.entries(values);
      if (!entries.length || entries.length > 30 || entries.some(([name,v]) => {
        const n = Number(v.integerValue ?? v.doubleValue);
        return !colorPattern.test(name) || !Number.isFinite(n) || n < 0 || n > 1000000;
      })) return res.status(400).json({ error: 'Invalid chip denominations.' });
      denominations = Object.fromEntries(entries.map(([name,v]) => [name, Number(v.integerValue ?? v.doubleValue)]).filter(([,v])=>v>0));
      if (!Object.keys(denominations).length) return res.status(400).json({error:'Set positive chip denominations in setup first.'});
      prompt = 'Count individual poker chips by their MAIN color, using ONLY these configured color names: ' + JSON.stringify(Object.keys(denominations)) + '. Count visible stack edges and separate stacks, never treat edge stripes as separate chips. Never invent a hidden count. Report uncertain, obscured or unmatched chips in warnings. Return JSON only: {"counts":[{"color":"exact configured name","count":integer}],"warnings":["short warning"]}. If no chips can be identified, return empty counts. Do not calculate the total.';
    }
    if (!take(account.localId)) return res.status(429).json({ error: 'Scan limit reached. Try again in a minute.' });
    inFlight++;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const answer = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        contents: { parts: [{ inlineData: { mimeType, data: image } }, { text: prompt }] },
        ...((mode === "stack" || mode === "check") ? { config: { responseMimeType: "application/json" } } : {})
      });
      const raw = answer.text?.trim() || '';
      if (mode === 'stack' || mode === 'check') {
        try {
          const review = parseStackScan(raw, denominations);
          if(mode==='check'){
            const config=fields.exchangeRate.mapValue.fields;
            review.context={baseCurrency:Number(config.baseCurrency.integerValue??config.baseCurrency.doubleValue),chips:Number(config.chips.integerValue??config.chips.doubleValue),chipValues:denominations};
          }
          return res.json({ result: JSON.stringify(review) });
        }
        catch { return res.status(422).json({ error: 'Could not identify a reliable chip count. Try a clearer photo or enter manually.' }); }
      }
      const names = raw.split(',').map(x => x.trim());
      if (!names.length || names.length > 30 || names.some(x => !colorPattern.test(x) || ['constructor','prototype'].includes(x.toLowerCase()))) return res.status(422).json({ error: 'Unreliable colors. Enter manually.' });
      return res.json({ result: names.join(', ') });
    } finally { inFlight--; }
  } catch {
    // Do not log credentials, images or provider errors.
    return res.status(502).json({ error: 'Scan unavailable. Please try again or enter values manually.' });
  }
});
app.use('/api', (_req,res) => res.status(404).json({ error: 'Not found.' }));
app.use((error,_req,res,next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Image too large.' });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  return next(error);
});
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.join(root,'dist');
  app.use(express.static(dist));
  app.get('*', (_req,res) => res.sendFile(path.join(dist,'index.html')));
}
app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
