import React, { useState } from 'react';
import { Play, Users } from 'lucide-react';

type Props = {
  busy: boolean;
  onCreateGame: () => void;
  onJoinGame: (gameId: string) => void;
};

export default function HomePhase({ busy, onCreateGame, onJoinGame }: Props) {
  const [joinCode, setJoinCode] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^[a-f0-9]{32}$/.test(joinCode) && !busy) {
      onJoinGame(joinCode);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-6xl font-black text-on-surface font-serif tracking-tight italic">check</h1>
        <p className="text-on-surface-variant text-lg">Real-time poker ledger</p>
      </div>

      <div className="w-full max-w-sm space-y-6">
        <button 
          onClick={onCreateGame} disabled={busy}
          className="w-full py-4 bg-primary text-on-primary font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dim active:scale-95 transition-all text-lg flex items-center justify-center gap-3"
        >
          <Play className="w-5 h-5 fill-current" />
          <span>Create New Game</span>
        </button>

        <div className="relative flex items-center py-4">
          <div className="flex-grow border-t border-outline-variant/30"></div>
          <span className="flex-shrink-0 mx-4 text-outline text-sm font-bold uppercase tracking-wider">or join existing</span>
          <div className="flex-grow border-t border-outline-variant/30"></div>
        </div>

        <form onSubmit={handleJoin} className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10 space-y-4">
          <div>
            <label className="text-xs uppercase font-bold tracking-wider text-outline block mb-2 text-center">Paste private room code</label>
            <input 
              type="text" 
              autoComplete="off" spellCheck={false}
              maxLength={32}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.trim().toLowerCase())}
              placeholder="Paste room code"
              className="w-full bg-surface-container-low border border-outline-variant/30 focus:border-primary rounded-xl p-4 text-center text-sm font-mono outline-none text-on-surface transition-colors"
            />
          </div>
          <button 
            type="submit"
            disabled={busy || !/^[a-f0-9]{32}$/.test(joinCode)}
            className="w-full py-3.5 bg-secondary text-on-secondary font-bold rounded-xl hover:bg-secondary-dim disabled:opacity-50 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Users className="w-5 h-5" />
            <span>Join Game</span>
          </button>
        </form>
      </div>
    </div>
  );
}
