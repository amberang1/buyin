import React from 'react';
import { CheckCircle2, Share2, AlertTriangle, Spade } from 'lucide-react';
import { Player } from '../types';
import { balance, reconciliation, money } from '../ledger.mjs';
type Props = { players:Player[]; onArchive:()=>void; archiveLabel?:string };
export default function ResultsPhase({players,onArchive,archiveLabel="Archive & return home"}:Props){
  const rows=players.map(p=>({...p,...balance(p)}));
  const {totalIn,totalOut,difference}=reconciliation(players);
  const balanced=difference===0;
  const share=async()=>{
    const summary=['Buy In · Final ledger',...rows.map(p=>p.name+': '+(p.netCents>=0?'+':'-')+'$'+money(Math.abs(p.netCents))),
      'Total in: $'+money(totalIn)+' · Total out: $'+money(totalOut),balanced?'Balanced':'Difference: $'+money(difference)].join('\n');
    try{if(navigator.share)await navigator.share({title:'Buy In results',text:summary});else{await navigator.clipboard.writeText(summary);alert('Results copied.');}}
    catch(error){if(!(error instanceof Error&&error.name==='AbortError'))window.prompt('Copy results',summary);}
  };
  return <div className="space-y-5">
    <section className="club-hero p-7 sm:p-9">
      <div className="flex items-center gap-2 text-[#d7c69f] club-kicker"><Spade size={15}/> Session complete</div>
      <h2 className="font-serif text-4xl mt-4">The final tally.</h2>
      <div className="grid grid-cols-2 gap-4 mt-7"><div><p className="text-xs text-[#dae5d9]">Total buy-ins</p><p className="club-money text-3xl font-bold">${money(totalIn)}</p></div><div><p className="text-xs text-[#dae5d9]">Total returned</p><p className="club-money text-3xl font-bold">${money(totalOut)}</p></div></div>
    </section>
    <div className={'club-card p-4 flex items-center gap-3 '+(balanced?'text-primary':'text-error')}>{balanced?<CheckCircle2 size={20}/>:<AlertTriangle size={20}/>}<div><p className="font-bold text-sm">{balanced?'All chips accounted for':'Ledger does not balance'}</p><p className="text-xs">{balanced?'The money in matches the money out.':'Difference: $'+money(Math.abs(difference))}</p></div></div>
    <section className="club-card p-5 sm:p-6 space-y-4"><div><h3 className="font-bold text-xl font-headline">Player results</h3><p className="text-xs text-on-surface-variant">Net profit or loss, including earlier cash-outs.</p></div>
    <div className="divide-y divide-outline-variant/30">{rows.map(p=><div key={p.id} className="py-4 flex gap-3 items-center">
      {p.photoUrl?<img src={p.photoUrl} alt={p.name+' chip stack'} className="w-11 h-11 rounded-xl object-cover"/>:<div className="w-11 h-11 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center font-bold">{p.name.slice(0,2).toUpperCase()}</div>}
      <div className="flex-1 min-w-0"><p className="font-bold truncate">{p.name}</p><p className="text-xs text-on-surface-variant">In ${money(p.inCents)} · Out ${money(p.outCents)}</p></div>
      <div className="text-right"><p className={'club-money text-xl font-bold '+(p.netCents<0?'text-error':'text-primary')}>{p.netCents<0?'−':'+'}${money(Math.abs(p.netCents))}</p><p className="text-[10px] text-outline uppercase">{p.netCents>0?'Profit':p.netCents<0?'Loss':'Even'}</p></div>
    </div>)}</div>
    <p className="text-xs text-on-surface-variant">These are accounting results, not payment instructions. If buy-ins were paid upfront, each player’s final stack is the remaining amount to return.</p>
    </section>
    <div className="grid sm:grid-cols-2 gap-3"><button className="club-secondary flex items-center justify-center gap-2" onClick={share}><Share2 size={17}/> Share results</button><button className="club-button" onClick={onArchive}>{archiveLabel}</button></div>
  </div>;
}

