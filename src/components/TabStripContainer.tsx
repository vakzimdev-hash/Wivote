import React, { useState, useEffect } from 'react';
import { Palette, X, RotateCcw, Check, Sparkles, Sliders, Shield } from 'lucide-react';

export interface TabStripThemeSettings {
  bgPreset: 'app-dark' | 'yellow-gold' | 'royal-indigo' | 'midnight-charcoal' | 'emerald-teal' | 'ruby-rose' | 'custom';
  customBgHex: string;
  outlinePreset: 'slate' | 'amber-gold' | 'neon-cyan' | 'emerald' | 'rose-pink' | 'electric-purple' | 'custom';
  customOutlineHex: string;
  outlineStyle: 'solid' | 'glowing' | 'double' | 'dashed';
}

export const DEFAULT_TAB_STRIP_SETTINGS: TabStripThemeSettings = {
  bgPreset: 'app-dark',
  customBgHex: '#0f172a',
  outlinePreset: 'slate',
  customOutlineHex: '#38bdf8',
  outlineStyle: 'solid',
};

const LOCAL_STORAGE_KEY = 'wivote_tab_strip_theme_settings_v1';

export const loadTabStripSettings = (): TabStripThemeSettings => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_TAB_STRIP_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (err) {
    console.error('Failed to load tab strip settings:', err);
  }
  return DEFAULT_TAB_STRIP_SETTINGS;
};

export const saveTabStripSettingsToStorage = (settings: TabStripThemeSettings) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('wivote:tab-strip-settings-changed', { detail: settings }));
  } catch (err) {
    console.error('Failed to save tab strip settings:', err);
  }
};

interface TabStripContainerProps {
  children: React.ReactNode;
  theme?: 'light' | 'dark';
  sectionTitle?: string;
  activeTabLineGradient?: string;
}

export const TabStripContainer: React.FC<TabStripContainerProps> = ({
  children,
  theme = 'dark',
  sectionTitle,
  activeTabLineGradient,
}) => {
  const [settings, setSettings] = useState<TabStripThemeSettings>(loadTabStripSettings);
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  // Sync settings when changed from anywhere else in app
  useEffect(() => {
    const handleSettingsChanged = (e: any) => {
      if (e.detail) setSettings(e.detail);
    };
    window.addEventListener('wivote:tab-strip-settings-changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('wivote:tab-strip-settings-changed', handleSettingsChanged);
    };
  }, []);

  const handleUpdate = (newSettings: TabStripThemeSettings) => {
    setSettings(newSettings);
    saveTabStripSettingsToStorage(newSettings);
  };

  const handleReset = () => {
    setSettings(DEFAULT_TAB_STRIP_SETTINGS);
    saveTabStripSettingsToStorage(DEFAULT_TAB_STRIP_SETTINGS);
  };

  // Determine Background CSS
  let bgClasses = 'bg-slate-100 dark:bg-slate-900/90';
  let customBgStyle: React.CSSProperties = {};

  if (settings.bgPreset === 'yellow-gold') {
    bgClasses = 'bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-300 dark:from-yellow-400 dark:via-amber-400 dark:to-yellow-300 text-slate-950';
  } else if (settings.bgPreset === 'royal-indigo') {
    bgClasses = 'bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 text-white';
  } else if (settings.bgPreset === 'midnight-charcoal') {
    bgClasses = 'bg-gradient-to-r from-slate-950 via-zinc-900 to-slate-950 text-white';
  } else if (settings.bgPreset === 'emerald-teal') {
    bgClasses = 'bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-950 text-white';
  } else if (settings.bgPreset === 'ruby-rose') {
    bgClasses = 'bg-gradient-to-r from-rose-950 via-slate-900 to-pink-950 text-white';
  } else if (settings.bgPreset === 'custom' && settings.customBgHex) {
    bgClasses = '';
    customBgStyle = { backgroundColor: settings.customBgHex };
  }

  // Determine Outline / Border CSS
  let borderClasses = 'border-slate-200 dark:border-slate-800';
  let customBorderStyle: React.CSSProperties = {};

  if (settings.outlinePreset === 'amber-gold') {
    borderClasses = 'border-amber-400 dark:border-amber-500/90 shadow-lg shadow-amber-500/10';
  } else if (settings.outlinePreset === 'neon-cyan') {
    borderClasses = 'border-cyan-400 dark:border-cyan-500/90 shadow-lg shadow-cyan-500/10';
  } else if (settings.outlinePreset === 'emerald') {
    borderClasses = 'border-emerald-400 dark:border-emerald-500/90 shadow-lg shadow-emerald-500/10';
  } else if (settings.outlinePreset === 'rose-pink') {
    borderClasses = 'border-rose-400 dark:border-rose-500/90 shadow-lg shadow-rose-500/10';
  } else if (settings.outlinePreset === 'electric-purple') {
    borderClasses = 'border-purple-400 dark:border-purple-500/90 shadow-lg shadow-purple-500/10';
  } else if (settings.outlinePreset === 'custom' && settings.customOutlineHex) {
    borderClasses = '';
    customBorderStyle = { borderColor: settings.customOutlineHex };
  }

  // Outline Style
  let outlineTypeClasses = 'border-t-2 border-x';
  if (settings.outlineStyle === 'glowing') {
    outlineTypeClasses = 'border-t-2 border-x ring-2 ring-sky-500/30 dark:ring-sky-400/20';
  } else if (settings.outlineStyle === 'double') {
    outlineTypeClasses = 'border-t-4 border-x-2';
  } else if (settings.outlineStyle === 'dashed') {
    outlineTypeClasses = 'border-t-2 border-x border-dashed';
  }

  return (
    <div className="relative flex flex-col w-full rounded-2xl sm:rounded-3xl shadow-md overflow-hidden my-2 sm:my-4 transition-all duration-200">
      {/* Tab Strip Outer Header Bar */}
      <div
        className={`relative flex items-end justify-between gap-2 px-3 sm:px-6 pt-3 transition-colors duration-200 ${bgClasses} ${borderClasses} ${outlineTypeClasses} overflow-x-auto no-scrollbar`}
        style={{ ...customBgStyle, ...customBorderStyle }}
      >
        {/* Tab Items Container */}
        <div className="flex items-end gap-0 -space-x-[1px] flex-grow overflow-x-auto no-scrollbar pr-2 -mb-[3px] z-20">
          {children}
        </div>

        {/* Floating Customizer Gear / Palette Button */}
        <div className="sticky right-0 bottom-2 pb-1 pl-2 z-30 shrink-0 bg-transparent flex items-center">
          <button
            type="button"
            onClick={() => setIsCustomizerOpen(true)}
            className={`p-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer font-mono text-[10px] font-bold uppercase tracking-wider ${
              settings.bgPreset === 'yellow-gold'
                ? 'bg-slate-900 text-white hover:bg-black border border-slate-800'
                : 'bg-amber-400 hover:bg-amber-500 text-slate-950 border border-amber-500/50'
            }`}
            title="Customize Tab Strip Background, Colors & Outline"
          >
            <Palette className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span className="hidden md:inline">Tab Style</span>
          </button>
        </div>
      </div>

      {/* Continuous Active Tab Accent Underline */}
      <div
        className={`w-full h-3 sm:h-3.5 ${activeTabLineGradient || 'bg-sky-500'} shadow-md z-10 transition-colors duration-200 -mt-[1px]`}
      />

      {/* Tab Strip Theme & Color Customizer Modal */}
      {isCustomizerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-white space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black font-display uppercase tracking-wider text-white">
                    Customize Main Tabs Section
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Adjust background color, outline color, and border styling for the tab bar strip.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomizerOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Background Color Presets */}
            <div className="space-y-3">
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                1. Tab Strip Background Color
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { id: 'app-dark', label: 'Dark App Theme', class: 'bg-slate-900 border-slate-700 text-slate-200' },
                  { id: 'yellow-gold', label: 'Bright Yellow Gold', class: 'bg-gradient-to-r from-yellow-400 to-amber-400 text-slate-950 border-amber-500' },
                  { id: 'royal-indigo', label: 'Royal Indigo', class: 'bg-gradient-to-r from-indigo-950 to-purple-950 text-white border-indigo-500' },
                  { id: 'midnight-charcoal', label: 'Midnight Charcoal', class: 'bg-gradient-to-r from-slate-950 to-zinc-900 text-white border-zinc-700' },
                  { id: 'emerald-teal', label: 'Emerald Teal', class: 'bg-gradient-to-r from-emerald-950 to-teal-900 text-white border-emerald-500' },
                  { id: 'ruby-rose', label: 'Ruby Rose', class: 'bg-gradient-to-r from-rose-950 to-pink-950 text-white border-rose-500' },
                ].map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => handleUpdate({ ...settings, bgPreset: bg.id as any })}
                    className={`p-3 rounded-2xl border text-left text-xs font-mono font-bold transition flex items-center justify-between cursor-pointer ${bg.class} ${
                      settings.bgPreset === bg.id ? 'ring-2 ring-sky-400 scale-[1.02]' : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span>{bg.label}</span>
                    {settings.bgPreset === bg.id && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}
              </div>

              {/* Custom Hex BG Picker */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleUpdate({ ...settings, bgPreset: 'custom' })}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-bold border transition ${
                    settings.bgPreset === 'custom'
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  Custom Hex Background
                </button>
                {settings.bgPreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.customBgHex}
                      onChange={(e) => handleUpdate({ ...settings, customBgHex: e.target.value })}
                      className="w-8 h-8 rounded-lg border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-slate-300 uppercase">{settings.customBgHex}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Outline / Border Color Presets */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                2. Tab Strip Outline Color
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'slate', label: 'Default Slate', border: 'border-slate-600 bg-slate-800' },
                  { id: 'amber-gold', label: 'Amber Gold', border: 'border-amber-400 bg-amber-500/10 text-amber-400' },
                  { id: 'neon-cyan', label: 'Electric Cyan', border: 'border-cyan-400 bg-cyan-500/10 text-cyan-400' },
                  { id: 'emerald', label: 'Emerald Green', border: 'border-emerald-400 bg-emerald-500/10 text-emerald-400' },
                  { id: 'rose-pink', label: 'Rose Pink', border: 'border-rose-400 bg-rose-500/10 text-rose-400' },
                  { id: 'electric-purple', label: 'Electric Purple', border: 'border-purple-400 bg-purple-500/10 text-purple-400' },
                ].map((out) => (
                  <button
                    key={out.id}
                    type="button"
                    onClick={() => handleUpdate({ ...settings, outlinePreset: out.id as any })}
                    className={`p-2.5 rounded-xl border-2 text-center text-[11px] font-mono font-bold transition flex items-center justify-center gap-1 cursor-pointer ${out.border} ${
                      settings.outlinePreset === out.id ? 'ring-2 ring-white scale-[1.03]' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <span>{out.label}</span>
                    {settings.outlinePreset === out.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>

              {/* Custom Hex Border Picker */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleUpdate({ ...settings, outlinePreset: 'custom' })}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-bold border transition ${
                    settings.outlinePreset === 'custom'
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  Custom Hex Outline
                </button>
                {settings.outlinePreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.customOutlineHex}
                      onChange={(e) => handleUpdate({ ...settings, customOutlineHex: e.target.value })}
                      className="w-8 h-8 rounded-lg border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-slate-300 uppercase">{settings.customOutlineHex}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Outline Style Selector */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                3. Outline Border Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'solid', label: 'Solid Border' },
                  { id: 'glowing', label: 'Glow Ring' },
                  { id: 'double', label: 'Thick Accent' },
                  { id: 'dashed', label: 'Tech Dashed' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleUpdate({ ...settings, outlineStyle: st.id as any })}
                    className={`p-2.5 rounded-xl border text-center text-[11px] font-mono font-bold transition cursor-pointer ${
                      settings.outlineStyle === st.id
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500 font-black'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>

              <button
                type="button"
                onClick={() => setIsCustomizerOpen(false)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-mono font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Apply & Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
