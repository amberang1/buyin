import React, { useState, useEffect } from 'react';
import { Phase, Player, ExchangeRate } from './types';
import HomePhase from './components/HomePhase';
import SetupPhase from './components/SetupPhase';
import ActivePhase from './components/ActivePhase';
import SettlementPhase from './components/SettlementPhase';
import ResultsPhase from './components/ResultsPhase';
import SettingsPhase from './components/SettingsPhase';
import { Spade, Settings, Layers, LogOut } from 'lucide-react';
import { reconciliation, ledger, moneyCents, chipsToCents } from './ledger.mjs';
import { auth, db, ensureAnonymousUser, projectId } from './firebase';
import { roomRequest } from './rooms';
import { doc, collection, onSnapshot, updateDoc, runTransaction } from 'firebase/firestore';

function samePlayer(a?: Player, b?: Player) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.name === b.name &&
    a.finalStackValue === b.finalStackValue && a.photoUrl === b.photoUrl &&
    JSON.stringify(a.buyIns) === JSON.stringify(b.buyIns) &&
    JSON.stringify(a.cashOuts) === JSON.stringify(b.cashOuts);
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const isHost = !!userId && userId === hostId;
  useEffect(() => {
    let mounted = true;
    ensureAnonymousUser().then(user => {
      if (mounted) { setUserId(user.uid); setAuthError(false); }
    }).catch(error => { console.error(error); if (mounted) setAuthError(true); });
    return () => { mounted = false; };
  }, []);
  const [phase, setPhase] = useState<Phase>('home');
  const [gamePhase, setGamePhase] = useState<Phase>('home');
  const [gameId, setGameId] = useState<string | null>(() => {
    const saved = localStorage.getItem('poker_current_game_id_' + projectId);
    return saved && /^[a-f0-9]{32}$/.test(saved) ? saved : null;
  });
  const [roomCode, setRoomCode] = useState('');
  const [readyRoom, setReadyRoom] = useState<string | null>(null);
  const [readyPlayers, setReadyPlayers] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [retry, setRetry] = useState(0);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>({ 
    baseCurrency: 20, 
    chips: 100,
    chipValues: {
      'Blue': 1,
      'Red': 5,
      'Green': 25,
      'Black': 100,
      'Purple': 500,
      'Yellow': 1000
    }
  });
  const [players, setPlayers] = useState<Player[]>([]);
  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('poker_history_' + projectId);
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  // Never treat a cache miss or transient permission/network error as a reason
  // to erase a saved room. Wait for both authoritative listeners on reload.
  useEffect(() => {
    if (!gameId || !userId) return;
    setReadyRoom(null); setReadyPlayers(null); setRestoreError('');
    const gameRef = doc(db, 'games', gameId);
    const unsubscribeGame = onSnapshot(gameRef, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      if (!snapshot.exists()) {
        setRestoreError('This room could not be found. Retry or leave the room.');
        return;
      }
      const data = snapshot.data();
      setHostId(data.hostId); setRoomCode(data.roomCode || '');
      setGamePhase(data.status as Phase);
      setPhase(current => current === 'settings' ? current : data.status as Phase);
      setExchangeRate(data.exchangeRate);
      setReadyRoom(gameId);
    }, error => {
      console.error(error);
      setRestoreError('Could not reconnect to your room. Your saved room has not been cleared.');
    });
    const unsubscribePlayers = onSnapshot(collection(db, 'games', gameId, 'players'), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      setPlayers(snapshot.docs.map(p => ({ ...p.data(), id: p.id } as Player)));
      setReadyPlayers(gameId);
    }, error => {
      console.error(error);
      setRestoreError('Could not load the ledger. Your saved room has not been cleared.');
    });
    return () => { unsubscribeGame(); unsubscribePlayers(); };
  }, [gameId, userId, retry]);

  const openRoom = (id: string) => {
    localStorage.setItem('poker_current_game_id_' + projectId, id);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState(null, '', url);
    setHostId(null); setPlayers([]); setRoomCode(''); setRestoreError('');
    setReadyRoom(null); setReadyPlayers(null); setGameId(id);
  };

  const handleCreateGame = async () => {
    if (!userId || joining || gameId) return;
    setJoining(true);
    try {
      const pendingKey = 'poker_pending_room_' + userId;
      let id = localStorage.getItem(pendingKey);
      if (!id || !/^[a-f0-9]{32}$/.test(id)) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(pendingKey, id);
      }
      const room = await roomRequest('create', { gameId: id, exchangeRate });
      openRoom(room.gameId);
      localStorage.removeItem(pendingKey);
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not create room.'); }
    finally { setJoining(false); }
  };

  const handleJoinGame = async (code: string) => {
    if (!userId || joining || gameId || !/^\d{6}$/.test(code)) return;
    setJoining(true);
    try {
      const room = await roomRequest('join', { code });
      openRoom(room.gameId);
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not join room.'); }
    finally { setJoining(false); }
  };

  const handleSetExchangeRate = (newRate: ExchangeRate) => {
    if (gameId && (!isHost || gamePhase !== 'setup')) return;
    if (!Number.isFinite(newRate.baseCurrency) || newRate.baseCurrency <= 0 ||
        !Number.isFinite(newRate.chips) || newRate.chips <= 0 ||
        Object.values(newRate.chipValues).some(v => !Number.isFinite(v) || v < 0)) return;
    setExchangeRate(newRate);
    if (gameId) {
      updateDoc(doc(db, 'games', gameId), { exchangeRate: newRate }).catch(error => {
        console.error(error);
        alert('Could not save table settings. Please reload and try again.');
      });
    }
  };

  // The server phase is authoritative. Navigation must not reopen a completed game.
  const advancePhase = async (from: Phase, to: Phase) => {
    if (!gameId || !isHost) return;
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'games', gameId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists() || snapshot.data().status !== from) {
          throw new Error('The game has already changed. Please check the latest screen.');
        }
        tx.update(ref, { status: to });
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not change game phase.');
    }
  };

  // Setup edits write only changed documents and reject stale edits instead of
  // overwriting another device's work. Snapshots update the local UI after commit.
  const handleSetPlayers = async (newPlayersOrCb: Player[] | ((prev: Player[]) => Player[])) => {
    if (!gameId || !isHost) return false;
    const next = typeof newPlayersOrCb === 'function' ? newPlayersOrCb(players) : newPlayersOrCb;
    const before = new Map(players.map(p => [p.id, p]));
    const after = new Map(next.map(p => [p.id, p]));
    const ids = Array.from(new Set([...before.keys(), ...after.keys()]))
      .filter(id => !samePlayer(before.get(id), after.get(id)));
    try {
      await runTransaction(db, async tx => {
        const game = await tx.get(doc(db, 'games', gameId));
        if (!game.exists() || game.data().status !== 'setup') throw new Error('Setup is closed.');
        const refs = ids.map(id => doc(db, 'games', gameId, 'players', id));
        const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
        snapshots.forEach((snap, i) => {
          const current = snap.exists() ? { ...snap.data(), id: snap.id } as Player : undefined;
          if (!samePlayer(current, before.get(ids[i]))) throw new Error('A player changed on another device. Review the latest values and try again.');
        });
        refs.forEach((ref, i) => {
          const player = after.get(ids[i]);
          if (player) tx.set(ref, player);
          else tx.delete(ref);
        });
      });
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save players.');
      return false;
    }
  };

  // Re-read the selected player in a transaction, so simultaneous entries
  // append independently even when the amounts are identical.
  const handleRecordTransaction = async (playerId: string, type: 'buyIn' | 'cashOut', amount: number) => {
    if (!gameId || !isHost || !Number.isFinite(amount) || amount <= 0) return false;
    try {
      await runTransaction(db, async tx => {
        const game = await tx.get(doc(db, 'games', gameId));
        const ref = doc(db, 'games', gameId, 'players', playerId);
        const player = await tx.get(ref);
        if (!game.exists() || game.data().status !== 'active' || !player.exists()) throw new Error('This game or player is no longer active.');
        const rate = game.data().exchangeRate as ExchangeRate;
        if (!Number.isFinite(rate.baseCurrency) || rate.baseCurrency <= 0 || !Number.isFinite(rate.chips) || rate.chips <= 0) throw new Error('Invalid table exchange rate.');
        if (rate.baseCurrency !== exchangeRate.baseCurrency || rate.chips !== exchangeRate.chips) throw new Error('Exchange rate changed. Review the latest rate and try again.');
        const cents = type==='buyIn'?moneyCents(amount):chipsToCents(amount,rate);
        if(cents<=0) throw new Error('Amount must be at least one cent.');
        // Read the other roster entries in the same transaction to prevent
        // concurrent cash-outs from exceeding the cash remaining on the table.
        if(type==='cashOut'){
          const others=await Promise.all(players.filter(p=>p.id!==playerId).map(p=>tx.get(doc(db,'games',gameId,'players',p.id))));
          const current=[{...player.data(),id:player.id},...others.filter(s=>s.exists()).map(s=>({...s.data(),id:s.id}))] as Player[];
          if(cents>ledger(current).tableCents)throw new Error('Cash-out exceeds the table balance.');
        }
        const value=cents/100;
        const field = type === 'buyIn' ? 'buyIns' : 'cashOuts';
        if ((player.data()[field] as number[]).length >= 100) throw new Error('Transaction limit reached for this player.');
        tx.update(ref, { [field]: [...(player.data()[field] as number[]), value] });
      });
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save transaction.');
      return false;
    }
  };

  const handleUndoTransaction = async (playerId:string, type:'buyIn'|'cashOut') => {
    if(!gameId||!isHost)return false;
    const expected=players.find(p=>p.id===playerId);
    const field=type==='buyIn'?'buyIns':'cashOuts';
    if(!expected||expected[field].length<=(type==='buyIn'?1:0))return false;
    const last=expected[field][expected[field].length-1];
    if(!confirm('Undo last '+(type==='buyIn'?'rebuy':'cash-out')+' for '+expected.name+' ($'+last.toFixed(2)+')?'))return false;
    try{
      await runTransaction(db,async tx=>{
        const game=await tx.get(doc(db,'games',gameId));
        const refs=players.map(p=>doc(db,'games',gameId,'players',p.id));
        const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
        if(!game.exists()||game.data().status!=='active')throw new Error('Return to active play before editing entries.');
        const current=snapshots.filter(s=>s.exists()).map(s=>({...s.data(),id:s.id} as Player));
        const target=current.find(p=>p.id===playerId);
        if(!samePlayer(target,expected))throw new Error('This player changed. Review the ledger and retry.');
        const corrected={...target!,[field]:target![field].slice(0,-1)};
        if(ledger(current.map(p=>p.id===playerId?corrected:p)).tableCents<0)throw new Error('Undo the relevant cash-out first; the table cannot have a negative balance.');
        tx.update(doc(db,'games',gameId,'players',playerId),{[field]:corrected[field]});
      });
      return true;
    }catch(error){alert(error instanceof Error?error.message:'Could not undo entry.');return false;}
  };

  const handleStartSession = () => {
    if (players.length < 2 || players.some(p => !p.buyIns.length || p.buyIns.some(v => !Number.isFinite(v) || v <= 0))) { alert('Add at least two players with valid buy-ins.'); return; }
    return advancePhase('setup', 'active');
  };
  const handleSettleGame = () => advancePhase('active', 'settlement');

  // Save all final stacks and the results phase together, or save neither.
  const handleShowResults = async (next: Player[]) => {
    if (!gameId || !isHost || !next.length) return false;
    if (reconciliation(next).difference !== 0) { alert('The ledger must balance before finalizing.'); return false; }
    try {
      await runTransaction(db, async tx => {
        const gameRef = doc(db, 'games', gameId);
        const game = await tx.get(gameRef);
        if (!game.exists() || game.data().status !== 'settlement') throw new Error('Settlement is no longer active.');
        const rate = game.data().exchangeRate as ExchangeRate;
        if (rate.baseCurrency !== exchangeRate.baseCurrency || rate.chips !== exchangeRate.chips) throw new Error('Exchange rate changed. Review the settlement and retry.');
        const refs = next.map(p => doc(db, 'games', gameId, 'players', p.id));
        const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
        snapshots.forEach((snap, i) => {
          const current = snap.exists() ? { ...snap.data(), id: snap.id } as Player : undefined;
          if (!samePlayer(current, players.find(p => p.id === next[i].id))) throw new Error('The ledger changed. Review the latest values and retry.');
        });
        refs.forEach((ref, i) => tx.set(ref, next[i]));
        tx.update(gameRef, { status: 'results' });
      });
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save settlement.');
      return false;
    }
  };
  const handleArchiveSession = () => {
    if (players.length > 0) {
      const newHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        players: [...players],
        exchangeRate: { ...exchangeRate }
      };
      const updatedHistory = [newHistoryItem, ...history].slice(0, 20);
      setHistory(updatedHistory);
      localStorage.setItem('poker_history_' + projectId, JSON.stringify(updatedHistory));
    }
    handleLeaveGame();
  };

  const handleLeaveGame = () => {
    setGameId(null); setHostId(null); setRoomCode(''); setRestoreError('');
    setReadyRoom(null); setReadyPlayers(null); setGamePhase('home');
    localStorage.removeItem('poker_current_game_id_' + projectId);
    setPlayers([]); setPhase('home');
  };

  if (!userId) return <main className="p-8 text-center">{authError ? "Could not connect securely. Reload and try again." : "Connecting securely..."}</main>;
  if (gameId && (restoreError || readyRoom !== gameId || readyPlayers !== gameId)) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-xl font-bold">{restoreError ? 'Reconnect to your room' : 'Restoring your room...'}</h1>
      <p className="text-sm">{restoreError || 'Loading the saved game and player ledger.'}</p>
      <button className="px-5 py-3 bg-primary text-on-primary rounded-xl" onClick={() => setRetry(n => n+1)}>Retry connection</button>
      <button className="text-sm underline" onClick={() => { if (confirm('Leave this room on this device? The game will stay open for others.')) handleLeaveGame(); }}>Leave room</button>
    </main>
  );
  return (
    <div className="bg-surface text-on-surface min-h-screen pb-28 md:pb-24 font-body">
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl flex justify-between items-center px-4 md:px-6 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-3 md:gap-4">
          <Spade className="text-primary w-6 h-6" fill="currentColor" />
          <h1 className="text-2xl font-black text-on-surface font-serif tracking-tight">Buy In</h1>
        </div>
        <div className="flex items-center gap-3">
          {gameId && roomCode && (
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 bg-primary/10 text-primary font-bold rounded-lg text-sm" onClick={async () => {
                try { await navigator.clipboard.writeText(roomCode); alert('Room code copied.'); }
                catch { window.prompt('Room code', roomCode); }
              }}>Room {roomCode}</button>
              {gamePhase !== 'results' && <button className="text-xs underline" onClick={async () => {
                const url = new URL(window.location.href); url.searchParams.set('room', roomCode);
                try { await navigator.clipboard.writeText(url.toString()); alert('Invite link copied. Share with trusted participants.'); }
                catch { window.prompt('Invite link', url.toString()); }
              }}>Invite</button>}
            </div>
          )}
          {gameId && <span className="hidden sm:inline text-xs font-bold text-outline">{isHost ? "Host" : "Guest"}</span>}
        </div>
      </header>

      <main className="pt-24 px-4 md:px-6 max-w-5xl mx-auto space-y-8 md:space-y-12">
        {gameId && hostId && !isHost && phase !== 'home' && <p className="text-sm text-on-surface-variant">Guest view: only the host can edit this ledger.</p>}
        {phase === 'home' && (
          <HomePhase 
            busy={joining}
            onCreateGame={handleCreateGame}
            onJoinGame={handleJoinGame}
          />
        )}
        {phase === 'setup' && (
          <fieldset disabled={!isHost} className="min-w-0 space-y-6 border-0 p-0">
          <SetupPhase 
            exchangeRate={exchangeRate} 
            setExchangeRate={handleSetExchangeRate} 
            players={players} 
            setPlayers={handleSetPlayers}
            onChipSettings={() => setPhase('settings')}
            onStart={handleStartSession}
          />
          </fieldset>
        )}
        {phase === 'active' && (
          <fieldset disabled={!isHost} className="min-w-0 space-y-6 border-0 p-0">
          <ActivePhase 
            players={players}
            onTransaction={handleRecordTransaction}
            onUndo={handleUndoTransaction}
            exchangeRate={exchangeRate}
            onSettle={() => { if (confirm("End play and count final chip stacks?")) handleSettleGame(); }}
          />
          </fieldset>
        )}
        {phase === 'settlement' && (
          <fieldset disabled={!isHost} className="min-w-0 space-y-6 border-0 p-0">
          <SettlementPhase 
            players={players}
            exchangeRate={exchangeRate}
            onComplete={handleShowResults}
            onReturnToPlay={()=>{if(confirm('Return to play to correct buy-ins or cash-outs? Final chip count drafts will be retained for review.'))void advancePhase('settlement','active');}}
            key={gameId!}
            gameId={gameId!}
          />
          </fieldset>
        )}
        {phase === 'results' && (
          <ResultsPhase 
            players={players}
            onArchive={handleArchiveSession}
          />
        )}
        {phase === 'settings' && (
          <SettingsPhase 
            canEdit={isHost && gamePhase === 'setup'}
            exchangeRate={exchangeRate}
            setExchangeRate={handleSetExchangeRate}
            history={history}
            onBack={() => setPhase(gameId ? gamePhase : 'home')}
            onLeaveGame={handleLeaveGame}
            gameId={gameId}
          />
        )}
      </main>

      {phase !== 'home' && (
        <nav className="fixed bottom-0 left-0 w-full club-nav flex justify-around items-center px-4 bg-surface-container-lowest/80 backdrop-blur-xl z-50 shadow-[0_-12px_32px_rgba(62,94,149,0.06)] border-t border-surface-container-low/15">
          <button 
            onClick={() => setPhase(gamePhase)}
            className={`flex flex-col items-center justify-center transition-colors ${phase === 'active' || phase === 'setup' ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            <Layers className="w-6 h-6 mb-1" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">Game</span>
          </button>
          
          <button 
            onClick={() => gamePhase === 'active' ? (confirm('End play and count final chip stacks?') && handleSettleGame()) : setPhase('settlement')}
            disabled={!isHost || (gamePhase !== 'active' && gamePhase !== 'settlement')}
            className={`flex flex-col items-center justify-center transition-colors ${phase === 'settlement' ? 'text-primary' : 'text-on-surface-variant'} disabled:opacity-30`}
          >
            <LogOut className="w-6 h-6 mb-1" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">Cash Out</span>
          </button>

          <button 
            onClick={() => setPhase('settings')}
            className={`flex flex-col items-center justify-center transition-colors ${phase === 'settings' ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            <Settings className="w-6 h-6 mb-1" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">Settings</span>
          </button>
        </nav>
      )}
    </div>
  );
}
