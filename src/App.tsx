import ChipCheck from './components/ChipCheck';
import { isRoomCode } from './room-codes.mjs';
import React, { useState, useEffect, useRef } from 'react';
import { Phase, Player, ExchangeRate, PlayerRequest, Payment } from './types';
import { roomScreen } from './navigation.mjs';
import ParticipationPanel from './components/ParticipationPanel';
import HomePhase from './components/HomePhase';
import SetupPhase from './components/SetupPhase';
import ActivePhase from './components/ActivePhase';
import SettlementPhase from './components/SettlementPhase';
import ResultsPhase from './components/ResultsPhase';
import SettingsPhase from './components/SettingsPhase';
import { Settings, Layers, LogOut, Home } from 'lucide-react';
import { validateSettings } from './ledger.mjs';
import { db, ensureAnonymousUser, projectId } from './firebase';
import { roomRequest, ledgerRequest } from './rooms';
import { doc, collection, onSnapshot, query, where } from 'firebase/firestore';

function samePlayer(a?: Player, b?: Player) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.name === b.name &&
    a.finalStackValue === b.finalStackValue && a.photoUrl === b.photoUrl &&
    JSON.stringify(a.buyIns) === JSON.stringify(b.buyIns) &&
    JSON.stringify(a.cashOuts) === JSON.stringify(b.cashOuts);
}

const newRoomRate = (): ExchangeRate => ({baseCurrency:20,chips:100,chipValues:{Blue:1,Red:10,Green:5,Black:50}});

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
  const homeViewKey='poker_home_view_'+projectId;
  const homeVisible=useRef(localStorage.getItem(homeViewKey)==='home');
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
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>(newRoomRate);
  const [players, setPlayers] = useState<Player[]>([]);
  const [requests,setRequests]=useState<PlayerRequest[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [participationReady,setParticipationReady]=useState(false);
  const [participationError,setParticipationError]=useState('');
  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('poker_history_' + projectId);
    try { const value=saved?JSON.parse(saved):[]; return Array.isArray(value)?value:[]; } catch { return []; }
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
      setPhase(current => roomScreen(current,data.status,homeVisible.current) as Phase);
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

  useEffect(()=>{
    if(!gameId||!userId||!hostId)return;
    setRequests([]);setPayments([]);setParticipationReady(false);setParticipationError('');
    let requestsReady=false,paymentsReady=false,failed=false;
    const error=()=>{failed=true;setParticipationReady(false);setParticipationError('Could not load requests and payments. Retry the connection before making changes.');};
    const requestSource=isHost?collection(db,'games',gameId,'requests'):query(collection(db,'games',gameId,'requests'),where('uid','==',userId));
    const stopRequests=onSnapshot(requestSource,{includeMetadataChanges:true},snapshot=>{if(snapshot.metadata.fromCache)return;setRequests(snapshot.docs.map(d=>d.data() as PlayerRequest));requestsReady=true;setParticipationReady(!failed&&requestsReady&&paymentsReady);},error);
    const stopPayments=onSnapshot(collection(db,'games',gameId,'payments'),{includeMetadataChanges:true},snapshot=>{if(snapshot.metadata.fromCache)return;setPayments(snapshot.docs.map(d=>d.data() as Payment));paymentsReady=true;setParticipationReady(!failed&&requestsReady&&paymentsReady);},error);
    return()=>{stopRequests();stopPayments();};
  },[gameId,userId,hostId,isHost,retry]);
  const participantAction=async(action:string,data:unknown)=>{
    if(!gameId||!participationReady)return false;
    try{await ledgerRequest(gameId,action,data);return true;}
    catch(error){alert(error instanceof Error?error.message:'Could not save.');return false;}
  };
  const goHome=()=>{homeVisible.current=true;try{localStorage.setItem(homeViewKey,'home');}catch{}setPhase('home');};
  const resumeRoom=()=>{homeVisible.current=false;localStorage.removeItem(homeViewKey);setPhase(gamePhase==='home'?'setup':gamePhase);};
  const openRoom = (id: string) => {
    homeVisible.current=false;localStorage.removeItem(homeViewKey);
    localStorage.setItem('poker_current_game_id_' + projectId, id);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState(null, '', url);
    setHostId(null); setPlayers([]); setRoomCode(''); setRestoreError('');
    setRequests([]);setPayments([]);setParticipationReady(false);setParticipationError('');
    setReadyRoom(null); setReadyPlayers(null); setGameId(id);
  };

  const handleCreateGame = async () => {
    if (!userId || joining) return;
    if(gameId&&!confirm('Switch to a new room on this device? Your current room will stay open.'))return;
    setJoining(true);
    try {
      const pendingKey = 'poker_pending_room_' + userId;
      let id = localStorage.getItem(pendingKey);
      if (!id || !/^[a-f0-9]{32}$/.test(id)) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(pendingKey, id);
      }
      const room = await roomRequest('create', { gameId: id, exchangeRate: newRoomRate() });
      openRoom(room.gameId);
      localStorage.removeItem(pendingKey);
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not create room.'); }
    finally { setJoining(false); }
  };

  const handleJoinGame = async (code: string) => {
    if (!userId || joining || !isRoomCode(code)) return;
    if(gameId&&!confirm('Switch rooms on this device? Your current room will stay open.'))return;
    setJoining(true);
    try {
      const room = await roomRequest('join', { code });
      openRoom(room.gameId);
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not join room.'); }
    finally { setJoining(false); }
  };

  const [settingsBusy,setSettingsBusy]=useState(false);
  const saveAction=async(action:string,data:unknown)=>{
    if(!gameId||!isHost)return false;
    try{await ledgerRequest(gameId,action,data);return true;}
    catch(error){alert(error instanceof Error?error.message:'Could not save.');return false;}
  };
  const handleSetExchangeRate = async(newRate:ExchangeRate, expected:ExchangeRate=exchangeRate) => {
    if(settingsBusy||!isHost||gamePhase!=='setup')return false;
    try{validateSettings(newRate);}catch(error){alert((error as Error).message);return false;}
    setSettingsBusy(true);
    try{return await saveAction('settings',{rate:newRate,expected});}finally{setSettingsBusy(false);}
  };
  const advancePhase=async(from:Phase,to:Phase)=>saveAction('phase',{from,to});
  const handleSetPlayers=async(nextOrCb:Player[]|((prev:Player[])=>Player[]))=>{
    const next=typeof nextOrCb==='function'?nextOrCb(players):nextOrCb;
    const ids=Array.from(new Set([...players.map(p=>p.id),...next.map(p=>p.id)]));
    const changes=ids.filter(id=>!samePlayer(players.find(p=>p.id===id),next.find(p=>p.id===id)))
      .map(id=>({id,before:players.find(p=>p.id===id)||null,after:next.find(p=>p.id===id)||null}));
    return saveAction('setup',{changes,rate:exchangeRate});
  };
  const handleRecordTransaction=(playerId:string,type:'buyIn'|'cashOut',amount:number)=>saveAction('record',{playerId,type,amount,rate:exchangeRate,...(type==='buyIn'?{unit:'chips'}:{})});
  const handleUndoTransaction=async(playerId:string,type:'buyIn'|'cashOut')=>{
    const expected=players.find(p=>p.id===playerId);if(!expected)return false;
    if(!confirm('Undo last '+(type==='buyIn'?'rebuy':'cash-out')+' for '+expected.name+'?'))return false;
    return saveAction('undo',{playerId,type,expected});
  };
  const handleStartSession=()=>advancePhase('setup','active');
  const handleSettleGame=()=>advancePhase('active','settlement');
  const handleShowResults=(stacks:Record<string,string>,photos:Record<string,string>)=>saveAction('finalize',{stacks,photos,expected:players,rate:exchangeRate});
  const handleArchiveSession = () => {
    if(!participationReady){alert('Wait for payment records to load before archiving.');return;}
    if (players.length > 0) {
      const newHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        players: players.map(({photoUrl,...player})=>player),
        roomId: gameId, roomCode, payments,
        exchangeRate: { ...exchangeRate }
      };
      const updatedHistory = [newHistoryItem, ...history].slice(0, 20).map(item=>({...item,players:item.players.map(({photoUrl,...p}:Player)=>p)}));
      try { localStorage.setItem('poker_history_' + projectId, JSON.stringify(updatedHistory)); setHistory(updatedHistory); }
      catch { alert('Could not save your archive: device storage is full. Share results or free space, then retry.'); return; }
    }
    handleLeaveGame();
  };

  const handleLeaveGame = () => {
    homeVisible.current=false;localStorage.removeItem(homeViewKey);
    setGameId(null); setHostId(null); setRoomCode(''); setRestoreError('');
    setReadyRoom(null); setReadyPlayers(null); setGamePhase('home');
    localStorage.removeItem('poker_current_game_id_' + projectId);
    setPlayers([]); setRequests([]);setPayments([]);setParticipationReady(false);setParticipationError(''); setPhase('home');
  };

  if (!userId) return <main className="p-8 text-center">{authError ? "Could not connect securely. Reload and try again." : "Connecting securely..."}</main>;
  if (gameId && !homeVisible.current && (restoreError || readyRoom !== gameId || readyPlayers !== gameId)) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-xl font-bold">{restoreError ? 'Reconnect to your room' : 'Restoring your room...'}</h1>
      <p className="text-sm">{restoreError || 'Loading the saved game and player ledger.'}</p>
      <button className="px-5 py-3 bg-primary text-on-primary rounded-xl" onClick={() => setRetry(n => n+1)}>Retry connection</button>
      <button className="club-secondary" onClick={goHome}>Home — keep room saved</button>
      <button className="text-sm underline" onClick={() => { if (confirm('Leave this room on this device? The game will stay open for others.')) handleLeaveGame(); }}>Leave room</button>
    </main>
  );
  return (
    <div className="bg-surface text-on-surface min-h-screen pb-28 md:pb-24 font-body">
      {phase !== 'home' && <header className="fixed top-0 w-full z-50 bg-surface/95 backdrop-blur-xl flex justify-between items-center gap-2 px-4 md:px-6 py-4 border-b border-outline-variant/10">
        <h1 className="brand-wordmark brand-wordmark--compact">Big Stack</h1>
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
      </header>}

      <main className={(phase === 'home' ? 'pt-12 sm:pt-20' : 'pt-24') + " px-4 md:px-6 max-w-3xl mx-auto space-y-5 md:space-y-6"}>
        {gameId && hostId && !isHost && phase !== 'home' && <p className="text-sm text-on-surface-variant">Your requests appear below. The host confirms financial entries.</p>}
        {gameId&&participationError&&<div role="alert" className="club-card p-4 text-error">{participationError}<button className="club-secondary ml-2" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
        {gameId&&(phase==='active'||phase==='settlement')&&<ChipCheck key={gameId} gameId={gameId} rate={exchangeRate}/>}
        {gameId&&userId&&phase!=='home'&&phase!=='settings'&&<ParticipationPanel uid={userId} host={isHost} phase={gamePhase} players={players} requests={requests} rate={exchangeRate} ready={participationReady} onAction={participantAction}/>}
        {phase === 'home' && (
          <><h1 className="brand-wordmark brand-wordmark--home">Big Stack</h1>{gameId&&<section className="club-card p-5 space-y-3"><h2 className="text-xl font-bold">Your saved room{roomCode?' · '+roomCode:''}</h2><p className="text-sm text-on-surface-variant">Your room and entries are saved. Resume whenever you’re ready.</p><button className="club-button w-full" onClick={resumeRoom}>Resume room</button></section>}<HomePhase busy={joining} onCreateGame={handleCreateGame} onJoinGame={handleJoinGame}/><button className="club-secondary w-full" onClick={()=>setPhase('settings')}>Game history</button></>
        )}
        {phase === 'setup' && (
          <fieldset disabled={!isHost||settingsBusy} className="min-w-0 space-y-6 border-0 p-0">
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
            onAddPlayer={isHost?(name,amount)=>saveAction('addPlayer',{name,amount,unit:'chips',rate:exchangeRate}):undefined}
            onTransaction={handleRecordTransaction}
            onUndo={handleUndoTransaction}
            exchangeRate={exchangeRate}
            onSettle={() => { if (confirm("End play and count final chip stacks?")) handleSettleGame(); }}
          />
          </fieldset>
        )}
        {phase === 'settlement' && (
          <fieldset key={gameId!} disabled={!isHost} className="min-w-0 space-y-6 border-0 p-0">
          <SettlementPhase 
            players={players}
            exchangeRate={exchangeRate}
            onComplete={handleShowResults}
            onReturnToPlay={()=>{if(confirm('Return to play to correct buy-ins or cash-outs? Final chip count drafts will be retained for review.'))void advancePhase('settlement','active');}}
            gameId={gameId!}
          />
          </fieldset>
        )}
        {phase === 'results' && (
          <ResultsPhase 
            players={players}
            onArchive={handleArchiveSession}
            payments={payments}
            canRecordPayments={isHost&&participationReady}
            onPayment={(playerId,amount,expectedCents)=>participantAction('payment',{playerId,amount,expectedCents})}
          />
        )}
        {phase === 'settings' && (
          <SettingsPhase 
            canEdit={isHost && gamePhase === 'setup' && !settingsBusy}
            exchangeRate={exchangeRate}
            setExchangeRate={handleSetExchangeRate}
            history={history}
            onBack={() => setPhase(gameId&&!homeVisible.current ? gamePhase : 'home')}
            onLeaveGame={handleLeaveGame}
            gameId={gameId}
          />
        )}
      </main>

      {gameId && phase !== 'home' && (
        <nav className="fixed bottom-0 left-0 w-full club-nav flex justify-around items-center px-4 bg-surface-container-lowest/80 backdrop-blur-xl z-50 shadow-[0_-12px_32px_rgba(62,94,149,0.06)] border-t border-surface-container-low/15">
          <button onClick={goHome} className="flex flex-col items-center justify-center text-on-surface-variant"><Home className="w-6 h-6 mb-1"/><span className="text-[11px] uppercase tracking-wider font-semibold">Home</span></button>
          <button 
            onClick={resumeRoom}
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
            <span className="text-[11px] uppercase tracking-wider font-semibold">Settle game</span>
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
