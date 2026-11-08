import React from 'react';
import { useApp } from '../context/AppContext';
import { APP_THEMES } from '../utils/themeEngine';
import { X, Settings, ShieldAlert, Sparkles, Volume2, Shield, Languages, LayoutGrid, Monitor, Check, RefreshCw, Zap, ArrowRight, DownloadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { checkServerUpdateNow } from '../utils/appUpdateManager';

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    theme,
    activeThemeId,
    setActiveThemeId,
    currentUser,
    activeWorkspace,
    showToast
  } = useApp();

  // Handle saving additional future dummy settings
  const [soundEnabled, setSoundEnabled] = React.useState(() => {
    return localStorage.getItem('wivote-sound-enabled') !== 'false';
  });

  const [uiDensity, setUiDensity] = React.useState(() => {
    return localStorage.getItem('wivote-ui-density') || 'comfortable';
  });

  const [appLanguage, setAppLanguage] = React.useState(() => {
    return localStorage.getItem('wivote-app-language') || 'en';
  });

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('wivote-sound-enabled', String(next));
    showToast(`✓ Sound notifications ${next ? 'enabled' : 'muted'}`);
  };

  const handleDensityChange = (density: string) => {
    setUiDensity(density);
    localStorage.setItem('wivote-ui-density', density);
    showToast(`✓ UI density adjusted to ${density}`);
  };

  const handleLanguageChange = (lang: string) => {
    setAppLanguage(lang);
    localStorage.setItem('wivote-app-language', lang);
    showToast(`✓ Language set to ${lang === 'en' ? 'English' : lang === 'fr' ? 'Français' : 'Español'}`);
  };

  const [isCheckingUpdate, setIsCheckingUpdate] = React.useState(false);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await checkServerUpdateNow();
      if (!res.hasUpdate) {
        showToast('✓ Terminal software is running the latest build', 'success');
      }
    } catch {
      showToast('Could not reach update server. Please check your connection.', 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSimulateUpdate = () => {
    onClose();
    setTimeout(() => {
      checkServerUpdateNow(true);
    }, 250);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* Content Modal Card */}
      <div className={`relative w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300 ${
        theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        {/* Top Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0 flex items-center justify-center">
              <div className="absolute inset-0 bg-sky-500/20 rounded-xl blur-md scale-90 pointer-events-none" />
              <img
                src="/wivote_logo.png"
                alt="WiVoTe Logo"
                referrerPolicy="no-referrer"
                className="w-10 h-10 object-contain drop-shadow-md rounded-xl relative z-10"
              />
            </div>
            <div>
              <h3 className="text-base font-bold font-display uppercase tracking-wider">
                General App Settings
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                Configure theme profile and workspace utilities
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
              theme === 'light'
                ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 hover:bg-slate-850'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Section 1: Themes tailored for eye comfort */}
          <div className="space-y-3">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block">
              💡 Comfort Themes (Maximum Visibility)
            </label>
            <div className="space-y-2">
              {APP_THEMES.map((t) => {
                const isActive = activeThemeId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveThemeId(t.id)}
                    type="button"
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isActive
                        ? theme === 'light'
                          ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/10'
                          : 'bg-sky-500/10 border-sky-500 ring-2 ring-sky-500/10'
                        : theme === 'light'
                        ? 'bg-slate-50/50 border-slate-100 hover:bg-slate-100/40 hover:border-slate-200'
                        : 'bg-slate-950/40 border-slate-850 hover:bg-slate-950/80 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Color Preview Badge */}
                      <div 
                        className="w-5 h-5 rounded-full border border-white/20 shadow-inner flex items-center justify-center shrink-0"
                        style={{ backgroundColor: t.variables.bg }}
                      >
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: t.variables.accent }}
                        />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">
                          {t.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {t.base === 'dark' ? 'Eye-Safe Dark Canvas' : 'High Contrast Sunlight Mode'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Highlighting selected */}
                      {isActive ? (
                        <div className={`p-1 rounded-lg ${theme === 'light' ? 'bg-indigo-500 text-white' : 'bg-sky-500 text-slate-950'}`}>
                          <Check className="w-3.5 h-3.5 font-extrabold" />
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 capitalize px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                          {t.base}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Future App Utilities Settings (Disabled or Interactive placeholders) */}
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block">
              ⚙️ Additional Interface Controls
            </label>

            {/* Audio Feedback Switch */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-slate-400" />
                  Terminal Sound Effects
                </span>
                <p className="text-[10px] text-slate-400 font-mono">
                  Play tone on successful voucher sale or top-up
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleSound}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                  soundEnabled
                    ? theme === 'light' ? 'bg-indigo-600 justify-end' : 'bg-sky-500 justify-end'
                    : 'bg-slate-300 dark:bg-slate-800 justify-start'
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-white shadow-md" />
              </button>
            </div>

            {/* UI Density Select */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="space-y-0.5">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <LayoutGrid className="w-4 h-4 text-slate-400" />
                  Interface Grid Density
                </span>
                <p className="text-[10px] text-slate-400 font-mono">
                  Toggle dashboard density spacing rules
                </p>
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleDensityChange('comfortable')}
                  className={`px-2 py-1 text-[10px] font-mono font-bold rounded-lg cursor-pointer ${
                    uiDensity === 'comfortable'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Comfort
                </button>
                <button
                  type="button"
                  onClick={() => handleDensityChange('compact')}
                  className={`px-2 py-1 text-[10px] font-mono font-bold rounded-lg cursor-pointer ${
                    uiDensity === 'compact'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Compact
                </button>
              </div>
            </div>

            {/* App Translation Language */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="space-y-0.5">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Languages className="w-4 h-4 text-slate-400" />
                  Terminal Language
                </span>
                <p className="text-[10px] text-slate-400 font-mono">
                  Select primary language of the POS view
                </p>
              </div>
              <select
                value={appLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className={`text-[10px] font-mono font-bold py-1 px-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-950 border-slate-800 text-white'
                }`}
              >
                <option value="en">English (US)</option>
                <option value="fr">Français (FR)</option>
                <option value="es">Español (ES)</option>
              </select>
            </div>

            {/* Software Updates & Server Version Watcher */}
            <div className={`mt-2 p-3.5 rounded-2xl border space-y-2.5 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block leading-tight">Software Updates</span>
                    <span className="text-[10px] text-slate-400 font-mono">Auto-detects new server deployments</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={isCheckingUpdate}
                  className="flex-1 py-2 px-3 rounded-xl text-[11px] font-mono font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  <span>{isCheckingUpdate ? 'Checking Server...' : 'Check for Updates'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSimulateUpdate}
                  className={`py-2 px-3 rounded-xl text-[11px] font-mono font-bold border transition cursor-pointer active:scale-95 shrink-0 ${
                    theme === 'light'
                      ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                  title="Simulate incoming server update notification & modal"
                >
                  <span>Test Update Flow</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Footer Info */}
        <div className={`p-4 text-center text-[10px] font-mono border-t ${
          theme === 'light'
            ? 'bg-slate-50 border-slate-100 text-slate-400'
            : 'bg-slate-950/40 border-slate-850 text-slate-500'
        }`}>
          VakZim WiVoTe App Engine v2026.09 • By VakZim ICT&E
        </div>
      </div>
    </div>
  );
};
