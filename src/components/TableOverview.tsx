import React from 'react';
import type {Player,ExchangeRate,Phase} from '../types';
import {sumCents,formatMoney,cashToChips} from '../ledger.mjs';
export default function TableOverview({players,rate,phase}:{players:Player[];rate:ExchangeRate;phase:Phase}){
 return <section className="club-card p-5 space-y-4"><div><h2 className="text-xl font-bold">At the table</h2><p className="text-sm text-on-surface-variant">{phase==='setup'?'The host is getting the game ready.':phase==='settlement'?'Everyone is counting their remaining chips.':'Confirmed entries for this game.'}</p></div>
 {players.length===0?<p className="text-sm">No players yet. Add your name above.</p>:players.map(p=><div key={p.id} className="flex justify-between gap-3 border-t border-outline-variant/20 pt-3"><span className="font-bold">{p.name}</span><div className="text-right text-sm"><p>{cashToChips(sumCents(p.buyIns)/100,rate)} chips bought in</p><p className="text-on-surface-variant">{formatMoney(sumCents(p.cashOuts))} cashed out</p></div></div>)}
 </section>;
}
