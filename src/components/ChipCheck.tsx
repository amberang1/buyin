import PhotoPicker from './PhotoPicker';
import {useEffect,useRef,useState} from 'react';
import {Camera,Loader2} from 'lucide-react';
import type {ExchangeRate} from '../types';
import {prepareChipPhoto,scanChips} from '../scan';
import {chipCheckSummary,readChipCheck} from '../chip-check.mjs';
import {formatMoney} from '../ledger.mjs';
type Review={counts:Record<string,number>;warnings:string[]};
export default function ChipCheck({gameId,rate}:{gameId:string;rate:ExchangeRate}){
 const [open,setOpen]=useState(false),[photo,setPhoto]=useState(''),[review,setReview]=useState<Review|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0);
 const rateKey=JSON.stringify([rate.baseCurrency,rate.chips,Object.entries(rate.chipValues).sort(([a],[b])=>a.localeCompare(b))]);
 useEffect(()=>{generation.current++;setPhoto('');setReview(null);setBusy(false);setError('');return()=>{generation.current++;};},[gameId,rateKey]);
 const upload=async(file?:File)=>{
  if(!file||busy)return;const version=++generation.current;setBusy(true);setError('');setPhoto('');setReview(null);
  try{const data=await prepareChipPhoto(file);if(version===generation.current)setPhoto(data);}
  catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'Could not open photo.');}
  finally{if(version===generation.current)setBusy(false);}
 };
 const scan=async()=>{
  if(!photo||busy)return;const version=++generation.current;setBusy(true);setError('');setReview(null);
  try{const result=await scanChips(gameId,'check',photo);if(version===generation.current)setReview(readChipCheck(result,rate));}
  catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'Scan failed. Please retry.');}
  finally{if(version===generation.current)setBusy(false);}
 };
 let summary:{units:number;cents:number}|null=null;
 if(review){try{summary=chipCheckSummary(review.counts,rate);}catch{}}
 const hasValues=Object.values(rate.chipValues).some(v=>v>0);
 return <section className="club-card p-4 space-y-4">
  <button className="club-secondary w-full flex justify-center gap-2 items-center" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><Camera size={18}/>{open?'Hide chip check':'Check my chips'}</button>
  {open&&<div className="space-y-4"><div><h2 className="text-xl font-bold">Check my chips</h2><p className="text-sm text-on-surface-variant">Take or upload a photo of your stack at any time. This estimate does not change your buy-ins, cash-outs or game ledger.</p><p className="text-xs text-on-surface-variant mt-2">Separate colors and leave stack edges visible. Hidden chips cannot be counted reliably.</p></div>
   {!hasValues?<p role="alert" className="text-error text-sm">Ask the host to configure chip values in Setup before scanning.</p>:<>
    {photo&&<img src={photo} alt="Your chips for a private estimate" className="w-full max-h-64 object-contain rounded-xl"/>}
    <PhotoPicker disabled={busy} onSelect={file=>void upload(file)}/>
    {photo&&<button className="club-button w-full" disabled={busy} onClick={scan}>{busy?<span className="flex justify-center items-center gap-2"><Loader2 className="animate-spin" size={16}/>Processing…</span>:'Scan my chips'}</button>}
    {busy&&!photo&&<p role="status" className="text-sm">Preparing photo…</p>}
   </>}
   {error&&<p role="alert" className="text-sm text-error">{error}</p>}
   {review&&<div className="space-y-3"><h3 className="font-bold">Review estimated counts</h3>{review.warnings.map((warning,i)=><p key={i} className="text-sm text-error">{warning}</p>)}
    {Object.entries(rate.chipValues).filter(([,value])=>value>0).map(([color,value])=><label key={color} className="flex items-center justify-between gap-3 text-sm"><span>{color} · {value} units each</span><input aria-label={color+' chip count for quick check'} className="club-input w-24 text-right" type="number" inputMode="numeric" min="0" max="10000" step="1" value={Number.isNaN(review.counts[color])?'':review.counts[color]??0} onChange={e=>setReview(current=>current?{...current,counts:{...current.counts,[color]:e.target.value===''?NaN:Number(e.target.value)}}:null)}/></label>)}
    {summary?<div className="border-t border-outline-variant/30 pt-3"><p className="font-bold text-xl">{summary.units.toLocaleString()} chip units</p><p className="text-primary font-bold">Cash equivalent: {formatMoney(summary.cents)}</p><p className="text-xs text-on-surface-variant mt-2">Estimate only · review the counts. No game entries have changed.</p></div>:<p role="alert" className="text-error text-sm">Enter valid whole-chip counts to calculate the total.</p>}
   </div>}
  </div>}
 </section>;
}
