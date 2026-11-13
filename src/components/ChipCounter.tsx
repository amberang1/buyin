import { useState } from 'react';
import type { ExchangeRate } from '../types';
import { chipTotal, chipsToCents, formatMoney } from '../ledger.mjs';
import { Calculator, Minus, Plus } from 'lucide-react';

const swatches: Record<string,string> = {blue:'#426a9d',red:'#b54a4e',green:'#44816b',black:'#282e32',purple:'#7864a0',yellow:'#d8b45d',white:'#faf6e9',orange:'#d48448',pink:'#c97e99',grey:'#8a8d91',gray:'#8a8d91'};
export default function ChipCounter({ rate, onApply, label='Use chip total' }: {rate:ExchangeRate;onApply:(units:number)=>void;label?:string}) {
  const [counts,setCounts] = useState<Record<string,string>>({});
  const entries = Object.entries(rate.chipValues).filter(([,v])=>Number.isFinite(v)&&v>0);
  const valid = entries.length>0 && entries.every(([color])=>counts[color]===undefined || counts[color]==='' || /^\d+$/.test(counts[color]) && Number.isSafeInteger(Number(counts[color])));
  let units=0,cents=0,ok=valid;
  try { if(valid){units=chipTotal(Object.fromEntries(entries.map(([c])=>[c,Number(counts[c]||0)])),rate.chipValues);cents=chipsToCents(units,rate);} } catch {ok=false;}
  const adjust=(color:string,delta:number)=>setCounts(prev=>({...prev,[color]:String(Math.max(0,(Number(prev[color])||0)+delta))}));
  return <div className="chip-counter">
    <div className="flex items-center gap-2 font-bold"><Calculator size={17}/> Count by color</div>
    <p className="text-xs text-on-surface-variant">Enter the number of physical chips in each color. Values are added automatically.</p>
    {entries.length===0&&<p className="text-sm text-error">Set positive chip denominations in setup first.</p>}
    {entries.map(([color,value])=><div key={color} className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0"><span className="poker-chip" style={{background:swatches[color.toLowerCase()]||'#9b9382'}}/><div className="min-w-0"><div className="font-semibold text-sm truncate">{color}</div><div className="text-xs text-outline">{value} units each</div></div></div>
      <div className="flex items-center gap-1"><button type="button" aria-label={'Remove '+color+' chip'} className="counter-step" onClick={()=>adjust(color,-1)}><Minus size={15}/></button><input type="number" inputMode="numeric" min="0" step="1" aria-label={color+' chip count'} className="counter-input" value={counts[color]??''} placeholder="0" onChange={e=>setCounts(p=>({...p,[color]:e.target.value}))}/><button type="button" aria-label={'Add '+color+' chip'} className="counter-step" onClick={()=>adjust(color,1)}><Plus size={15}/></button></div>
    </div>)}
    <div className="flex justify-between items-center border-t border-outline-variant/30 pt-3"><div><div className="text-xs text-outline">Total chip units</div><div className="text-xl font-bold tabular-nums">{ok?units.toLocaleString():'—'}</div></div><div className="text-right"><div className="text-xs text-outline">Cash value</div><div className="text-xl font-bold tabular-nums text-primary">{ok?formatMoney(cents):'—'}</div></div></div>
    <button type="button" disabled={!ok} onClick={()=>onApply(units)} className="primary-action">{label}</button>
  </div>;
}
