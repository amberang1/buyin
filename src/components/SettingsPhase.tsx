import React, { useState, useRef } from 'react';
import { ExchangeRate } from '../types';
import { ArrowLeft, Palette, History, Calendar, Camera, Loader2, Plus, X } from 'lucide-react';
import ResultsPhase from './ResultsPhase';
import { scanChips, prepareChipPhoto } from '../scan';

type Props = {
  canEdit: boolean;
  exchangeRate: ExchangeRate;
  setExchangeRate: (rate: ExchangeRate, expected?: ExchangeRate) => Promise<boolean>;
  history: any[];
  onBack: () => void;
  onLeaveGame?: () => void;
  gameId?: string | null;
};

export default function SettingsPhase({ canEdit, exchangeRate, setExchangeRate, history, onBack, onLeaveGame, gameId }: Props) {
  const [selectedGame,setSelectedGame]=useState<any>(null);
  const [newColorName, setNewColorName] = useState('');
  const [scanningColors, setScanningColors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddColor = async () => {
    if(Object.keys(exchangeRate.chipValues).some(c=>c.toLowerCase()===newColorName.trim().toLowerCase())){alert("That color already exists. Edit its value instead.");return;}
    if(Object.keys(exchangeRate.chipValues).length>=30){alert("Use at most 30 colors.");return;}
    if (!/^[A-Za-z][A-Za-z -]{0,29}$/.test(newColorName.trim()) || ['constructor','prototype'].includes(newColorName.trim().toLowerCase())) { alert('Use a color name with letters, spaces or hyphens.'); return; }
    if(await setExchangeRate({...exchangeRate,chipValues:{...exchangeRate.chipValues,[newColorName.trim()]:0}}))setNewColorName('');
  };

  const handleRemoveColor = (color: string) => {
    const newChipValues = { ...exchangeRate.chipValues };
    delete newChipValues[color];
    setExchangeRate({ ...exchangeRate, chipValues: newChipValues });
  };

  const handleUpdateColorValue = (color: string, value: string) => {
    setExchangeRate({
      ...exchangeRate,
      chipValues: {
        ...exchangeRate.chipValues,
        [color]: parseFloat(value) || 0
      }
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !gameId || !canEdit) return;

    setScanningColors(true);
    try {
      const data = await prepareChipPhoto(file);
      {
        const result = await scanChips(gameId, 'colors', data);
        const detectedColors = result.split(',').map(c => c.trim()).filter(c => c.length > 0);
        
        if (detectedColors.length > 0) {
          const newChipValues = { ...exchangeRate.chipValues };
          detectedColors.forEach(color => {
            // Capitalize first letter
            const formattedColor = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
            if (!Object.keys(newChipValues).some(c=>c.toLowerCase()===formattedColor.toLowerCase())) {
              newChipValues[formattedColor] = 0;
            }
          });
          await setExchangeRate({ ...exchangeRate, chipValues: newChipValues }, exchangeRate);
        }
      }
    } catch (error) {
      console.error("AI Scan failed:", error);
      alert("Failed to scan chip colors. Please try again.");
    } finally {
      setScanningColors(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if(selectedGame)return <div className="space-y-4"><button className="club-secondary" onClick={()=>setSelectedGame(null)}>Back to history</button><ResultsPhase players={selectedGame.players} onArchive={()=>setSelectedGame(null)} archiveLabel="Back to history"/></div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-surface-container rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-3xl font-extrabold tracking-tight font-headline">Settings</h2>
      </div>

      <fieldset disabled={!canEdit} className="min-w-0 border-0 p-5 bg-surface-container-lowest rounded-xl shadow-sm space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Palette className="text-primary w-5 h-5" />
            <h3 className="text-base font-bold tracking-tight font-headline">Chip Colors</h3>
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={scanningColors}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-all disabled:opacity-50"
          >
            {scanningColors ? (
              <><Loader2 className="w-3 h-3 animate-spin" /><span>Scanning...</span></>
            ) : (
              <><Camera className="w-3 h-3" /><span>Scan Chips</span></>
            )}
          </button>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            className="hidden" 
            ref={fileInputRef}
            onChange={handlePhotoUpload}
          />
        </div>
        
        <p className="text-xs text-on-surface-variant">
          Define the value of each chip color. You can add them manually or take a picture of your starting stack to auto-detect colors.
        </p>

        <div className="space-y-3">
          {Object.entries(exchangeRate.chipValues).map(([color, value]) => (
            <div key={color} className="flex items-center gap-3 bg-surface-container-low p-2 md:p-3 rounded-lg border border-outline-variant/10">
              <div className="flex-1 font-bold text-sm text-on-surface">{color}</div>
              <div className="w-24 relative">
                <input 
                  type="number"
                  key={color+':'+value} defaultValue={value} min={0} max={1000000}
                  onBlur={(e) => {const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0&&n<=1000000)handleUpdateColorValue(color,e.target.value);else {alert('Use a value between 0 and 1,000,000.');e.target.value=String(value);}}}
                  placeholder="Value"
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded p-1.5 text-right font-bold focus:border-primary outline-none text-sm"
                />
              </div>
              <button onClick={() => handleRemoveColor(color)} className="p-1.5 text-error hover:bg-error/10 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input 
            type="text"
            value={newColorName}
            onChange={e => setNewColorName(e.target.value)}
            placeholder="New color name..."
            className="flex-1 bg-transparent border-b border-outline-variant/30 focus:border-primary p-2 outline-none text-sm font-medium"
            onKeyDown={e => e.key === 'Enter' && handleAddColor()}
          />
          <button 
            onClick={handleAddColor}
            disabled={!newColorName.trim()}
            className="p-2 bg-secondary text-on-secondary rounded-lg disabled:opacity-50 hover:bg-secondary-dim transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </fieldset>

      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <History className="text-primary w-5 h-5" />
          <h3 className="text-base font-bold tracking-tight font-headline">Game History</h3>
        </div>

        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-xs text-outline text-center py-4">No games archived yet.</p>
          ) : (
            history.map((game) => (
              <button type="button" onClick={()=>setSelectedGame(game)} key={game.id} className="w-full text-left p-3 bg-surface-container-low rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-surface-container-highest rounded-lg">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {new Date(game.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[10px] text-outline font-medium">{game.players.length} Players</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-primary">
                    ${game.players.reduce((sum: number, p: any) => sum + (p.buyIns.reduce((a: number, b: number) => a + b, 0)), 0).toFixed(0)} Pot
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {gameId && onLeaveGame && (
        <div className="space-y-3">
          <button 
            onClick={onLeaveGame}
            className="w-full py-3.5 text-error font-bold bg-error/10 rounded-xl hover:bg-error/20 transition-colors flex items-center justify-center gap-2"
          >
            Leave Current Game
          </button>
        </div>
      )}

      <div className="bg-surface-container-low p-5 rounded-xl space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-outline">App Information</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-on-surface-variant">Version</span>
            <span className="font-bold">1.3.0</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-on-surface-variant">AI Engine</span>
            <span className="font-bold text-primary">Gemini (server-configured)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

