import {useState} from 'react';
import type {Player,PlayerRequest,ExchangeRate,Phase} from '../types';
import {moneyCents,chipsToCents,cashOutCents,formatMoney} from '../ledger.mjs';
type Props={uid:string;host:boolean;phase:Phase;players:Player[];requests:PlayerRequest[];rate:ExchangeRate;ready:boolean;onAction:(action:string,data:unknown)=>Promise<boolean>};
export default function ParticipationPanel({uid,host,phase,players,requests,rate,ready,onAction}:Props){
 const [name,setName]=useState(''),[initial,setInitial]=useState(''),[seat,setSeat]=useState('');
 const [kind,setKind]=useState<'buyIn'|'cashOut'>('buyIn'),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false);
 const own=players.find(p=>p.ownerUid===uid),open=phase==='setup'||phase==='active';
 const mine=requests.filter(r=>r.uid===uid),pending=mine.some(r=>r.status==='requested');
 const send=async(action:string,data:unknown)=>{if(busy||!ready)return;setBusy(true);try{if(await onAction(action,data)){setName('');setInitial('');setAmount('');setSeat('');}}finally{setBusy(false)}};
 let preview='',valid=false;
 try{if(amount.trim()&&Number(amount)>0){const cents=kind==='buyIn'?moneyCents(Number(amount)):chipsToCents(Number(amount),rate);valid=cents>0;preview=formatMoney(cents);}}catch{}
 return <section className="club-card p-5 space-y-4">
  <div><h2 className="text-xl font-bold">{own?'Your seat · '+own.name:'Take your seat'}</h2><p className="text-sm text-on-surface-variant">{own?'Your seat is saved on this device. Money entries need host confirmation.':'Add your name, or ask the host to link a seat already on the list.'}</p></div>
  {!ready?<p role="status">Loading requests…</p>:<>
  {!own&&open&&!pending&&<div className="space-y-4">
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();void send('enroll',{name,...(initial.trim()?{amount:Number(initial)}:{})});}}>
    <label className="block text-sm">Your name<input className="club-input w-full mt-1" maxLength={49} required value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="block text-sm">Initial buy-in ($, optional)<input className="club-input w-full mt-1" type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" value={initial} onChange={e=>setInitial(e.target.value)}/></label>
    <button className="club-button w-full" disabled={busy||!name.trim()}>{busy?'Saving…':'Join as a player'}</button>
   </form>
   {players.some(p=>!p.ownerUid)&&<form className="space-y-2 border-t border-outline-variant/30 pt-4" onSubmit={e=>{e.preventDefault();void send('request',{kind:'claim',playerId:seat});}}>
    <label className="block text-sm">Already on the list?<select className="club-input w-full mt-1" value={seat} onChange={e=>setSeat(e.target.value)}><option value="">Select your name</option>{players.filter(p=>!p.ownerUid).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button className="club-secondary w-full" disabled={busy||!seat}>Ask host to link this seat</button>
   </form>}
  </div>}
  {!own&&!open&&<p className="text-sm">New seats are closed for this game.</p>}
  {own&&open&&!pending&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(valid)void send('request',{playerId:own.id,kind,amount:Number(amount)});}}>
    <label className="block text-sm">Request<select className="club-input w-full mt-1" value={kind} onChange={e=>{setKind(e.target.value as 'buyIn'|'cashOut');setAmount('');}}><option value="buyIn">Buy-in</option>{phase==='active'&&<option value="cashOut">Cash-out</option>}</select></label>
    <label className="block text-sm">{kind==='buyIn'?'Amount ($)':'Chip value to return'}<input className="club-input w-full mt-1" type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    {preview&&<p className="text-sm">{preview}{kind==='cashOut'?' estimated payout; cent rounding is confirmed by the host':''}</p>}
    <button className="club-button w-full" disabled={busy||!valid}>Send to host</button>
  </form>}
  {pending&&<p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">Your request is waiting for host confirmation.</p>}
  {(host?requests:mine).length>0&&<div className="space-y-3"><h3 className="font-bold">{host?'Player requests':'Your requests'}</h3>
   {[...(host?requests:mine)].sort((a,b)=>Number(b.status==='requested')-Number(a.status==='requested')||b.createdAt.localeCompare(a.createdAt)).map(r=>{let payout:number|null=null;try{if(r.kind==='cashOut')payout=cashOutCents(players,r.amount,rate);}catch{}return <div key={r.id} className="border border-outline-variant/30 rounded-xl p-3 space-y-2">
    <p className="font-bold text-sm">{r.playerName} · {r.kind==='claim'?'Link seat':r.kind==='buyIn'?'Buy-in $'+r.amount.toFixed(2):'Cash-out '+r.amount+' chip units'}</p>
    <p className={'text-sm '+(r.status==='rejected'?'text-error':'text-primary')}>{r.status==='requested'?'Requested · awaiting host':r.status==='confirmed'?'Confirmed':r.status==='reversed'?'Reversed by host':'Rejected'}{r.reason?' · '+r.reason:''}</p>
    {r.confirmedAmount!==undefined&&r.status==='confirmed'&&<p className="text-sm">Paid at cash-out: ${r.confirmedAmount.toFixed(2)}</p>}
    {host&&r.status==='requested'&&r.kind==='cashOut'&&<p className="text-sm font-bold">{payout===null?'Cannot approve: chips exceed the table balance.':'Payout to confirm: '+formatMoney(payout)}</p>}
    {host&&r.status==='requested'&&<div className="space-y-2"><p className="text-xs text-on-surface-variant">{r.kind==='claim'?'Confirm this guest is the named player.':r.kind==='buyIn'?'Confirm only after receiving the money.':'Confirm only after receiving the chips and paying the player.'}</p><div className="flex gap-2"><button className="club-button flex-1" disabled={busy} onClick={()=>{if(confirm(r.kind==='claim'?'Link this guest to '+r.playerName+'?':r.kind==='buyIn'?'Confirm money received from '+r.playerName+'?':'Confirm chips received and '+(payout===null?'the payout':formatMoney(payout))+' paid to '+r.playerName+'?'))void send('resolve',{id:r.id,status:'confirmed',...(r.kind==='cashOut'?{expectedPaidCents:payout}:{})});}}>Confirm</button><button className="club-secondary flex-1" disabled={busy} onClick={()=>{const reason=prompt('Reason (optional)','');if(reason!==null)void send('resolve',{id:r.id,status:'rejected',reason});}}>Reject</button></div></div>}
   </div>})}
  </div>}
  </>}
 </section>;
}
