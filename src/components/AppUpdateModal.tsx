import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Sparkles, ShieldCheck, ArrowRight, Zap, CheckCircle2, DownloadCloud, AlertTriangle } from 'lucide-react';
import { executeReloadToLatestVersion } from '../utils/appUpdateManager';

interface UpdateEventDetails {
  version: string;
  buildId: string;
  buildTime: string;
  isSimulated?: boolean;
}

export const AppUpdateModal: React.FC = () => {
  const [updateDetails, setUpdateDetails] = useState<UpdateEventDetails | null>(null);
  const [progress, setProgress] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  const phases = [
    { label: 'Connecting to server & validating assets...', targetProgress: 25 },
    { label: 'Clearing obsolete caches & chunk manifests...', targetProgress: 60 },
    { label: 'Preserving active terminal session & security keys...', targetProgress: 88 },
    { label: 'Finalizing installation & restarting terminal...', targetProgress: 100 },
  ];

  // Listen for the update detected event
  useEffect(() => {
    const handleUpdateDetected = (event: Event) => {
      const customEvent = event as CustomEvent<UpdateEventDetails>;
      if (customEvent.detail) {
        setUpdateDetails(customEvent.detail);
        setProgress(5);
        setPhaseIndex(0);
      }
    };

    window.addEventListener('wivote:system-update-detected', handleUpdateDetected);
    return () => {
      window.removeEventListener('wivote:system-update-detected', handleUpdateDetected);
    };
  }, []);

  // Run the animated update progress once kicked in
  useEffect(() => {
    if (!updateDetails) return;

    let timer: ReturnType<typeof setInterval>;
    let currentStep = 5;

    timer = setInterval(() => {
      currentStep += Math.floor(Math.random() * 8) + 4;
      if (currentStep >= 100) {
        currentStep = 100;
        setProgress(100);
        setPhaseIndex(3);
        clearInterval(timer);
        setIsFinishing(true);

        // Allow 750ms for user to see 100% completed state, then automatically execute reload
        setTimeout(() => {
          executeReloadToLatestVersion();
        }, 750);
      } else {
        setProgress(currentStep);
        if (currentStep > 85) setPhaseIndex(3);
        else if (currentStep > 55) setPhaseIndex(2);
        else if (currentStep > 20) setPhaseIndex(1);
      }
    }, 180);

    return () => clearInterval(timer);
  }, [updateDetails]);

  if (!updateDetails) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none">
        {/* Fullscreen Backdrop with high blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-md transition-all"
        />

        {/* Updating Screen Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md rounded-3xl border border-sky-500/40 bg-slate-900/95 text-white shadow-2xl shadow-sky-500/10 overflow-hidden p-6 sm:p-7"
        >
          {/* Top glowing ambient accent */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400 animate-pulse" />
          <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Logo & Animated Updating Ring */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-3 flex items-center justify-center">
              {/* Outer pulsing ring */}
              <div className="absolute -inset-2.5 rounded-full border-2 border-sky-500/30 animate-ping opacity-50" />
              <div className="absolute -inset-1 rounded-full border-2 border-sky-400/60 animate-spin border-t-transparent" />
              
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-sky-500/40 flex items-center justify-center shadow-lg relative z-10 overflow-hidden">
                <img
                  src="/wivote_logo.png"
                  alt="WiVoTe"
                  className="w-12 h-12 object-contain"
                />
              </div>

              {/* Status Badge */}
              <div className="absolute -bottom-1 -right-1 bg-sky-500 text-slate-950 p-1 rounded-full shadow-md z-20">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[10px] font-mono font-bold uppercase tracking-wider mb-2">
              <Zap className="w-3 h-3 text-sky-400 animate-pulse" />
              <span>System Update in Progress</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black font-display tracking-tight text-white">
              Updating WiVoTe Terminal
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-1">
              New version detected from server &bull; Updating software bundle
            </p>
          </div>

          {/* Progress Bar & Percentage */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold truncate max-w-[260px]">
                {phases[phaseIndex].label}
              </span>
              <span className="text-sky-400 font-black tabular-nums">
                {progress}%
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-slate-800 border border-slate-700/80 overflow-hidden p-0.5 relative">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 transition-all duration-200 relative overflow-hidden"
                style={{ width: `${progress}%` }}
              >
                {/* Shimmer light effect */}
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </motion.div>
            </div>
          </div>

          {/* Update Details Pill */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs font-mono space-y-1.5 mb-5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Target Version:</span>
              <span className="font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                v{updateDetails.version}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Build Hash:</span>
              <span className="font-mono text-slate-300 truncate max-w-[180px]">
                {updateDetails.buildId}
              </span>
            </div>
            {updateDetails.isSimulated && (
              <div className="text-[10px] text-amber-400 font-bold pt-0.5">
                * Simulated Update Flow Active
              </div>
            )}
          </div>

          {/* Action button */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>{isFinishing ? 'Reloading session...' : 'Applying patches...'}</span>
            </div>

            <button
              type="button"
              onClick={() => executeReloadToLatestVersion()}
              className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 transition cursor-pointer shadow-md active:scale-95"
            >
              <span>Reload Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
