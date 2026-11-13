import 'dotenv/config';
import express from 'express';
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
const codePattern = /^\d{6}$/;
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
function validRate(rate) {
  if (!rate || !Number.isFinite(rate.baseCurrency) || rate.baseCurrency <= 0 || rate.baseCurrency > 1000000 ||
      !Number.isFinite(rate.chips) || rate.chips <= 0 || rate.chips > 100000000 ||
      !rate.chipValues || typeof rate.chipValues !== 'object' || Array.isArray(rate.chipValues)) return false;
  const values = Object.entries(rate.chipValues);
  return values.length <= 30 && values.every(([k,v]) => colorPattern.test(k) &&
    !['constructor','prototype'].includes(k.toLowerCase()) && Number.isFinite(v) && v >= 0 && v <= 1000000);
}
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
        if (!codePattern.test(existingCode || '')) return res.status(409).json({ error: 'Existing room uses an older invitation format.' });
        return res.json({ gameId, roomCode: existingCode });
      }
      for (let i=0; i<12; i++) {
        const roomCode = String(randomInt(0,1000000)).padStart(6,'0');
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
          if (created?.fields?.hostId?.stringValue === uid && codePattern.test(created.fields?.roomCode?.stringValue || '')) {
            return res.json({ gameId, roomCode: created.fields.roomCode.stringValue });
          }
          if (created) return res.status(409).json({ error: 'Room ID unavailable.' });
        }
      }
      return res.status(503).json({ error: 'Could not allocate a room code. Try again.' });
    }
    const { code } = req.body || {};
    if (typeof code !== 'string' || !codePattern.test(code)) return res.status(400).json({ error: 'Enter a six-digit room code.' });
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
          { verify: fullName(gamePath), currentDocument: { updateTime: room.updateTime } },
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

app.post('/api/scan', express.json({ limit: '4100kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '')?.[1];
  if (!token || token.length > 8192) return res.status(401).json({ error: 'Authentication required.' });
  const { gameId, mode, mimeType, image } = req.body || {};
  if (typeof gameId !== 'string' || !roomPattern.test(gameId) || !['colors','stack'].includes(mode) ||
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
    if (fields.hostId?.stringValue !== account.localId ||
        fields.status?.stringValue !== (mode === 'colors' ? 'setup' : 'settlement')) return res.status(403).json({ error: 'Only the host can scan in this phase.' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI scanning is not configured.' });
    let prompt = 'Identify the distinct poker chip colors in this photo. Return only a comma-separated list of color names.';
    if (mode === 'stack') {
      const values = fields.exchangeRate?.mapValue?.fields?.chipValues?.mapValue?.fields || {};
      const entries = Object.entries(values);
      if (!entries.length || entries.length > 30 || entries.some(([name,v]) => {
        const n = Number(v.integerValue ?? v.doubleValue);
        return !colorPattern.test(name) || !Number.isFinite(n) || n < 0 || n > 1000000;
      })) return res.status(400).json({ error: 'Invalid chip denominations.' });
      const denominations = Object.fromEntries(entries.map(([name,v]) => [name, Number(v.integerValue ?? v.doubleValue)]));
      prompt = 'Estimate the total chip denomination value in this photo using this mapping: ' + JSON.stringify(denominations) + '. Return only a non-negative number. Return 0 if no chips are visible.';
    }
    if (!take(account.localId)) return res.status(429).json({ error: 'Scan limit reached. Try again in a minute.' });
    inFlight++;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const answer = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
        contents: { parts: [{ inlineData: { mimeType, data: image } }, { text: prompt }] }
      });
      const raw = answer.text?.trim() || '';
      if (mode === 'stack') {
        if (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) > 100000000) return res.status(422).json({ error: 'Unreliable scan. Enter manually.' });
        return res.json({ result: raw });
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
