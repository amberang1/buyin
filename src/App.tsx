import React, { useState, useEffect } from 'react';
import { Phase, Player, ExchangeRate } from './types';
import HomePhase from './components/HomePhase';
import SetupPhase from './components/SetupPhase';
import ActivePhase from './components/ActivePhase';
import SettlementPhase from './components/SettlementPhase';
import ResultsPhase from './components/ResultsPhase';
import SettingsPhase from './components/SettingsPhase';
import { Menu, History, Settings, Layers, LogOut } from 'lucide-react';
import { db } from './firebase';
import { doc, collection, onSnapshot, updateDoc, runTransaction } from 'firebase/firestore';

function samePlayer(a?: Player, b?: Player) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.name === b.name &&
    a.finalStackValue === b.finalStackValue && a.photoUrl === b.photoUrl &&
    JSON.stringify(a.buyIns) === JSON.stringify(b.buyIns) &&
    JSON.stringify(a.cashOuts) === JSON.stringify(b.cashOuts);
}

export default function App() {
  const [userId] = useState(() => {
    let id = localStorage.getItem('poker_user_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('poker_user_id', id);
    }
    return id;
  });

  const [phase, setPhase] = useState<Phase>('home');
  const [gamePhase, setGamePhase] = useState<Phase>('home');
  const [gameId, setGameId] = useState<string | null>(() => {
    return localStorage.getItem('poker_current_game_id') || null;
  });
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
    const saved = localStorage.getItem('poker_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Listen to Firebase when gameId is set
  useEffect(() => {
    if (!gameId) return;

    const gameRef = doc(db, 'games', gameId);
    const unsubscribeGame = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status) {
          setGamePhase(data.status as Phase);
          setPhase(current => current === 'settings' ? current : data.status as Phase);
        }
        if (data.exchangeRate) {
          setExchangeRate(data.exchangeRate);
        }
      } else {
        setGameId(null);
        localStorage.removeItem('poker_current_game_id');
        setPlayers([]);
        setGamePhase('home');
        setPhase('home');
        alert('Game not found. Check the room code.');
      }
    }, error => { console.error(error); alert('Unable to load game. Please try again.'); });

    const playersRef = collection(db, 'games', gameId, 'players');
    const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
      const loadedPlayers: Player[] = [];
      snapshot.forEach(doc => {
        loadedPlayers.push({ ...doc.data(), id: doc.id } as Player);
      });
      setPlayers(loadedPlayers);
    }, error => { console.error(error); alert('Unable to load players. Please try again.'); });

    return () => {
      unsubscribeGame();
      unsubscribePlayers();
    };
  }, [gameId]); // Removed phase from dependencies to avoid infinite loops

  const handleCreateGame = async () => {
    try {
      let newGameId = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = Math.floor(1000 + Math.random() * 9000).toString();
        const created = await runTransaction(db, async tx => {
          const ref = doc(db, 'games', candidate);
          if ((await tx.get(ref)).exists()) return false;
          tx.set(ref, { status: 'setup', exchangeRate, createdAt: new Date().toISOString(), hostId: userId });
          return true;
        });
        if (created) { newGameId = candidate; break; }
      }
      if (!newGameId) throw new Error('Could not allocate a room code. Try again.');
      setPlayers([]);
      setGamePhase('setup');
      setGameId(newGameId);
      localStorage.setItem('poker_current_game_id', newGameId);
      setPhase('setup');
    } catch (error: any) {
      console.error("Error creating game:", error);
      alert(`Failed to create game: ${error.message || 'Unknown error'}`);
    }
  };

  const handleJoinGame = (code: string) => {
    setGameId(code);
    localStorage.setItem('poker_current_game_id', code);
    // The onSnapshot will automatically update the phase and players
  };

  const handleSetExchangeRate = (newRate: ExchangeRate) => {
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
    if (!gameId) return;
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
    if (!gameId) return false;
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
    if (!gameId || !Number.isFinite(amount) || amount <= 0) return false;
    try {
      await runTransaction(db, async tx => {
        const game = await tx.get(doc(db, 'games', gameId));
        const ref = doc(db, 'games', gameId, 'players', playerId);
        const player = await tx.get(ref);
        if (!game.exists() || game.data().status !== 'active' || !player.exists()) throw new Error('This game or player is no longer active.');
        const rate = game.data().exchangeRate as ExchangeRate;
        if (!Number.isFinite(rate.baseCurrency) || rate.baseCurrency <= 0 || !Number.isFinite(rate.chips) || rate.chips <= 0) throw new Error('Invalid table exchange rate.');
        if (rate.baseCurrency !== exchangeRate.baseCurrency || rate.chips !== exchangeRate.chips) throw new Error('Exchange rate changed. Review the latest rate and try again.');
        const raw = type === 'buyIn' ? amount : amount * rate.baseCurrency / rate.chips;
        const value = Math.round(raw * 100) / 100;
        if (!Number.isSafeInteger(Math.round(raw * 100)) || value <= 0) throw new Error('Amount must be at least one cent and within the supported range.');
        const field = type === 'buyIn' ? 'buyIns' : 'cashOuts';
        tx.update(ref, { [field]: [...(player.data()[field] as number[]), value] });
      });
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save transaction.');
      return false;
    }
  };

  const handleStartSession = () => advancePhase('setup', 'active');
  const handleSettleGame = () => advancePhase('active', 'settlement');

  // Save all final stacks and the results phase together, or save neither.
  const handleShowResults = async (next: Player[]) => {
    if (!gameId || !next.length) return false;
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
      localStorage.setItem('poker_history', JSON.stringify(updatedHistory));
    }
    setGameId(null);
    localStorage.removeItem('poker_current_game_id');
    setPlayers([]);
    setPhase('home');
  };

  const handleLeaveGame = () => {
    setGameId(null);
    localStorage.removeItem('poker_current_game_id');
    setPlayers([]);
    setPhase('home');
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-28 md:pb-24 font-body">
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl flex justify-between items-center px-4 md:px-6 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-3 md:gap-4">
          <Menu className="text-primary w-6 h-6 cursor-pointer" />
          <h1 className="text-2xl font-black text-on-surface font-serif tracking-tight italic">check</h1>
        </div>
        <div className="flex items-center gap-3">
          {gameId && (
            <div className="px-3 py-1 bg-primary/10 text-primary font-bold rounded-lg text-sm tracking-widest">
              ROOM: {gameId}
            </div>
          )}
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden">
            <div className="w-full h-full bg-outline-variant/30" />
          </div>
        </div>
      </header>

      <main className="pt-24 px-4 md:px-6 max-w-5xl mx-auto space-y-8 md:space-y-12">
        {phase === 'home' && (
          <HomePhase 
            onCreateGame={handleCreateGame}
            onJoinGame={handleJoinGame}
          />
        )}
        {phase === 'setup' && (
          <SetupPhase 
            exchangeRate={exchangeRate} 
            setExchangeRate={handleSetExchangeRate} 
            players={players} 
            setPlayers={handleSetPlayers}
            onStart={handleStartSession}
          />
        )}
        {phase === 'active' && (
          <ActivePhase 
            players={players}
            onTransaction={handleRecordTransaction}
            exchangeRate={exchangeRate}
            onSettle={handleSettleGame}
          />
        )}
        {phase === 'settlement' && (
          <SettlementPhase 
            players={players}
            exchangeRate={exchangeRate}
            onComplete={handleShowResults}
          />
        )}
        {phase === 'results' && (
          <ResultsPhase 
            players={players}
            onArchive={handleArchiveSession}
          />
        )}
        {phase === 'settings' && (
          <SettingsPhase 
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
        <nav className="fixed bottom-0 left-0 w-full h-16 flex justify-around items-center px-4 pb-safe bg-surface-container-lowest/80 backdrop-blur-xl z-50 shadow-[0_-12px_32px_rgba(62,94,149,0.06)] border-t border-surface-container-low/15">
          <button 
            onClick={() => setPhase(gamePhase)}
            className={`flex flex-col items-center justify-center transition-colors ${phase === 'active' || phase === 'setup' ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            <Layers className="w-6 h-6 mb-1" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">Game</span>
          </button>
          
          <button 
            onClick={() => gamePhase === 'active' ? handleSettleGame() : setPhase('settlement')}
            disabled={gamePhase !== 'active' && gamePhase !== 'settlement'}
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
