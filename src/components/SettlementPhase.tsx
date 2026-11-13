import PhotoPicker from './PhotoPicker';
import React,{useState,useEffect} from 'react';
import { Camera, Sparkles, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Player, ExchangeRate } from '../types';
import { scanChips, prepareChipPhoto } from '../scan';
import { draftOperation } from '../drafts';
import ChipCounter from './ChipCounter';
import { stackTotal, chipCents, money, reconciliation, allocateStacks } from '../ledger.mjs';
type Props={gameId:string;players:Player[];exchangeRate:ExchangeRate;onComplete:(stacks:Record<string,string>,photos:Record<string,string>)=>Promise<boolean>;onReturnToPlay:()=>void};
type Review={counts:Record<string,number>;warnings:string[]};
export default function SettlementPhase({gameId,players,exchangeRate,onComplete,onReturnToPlay}:Props){
  const draftKey='poker_stack_draft_'+gameId;
  const [stacks,setStacks]=useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem(draftKey)||'{}')||{};}catch{return {};}});
  const [photos,setPhotos]=useState<Record<string,string>>({});
  const [reviews,setReviews]=useState<Record<string,Review>>({});
  const [busy,setBusy]=useState<Record<string,boolean>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState(false);
  const [counterId,setCounterId]=useState<string|null>(null);
  const [draftReady,setDraftReady]=useState(false);
  const [draftError,setDraftError]=useState('');
  useEffect(()=>{let active=true;draftOperation(draftKey,'read').then(value=>{if(active&&value){setStacks(value.stacks||{});setPhotos(value.photos||{});setReviews(value.reviews||{});}}).catch(()=>{if(active)setDraftError('Draft storage is unavailable. Keep this screen open until finalizing.');}).finally(()=>{if(active)setDraftReady(true);});return()=>{active=false;};},[draftKey]);
  useEffect(()=>{if(draftReady)void draftOperation(draftKey,'write',{stacks,photos,reviews}).catch(()=>setDraftError('Draft could not be saved. Keep this screen open until finalizing.'));},[draftKey,draftReady,stacks,photos,reviews]);
  const setError=(id:string,msg:string)=>setErrors(p=>({...p,[id]:msg}));
  const clearReview=(id:string)=>setReviews(p=>{const n={...p};delete n[id];return n;});
  const upload=async(id:string,file?:File)=>{
    if(!file||busy[id])return;
    setBusy(p=>({...p,[id]:true}));setError(id,'');clearReview(id);
    try{setPhotos(p=>{const n={...p};delete n[id];return n;});const photo=await prepareChipPhoto(file);setPhotos(p=>({...p,[id]:photo}));}
    catch(e){setError(id,e instanceof Error?e.message:'Photo failed.');}
    finally{setBusy(p=>({...p,[id]:false}));}
  };
  const runScan=async(id:string)=>{
    if(!photos[id]||busy[id])return;
    setBusy(p=>({...p,[id]:true}));setError(id,'');clearReview(id);
    try{
      const raw=await scanChips(gameId,'stack',photos[id]);
      const review=JSON.parse(raw) as Review;
      stackTotal(review.counts,exchangeRate.chipValues);
      setReviews(p=>({...p,[id]:review}));
    }catch(e){setError(id,e instanceof Error?e.message:'Scan failed. Enter chips manually.');}
    finally{setBusy(p=>({...p,[id]:false}));}
  };
  const valid=(id:string)=>{try{return typeof stacks[id]==='string'&&stacks[id].trim()!==''&&Number.isFinite(Number(stacks[id]))&&Number(stacks[id])>=0&&Number(stacks[id])<=100000000&&Number.isSafeInteger(chipCents(stacks[id],exchangeRate));}catch{return false}};
  const complete=players.length>0&&players.every(p=>valid(p.id));
  let next=players.map(p=>({...p,finalStackValue:valid(p.id)?chipCents(stacks[p.id],exchangeRate)/100:0}));
  let allocationError='';
  if(complete){try{next=allocateStacks(players,stacks,exchangeRate);}catch(e){allocationError=(e as Error).message;}}
  const {totalIn,totalOut,difference}=reconciliation(next);
  const rounding=complete&&!allocationError?next.filter(p=>Math.abs(p.finalStackValue*100-chipCents(stacks[p.id],exchangeRate))>=1):[];
  const blocked=!draftReady||!complete||!!allocationError||difference!==0||Object.values(busy).some(Boolean)||Object.keys(reviews).length>0||saving;
  const submit=async()=>{if(blocked)return;setSaving(true);try{if(await onComplete(stacks,photos)){localStorage.removeItem(draftKey);await draftOperation(draftKey,'delete').catch(()=>{});}}finally{setSaving(false);}};
  if(!draftReady)return <p>Restoring chip counts and photos…</p>;
  return <div className="space-y-5">
    {draftError&&<p role="alert" className="text-error">{draftError}</p>}
    {allocationError&&complete&&<p role="alert" className="text-error">{allocationError}</p>}
    {rounding.length>0&&<p className="text-sm text-primary">Fractional cents allocated to keep payouts balanced: {rounding.map(p=>p.name+' $'+p.finalStackValue.toFixed(2)).join(', ')}. Chip counts are unchanged.</p>}
    <button className="club-secondary w-full" disabled={saving||Object.values(busy).some(Boolean)} onClick={onReturnToPlay}>Back to play / edit entries</button>
    <section><p className="club-kicker text-secondary">03 / Count &amp; reconcile</p><h2 className="font-serif text-4xl mt-2">Count the stacks.</h2><p className="text-sm text-on-surface-variant mt-2">Photograph one player’s chips, review the count, or enter the chip value manually. Lay out stacks by color in good light.</p></section>
    <section className="club-hero p-5 sm:p-7"><div className="grid grid-cols-2 gap-4"><div><p className="text-xs text-[#dae5d9]">Accounted for</p><p className="club-money text-3xl font-bold">${money(totalOut)}</p></div><div><p className="text-xs text-[#dae5d9]">Total buy-ins</p><p className="club-money text-3xl font-bold">${money(totalIn)}</p></div></div><div className="mt-4 text-xs flex items-center justify-between border-t border-white/20 pt-4"><span>{players.filter(p=>valid(p.id)).length} / {players.length} stacks entered</span><span>{difference===0&&!allocationError?'Balanced':(difference>0?'Remaining $':'Over by $')+money(Math.abs(difference))}</span></div></section>
    {players.map(p=>{const id=p.id;const review=reviews[id];let total=0;let good=true;if(review){try{total=stackTotal(review.counts,exchangeRate.chipValues);chipCents(total,exchangeRate);}catch{good=false;}}
      return <section key={id} className="club-card p-5 space-y-4">
        <div className="flex justify-between items-center gap-3"><div><h3 className="font-headline font-bold text-lg">{p.name}</h3><p className="text-xs text-on-surface-variant">Buy-ins ${p.buyIns.reduce((a,b)=>a+b,0).toFixed(2)} · Earlier cash-outs ${p.cashOuts.reduce((a,b)=>a+b,0).toFixed(2)}</p></div>{valid(id)&&<CheckCircle2 className="text-primary shrink-0" size={22}/>}</div>
        <div><label className="text-xs font-bold" htmlFor={'stack-'+id}>Final chip value (not number of chips)</label><div className="flex gap-3 items-center mt-1"><input id={'stack-'+id} type="number" inputMode="decimal" min="0" max="100000000" step="any" className="club-input flex-1 min-w-0 font-bold text-xl" placeholder="Enter value, or 0" value={stacks[id]??''} onChange={e=>{clearReview(id);setStacks(prev=>({...prev,[id]:e.target.value}));}}/><span className="font-bold text-primary whitespace-nowrap">{valid(id)?'$'+money(chipCents(stacks[id],exchangeRate)):'—'}</span></div></div>
        <button className="club-secondary w-full" onClick={()=>setCounterId(counterId===id?null:id)}>{counterId===id?'Hide manual calculator':'Count chips by color'}</button>
        {counterId===id&&<ChipCounter rate={exchangeRate} onApply={units=>{clearReview(id);setStacks(prev=>({...prev,[id]:String(units)}));setCounterId(null)}}/>}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {photos[id]&&<img src={photos[id]} alt="Chip stack" className="w-20 h-20 rounded-xl object-cover"/>}
          <div className="min-w-0 flex-1 flex flex-wrap gap-2">
            <PhotoPicker disabled={busy[id]} onSelect={file=>void upload(id,file)}/>
            {photos[id]&&<button className="club-button text-sm flex gap-2 items-center" onClick={()=>runScan(id)} disabled={busy[id]||saving}>{busy[id]?<Loader2 className="animate-spin" size={16}/>:<Sparkles size={16}/>} Scan chips</button>}
            {photos[id]&&<button aria-label="Remove photo" disabled={busy[id]} className="p-2 text-error" onClick={()=>{setPhotos(prev=>{const n={...prev};delete n[id];return n;});clearReview(id);}}><X size={20}/></button>}
          </div>
        </div>
        {busy[id]&&<p role="status" className="text-xs text-primary">Processing photo…</p>}
        {errors[id]&&<p role="alert" className="text-sm text-error">{errors[id]}</p>}
        {review&&<div className="rounded-xl bg-surface-container-low p-4 space-y-3"><h4 className="font-bold">Review AI chip counts</h4><p className="text-xs text-on-surface-variant">Correct the estimated number of chips by color. AI may miss hidden chips.</p>
          {review.warnings.map((w,i)=><p key={i} className="text-xs text-error flex gap-2"><AlertTriangle size={15}/>{w}</p>)}
          {Object.entries(exchangeRate.chipValues).filter(([,v])=>v>0).map(([color,value])=><div key={color} className="grid grid-cols-[1fr_88px_80px] gap-2 items-center"><label htmlFor={id+'-'+color} className="text-sm">{color} <span className="text-outline">× {value}</span></label><input id={id+'-'+color} type="number" min="0" max="10000" step="1" className="club-input text-right" value={review.counts[color]??0} onChange={e=>setReviews(prev=>({...prev,[id]:{...review,counts:{...review.counts,[color]:e.target.value===''?NaN:Number(e.target.value)}}}))}/><span className="text-right text-sm font-bold">{Number.isFinite(review.counts[color]??0)?(review.counts[color]??0)*value:'—'}</span></div>)}
          <div className="flex justify-between items-center border-t border-outline-variant/30 pt-3"><span className="font-bold">Total chip value</span><span className="font-bold text-primary">{good?total.toLocaleString():'Invalid count'}</span></div>
          <button className="club-button w-full" disabled={!good} onClick={()=>{setStacks(prev=>({...prev,[id]:String(total)}));clearReview(id);}}>Confirm chip value{good?' · $'+money(chipCents(total,exchangeRate)):''}</button><button className="club-secondary w-full" onClick={()=>clearReview(id)}>Discard estimate / enter manually</button>
        </div>}
      </section>;
    })}
    {!complete?<p className="text-sm text-on-surface-variant">Enter every final stack, including zero for an empty stack.</p>:difference!==0||!!allocationError?<div role="alert" className="club-card p-4 text-error text-sm"><strong>Check the count.</strong> The ledger is off by ${money(Math.abs(difference))}. Correct the stacks before finalizing.</div>:<p className="text-sm text-primary font-bold">All amounts balance. Ready to finalize.</p>}
    <button className="club-button w-full" disabled={blocked} onClick={submit}>{saving?'Saving results…':'Finalize ledger'}</button>

  </div>;
}
