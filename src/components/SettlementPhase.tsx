import React, { useState, useRef, useEffect } from 'react';
import { Player, ExchangeRate } from '../types';
import { Camera, Image as ImageIcon, X, Sparkles, Loader2 } from 'lucide-react';
import { scanChips } from '../scan';

type Props = {
  gameId: string;
  players: Player[];
   exchangeRate: ExchangeRate;
  onComplete: (players: Player[]) => Promise<boolean>;
};

export default function SettlementPhase({ gameId, players, exchangeRate, onComplete }: Props) {
  const [saving, setSaving] = useState(false);
  const draftKey = 'poker_stack_draft_' + gameId;
  const [finalStacks, setFinalStacks] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify(finalStacks)); } catch { /* storage unavailable */ }
  }, [draftKey, finalStacks]);
  const [playerPhotos, setPlayerPhotos] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handlePhotoUpload = (playerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 650000 || !['image/jpeg','image/png','image/webp'].includes(file.type)) { alert('Choose a JPEG, PNG or WebP under 650 KB.'); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPlayerPhotos(prev => ({ ...prev, [playerId]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIScan = async (playerId: string) => {
    const photoData = playerPhotos[playerId];
    if (!photoData) return;

    setScanning(prev => ({ ...prev, [playerId]: true }));

    try {
      const result = await scanChips(gameId, 'stack', photoData);
      if (!/^\d+(\.\d+)?$/.test(result) || !Number.isFinite(Number(result))) throw new Error('Invalid scan result.');
      const estimatedChips = Number(result);
      
      setFinalStacks(prev => ({ ...prev, [playerId]: estimatedChips.toString() }));
    } catch (error) {
      console.error("AI Scan failed:", error);
      alert('Unable to read the chip stack reliably. Enter the value manually.');
    } finally {
      setScanning(prev => ({ ...prev, [playerId]: false }));
    }
  };

  const removePhoto = (playerId: string) => {
    setPlayerPhotos(prev => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  };

  const validStacks = players.length > 0 && players.every(p => {
    const raw = finalStacks[p.id];
    const cents = Number(raw) * exchangeRate.baseCurrency / exchangeRate.chips * 100;
    return typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number.isSafeInteger(Math.round(cents));
  }) && exchangeRate.baseCurrency > 0 && exchangeRate.chips > 0;

  const handleSave = async () => {
    if (!validStacks || saving || Object.values(scanning).some(Boolean)) return;
    const next = players.map(p => {
      const inputVal = Number(finalStacks[p.id]);
      const valueInCurrency = Math.round(inputVal * (exchangeRate.baseCurrency / exchangeRate.chips) * 100) / 100;
      
      const updatedPlayer = { 
        ...p, 
        finalStackValue: valueInCurrency,
      };
      
      if (playerPhotos[p.id]) {
        updatedPlayer.photoUrl = playerPhotos[p.id];
      } else {
        delete updatedPlayer.photoUrl;
      }
      
      return updatedPlayer;
    });
    setSaving(true);
    try {
      if (await onComplete(next)) localStorage.removeItem(draftKey);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="space-y-2">
        <p className="text-[10px] md:text-[11px] uppercase tracking-widest text-primary font-bold">End of Session</p>
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-on-surface font-headline">Cash Out</h2>
        <p className="text-on-surface-variant max-w-xl text-sm md:text-base">Enter final chip counts or use AI to scan your stacks for verification.</p>
      </section>

      <div className="bg-surface-container-lowest p-4 md:p-6 rounded-xl shadow-[0_12px_32px_rgba(62,94,149,0.06)] border border-outline-variant/10">
        <div className="space-y-4 md:space-y-6">
          {players.map(player => {
            const currentBuyIn = player.buyIns.reduce((a, b) => a + b, 0);
            const currentCashOut = player.cashOuts.reduce((a, b) => a + b, 0);
            const inputVal = parseFloat(finalStacks[player.id]) || 0;
            const valueInCurrency = inputVal * (exchangeRate.baseCurrency / exchangeRate.chips);
            const net = (currentCashOut + valueInCurrency) - currentBuyIn;

            return (
              <div key={player.id} className="p-4 bg-surface rounded-2xl border border-outline-variant/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-on-surface text-base md:text-lg truncate pr-4">{player.name}</div>
                  <div className="w-[120px] md:w-[160px] text-right">
                    <input 
                      type="number" 
                      inputMode="decimal"
                      placeholder="Enter chips" 
                      min="0"
                      value={finalStacks[player.id] || ''}
                      onChange={e => setFinalStacks({ ...finalStacks, [player.id]: e.target.value })}
                      className="w-full border border-outline-variant/30 rounded-xl p-2 text-right font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-surface-container-lowest text-on-surface text-base"
                    />
                    <div className="text-xs mt-1.5 font-medium text-on-surface-variant">
                      = ${valueInCurrency.toFixed(2)}
                    </div>
                    <div className={`text-xs font-bold mt-0.5 ${net > 0 ? 'text-primary' : net < 0 ? 'text-error' : 'text-outline'}`}>
                      {net > 0 ? 'Takes' : net < 0 ? 'Gives' : 'Even'}: ${Math.abs(net).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {playerPhotos[player.id] ? (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-outline-variant/20">
                      <img src={playerPhotos[player.id]} alt="Stack" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removePhoto(player.id)}
                        className="absolute top-1 right-1 p-1 bg-error text-on-error rounded-full shadow-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRefs.current[player.id]?.click()}
                      className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border-2 border-dashed border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5 transition-all text-outline group"
                    >
                      <Camera className="w-6 h-6 mb-1 group-hover:text-primary" />
                      <span className="text-[10px] font-bold uppercase">Photo</span>
                    </button>
                  )}
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-xs text-on-surface-variant font-medium">
                      {playerPhotos[player.id] ? 'Photo attached' : 'Optional: Take a photo of the final chip stack'}
                    </p>
                    {playerPhotos[player.id] && (
                      <button 
                        onClick={() => handleAIScan(player.id)}
                        disabled={scanning[player.id]}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-all w-fit disabled:opacity-50"
                      >
                        {scanning[player.id] ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Scanning...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            <span>Scan with AI</span>
                          </>
                        )}
                      </button>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      className="hidden" 
                      ref={el => fileInputRefs.current[player.id] = el}
                      onChange={e => handlePhotoUpload(player.id, e)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!validStacks && <p className="text-sm text-error">Enter a non-negative final chip value for every player, including 0 for an empty stack.</p>}
      <button 
        onClick={handleSave}
        disabled={!validStacks || saving || Object.values(scanning).some(Boolean)}
        className="w-full py-4 bg-primary text-on-primary font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dim active:scale-95 transition-all text-sm md:text-base flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <span>{saving ? 'SAVING...' : 'CALCULATE FINAL LEDGER'}</span>
      </button>
    </div>
  );
}
