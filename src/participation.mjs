import { moneyCents, chipsToCents, cashOutCents, buyInEntryCents } from './ledger.mjs';
import { mutateRoom, validatePlayer } from './mutations.mjs';
export const participationActions = ['enroll','request','resolve','payment'];
const fail = message => { throw new Error(message); };
export function mutateParticipation(game, original, previousRequests, previousPayments, uid, action, data, id, now) {
  const players=structuredClone(original), requests=structuredClone(previousRequests), payments=structuredClone(previousPayments);
  const host=uid===game.hostId, own=players.find(p=>p.ownerUid===uid);
  const pending=requests.filter(r=>r.status==='requested');
  const open=game.status==='setup'||game.status==='active';
  if(['enroll','request'].includes(action)&&requests.some(r=>r.id===id))fail('Request identifier already exists. Retry with a new request.');
  if(action==='enroll'){
    if(players.some(p=>p.id===id))fail('Seat identifier already exists.');
    if(!open)fail('New seats are closed during settlement.');
    if(own)fail('You already have a seat in this room.');
    if(pending.some(r=>r.uid===uid))fail('Resolve your pending seat request first.');
    if(players.length>=30)fail('The table already has 30 players.');
    const name=typeof data.name==='string'?data.name.trim():'';
    if(!name||name.length>49)fail('Enter a name of up to 49 characters.');
    if(players.some(p=>p.name.trim().toLowerCase()===name.toLowerCase()))fail('That name is already at the table. Request the existing seat instead.');
    const p={id,name,ownerUid:uid,buyIns:[],cashOuts:[],finalStackValue:0};
    validatePlayer(p);players.push(p);
    if(data.amount!==undefined){
      const amount=buyInEntryCents(data,game.exchangeRate)/100;if(amount<=0)fail('Initial buy-in must be positive.');
      if(requests.length>=1000)fail('Request limit reached.');
      requests.push({id,uid,playerId:p.id,playerName:p.name,kind:'buyIn',amount,...(data.unit==='chips'?{chipValue:data.amount}:{}),rate:structuredClone(game.exchangeRate),status:'requested',createdAt:now});
    }
  }else if(action==='request'){
    if(!open&&!(game.status==='settlement'&&data.kind==='finalStack'))fail('Requests are closed for this game.');
    if(requests.length>=1000)fail('This room has reached its request limit. Ask the host to record the entry.');
    if(!['claim','buyIn','cashOut','finalStack'].includes(data.kind))fail('Invalid request.');
    if(pending.some(r=>r.uid===uid))fail('Wait for the host to resolve your previous request.');
    const p=players.find(p=>p.id===data.playerId);if(!p)fail('Seat not found.');
    if(data.kind==='claim'){
      if(own||p.ownerUid)fail('This seat is already linked, or you already have a seat.');
    }else{
      if(!own||own.id!==p.id)fail('You can only request transactions for your own seat.');
      if(data.kind==='cashOut'&&game.status!=='active')fail('Cash-outs are available during play.');
    }
    if(data.kind==='finalStack'&&game.status!=='settlement')fail('Send your final count when the table is counting chips.');
    const amount=data.kind==='claim'?0:data.kind==='buyIn'?buyInEntryCents(data,game.exchangeRate)/100:data.amount;
    if(data.kind!=='claim'&&(!Number.isFinite(amount)||(data.kind==='finalStack'?amount<0:amount<=0)||amount>100000000))fail('Enter a valid positive amount.');
    if(data.kind==='finalStack')chipsToCents(amount,game.exchangeRate);
    if(data.kind==='cashOut'&&chipsToCents(amount,game.exchangeRate)<=0)fail('Cash-out must be worth at least one cent.');
    requests.push({id,uid,playerId:p.id,playerName:p.name,kind:data.kind,amount,...(data.kind==='buyIn'&&data.unit==='chips'?{chipValue:data.amount}:{}),rate:structuredClone(game.exchangeRate),status:'requested',createdAt:now});
  }else if(action==='resolve'){
    if(!host)fail('Only the host can resolve requests.');
    const r=requests.find(r=>r.id===data.id);
    if(!r||r.status!=='requested')fail('This request has already been resolved.');
    if(!['confirmed','rejected'].includes(data.status))fail('Choose confirm or reject.');
    if(data.reason!==undefined&&(typeof data.reason!=='string'||data.reason.length>140))fail('Keep the reason under 140 characters.');
    if(data.status==='confirmed'){
      if(!open&&!(game.status==='settlement'&&r.kind==='finalStack'))fail('Return to play before confirming this request.');
      if(r.kind==='finalStack'&&game.status!=='settlement')fail('Review final counts when the table is counting chips.');
      const p=players.find(p=>p.id===r.playerId);if(!p)fail('This seat was removed. Reject the request.');
      if(r.kind==='finalStack'){
        if(p.ownerUid!==r.uid)fail('This count belongs to a different seat.');
        chipsToCents(r.amount,game.exchangeRate);
      }else if(r.kind==='claim'){
        if(p.ownerUid||players.some(p=>p.ownerUid===r.uid))fail('This player or seat has already been linked. Reject the request.');
        p.ownerUid=r.uid;
      }else{
        if(p.ownerUid!==r.uid)fail('This request is no longer linked to the player.');
        if(r.kind==='cashOut'&&data.expectedPaidCents!==cashOutCents(players,r.amount,game.exchangeRate))fail('Cash-out payout changed. Review the updated amount and confirm again.');
        if(r.chipValue!==undefined&&(r.rate.baseCurrency!==game.exchangeRate.baseCurrency||r.rate.chips!==game.exchangeRate.chips))fail('Table rate changed. Reject this request and ask the player to resend it.');
        r.entryIndex=(r.kind==='buyIn'?p.buyIns:p.cashOuts).length;
        const previousPaid=p.cashOuts.reduce((s,v)=>s+moneyCents(v),0);
        if(game.status==='setup'){
          if(r.kind!=='buyIn')fail('Cash-outs require active play.');
          if(p.buyIns.length>=100)fail('Transaction limit reached.');
          p.buyIns.push(moneyCents(r.amount)/100);validatePlayer(p);
        }else{
          const next=mutateRoom(game,players,'record',{playerId:p.id,type:r.kind,amount:r.amount,rate:r.rate});
          players.splice(0,players.length,...next.players);
          if(r.kind==='cashOut')r.confirmedAmount=(next.players.find(p=>p.id===r.playerId).cashOuts.reduce((s,v)=>s+moneyCents(v),0)-previousPaid)/100;
        }
      }
    }
    r.status=data.status;r.resolvedAt=now;r.resolvedBy=uid;r.reason=data.reason||'';
  }else if(action==='payment'){
    if(!host||game.status!=='results')fail('Only the host can record payments after finalization.');
    const p=players.find(p=>p.id===data.playerId);if(!p)fail('Player not found.');
    const current=payments.find(p=>p.playerId===data.playerId);
    if((current?.paidCents||0)!==data.expectedCents)fail('Payment changed on another device. Review and retry.');
    const amount=moneyCents(data.amount);
    if(amount>moneyCents(p.finalStackValue))fail('Payment cannot exceed the final payout.');
    if(current){current.paidCents=amount;current.updatedAt=now;current.updatedBy=uid;}
    else payments.push({playerId:p.id,paidCents:amount,updatedAt:now,updatedBy:uid});
  }else fail('Unknown participation action.');
  players.forEach(validatePlayer);
  return {game,players,requests,payments};
}
export function assertNoPending(requests,action,data){
  if(['record','undo'].includes(action)&&requests.some(r=>r.status==='requested'&&r.playerId===data.playerId&&r.kind!=='claim'))fail('Resolve this player’s pending request before adding or undoing an entry.');
  if((action==='finalize'||action==='phase'&&data.to!=='active'||action==='phase'&&data.from==='setup')&&requests.some(r=>r.status==='requested'))fail('Confirm or reject pending requests before changing the game stage.');
}

export function reverseUndoneRequest(requests,players,data,uid,now){
 const next=structuredClone(requests),player=players.find(p=>p.id===data.playerId);
 if(!player)return next;
 const index=(data.type==='buyIn'?player.buyIns:player.cashOuts).length-1;
 const request=next.find(r=>r.status==='confirmed'&&r.playerId===data.playerId&&r.kind===data.type&&r.entryIndex===index);
 if(request){request.status='reversed';request.reason='Entry undone by host';request.resolvedAt=now;request.resolvedBy=uid;}
 return next;
}

export function canAccessLedger(game,uid,isMember,action){
 return !!game&&!!uid&&(game.hostId===uid||isMember===true&&participationActions.includes(action));
}
