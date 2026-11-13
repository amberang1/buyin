export function moneyCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000) throw new Error('Invalid money amount');
  return Math.round(Number(value.toFixed(8)) * 100 + 1e-6);
}

export function sumCents(values) { return values.reduce((total, value) => total + moneyCents(value), 0); }

export function validRate(rate) { return !!rate && Number.isFinite(rate.baseCurrency) && rate.baseCurrency > 0 && rate.baseCurrency <= 1000000 && Number.isFinite(rate.chips) && rate.chips > 0 && rate.chips <= 100000000; }

export function chipsToCents(units, rate) { if (!validRate(rate) || typeof units !== 'number' || !Number.isFinite(units) || units < 0) throw new Error('Invalid chip value or rate'); return moneyCents(units * rate.baseCurrency / rate.chips); }

export function cashToChips(cash, rate) { if (!validRate(rate)) throw new Error('Invalid rate'); if (!Number.isFinite(cash) || cash < 0 || !Number.isSafeInteger(Math.round(cash * 100))) throw new Error('Invalid table total'); return Math.round(cash * 100) / 100 * rate.chips / rate.baseCurrency; }

export function chipTotal(counts, denominations) {
  let total = 0;
  for (const [color, count] of Object.entries(counts)) {
    const value = denominations[color];
    if (!Object.hasOwn(denominations,color) || !Number.isSafeInteger(count) || count < 0 || !Number.isFinite(value) || value <= 0) throw new Error('Invalid chip count or denomination');
    total += count * value;
    if (!Number.isFinite(total) || total > 100000000) throw new Error('Chip total too large');
  }
  return total;
}

export function ledger(players) {
  const balances = players.map(p => {
    const inCents = sumCents(p.buyIns), midCents = sumCents(p.cashOuts), finalCents = moneyCents(p.finalStackValue);
    return {...p,inCents,midCents,finalCents,outCents:midCents+finalCents,netCents:midCents+finalCents-inCents};
  });
  const inCents = balances.reduce((s,p)=>s+p.inCents,0), midCents = balances.reduce((s,p)=>s+p.midCents,0), finalCents = balances.reduce((s,p)=>s+p.finalCents,0);
  return {balances,inCents,midCents,finalCents,tableCents:inCents-midCents, differenceCents:inCents-midCents-finalCents};
}

export function formatMoney(cents) { return (cents<0?'-':'')+'$'+(Math.abs(cents)/100).toFixed(2); }

export const cents = moneyCents;
export const money = n => (n / 100).toFixed(2);
export const chipCents = (chips, rate) => chipsToCents(Number(chips), rate);
export function balance(player) {
  const inCents = sumCents(player.buyIns);
  const outCents = sumCents(player.cashOuts) + moneyCents(player.finalStackValue);
  return { inCents, outCents, netCents: outCents - inCents };
}
export function stackTotal(counts, values) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new Error('Invalid count.');
  if (Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0 || n > 10000)) throw new Error('Invalid chip count.');
  return Math.round(chipTotal(counts, values) * 1000000) / 1000000;
}
export function parseStackScan(raw, values) {
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.counts) || !Array.isArray(data.warnings) ||
      data.counts.length > 30 || data.warnings.length > 10 ||
      data.warnings.some(w => typeof w !== 'string' || w.length > 240)) throw new Error('Invalid scan response.');
  const counts = Object.create(null);
  for (const row of data.counts) {
    if (!row || typeof row.color !== 'string' || Object.hasOwn(counts, row.color)) throw new Error('Invalid or duplicate chip color.');
    counts[row.color] = row.count;
  }
  const total = stackTotal(counts, values);
  if (!Object.values(counts).some(n => n > 0)) throw new Error('No identifiable chips. Enter zero manually for an empty stack.');
  return { counts, warnings: data.warnings, total };
}
export function reconciliation(players) {
  const rows = players.map(balance);
  const totalIn = rows.reduce((n,p)=>n+p.inCents,0);
  const totalOut = rows.reduce((n,p)=>n+p.outCents,0);
  return { totalIn, totalOut, difference: totalIn-totalOut };
}


export function validateSettings(rate) {
  if (!validRate(rate) || !rate.chipValues || typeof rate.chipValues !== 'object' || Array.isArray(rate.chipValues)) throw new Error('Invalid table settings.');
  const entries=Object.entries(rate.chipValues), names=new Set();
  if(entries.length>30)throw new Error('Use at most 30 chip colors.');
  for(const [name,value] of entries){
    const key=name.toLowerCase();
    if(!/^[A-Za-z][A-Za-z -]{0,29}$/.test(name)||['constructor','prototype'].includes(key)||names.has(key))throw new Error('Use unique chip color names.');
    if(!Number.isFinite(value)||value<0||value>1000000)throw new Error('Chip values must be between 0 and 1,000,000.');
    names.add(key);
  }
}
// Allocate unavoidable fractional cents without changing the actual chip counts.
export function allocateStacks(players, stacks, rate) {
  const available=ledger(players).tableCents;
  const rows=players.map(p=>{
    const text=stacks?.[p.id];
    if(text===undefined||String(text).trim()===''||!Number.isFinite(Number(text))||Number(text)<0||Number(text)>100000000)throw new Error('Enter every final stack, including zero.');
    const rounded=chipsToCents(Number(text),rate);
    const raw=Number(text)*rate.baseCurrency/rate.chips*100;
    return {p,raw,rounded,cents:Math.floor(raw+1e-8)};
  });
  const expectedRaw=ledger(players).inCents-priorCashOutUnits(players,rate)*rate.baseCurrency/rate.chips*100;
  if(Math.abs(rows.reduce((s,r)=>s+r.raw,0)-expectedRaw)>1e-5)throw new Error('Chip values do not match the remaining table balance. Correct the counts before finalizing.');
  let remaining=available-rows.reduce((s,r)=>s+r.cents,0);
  const sorted=[...rows].sort((a,b)=>(b.raw-b.cents)-(a.raw-a.cents)||a.p.id.localeCompare(b.p.id));
  if(remaining<0||remaining>rows.length)throw new Error('Unable to reconcile rounding.');
  for(let i=0;i<remaining;i++)sorted[i].cents++;
  return rows.map(r=>({...r.p,finalStackValue:r.cents/100}));
}

export function priorCashOutUnits(players,rate){return players.reduce((s,p)=>s+(p.cashOutChipUnits?p.cashOutChipUnits.reduce((a,b)=>a+b,0):sumCents(p.cashOuts)/100*rate.chips/rate.baseCurrency),0);}
export function cashOutCents(players,units,rate){
  chipsToCents(units,rate);
  const totals=ledger(players);
  const raw=(priorCashOutUnits(players,rate)+units)*rate.baseCurrency/rate.chips*100;
  if(raw-totals.inCents>1e-5)throw new Error('Cash-out exceeds the chips remaining on the table.');
  return Math.round(raw+1e-6)-totals.midCents;
}

export function replaceInitialBuyIn(buyIns,amount){
  sumCents(buyIns);
  const cents=moneyCents(amount);if(cents<=0)throw new Error('Enter a positive buy-in.');
  return [cents/100,...buyIns.slice(1)];
}
