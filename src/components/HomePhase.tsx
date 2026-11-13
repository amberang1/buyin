import { isRoomCode } from '../room-codes.mjs';
import React, { useState } from 'react';
import { ArrowUpRight, Users, Plus } from 'lucide-react';
type Props = { busy:boolean; onCreateGame:()=>void; onJoinGame:(gameId:string)=>void };
export default function HomePhase({busy,onCreateGame,onJoinGame}:Props) {
  const [joinCode,setJoinCode]=useState(()=>{ const c=new URLSearchParams(window.location.search).get('room')||'';return isRoomCode(c)?c:''; });
  return <div className="mx-auto max-w-3xl space-y-5">
    <div className="grid sm:grid-cols-2 gap-4">
      <section className="club-card p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3"><div className="rounded-full bg-primary/10 p-3 text-primary"><Plus size={22}/></div><div><h2 className="font-headline font-bold text-lg">Host a game</h2><p className="text-xs text-on-surface-variant">Set stakes, add players, share a code.</p></div></div>
        <button disabled={busy} onClick={onCreateGame} className="club-button mt-auto flex justify-between items-center">{busy?'Connecting…':'Create new game'}<ArrowUpRight size={18}/></button>
      </section>
      <form className="club-card p-6 space-y-4" onSubmit={e=>{e.preventDefault();if(!busy&&isRoomCode(joinCode))onJoinGame(joinCode);}}>
        <div className="flex items-center gap-3"><div className="rounded-full bg-secondary/10 p-3 text-secondary"><Users size={22}/></div><div><h2 className="font-headline font-bold text-lg">Join a table</h2><p className="text-xs text-on-surface-variant">Enter your host’s 4-digit room code.</p></div></div>
        <label className="sr-only" htmlFor="room-code">Room code (4 digits, or an existing 6-digit code)</label><input id="room-code" className="club-input text-center font-mono tracking-[.35em] text-2xl" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="0000" value={joinCode} onChange={e=>setJoinCode(e.target.value.replace(/\D/g,'').slice(0,6))}/>
        <button className="club-secondary w-full" disabled={busy||!isRoomCode(joinCode)}>Join game</button>
        <p className="text-xs text-on-surface-variant">Existing 6-digit codes still work.</p>
      </form>
    </div>
  </div>;
}
