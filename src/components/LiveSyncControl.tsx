import React from 'react';
import { RefreshCw, Database, Upload, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface LiveSyncControlProps {
  theme: 'light' | 'dark';
}

export const LiveSyncControl: React.FC<LiveSyncControlProps> = ({ theme }) => {
  const {
    isLiveRefresh,
    toggleLiveRefresh,
    refetchData,
    isRefetching,
    refreshCountdown,
    forcePushLocalToGlobalDB,
    isPushingToDb,
    pendingMutationsCount
  } = useApp();

  return (
    <div className="flex items-center gap-2 shrink-0 select-none isolate flex-wrap">
      {/* Explicit 'Push Local Data to Global DB' Operational Override & Visual Sync Badge */}
      <button
        type="button"
        onClick={() => forcePushLocalToGlobalDB(false)}
        disabled={isPushingToDb}
        className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs ${
          isPushingToDb
            ? 'bg-rose-500/20 border-rose-500/50 text-rose-500 animate-pulse'
            : pendingMutationsCount > 0
            ? theme === 'light'
              ? 'bg-amber-500/10 border-amber-400 text-amber-700 shadow-amber-500/10 hover:bg-amber-500/20 ring-2 ring-amber-500/20'
              : 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-amber-500/20 hover:bg-amber-500/30 ring-2 ring-amber-500/30'
            : theme === 'light'
            ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
        title="Push local offline mutations directly to Global Database"
      >
        {isPushingToDb ? (
          <Database className="w-3.5 h-3.5 animate-spin text-rose-500" />
        ) : pendingMutationsCount > 0 ? (
          <Upload className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        )}
        <span className="truncate">
          {isPushingToDb
            ? 'Pushing Local Data...'
            : pendingMutationsCount > 0
            ? `Push Local Data to Global DB (${pendingMutationsCount} pending)`
            : 'Push Local Data to Global DB'}
        </span>
      </button>

      {/* Live Sync Bubble */}
      <button
        type="button"
        onClick={toggleLiveRefresh}
        className={`relative flex items-center justify-center w-8 h-8 min-w-[32px] min-h-[32px] max-w-[32px] max-h-[32px] rounded-full border transition-colors duration-150 cursor-pointer overflow-hidden shrink-0 active:scale-95 ${
          isLiveRefresh
            ? theme === 'light'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs ring-1 ring-emerald-500/30'
              : 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300 shadow-xs ring-1 ring-emerald-400/30'
            : theme === 'light'
              ? 'bg-slate-100 border-slate-300 text-slate-500 hover:border-slate-400'
              : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:border-slate-600'
        }`}
        title={`Live Sync: ${isLiveRefresh ? `ACTIVE (${refreshCountdown}s remaining)` : 'PAUSED'}. Tap to toggle.`}
        aria-label={`Live sync toggle (${isLiveRefresh ? `${refreshCountdown}s` : 'OFF'})`}
      >
        {isLiveRefresh && (
          <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-pulse pointer-events-none" />
        )}
        <span className="relative z-10 w-5 text-center font-mono font-black text-[10px] sm:text-[11px] tabular-nums tracking-tighter leading-none inline-block">
          {isLiveRefresh ? refreshCountdown : 'OFF'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          refetchData();
        }}
        disabled={isRefetching}
        className={`w-8 h-8 min-w-[32px] min-h-[32px] max-w-[32px] max-h-[32px] rounded-full border transition-colors duration-150 cursor-pointer flex items-center justify-center shrink-0 active:scale-95 ${
          theme === 'light'
            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-white'
        }`}
        title="Force immediate Firestore re-fetch"
        aria-label="Force immediate Firestore re-fetch"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin text-sky-500' : ''}`} />
      </button>
    </div>
  );
};
