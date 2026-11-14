import {useEffect,useState} from 'react';
import type {Payment,Player} from '../types';
import {moneyCents,formatMoney} from '../ledger.mjs';
type Props={player:Player;payment?:Payment;canEdit:boolean;onPayment?:(id:string,amount:number,expectedCents:number)=>Promise<boolean>};
export default function PaymentTracker({player,payment,canEdit,onPayment}:Props){
 const due=moneyCents(player.finalStackValue),paid=payment?.paidCents||0;
 const [amount,setAmount]=useState((paid/100).toFixed(2)),[busy,setBusy]=useState(false);
 useEffect(()=>{setAmount((paid/100).toFixed(2));},[paid]);
 const record=async(value:number)=>{if(busy||!canEdit||!onPayment)return;setBusy(true);try{await onPayment(player.id,value,paid);}finally{setBusy(false)}};
 let valid=false;try{valid=amount.trim()!==''&&moneyCents(Number(amount))<=due;}catch{}
 return <div className="rounded-xl bg-surface-container-low p-4 space-y-3">
  <div className="flex justify-between gap-3"><strong>{player.name}</strong><span className={'text-sm font-bold '+(paid>=due?'text-primary':'text-error')}>{due===0?'No payout due':paid>=due?'Paid':paid>0?'Partly paid':'Unpaid'}</span></div>
  <dl className="grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-outline">Final payout</dt><dd>{formatMoney(due)}</dd></div><div><dt className="text-xs text-outline">Marked paid</dt><dd>{formatMoney(paid)}</dd></div><div><dt className="text-xs text-outline">Still due</dt><dd className="font-bold">{formatMoney(due-paid)}</dd></div></dl>
  {canEdit&&due>0&&<><form className="flex flex-wrap gap-2 items-end" onSubmit={e=>{e.preventDefault();if(valid&&confirm('Record '+formatMoney(moneyCents(Number(amount)))+' as the total already paid to '+player.name+'?'))void record(Number(amount));}}><label className="text-xs flex-1">Total already paid ($)<input aria-label={'Total already paid to '+player.name} type="number" inputMode="decimal" min="0" max={due/100} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="club-input w-full mt-1"/></label><button className="club-secondary" disabled={busy||!valid}>Save amount</button></form>{paid<due&&<button className="club-button w-full" disabled={busy} onClick={()=>{if(confirm('Confirm the full '+formatMoney(due)+' has been paid to '+player.name+'?'))void record(due/100);}}>Mark fully paid</button>}</>}
 </div>;
}
