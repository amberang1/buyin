import React, { useState } from 'react';
import { ArrowUpRight, Users, Spade, Plus } from 'lucide-react';
type Props = { busy:boolean; onCreateGame:()=>void; onJoinGame:(gameId:string)=>void };
export default function HomePhase({busy,onCreateGame,onJoinGame}:Props) {
  const [joinCode,setJoinCode]=useState(()=>{ const c=new URLSearchParams(window.location.search).get('room')||'';return /^\d{6}$/.test(c)?c:''; });
  return <div className="mx-auto max-w-3xl space-y-5">
    <section className="club-hero p-7 sm:p-10 min-h-64 flex flex-col justify-between">
      <div className="flex justify-between items-start"><span className="club-kicker text-[#d7c69f]">The table is yours</span><Spade className="w-10 h-10 text-[#d7c69f]" strokeWidth={1.2}/></div>
      <div className="mt-8"><h1 className="font-serif text-5xl sm:text-6xl leading-[1.05] tracking-tight">Good hands.<br/>Clean books.</h1><p className="mt-4 text-sm text-[#dae5d9] max-w-sm">Keep the chips moving and let Buy In keep score.</p></div>
    </section>
    <div className="grid sm:grid-cols-2 gap-4">
      <section className="club-card p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3"><div className="rounded-full bg-primary/10 p-3 text-primary"><Plus size={22}/></div><div><h2 className="font-headline font-bold text-lg">Host a game</h2><p className="text-xs text-on-surface-variant">Set stakes, add players, share a code.</p></div></div>
        <button disabled={busy} onClick={onCreateGame} className="club-button mt-auto flex justify-between items-center">{busy?'Connecting…':'Create new game'}<ArrowUpRight size={18}/></button>
      </section>
      <form className="club-card p-6 space-y-4" onSubmit={e=>{e.preventDefault();if(!busy&&/^\d{6}$/.test(joinCode))onJoinGame(joinCode);}}>
        <div className="flex items-center gap-3"><div className="rounded-full bg-secondary/10 p-3 text-secondary"><Users size={22}/></div><div><h2 className="font-headline font-bold text-lg">Join a table</h2><p className="text-xs text-on-surface-variant">Enter your host’s room code.</p></div></div>
        <label className="sr-only" htmlFor="room-code">Six-digit room code</label><input id="room-code" className="club-input text-center font-mono tracking-[.35em] text-2xl" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="000000" value={joinCode} onChange={e=>setJoinCode(e.target.value.replace(/\D/g,'').slice(0,6))}/>
        <button className="club-secondary w-full" disabled={busy||!/^\d{6}$/.test(joinCode)}>Join game</button>
      </form>
    </div>
    <p className="text-center text-xs text-on-surface-variant">No account needed · Live room updates · Settle in minutes</p>
  </div>;
}
