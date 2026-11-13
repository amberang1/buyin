import React, { useState } from 'react';
import { sumCents, cashToChips, replaceInitialBuyIn, buyInChipsToCents, formatMoney } from '../ledger.mjs';
import { Player, ExchangeRate } from '../types';
import { RefreshCw, UserPlus, Users, Trash2, Play, Edit3 } from 'lucide-react';

type Props = {
  exchangeRate: ExchangeRate;
  setExchangeRate: (rate: ExchangeRate) => void;
  players: Player[];
  setPlayers: (players: Player[] | ((prev: Player[]) => Player[])) => Promise<boolean>;
  onChipSettings: () => void;
  onStart: () => void;
};

export default function SetupPhase({ exchangeRate, setExchangeRate, players, setPlayers, onChipSettings, onStart }: Props) {
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerBuyIn, setNewPlayerBuyIn] = useState('');
  const [bulkBuyIn, setBulkBuyIn] = useState('');
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  const [saving, setSaving] = useState(false);
  let initialCents=0,bulkCents=0,initialError='',bulkError='';
  try{if(newPlayerBuyIn.trim())initialCents=buyInChipsToCents(Number(newPlayerBuyIn),exchangeRate);}catch(e){initialError=(e as Error).message;}
  try{if(bulkBuyIn.trim())bulkCents=buyInChipsToCents(Number(bulkBuyIn),exchangeRate);}catch(e){bulkError=(e as Error).message;}
  const validInitial=!initialError;
  const handleAddPlayer = async () => {
    if (!newPlayerName.trim() || newPlayerName.trim().length > 49 || !validInitial || saving || players.length>=30) return;
    
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: newPlayerName.trim(),
      buyIns: newPlayerBuyIn ? [initialCents / 100] : [],
      cashOuts: [],
      finalStackValue: 0,
    };

    setSaving(true);
    try {
      if (await setPlayers(prev => [...prev, newPlayer])) {
        setNewPlayerName('');
        setNewPlayerBuyIn('');
      }
    } finally { setSaving(false); }
  };

  const handleBulkApply = async () => {
    const cents=bulkCents;
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 10000000000 || saving) return;
    setSaving(true);
    try {
      if (await setPlayers(prev => prev.map(p => ({ ...p, buyIns: replaceInitialBuyIn(p.buyIns,cents/100) })))) {
        setShowBulkEdit(false);
        setBulkBuyIn('');
      }
    } finally { setSaving(false); }
  };

  const removePlayer = async (id: string) => {
    if(saving)return;setSaving(true);try{await setPlayers(prev => prev.filter(p => p.id !== id));}finally{setSaving(false);}
  };

  const totalTableValue = sumCents(players.flatMap(p=>p.buyIns))/100;
  const totalChips = cashToChips(totalTableValue,exchangeRate);
  
  const hasMissingBuyIns = players.some(p => p.buyIns.length === 0 || p.buyIns.some(v => !Number.isFinite(v) || v <= 0));
  const canStart = !saving && players.length >= 2 && !hasMissingBuyIns && exchangeRate.baseCurrency > 0 && exchangeRate.chips > 0;

  return (
    <>
      <section className="space-y-2">
        <span className="text-[0.75rem] uppercase tracking-[0.1em] text-secondary font-bold">01 / Set the table</span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-on-surface font-serif">Set the table.</h1>
        <p className="text-on-surface-variant max-w-xl text-sm md:text-base">Choose the exchange rate, define chip colors and add your players. Enter total chip value, not the number of physical chips.</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
        <div className="lg:col-span-5 space-y-6">
          {/* Exchange Rate Card */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl shadow-[0_12px_32px_rgba(62,94,149,0.06)] space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="text-primary w-5 h-5 md:w-6 md:h-6" />
                <h3 className="text-lg font-bold tracking-tight font-headline">Table Stakes</h3>
              </div>
            </div>
            
            <div className="flex items-center gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
              <div className="flex-1">
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-primary font-bold">$</span>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    key={exchangeRate.baseCurrency} defaultValue={exchangeRate.baseCurrency}
                    onBlur={e => { const val=Number(e.target.value); if(Number.isFinite(val)&&val>0&&val<=1000000)setExchangeRate({...exchangeRate,baseCurrency:val});else e.target.value=String(exchangeRate.baseCurrency); }}
                    className="bg-transparent border-none pl-5 pr-0 py-2 w-full focus:ring-0 font-bold outline-none text-base md:text-2xl"
                    placeholder="0"
                  />
                </div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-outline mt-1">Currency Value</p>
              </div>
              
              <div className="text-outline font-bold text-xl">to</div>
              
              <div className="flex-1 text-right">
                <input aria-label="Chip units" type="number" inputMode="decimal" min="1" key={exchangeRate.chips} defaultValue={exchangeRate.chips} onBlur={e=>{const val=Number(e.target.value);if(Number.isFinite(val)&&val>0&&val<=100000000)setExchangeRate({...exchangeRate,chips:val});else e.target.value=String(exchangeRate.chips);}} className="w-full bg-transparent text-right font-bold text-xl py-2"/>
                <p className="text-[10px] uppercase font-bold tracking-wider text-outline mt-1">Chips</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
              <p className="text-xs text-on-surface-variant font-medium">
                Standard rate: <span className="font-bold text-primary">${exchangeRate.baseCurrency.toFixed(2)}</span> per {exchangeRate.chips} credits.
              </p>
            </div>
          </div>

          <div className="club-card p-4 flex justify-between items-center gap-3"><div><p className="font-bold text-sm">Chip denominations</p><p className="text-xs text-on-surface-variant">Set colors and values before scanning.</p></div><button onClick={onChipSettings} className="club-secondary text-sm">Configure</button></div>
          {/* Add player Card */}
          <div className="bg-surface-container-low p-6 md:p-8 rounded-xl space-y-6">
            <div className="flex items-center gap-3">
              <UserPlus className="text-primary w-5 h-5 md:w-6 md:h-6" />
              <h3 className="text-lg font-bold tracking-tight font-headline">Add player</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1 group">
                <label className="text-[10px] uppercase font-bold tracking-wider text-outline group-focus-within:text-primary transition-colors">Player Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Alex" maxLength={49} 
                  value={newPlayerName}
                  onChange={e => setNewPlayerName(e.target.value)}
                  className="w-full bg-transparent border-none border-b border-outline-variant/30 focus:border-primary focus:ring-0 p-0 py-2 placeholder:text-outline-variant/50 transition-all font-medium outline-none text-base"
                />
              </div>
              <div className="space-y-1 group">
                <label className="text-[10px] uppercase font-bold tracking-wider text-outline group-focus-within:text-primary transition-colors">Initial buy-in (chip units) - optional</label>
                <input 
                  type="number" 
                  inputMode="decimal"
                  placeholder="Leave blank to bulk enter later" 
                  step="any" value={newPlayerBuyIn}
                  onChange={e => setNewPlayerBuyIn(e.target.value)}
                  className="w-full bg-transparent border-none border-b border-outline-variant/30 focus:border-primary focus:ring-0 p-0 py-2 placeholder:text-outline-variant/50 transition-all font-medium outline-none text-base"
                />
                {newPlayerBuyIn&&<p className="text-xs text-primary">{initialError||"= "+formatMoney(initialCents)}</p>}
              </div>
              <button 
                onClick={handleAddPlayer}
                disabled={saving || players.length>=30 || !newPlayerName.trim() || !validInitial}
                className="w-full py-3.5 md:py-4 bg-secondary text-on-secondary font-bold rounded-lg hover:bg-secondary-dim disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4 active:scale-95"
              >
                <span>ADD TO GAME</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Game */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl shadow-[0_12px_32px_rgba(62,94,149,0.06)] overflow-hidden">
          <div className="px-6 md:px-8 py-5 md:py-6 bg-surface-container border-b border-outline-variant/20 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Users className="text-primary w-5 h-5 md:w-6 md:h-6" />
              <h3 className="text-lg font-bold tracking-tight font-headline">Current Game</h3>
            </div>
            <div className="flex items-center gap-2">
              {players.length > 0 && (
                <button 
                  onClick={() => setShowBulkEdit(!showBulkEdit)}
                  className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  title="Bulk Edit Buy-ins"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-full">{players.length} PLAYERS</span>
            </div>
          </div>

          {showBulkEdit && players.length > 0 && (
            <div className="px-6 md:px-8 py-4 bg-primary/5 border-b border-primary/10 animate-in slide-in-from-top duration-200">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-primary mb-1 block">Set initial buy-ins (chip units)</label>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    placeholder="e.g. 200"
                    step="any" value={bulkBuyIn}
                    onChange={e => setBulkBuyIn(e.target.value)}
                    className="w-full bg-transparent border-b border-primary/30 focus:border-primary p-1 font-bold outline-none text-base"
                  />
                  {bulkBuyIn&&<p className="text-xs text-primary">{bulkError||"= "+formatMoney(bulkCents)+" per player"}</p>}
                </div>
                <button 
                  onClick={handleBulkApply}
                  disabled={saving || !!bulkError || bulkCents<=0}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all"
                >
                  APPLY TO ALL
                </button>
              </div>
            </div>
          )}
          
          <div className="divide-y divide-outline-variant/20">
            {players.length === 0 ? (
              <div className="px-6 md:px-8 py-12 text-center text-outline text-sm">
                No players added yet. Add players to begin.
              </div>
            ) : (
              players.map((player, idx) => {
                const playerChips = cashToChips(sumCents(player.buyIns)/100,exchangeRate);
                const isMissingBuyIn = player.buyIns.length === 0;
                
                return (
                  <div key={player.id} className="px-6 md:px-8 py-4 md:py-6 flex items-center justify-between hover:bg-surface-container-low transition-colors group">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center text-on-tertiary-container font-bold text-xs md:text-sm">
                        {player.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-sm md:text-base">{player.name}</p>
                        <p className="text-[10px] md:text-[11px] uppercase tracking-wide text-outline font-semibold">Seat {String(idx + 1).padStart(2, '0')}</p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-4 md:gap-8">
                      {isMissingBuyIn ? (
                        <div className="px-3 py-1 bg-error/10 text-error rounded text-xs font-bold uppercase tracking-wider">
                          Missing Buy-in
                        </div>
                      ) : (
                        <div>
                          <p className="font-bold text-primary text-sm md:text-base">${(sumCents(player.buyIns)/100).toFixed(2)}</p>
                          <p className="text-[10px] text-outline text-right">{playerChips.toLocaleString()} Chips</p>
                        </div>
                      )}
                      <button aria-label={'Edit buy-in for '+player.name} disabled={saving} onClick={async()=>{const raw=prompt('Initial buy-in in chip units for '+player.name,String(player.buyIns.length?cashToChips(player.buyIns[0],exchangeRate):''));if(raw===null)return;let cents:number;try{cents=buyInChipsToCents(Number(raw),exchangeRate);}catch(e){alert((e as Error).message);return;}if(!confirm(Number(raw)+' chip units = '+formatMoney(cents)+'. Save initial buy-in?'))return;setSaving(true);try{await setPlayers(prev=>prev.map(p=>p.id===player.id?{...p,buyIns:replaceInitialBuyIn(p.buyIns,cents/100)}:p));}finally{setSaving(false);}}} className="text-primary p-2"><Edit3 size={16}/></button>
                      <button aria-label={'Remove '+player.name} onClick={() => removePlayer(player.id)} disabled={saving} className="opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity text-error hover:scale-110 p-2 md:p-0">
                        <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-6 md:p-8 bg-surface-container-low/50 border-t border-outline-variant/20">
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm font-bold uppercase tracking-widest text-outline">Total Table Value</span>
              <div className="text-right">
                <p className="text-2xl md:text-3xl font-extrabold text-on-surface tracking-tighter">${totalTableValue.toFixed(2)}</p>
                <p className="text-[10px] md:text-xs text-secondary font-bold">{totalChips.toLocaleString()} TOTAL CHIPS</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 md:pt-8 flex flex-col items-end gap-2">
        <button 
          onClick={onStart}
          disabled={!canStart}
          className="w-full md:w-auto px-12 py-4 md:py-5 bg-gradient-to-br from-primary to-primary-dim text-on-primary font-extrabold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all tracking-wider text-sm flex items-center justify-center gap-3"
        >
          <span>START SESSION</span>
          <Play className="w-5 h-5 fill-current" />
        </button>
        {hasMissingBuyIns && (
          <p className="text-error text-xs font-bold uppercase tracking-wider">
            All players must have a buy-in to start
          </p>
        )}
      </div>
    </>
  );
}
