import { auth } from './firebase';

export async function roomRequest(action: 'create' | 'join', payload: Record<string, unknown>): Promise<{gameId: string; roomCode: string}> {
  const user = auth.currentUser;
  if (!user) throw new Error('Could not connect securely. Reload and try again.');
  const response = await fetch('/api/rooms/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !/^[a-f0-9]{32}$/.test(result.gameId || '') || !/^\d{6}$/.test(result.roomCode || '')) {
    throw new Error(result.error || 'Room service unavailable. Please retry.');
  }
  return result;
}


const pending=new Map<string,string>();
export async function ledgerRequest(gameId:string,action:string,data:unknown):Promise<void>{
  const key=JSON.stringify({gameId,action,data});
  const requestId=pending.get(key)||crypto.randomUUID();pending.set(key,requestId);
  const user=auth.currentUser;if(!user)throw new Error('Reconnect before editing.');
  const response=await fetch('/api/ledger',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({gameId,requestId,action,data})});
  const result=await response.json();
  if(!response.ok){if(response.status<500)pending.delete(key);throw new Error(result.error||'Could not save.');}
  pending.delete(key);
}
