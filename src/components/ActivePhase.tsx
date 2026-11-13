import React, { useState } from 'react';
import { Player, ExchangeRate } from '../types';
import { Wallet, LogOut } from 'lucide-react';
import { sumCents, ledger, cashToChips, formatMoney, cashOutCents, buyInChipsToCents } from '../ledger.mjs';
import ChipCounter from './ChipCounter';

type Props = {
  players: Player[];
  onTransaction: (playerId: string, type: 'buyIn' | 'cashOut', amount: number) => Promise<boolean>;
  exchangeRate: ExchangeRate;
  onSettle: () => void;
  onAddPlayer?: (name:string,amount:number)=>Promise<boolean>;
  onUndo: (playerId:string,type:'buyIn'|'cashOut')=>Promise<boolean>;
};

export default function ActivePhase({ players, onTransaction, exchangeRate, onSettle, onUndo, onAddPlayer }: Props) {
  const [showAdd,setShowAdd]=useState(false);
  const [newName,setNewName]=useState('');
  const [newBuyIn,setNewBuyIn]=useState('');
  const [adding,setAdding]=useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<'buyIn' | 'cashOut' | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [undoing,setUndoing]=useState(false);
  const undo=async(id:string,type:'buyIn'|'cashOut')=>{if(undoing||saving)return;setUndoing(true);try{await onUndo(id,type)}finally{setUndoing(false)}};

  const totals=ledger(players);
  const totalPot=totals.tableCents/100;
  const [showCounter,setShowCounter]=useState(false);
  let preview='',validAmount=false,inputError='';
  try{if(amount.trim() && Number(amount)>0){
    const n=Number(amount);
    const cents=transactionType==='cashOut'?cashOutCents(players,n,exchangeRate):buyInChipsToCents(n,exchangeRate);
    preview=formatMoney(cents);
    validAmount=cents>0&&(transactionType!=='cashOut'||cents<=totals.tableCents);
  }}catch(e){inputError=(e as Error).message;}
  const handleTransaction = async () => {
    if (!selectedPlayerId || !transactionType || saving) return;
    const value = Number(amount);
    if (!validAmount) return;
    setSaving(true);
    try {
      if (await onTransaction(selectedPlayerId, transactionType, value)) {
        setSelectedPlayerId(null);
        setTransactionType(null);
        setAmount(''); setShowCounter(false);
      }
    } finally {
      setSaving(false);
    }
  };

  let newCents=0,validNew=false;try{newCents=buyInChipsToCents(Number(newBuyIn),exchangeRate);validNew=!!newName.trim()&&newName.trim().length<=49&&newCents>0;}catch{}
  const addPlayer=async()=>{if(!onAddPlayer||!validNew||adding||saving||undoing)return;if(!confirm('Confirm '+newName.trim()+"’s buy-in of "+newBuyIn+" chip units ("+formatMoney(newCents)+") has been received?"))return;setAdding(true);try{if(await onAddPlayer(newName.trim(),Number(newBuyIn))){setNewName('');setNewBuyIn('');setShowAdd(false);}}finally{setAdding(false)}};
  return (
    <>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-12">
        <div className="md:col-span-2 club-hero p-6 md:p-8 flex flex-col justify-between overflow-hidden relative">
          <div className="relative z-10">
            <p className="text-[10px] md:text-xs uppercase tracking-[0.1em] text-[#d7c69f] mb-1 md:mb-2 font-bold">Money on table</p>
            <h2 className="text-4xl md:text-5xl font-extrabold text-[#fffdf8] tracking-tighter font-headline">${totalPot.toFixed(2)}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm"><div><p className="text-[#dae5d9] text-xs">Total buy-ins</p><strong>{formatMoney(totals.inCents)}</strong></div><div><p className="text-[#dae5d9] text-xs">Earlier cash-outs</p><strong>{formatMoney(totals.midCents)}</strong></div></div>
          <div className="mt-6 md:mt-8 flex items-center gap-2 text-[#dae5d9]">
            <Wallet className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-xs md:text-sm font-semibold">Live ledger · after cash-outs</span>
          </div>
          <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-primary/5 to-transparent"></div>
        </div>

        <div className="flex flex-col gap-4 md:gap-6">
          <div className="bg-surface-container-low p-4 md:p-6 rounded-xl flex flex-col">
            <p className="text-[10px] md:text-xs uppercase tracking-[0.1em] text-outline mb-1 font-bold">Players</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl md:text-3xl font-bold text-on-surface">{players.length}</span>
            </div>
          </div>
          <button 
            onClick={onSettle}
            className="w-full py-4 md:py-6 px-4 bg-gradient-to-br from-error to-error-dim text-on-error rounded-xl font-headline font-bold text-base md:text-lg tracking-tight hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-error/20 flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            End game & settle
          </button>
        </div>
      </section>

      <div className="flex justify-between items-end mb-6">
        <div>
          <h3 className="text-xl md:text-2xl font-bold text-on-surface tracking-tight font-headline">Active Players</h3>
          <p className="text-on-surface-variant text-xs md:text-sm">Track buy-ins and chips returned during the game.</p>
        </div>
      </div>

      {onAddPlayer&&<section className="club-card p-4 space-y-3"><button className="club-secondary w-full" disabled={adding||saving||undoing||players.length>=30} onClick={()=>setShowAdd(v=>!v)}>{showAdd?'Cancel adding player':'Add late player'}</button>{showAdd&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void addPlayer();}}><label className="block text-sm">Player name<input className="club-input w-full mt-1" maxLength={49} required value={newName} onChange={e=>setNewName(e.target.value)}/></label><label className="block text-sm">Buy-in received (chip units)<input type="number" inputMode="decimal" min="0" max="100000000" step="any" className="club-input w-full mt-1" required value={newBuyIn} onChange={e=>setNewBuyIn(e.target.value)}/></label>{validNew&&<p className="text-sm text-primary">= {formatMoney(newCents)}</p>}<button className="club-button w-full" disabled={adding||saving||undoing||!validNew}>{adding?'Adding…':'Add player & buy-in'}</button></form>}</section>}
      <div className="space-y-3 md:space-y-4">
        {players.map((player, idx) => {
          const currentBuyIn = sumCents(player.buyIns)/100;
          const currentCashOut = sumCents(player.cashOuts)/100;
          
          return (
            <div key={player.id} className="group bg-surface-container-lowest p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between transition-all hover:bg-surface-container-low border-l-4 border-transparent hover:border-primary shadow-sm rounded-xl gap-4">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-surface-container-highest flex items-center justify-center font-headline font-bold text-primary text-sm md:text-base">
                    {player.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-on-surface text-sm md:text-base">{player.name}</h4>
                    <span className="text-[10px] md:text-xs text-outline uppercase tracking-wider font-bold">Seat {String(idx + 1).padStart(2, '0')}</span>
                  </div>
                </div>
                
                {/* Mobile-only stats */}
                <div className="flex flex-col items-end sm:hidden">
                  <span className="text-[10px] text-outline uppercase tracking-wider font-bold">Total In</span>
                  <span className="text-lg font-bold text-on-surface">${currentBuyIn.toFixed(2)}</span>
                  {currentCashOut > 0 && (
                    <span className="text-[10px] text-error font-bold">Out: ${currentCashOut.toFixed(2)}</span>
                  )}
                </div>
              </div>
              
              {/* Desktop stats */}
              <div className="hidden sm:flex flex-col items-end mr-0 md:mr-8 lg:mr-12">
                <span className="text-[10px] md:text-xs text-outline uppercase tracking-wider font-bold">Total In</span>
                <span className="text-lg md:text-xl font-bold text-on-surface">${currentBuyIn.toFixed(2)}</span>
                {currentCashOut > 0 && (
                  <span className="text-[10px] md:text-xs text-error font-bold">Cashed out: ${currentCashOut.toFixed(2)}</span>
                )}
              </div>

              <div className="flex flex-col gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => {
                    setSelectedPlayerId(player.id);
                    setTransactionType('buyIn');
                    setAmount('');setShowCounter(false); setAmount('');
                  }}
                  className="flex-1 sm:flex-none px-3 md:px-4 py-2.5 md:py-2 bg-secondary-container text-on-secondary-container rounded-lg font-semibold text-sm transition-colors hover:bg-secondary/20 active:scale-95"
                >
                  + Buy-in
                </button>
                <button 
                  onClick={() => {
                    setSelectedPlayerId(player.id);
                    setTransactionType('cashOut');
                    setAmount('');setShowCounter(false); setAmount('');
                  }}
                  className="flex-1 sm:flex-none px-3 md:px-4 py-2.5 md:py-2 text-error font-semibold text-sm border border-error/20 rounded-lg hover:bg-error/5 transition-colors active:scale-95"
                >
                  Cash-out
                </button>
              </div>
              {(player.buyIns.length>1||player.cashOuts.length>0)&&<div className="flex flex-wrap gap-3 text-xs text-outline">
                {player.buyIns.length>1&&<button disabled={undoing||saving} className="underline" onClick={()=>undo(player.id,'buyIn')}>Undo last rebuy</button>}
                {player.cashOuts.length>0&&<button disabled={undoing||saving} className="underline" onClick={()=>undo(player.id,'cashOut')}>Undo last cash-out</button>}
              </div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction Modal */}
      {selectedPlayerId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-md max-h-[88dvh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold mb-2 font-headline text-on-surface">
              {transactionType === 'buyIn' ? 'Add Buy-in' : 'Player Cash-out'}
            </h3>
            <p className="text-on-surface-variant mb-6 text-sm">
              For <span className="font-bold text-on-surface">{players.find(p => p.id === selectedPlayerId)?.name}</span>
            </p>
            
            <div className="space-y-4 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="text-xs uppercase font-bold tracking-wider text-outline">
                  Chip value (units)
                </label>
                <input 
                  type="number" 
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0" step="any"
                  className="w-full mt-1 border-b-2 border-outline-variant/50 focus:border-primary bg-transparent p-2 text-2xl md:text-3xl font-bold outline-none text-on-surface"
                  autoFocus
                />
                {preview && <p className="text-sm text-primary font-bold mt-2">= {preview}</p>}
                {<button type="button" className="club-secondary w-full mt-3" onClick={()=>setShowCounter(v=>!v)}>{showCounter?'Hide chip calculator':'Count chips by color'}</button>}
                {showCounter && <ChipCounter rate={exchangeRate} onApply={units=>{setAmount(String(units));setShowCounter(false)}}/>}
                {amount&&!validAmount&&<p className="text-xs text-error mt-2">{inputError||'Enter a positive chip value within the available table balance.'}</p>}
              </div>
              
              <div className="flex gap-3 pt-6">
                <button 
                  disabled={saving}
                  onClick={() => {
                    setSelectedPlayerId(null);
                    setTransactionType(null);
                    setAmount('');
                  }}
                  className="flex-1 py-3.5 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleTransaction}
                  disabled={saving || !validAmount}
                  className={`flex-1 py-3.5 font-bold rounded-xl transition-colors shadow-sm ${
                    transactionType === 'buyIn' 
                      ? 'bg-secondary text-on-secondary hover:bg-secondary-dim' 
                      : 'bg-error text-on-error hover:bg-error-dim'
                  } disabled:opacity-50 disabled:shadow-none`}
                >
                  {saving ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
