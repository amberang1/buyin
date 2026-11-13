import React from 'react';
import { Player } from '../types';
import { Table, Share, AlertTriangle } from 'lucide-react';

type Props = {
  players: Player[];
  onArchive: () => void;
};

export default function ResultsPhase({ players, onArchive }: Props) {
  // Calculate net results
  const balances = players.map(p => {
    const totalIn = p.buyIns.reduce((a, b) => a + b, 0);
    const totalOut = p.cashOuts.reduce((a, b) => a + b, 0) + p.finalStackValue;
    return {
      ...p,
      totalIn,
      totalOut,
      net: totalOut - totalIn
    };
  });

  const totalBuyIns = balances.reduce((sum, b) => sum + b.totalIn, 0);
  const totalCashOuts = balances.reduce((sum, b) => sum + b.totalOut, 0);
  const discrepancy = totalBuyIns - totalCashOuts;

  return (
    <div className="space-y-8 md:space-y-12">
      <section className="space-y-2">
        <p className="text-[10px] md:text-[11px] uppercase tracking-widest text-primary font-bold">Session Overview</p>
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-on-surface font-headline">Final Settlement</h2>
        <p className="text-on-surface-variant max-w-xl text-sm md:text-base">All stakes accounted for. Review the ledger below to finalize the transaction distribution for tonight's session.</p>
      </section>

      {Math.abs(discrepancy) > 0.05 && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${discrepancy > 0 ? 'bg-error/10 border-error/20 text-error' : 'bg-primary/10 border-primary/20 text-primary'}`}>
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">
              {discrepancy > 0 ? 'Shortfall Detected' : 'Overage Detected'}
            </h4>
            <p className="text-sm opacity-90 mt-1">
              {discrepancy > 0 
                ? `There is $${discrepancy.toFixed(2)} missing from the table. Total buy-ins ($${totalBuyIns.toFixed(2)}) exceed total cash-outs ($${totalCashOuts.toFixed(2)}).`
                : `There is an extra $${Math.abs(discrepancy).toFixed(2)} on the table. Total cash-outs ($${totalCashOuts.toFixed(2)}) exceed total buy-ins ($${totalBuyIns.toFixed(2)}).`
              }
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6 md:space-y-8">
        {/* Main Ledger Table */}
        <div className="bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/10 shadow-[0_12px_32px_rgba(62,94,149,0.04)]">
          <div className="p-4 md:p-6">
            <h3 className="text-lg font-bold mb-4 md:mb-6 flex items-center gap-2 font-headline">
              <Table className="text-primary w-5 h-5" />
              Final Ledger
            </h3>
            
            {/* Mobile Cards View */}
            <div className="block md:hidden space-y-3">
              {balances.map(b => (
                <div key={b.id} className="bg-surface-container-low/50 p-4 rounded-lg border border-outline-variant/10">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-3">
                      {b.photoUrl ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant/20">
                          <img src={b.photoUrl} alt={b.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-outline">
                          NO PIC
                        </div>
                      )}
                      <span className="font-bold text-on-surface">{b.name}</span>
                    </div>
                    <span className={`font-bold text-lg ${b.net > 0.01 ? 'text-primary' : b.net < -0.01 ? 'text-error' : 'text-on-surface-variant'}`}>
                      {b.net > 0.01 ? '+' : ''}{b.net.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-on-surface-variant">
                    <div className="flex flex-col">
                      <span className="uppercase tracking-wider text-[9px] font-bold text-outline">Total In</span>
                      <span>${b.totalIn.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="uppercase tracking-wider text-[9px] font-bold text-outline">Total Out</span>
                      <span>${b.totalOut.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-surface-container-high">
                    <th className="pb-4 text-[10px] uppercase tracking-wider text-outline font-bold">Stack</th>
                    <th className="pb-4 text-[10px] uppercase tracking-wider text-outline font-bold">Player</th>
                    <th className="pb-4 text-[10px] uppercase tracking-wider text-outline font-bold text-right">Total Buy-in</th>
                    <th className="pb-4 text-[10px] uppercase tracking-wider text-outline font-bold text-right">Total Cash-out</th>
                    <th className="pb-4 text-[10px] uppercase tracking-wider text-outline font-bold text-right">Net Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container/50">
                  {balances.map(b => (
                    <tr key={b.id} className="group hover:bg-surface-container-low transition-colors">
                      <td className="py-4">
                        {b.photoUrl ? (
                          <div className="w-8 h-8 rounded bg-surface-container-highest overflow-hidden border border-outline-variant/10">
                            <img src={b.photoUrl} alt="Stack" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded bg-surface-container-low border border-dashed border-outline-variant/20" />
                        )}
                      </td>
                      <td className="py-4 font-semibold text-on-surface">{b.name}</td>
                      <td className="py-4 text-right text-on-surface-variant">${b.totalIn.toFixed(2)}</td>
                      <td className="py-4 text-right text-on-surface-variant">${b.totalOut.toFixed(2)}</td>
                      <td className={`py-4 text-right font-bold ${b.net > 0.01 ? 'text-primary' : b.net < -0.01 ? 'text-error' : 'text-on-surface-variant'}`}>
                        {b.net > 0.01 ? '+' : ''}{b.net.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-end pt-4">
          <button className="w-full sm:w-auto px-8 py-4 bg-surface-container-high text-on-surface-variant font-bold rounded-xl hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-2 text-sm md:text-base">
            <Share className="w-4 h-4" />
            SHARE RESULTS
          </button>
          <button 
            onClick={onArchive}
            className="w-full sm:w-auto px-8 py-4 bg-primary text-on-primary font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dim active:scale-95 transition-all text-sm md:text-base"
          >
            ARCHIVE SESSION
          </button>
        </div>
      </div>
    </div>
  );
}
