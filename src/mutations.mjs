import { moneyCents, chipsToCents, ledger, validRate, allocateStacks, validateSettings, cashOutCents, priorCashOutUnits } from './ledger.mjs';
const canonical = v => Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fail = message => { throw new Error(message); };
export function validatePlayer(p) {
  if (!p || typeof p.id !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 49) fail('Invalid player.');
  for (const key of ['buyIns','cashOuts']) {
    if (!Array.isArray(p[key]) || p[key].length > 100) fail('Invalid transaction list.');
    for (const value of p[key]) if (moneyCents(value) <= 0 || Math.abs(value * 100 - moneyCents(value)) > 0.00001) fail('Use positive whole-cent amounts.');
  }
  if(p.ownerUid!==undefined&&(typeof p.ownerUid!=='string'||!p.ownerUid||p.ownerUid.length>128))fail('Invalid seat identity.');
  moneyCents(p.finalStackValue);
  if(p.cashOutChipUnits!==undefined&&(!Array.isArray(p.cashOutChipUnits)||p.cashOutChipUnits.length!==p.cashOuts.length||p.cashOutChipUnits.some(v=>!Number.isFinite(v)||v<=0||v>100000000)))fail('Invalid chip transaction record.');
  if (p.photoUrl !== undefined && (typeof p.photoUrl !== 'string' || p.photoUrl.length > 180000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.photoUrl))) fail('Invalid or oversized photo.');
  if (Object.keys(p).some(k=>!['id','name','buyIns','cashOuts','cashOutChipUnits','finalStackValue','photoUrl','ownerUid'].includes(k))) fail('Unknown player field.');
}
export function mutateRoom(game, original, action, data) {
  const players = structuredClone(original);
  const nextGame = structuredClone(game);
  players.forEach(validatePlayer);
  if (!validRate(game.exchangeRate)) fail('Invalid table rate.');
  if (action === 'settings') {
    if (game.status !== 'setup' || !same(data.expected,game.exchangeRate)) fail('Settings changed. Review the latest values and retry.');
    validateSettings(data.rate); nextGame.exchangeRate=data.rate;
  } else if (action === 'setup') {
    if(game.status!=='setup') fail('Setup is closed.');
    if(!Array.isArray(data.changes)||data.changes.length>30) fail('Invalid player changes.');
    for(const change of data.changes){
      const index=players.findIndex(p=>p.id===change.id), current=index<0?null:players[index];
      if(!same(current,change.before)) fail('A player changed. Review the latest values and retry.');
      if(change.after){if(change.after.ownerUid!==current?.ownerUid)fail('Seat links can only change through approved requests.');validatePlayer(change.after);if(change.after.id!==change.id||change.after.cashOuts.length||change.after.finalStackValue!==0)fail('Invalid setup player.');if(index<0)players.push(change.after);else players[index]=change.after;}
      else if(index>=0)players.splice(index,1);
    }
    if(players.length>30)fail('A room supports up to 30 players.');
  } else if(action==='addPlayer'){
    if(game.status!=='active')fail('Add late players only during active play.');
    if(players.length>=30||players.some(p=>p.id===data.id))fail('Player limit reached or seat already exists.');
    const name=typeof data.name==='string'?data.name.trim():'';
    if(players.some(p=>p.name.trim().toLowerCase()===name.toLowerCase()))fail('That player is already on the list.');
    const amount=moneyCents(data.amount);if(amount<=0)fail('Enter the buy-in received.');
    const player={id:data.id,name,buyIns:[amount/100],cashOuts:[],finalStackValue:0};
    validatePlayer(player);players.push(player);
  } else if(action==='phase'){
    if(game.status!==data.from)fail('Game phase changed. Review the latest screen.');
    if(!['setup:active','active:settlement','settlement:active'].includes(data.from+':'+data.to))fail('Invalid phase transition.');
    if(data.to==='active' && (players.length<2||players.some(p=>!p.buyIns.length)))fail('Add at least two players with buy-ins.');
    nextGame.status=data.to;
  } else if(action==='record'||action==='undo'){
    if(game.status!=='active')fail('The game is no longer active.');
    const p=players.find(p=>p.id===data.playerId);if(!p)fail('Player not found.');
    if(!['buyIn','cashOut'].includes(data.type))fail('Invalid transaction type.');
    const field=data.type==='buyIn'?'buyIns':'cashOuts';
    if(action==='undo'){
      if(!same(p,data.expected))fail('This player changed. Review the ledger and retry.');
      if(p[field].length<=(field==='buyIns'?1:0))fail('No entry to undo.');p[field].pop();if(field==='cashOuts'&&p.cashOutChipUnits)p.cashOutChipUnits.pop();
    }else{
      if(!same(data.rate,game.exchangeRate))fail('Table rate changed. Review the amount.');
      const amount=data.type==='buyIn'?moneyCents(data.amount):cashOutCents(players,data.amount,game.exchangeRate);
      if(amount<=0||p[field].length>=100)fail('Invalid amount or transaction limit reached.');if(field==='cashOuts'){p.cashOutChipUnits=p.cashOutChipUnits||p.cashOuts.map(v=>v*game.exchangeRate.chips/game.exchangeRate.baseCurrency);p.cashOutChipUnits.push(data.amount);}
      p[field].push(amount/100);
    }
    if(ledger(players).tableCents<0||priorCashOutUnits(players,game.exchangeRate)*game.exchangeRate.baseCurrency/game.exchangeRate.chips*100-ledger(players).inCents>1e-5)fail('Transaction exceeds the table balance.');
  }else if(action==='finalize'){
    if(game.status!=='settlement')fail('Settlement is no longer active.');
    if(!same(data.expected,original)||!same(data.rate,game.exchangeRate))fail('The ledger changed. Review the latest values.');
    const allocated=allocateStacks(players,data.stacks,game.exchangeRate);
    players.forEach((p,i)=>{p.finalStackValue=allocated[i].finalStackValue;if(data.photos?.[p.id])p.photoUrl=data.photos[p.id];else delete p.photoUrl;});
    nextGame.status='results';
  }else fail('Unknown action.');
  players.forEach(validatePlayer);
  if(ledger(players).tableCents<0)fail('Negative table balance.');
  return {game:nextGame,players};
}
