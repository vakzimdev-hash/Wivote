import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, Zap, Crown, Sparkles, Users, Shield, ArrowRight } from 'lucide-react';
import { SubscriptionTier, PackagePricing } from '../types';

interface SubscriptionSliderSelectorProps {
  selectedTier: SubscriptionTier;
  onChange: (tier: SubscriptionTier) => void;
  packages?: PackagePricing[];
  theme?: 'light' | 'dark';
  compact?: boolean;
  label?: string;
  showDetails?: boolean;
  id?: string;
}

const DEFAULT_PACKAGES: PackagePricing[] = [
  { id: 'Starter', name: 'Starter', price: 10, desc: '1 Active Router limit', maxAgents: 3 },
  { id: 'Gold', name: 'Gold', price: 15, desc: '5 Active Routers', maxAgents: 7 },
  { id: 'Lithium', name: 'Lithium', price: 20, desc: 'Enterprise Unlimited', maxAgents: 15 }
];

const TIER_ORDER: SubscriptionTier[] = ['Starter', 'Gold', 'Lithium'];

const TIER_CONFIG = {
  Starter: {
    badge: 'Standard',
    icon: Zap,
    accentColor: 'sky',
    gradient: 'from-sky-500 to-cyan-500',
    lightBg: 'bg-sky-50/70 border-sky-200/90 text-sky-950',
    darkBg: 'bg-sky-950/30 border-sky-800/60 text-sky-100',
    pillActiveLight: 'bg-sky-500 text-white shadow-sky-500/25',
    pillActiveDark: 'bg-sky-500 text-white shadow-sky-500/30',
    sliderTrack: 'bg-sky-500',
    tagColor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    tagline: 'Ideal for single-location setups'
  },
  Gold: {
    badge: 'Most Popular',
    icon: Crown,
    accentColor: 'amber',
    gradient: 'from-amber-500 to-orange-500',
    lightBg: 'bg-amber-50/70 border-amber-200/90 text-amber-950',
    darkBg: 'bg-amber-950/30 border-amber-800/60 text-amber-100',
    pillActiveLight: 'bg-amber-500 text-white shadow-amber-500/25',
    pillActiveDark: 'bg-amber-500 text-white shadow-amber-500/30',
    sliderTrack: 'bg-amber-500',
    tagColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    tagline: 'Optimal balance for growing businesses'
  },
  Lithium: {
    badge: 'Enterprise',
    icon: Sparkles,
    accentColor: 'purple',
    gradient: 'from-purple-600 to-indigo-600',
    lightBg: 'bg-purple-50/70 border-purple-200/90 text-purple-950',
    darkBg: 'bg-purple-950/30 border-purple-800/60 text-purple-100',
    pillActiveLight: 'bg-purple-600 text-white shadow-purple-600/25',
    pillActiveDark: 'bg-purple-600 text-white shadow-purple-600/30',
    sliderTrack: 'bg-purple-600',
    tagColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    tagline: 'Maximum throughput with unlimited scaling'
  }
};

export const SubscriptionSliderSelector: React.FC<SubscriptionSliderSelectorProps> = ({
  selectedTier,
  onChange,
  packages = DEFAULT_PACKAGES,
  theme = 'dark',
  compact = false,
  label = 'Select Subscription Tier',
  showDetails = true,
  id = 'subscription-slider-selector'
}) => {
  const [direction, setDirection] = useState<number>(0);
  const activePackages = packages && packages.length >= 3 ? packages : DEFAULT_PACKAGES;

  const currentIndex = Math.max(0, TIER_ORDER.indexOf(selectedTier));
  const currentPkg = activePackages.find(p => p.id === selectedTier) || activePackages[currentIndex] || DEFAULT_PACKAGES[0];
  const config = TIER_CONFIG[selectedTier] || TIER_CONFIG.Starter;
  const TierIcon = config.icon;

  const handleSelectIndex = (newIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(TIER_ORDER.length - 1, newIndex));
    const nextTier = TIER_ORDER[clampedIndex];
    if (nextTier !== selectedTier) {
      setDirection(clampedIndex > currentIndex ? 1 : -1);
      onChange(nextTier);
    }
  };

  const handleStepBack = () => {
    if (currentIndex > 0) {
      handleSelectIndex(currentIndex - 1);
    }
  };

  const handleStepForward = () => {
    if (currentIndex < TIER_ORDER.length - 1) {
      handleSelectIndex(currentIndex + 1);
    }
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleStepBack();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleStepForward();
    }
  };

  const sliderPercentage = (currentIndex / (TIER_ORDER.length - 1)) * 100;

  return (
    <div
      id={id}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`rounded-2xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 select-none ${
        theme === 'light'
          ? 'bg-slate-50/90 border-slate-200/90'
          : 'bg-slate-950/70 border-slate-800/80'
      } ${compact ? 'p-3' : 'p-3.5 sm:p-4'}`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border flex items-center justify-center ${config.tagColor}`}>
            <TierIcon className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className={`block text-[11px] font-bold font-mono uppercase tracking-wider ${
              theme === 'light' ? 'text-slate-600' : 'text-slate-400'
            }`}>
              {label}
            </span>
          </div>
        </div>

        {/* Current Tier & Step indicator badge */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold uppercase ${config.tagColor}`}>
            {config.badge}
          </span>
          <span className={`text-[10px] font-mono ${
            theme === 'light' ? 'text-slate-400' : 'text-slate-500'
          }`}>
            {currentIndex + 1}/{TIER_ORDER.length}
          </span>
        </div>
      </div>

      {/* Sliding Segmented Pill Tab Bar */}
      <div className={`relative p-1 rounded-xl border flex items-center mb-3 ${
        theme === 'light'
          ? 'bg-slate-200/60 border-slate-300/70'
          : 'bg-slate-900 border-slate-800'
      }`}>
        {TIER_ORDER.map((tier, idx) => {
          const pkg = activePackages.find(p => p.id === tier) || DEFAULT_PACKAGES[idx];
          const isSelected = selectedTier === tier;
          const tierCfg = TIER_CONFIG[tier];

          return (
            <button
              key={tier}
              type="button"
              id={`${id}-tab-${tier.toLowerCase()}`}
              onClick={() => handleSelectIndex(idx)}
              className={`relative flex-1 py-1.5 sm:py-2 px-2 text-center rounded-lg font-bold transition-all duration-200 z-10 cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 ${
                isSelected
                  ? 'text-white'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {isSelected && (
                <motion.div
                  layoutId={`${id}-active-pill`}
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  className={`absolute inset-0 rounded-lg shadow-md ${
                    tier === 'Starter'
                      ? 'bg-gradient-to-r from-sky-500 to-sky-600'
                      : tier === 'Gold'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600'
                  }`}
                />
              )}
              <span className="relative z-10 text-[11px] sm:text-xs uppercase font-extrabold tracking-wide">
                {pkg.name}
              </span>
              <span className={`relative z-10 text-[9px] sm:text-[10px] font-mono font-bold ${
                isSelected
                  ? 'text-white/90'
                  : theme === 'light'
                  ? 'text-slate-500'
                  : 'text-slate-400'
              }`}>
                ${pkg.price}/mo
              </span>
            </button>
          );
        })}
      </div>

      {/* Interactive Sliding Range Track & Stepper Buttons */}
      <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
        {/* Step Back button */}
        <button
          type="button"
          id={`${id}-step-back`}
          onClick={handleStepBack}
          disabled={currentIndex === 0}
          title="Slide to previous subscription"
          className={`p-2 rounded-xl border transition-all duration-150 flex items-center justify-center cursor-pointer ${
            currentIndex === 0
              ? 'opacity-30 cursor-not-allowed border-transparent'
              : theme === 'light'
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 shadow-2xs active:scale-95'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700 shadow-2xs active:scale-95'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Sliding Range Track */}
        <div className="relative flex-1 py-2 flex items-center">
          {/* Background rail */}
          <div className={`absolute left-0 right-0 h-2 rounded-full overflow-hidden ${
            theme === 'light' ? 'bg-slate-200' : 'bg-slate-850'
          }`}>
            {/* Active filled track */}
            <div
              className={`h-full transition-all duration-250 ease-out bg-gradient-to-r ${config.gradient}`}
              style={{ width: `${sliderPercentage}%` }}
            />
          </div>

          {/* Interactive Range Input (Invisible overlay for smooth drag/touch) */}
          <input
            type="range"
            min={0}
            max={TIER_ORDER.length - 1}
            step={1}
            value={currentIndex}
            onChange={(e) => handleSelectIndex(parseInt(e.target.value, 10))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            aria-label="Subscription plan slider"
          />

          {/* Stepper Notch Points */}
          <div className="relative w-full flex justify-between items-center z-10 pointer-events-none px-1">
            {TIER_ORDER.map((tier, idx) => {
              const isPassedOrCurrent = idx <= currentIndex;
              const isExactCurrent = idx === currentIndex;
              return (
                <div key={tier} className="relative flex flex-col items-center">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                      isExactCurrent
                        ? `scale-125 border-white bg-gradient-to-br ${config.gradient} shadow-md`
                        : isPassedOrCurrent
                        ? 'border-white bg-slate-400 dark:bg-slate-300'
                        : theme === 'light'
                        ? 'border-slate-300 bg-slate-100'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                  >
                    {isExactCurrent && (
                      <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Forward button */}
        <button
          type="button"
          id={`${id}-step-forward`}
          onClick={handleStepForward}
          disabled={currentIndex === TIER_ORDER.length - 1}
          title="Slide to next subscription"
          className={`p-2 rounded-xl border transition-all duration-150 flex items-center justify-center cursor-pointer ${
            currentIndex === TIER_ORDER.length - 1
              ? 'opacity-30 cursor-not-allowed border-transparent'
              : theme === 'light'
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 shadow-2xs active:scale-95'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700 shadow-2xs active:scale-95'
          }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Animated Sliding Details Card */}
      {showDetails && (
        <div className="overflow-hidden rounded-xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedTier}
              initial={{ opacity: 0, x: direction * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -28 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`p-3 rounded-xl border transition-all duration-200 ${
                theme === 'light' ? config.lightBg : config.darkBg
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black uppercase font-display tracking-wide">
                      {currentPkg.name} Plan
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase border ${config.tagColor}`}>
                      {config.tagline}
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 line-clamp-1 ${
                    theme === 'light' ? 'text-slate-600' : 'text-slate-300'
                  }`}>
                    {currentPkg.desc}
                  </p>
                </div>

                {/* Price Display */}
                <div className="text-right shrink-0">
                  <div className="flex items-baseline justify-end gap-0.5">
                    <span className="text-base font-extrabold font-mono tracking-tight">
                      ${currentPkg.price}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">/mo</span>
                  </div>
                </div>
              </div>

              {/* Spec Pills in one compact row */}
              <div className="mt-2 pt-2 border-t border-current/10 flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-1.5 font-bold">
                  <Users className="w-3 h-3 opacity-70" />
                  <span>Quota: {currentPkg.maxAgents || (selectedTier === 'Lithium' ? 15 : selectedTier === 'Gold' ? 7 : 3)} Active Agents</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] opacity-80">
                  <span>Swipe / slide to switch</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
