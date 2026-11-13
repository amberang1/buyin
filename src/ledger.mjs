export function moneyCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000) throw new Error('Invalid money amount');
  return Math.round((value + Number.EPSILON) * 100);
}

export function sumCents(values) { return values.reduce((total, value) => total + moneyCents(value), 0); }

export function validRate(rate) { return !!rate && Number.isFinite(rate.baseCurrency) && rate.baseCurrency > 0 && rate.baseCurrency <= 1000000 && Number.isFinite(rate.chips) && rate.chips > 0 && rate.chips <= 100000000; }

export function chipsToCents(units, rate) { if (!validRate(rate) || typeof units !== 'number' || !Number.isFinite(units) || units < 0) throw new Error('Invalid chip value or rate'); return moneyCents(units * rate.baseCurrency / rate.chips); }

export function cashToChips(cash, rate) { if (!validRate(rate)) throw new Error('Invalid rate'); return moneyCents(cash) / 100 * rate.chips / rate.baseCurrency; }

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
