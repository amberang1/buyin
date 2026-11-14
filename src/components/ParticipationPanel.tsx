import ChipCheck from './ChipCheck';
import {useState,useEffect} from 'react';
import type {Player,PlayerRequest,ExchangeRate,Phase} from '../types';
import {chipsToCents,cashOutCents,formatMoney,buyInChipsToCents} from '../ledger.mjs';
type Props={gameId:string;uid:string;host:boolean;phase:Phase;players:Player[];requests:PlayerRequest[];rate:ExchangeRate;ready:boolean;onAction:(action:string,data:unknown)=>Promise<boolean>};
export default function ParticipationPanel({gameId,uid,host,phase,players,requests,rate,ready,onAction}:Props){
 const [showSelf,setShowSelf]=useState(false);
 const [name,setName]=useState(''),[initial,setInitial]=useState(''),[seat,setSeat]=useState('');
 const [kind,setKind]=useState<'buyIn'|'cashOut'|'finalStack'>(phase==='settlement'?'finalStack':'buyIn'),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setAmount('');setKind(phase==='settlement'?'finalStack':'buyIn');},[phase]);
 const finalCount=phase==='settlement';
 const effectiveKind=finalCount?'finalStack':kind==='finalStack'?'buyIn':kind;
 const own=players.find(p=>p.ownerUid===uid),open=phase==='setup'||phase==='active';
 let initialPreview='',initialValid=true;try{if(initial.trim())initialPreview=formatMoney(buyInChipsToCents(Number(initial),rate));}catch(e){initialValid=false;initialPreview=(e as Error).message;}
 const mine=requests.filter(r=>r.uid===uid),pending=mine.some(r=>r.status==='requested');
 const send=async(action:string,data:unknown)=>{if(busy||!ready)return;setBusy(true);try{if(await onAction(action,data)){setName('');setInitial('');setAmount('');setSeat('');}}finally{setBusy(false)}};
 let preview='',valid=false;
 try{if(amount.trim()&&(finalCount?Number(amount)>=0:Number(amount)>0)){const cents=effectiveKind==='buyIn'?buyInChipsToCents(Number(amount),rate):chipsToCents(Number(amount),rate);valid=finalCount?cents>=0:cents>0;preview=formatMoney(cents);}}catch{}
 const activity=[...(host?requests:mine)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const renderRequest=(r:PlayerRequest)=>{let payout:number|null=null;try{if(r.kind==='cashOut')payout=cashOutCents(players,r.amount,rate);}catch{}return <div key={r.id} className="border border-outline-variant/30 rounded-xl p-3 space-y-2">
    <p className="font-bold text-sm">{r.playerName} · {r.kind==='claim'?'Link seat':r.kind==='finalStack'?'Final count · '+r.amount+' chips':r.kind==='buyIn'?'Buy-in '+(r.chipValue!==undefined?r.chipValue+' chip units · $':'$')+r.amount.toFixed(2):'Cash-out '+r.amount+' chip units'}</p>
    <p className={'text-sm '+(r.status==='rejected'?'text-error':'text-primary')}>{r.status==='requested'?'Requested · awaiting host':r.status==='confirmed'?'Confirmed':r.status==='reversed'?'Reversed by host':'Rejected'}{r.reason?' · '+r.reason:''}</p>
    {r.confirmedAmount!==undefined&&r.status==='confirmed'&&<p className="text-sm">Paid at cash-out: ${r.confirmedAmount.toFixed(2)}</p>}
    {host&&r.status==='requested'&&r.kind==='cashOut'&&<p className="text-sm font-bold">{payout===null?'Cannot approve: chips exceed the table balance.':'Payout to confirm: '+formatMoney(payout)}</p>}
    {host&&r.status==='requested'&&<div className="space-y-2"><p className="text-xs text-on-surface-variant">{r.kind==='finalStack'?'Check this count with the player before confirming.':r.kind==='claim'?'Confirm this guest is the named player.':r.kind==='buyIn'?'Confirm only after receiving the money.':'Confirm only after receiving the chips and paying the player.'}</p><div className="flex gap-2"><button className="club-button flex-1" disabled={busy} onClick={()=>{if(confirm(r.kind==='finalStack'?'Confirm '+r.playerName+"’s final count of "+r.amount+' chips?':r.kind==='claim'?'Link this guest to '+r.playerName+'?':r.kind==='buyIn'?'Confirm $'+r.amount.toFixed(2)+' received from '+r.playerName+'?':'Confirm chips received and '+(payout===null?'the payout':formatMoney(payout))+' paid to '+r.playerName+'?'))void send('resolve',{id:r.id,status:'confirmed',...(r.kind==='cashOut'?{expectedPaidCents:payout}:{})});}}>Confirm</button><button className="club-secondary flex-1" disabled={busy} onClick={()=>{const reason=prompt('Reason (optional)','');if(reason!==null)void send('resolve',{id:r.id,status:'rejected',reason});}}>Reject</button></div></div>}
   </div>};
 return <section className="club-card p-5 space-y-4">
  <div><h2 className="text-xl font-bold">{own?own.name+"’s seat":host?'Manage the table':'Take your seat'}</h2><p className="text-sm text-on-surface-variant">{own?(finalCount?'Count your remaining chips and send the total below.':phase==='results'?'Your game is finished. Your result and payment status are below.':'Add a buy-in or cash out here. The host confirms once the money and chips have changed hands.'):host?'Manage the table here. Playing too? Link your name below.':'Enter your name to join. If it is already listed, choose it below.'}</p></div>
  {!ready?<p role="status">Loading requests…</p>:<>
  {host&&!own&&open&&!pending&&<button className="club-secondary w-full" onClick={()=>setShowSelf(v=>!v)}>{showSelf?"Hide my seat options":"I’m playing too"}</button>}
  {!own&&open&&!pending&&(!host||showSelf)&&<div className="space-y-4">
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();void send('enroll',{name,...(initial.trim()?{amount:Number(initial),unit:'chips',rate}:{})});}}>
    <label className="block text-sm">Your name<input className="club-input w-full mt-1" maxLength={49} required value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="block text-sm">Starting chips (optional)<input className="club-input w-full mt-1" type="number" inputMode="decimal" min="0" max="100000000" step="any" value={initial} onChange={e=>setInitial(e.target.value)}/></label>
    {initial&&<p className="text-sm text-primary">{initialValid?"= ":""}{initialPreview}</p>}
    <button className="club-button w-full" disabled={busy||!name.trim()||!initialValid}>{busy?'Saving…':'Join as a player'}</button>
   </form>
   {players.some(p=>!p.ownerUid)&&<form className="space-y-2 border-t border-outline-variant/30 pt-4" onSubmit={e=>{e.preventDefault();void send('request',{kind:'claim',playerId:seat});}}>
    <label className="block text-sm">Already on the list?<select className="club-input w-full mt-1" value={seat} onChange={e=>setSeat(e.target.value)}><option value="">Select your name</option>{players.filter(p=>!p.ownerUid).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button className="club-secondary w-full" disabled={busy||!seat}>This is my seat</button>
   </form>}
  </div>}
  {!own&&!open&&<p className="text-sm">New seats are closed for this game.</p>}
  {own&&(open||finalCount)&&!pending&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(valid)void send('request',{playerId:own.id,kind:effectiveKind,amount:Number(amount),...(effectiveKind==='buyIn'?{unit:'chips',rate}:{})});}}>
    {finalCount?<div><h3 className="font-bold">Your final chip count</h3><p className="text-sm text-on-surface-variant">Count your remaining chips, then send the total to the host. Enter 0 if you have none left.</p></div>:<div className="grid grid-cols-2 gap-2" role="group" aria-label="Your next action"><button type="button" aria-pressed={effectiveKind==='buyIn'} className={effectiveKind==='buyIn'?'club-button':'club-secondary'} onClick={()=>{setKind('buyIn');setAmount('');}}>Buy in</button>{phase==='active'&&<button type="button" aria-pressed={effectiveKind==='cashOut'} className={effectiveKind==='cashOut'?'club-button':'club-secondary'} onClick={()=>{setKind('cashOut');setAmount('');}}>Cash out</button>}</div>}

    <label className="block text-sm">Total chip value (units)<input className="club-input w-full mt-1" type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    {preview&&<p className="text-sm">{preview}{effectiveKind==='cashOut'?' estimated payout':''}</p>}
    <button className="club-button w-full" disabled={busy||!valid}>{busy?'Sending…':finalCount?'Send final count':effectiveKind==='cashOut'?'Ask to cash out':'Send buy-in'}</button>
  </form>}
  {pending&&<p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">Your request is waiting for host confirmation.</p>}
  {(host?requests:mine).length>0&&<div className="space-y-3"><h3 className="font-bold">{host?'To confirm & recent activity':'Your activity'}</h3>
   {activity.filter(r=>r.status==='requested').map(renderRequest)}
   {activity.some(r=>r.status!=='requested')&&<details className="space-y-3"><summary className="cursor-pointer text-sm font-bold py-2">Earlier activity ({activity.filter(r=>r.status!=='requested').length})</summary>{activity.filter(r=>r.status!=='requested').map(renderRequest)}</details>}

  </div>}
  <ChipCheck gameId={gameId} rate={rate} onUse={pending||(!open&&!finalCount)||(!own&&host&&!showSelf)?undefined:units=>{if(!own)setInitial(String(units));else setAmount(String(units));}}/>
  </>}
 </section>;
}
