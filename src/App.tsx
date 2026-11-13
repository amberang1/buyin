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
import { doc, collection, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

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
          setPhase(data.status as Phase);
        }
        if (data.exchangeRate) {
          setExchangeRate(data.exchangeRate);
        }
      } else {
        setGameId(null);
        localStorage.removeItem('poker_current_game_id');
        setPhase('home');
      }
    });

    const playersRef = collection(db, 'games', gameId, 'players');
    const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
      const loadedPlayers: Player[] = [];
      snapshot.forEach(doc => {
        loadedPlayers.push(doc.data() as Player);
      });
      setPlayers(loadedPlayers);
    });

    return () => {
      unsubscribeGame();
      unsubscribePlayers();
    };
  }, [gameId]); // Removed phase from dependencies to avoid infinite loops

  const handleCreateGame = async () => {
    const newGameId = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      await setDoc(doc(db, 'games', newGameId), {
        status: 'setup',
        exchangeRate,
        createdAt: new Date().toISOString(),
        hostId: userId
      });
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
    setExchangeRate(newRate);
    if (gameId) {
      updateDoc(doc(db, 'games', gameId), { exchangeRate: newRate }).catch(console.error);
    }
  };

  const handleSetPhase = (newPhase: Phase) => {
    setPhase(newPhase);
    if (gameId && newPhase !== 'home' && newPhase !== 'settings') {
      updateDoc(doc(db, 'games', gameId), { status: newPhase }).catch(console.error);
    }
  };

  const handleSetPlayers = (newPlayersOrCb: Player[] | ((prev: Player[]) => Player[])) => {
    const newPlayers = typeof newPlayersOrCb === 'function' ? newPlayersOrCb(players) : newPlayersOrCb;
    
    // Update local state immediately for responsiveness
    setPlayers(newPlayers);

    if (gameId) {
      const batch = writeBatch(db);
      
      // Delete removed players
      const newPlayerIds = new Set(newPlayers.map(p => p.id));
      players.forEach(p => {
        if (!newPlayerIds.has(p.id)) {
          batch.delete(doc(db, 'games', gameId, 'players', p.id));
        }
      });
      
      // Set/Update players
      newPlayers.forEach(p => {
        batch.set(doc(db, 'games', gameId, 'players', p.id), p);
      });
      
      batch.commit().catch(console.error);
    }
  };

  const handleStartSession = () => handleSetPhase('active');
  const handleSettleGame = () => handleSetPhase('settlement');
  const handleShowResults = () => handleSetPhase('results');
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
            setPlayers={handleSetPlayers}
            exchangeRate={exchangeRate}
            onSettle={handleSettleGame}
          />
        )}
        {phase === 'settlement' && (
          <SettlementPhase 
            players={players}
            setPlayers={handleSetPlayers}
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
            onBack={() => setPhase(gameId ? (players.length > 0 ? 'active' : 'setup') : 'home')}
            onLeaveGame={handleLeaveGame}
            gameId={gameId}
          />
        )}
      </main>

      {phase !== 'home' && (
        <nav className="fixed bottom-0 left-0 w-full h-16 flex justify-around items-center px-4 pb-safe bg-surface-container-lowest/80 backdrop-blur-xl z-50 shadow-[0_-12px_32px_rgba(62,94,149,0.06)] border-t border-surface-container-low/15">
          <button 
            onClick={() => handleSetPhase(players.length > 0 ? 'active' : 'setup')}
            className={`flex flex-col items-center justify-center transition-colors ${phase === 'active' || phase === 'setup' ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            <Layers className="w-6 h-6 mb-1" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">Game</span>
          </button>
          
          <button 
            onClick={() => players.length > 0 && handleSetPhase('settlement')}
            disabled={players.length === 0}
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
