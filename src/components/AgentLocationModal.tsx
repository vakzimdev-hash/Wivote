import React, { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Check, 
  Plus, 
  AlertCircle, 
  Loader2, 
  Navigation, 
  CheckCircle2, 
  Edit2, 
  Trash2, 
  RotateCcw, 
  SlidersHorizontal,
  Copy,
  Shield
} from 'lucide-react';
import { UserProfile } from '../types';
import { SyncedLeaderboardEntry } from '../utils/rbacPolicy';

interface AgentLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: UserProfile | SyncedLeaderboardEntry | null;
  onSaveLocation: (agentUid: string, newLocation: string, syncVouchers?: boolean) => Promise<void>;
  theme: 'light' | 'dark';
  availableLocations?: string[];
  assignedVouchersCount?: number;
  onAddPresetLocation?: (name: string) => void;
  onEditPresetLocation?: (oldName: string, newName: string) => void;
  onDeletePresetLocation?: (name: string) => void;
}

export const DEFAULT_TERRITORIES = [
  'Harare Central',
  'Harare North',
  'Harare South',
  'Bulawayo CBD',
  'Bulawayo North',
  'Gweru Central',
  'Mutare Urban',
  'Chitungwiza',
  'Masvingo CBD',
  'Kwekwe Central'
];

export const AgentLocationModal: React.FC<AgentLocationModalProps> = ({
  isOpen,
  onClose,
  agent,
  onSaveLocation,
  theme,
  availableLocations = [],
  assignedVouchersCount = 0,
  onAddPresetLocation,
  onEditPresetLocation,
  onDeletePresetLocation
}) => {
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [customInput, setCustomInput] = useState<string>('');
  const [syncVouchers, setSyncVouchers] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState<boolean>(false);

  // Preset Management State
  const [isManagingPresets, setIsManagingPresets] = useState<boolean>(false);
  const [editingPresetOldName, setEditingPresetOldName] = useState<string | null>(null);
  const [editingPresetNewName, setEditingPresetNewName] = useState<string>('');
  const [newPresetInput, setNewPresetInput] = useState<string>('');
  const [localPresetList, setLocalPresetList] = useState<string[]>(() => {
    const saved = localStorage.getItem('wivote_custom_locations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return DEFAULT_TERRITORIES;
  });

  // Keep local preset list in sync with availableLocations and saved storage
  useEffect(() => {
    if (availableLocations.length > 0) {
      setLocalPresetList(prev => {
        const merged = Array.from(new Set([...availableLocations.filter(Boolean), ...prev]));
        return merged;
      });
    }
  }, [availableLocations]);

  // Combine default territories with available locations and local presets
  const combinedLocations = React.useMemo(() => {
    const merged = Array.from(new Set([
      ...localPresetList.filter(Boolean),
      ...availableLocations.filter(Boolean)
    ]));
    return merged.length > 0 ? merged : DEFAULT_TERRITORIES;
  }, [localPresetList, availableLocations]);

  useEffect(() => {
    if (agent && isOpen) {
      const initial = agent.location || 'Harare Central';
      setSelectedLocation(initial);
      setCustomInput('');
      setErrorMsg(null);
      setIsSaving(false);
      setSyncVouchers(true);
      setIsManagingPresets(false);
      setEditingPresetOldName(null);
    }
  }, [agent, isOpen]);

  if (!isOpen || !agent) return null;

  const handleSelectLocation = (loc: string) => {
    setSelectedLocation(loc);
    setCustomInput('');
    setErrorMsg(null);
  };

  const handleApplyCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a location name before applying.');
      return;
    }
    setSelectedLocation(trimmed);
    setErrorMsg(null);
  };

  // --- Preset Location Management Handlers ---
  const handleAddNewPreset = () => {
    const trimmed = newPresetInput.trim();
    if (!trimmed) return;
    if (combinedLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`"${trimmed}" is already in the preset list.`);
      return;
    }

    const updated = [...combinedLocations, trimmed];
    setLocalPresetList(updated);
    localStorage.setItem('wivote_custom_locations', JSON.stringify(updated));
    if (onAddPresetLocation) {
      onAddPresetLocation(trimmed);
    }
    setNewPresetInput('');
    setErrorMsg(null);
  };

  const handleStartEditPreset = (loc: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPresetOldName(loc);
    setEditingPresetNewName(loc);
  };

  const handleSaveEditPreset = (oldName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const trimmed = editingPresetNewName.trim();
    if (!trimmed) return;

    const updated = combinedLocations.map(l => l === oldName ? trimmed : l);
    setLocalPresetList(updated);
    localStorage.setItem('wivote_custom_locations', JSON.stringify(updated));

    if (onEditPresetLocation) {
      onEditPresetLocation(oldName, trimmed);
    }

    if (selectedLocation === oldName) {
      setSelectedLocation(trimmed);
    }

    setEditingPresetOldName(null);
    setEditingPresetNewName('');
    setErrorMsg(null);
  };

  const handleCancelEditPreset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPresetOldName(null);
    setEditingPresetNewName('');
  };

  const handleDeletePreset = (locToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = combinedLocations.filter(l => l !== locToDelete);
    setLocalPresetList(updated);
    localStorage.setItem('wivote_custom_locations', JSON.stringify(updated));

    if (onDeletePresetLocation) {
      onDeletePresetLocation(locToDelete);
    }

    if (selectedLocation === locToDelete) {
      setSelectedLocation(updated[0] || 'Harare Central');
    }
    setErrorMsg(null);
  };

  const handleResetDefaults = () => {
    setLocalPresetList(DEFAULT_TERRITORIES);
    localStorage.setItem('wivote_custom_locations', JSON.stringify(DEFAULT_TERRITORIES));
    setErrorMsg(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetLoc = (customInput.trim() || selectedLocation || '').trim();
    if (!targetLoc) {
      setErrorMsg('Please select or specify a valid operating location.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onSaveLocation(agent.uid, targetLoc, syncVouchers && assignedVouchersCount > 0);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update agent location. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300 flex flex-col max-h-[90vh] ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-800' 
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-500 border border-sky-500/20 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base sm:text-lg font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                Agent Location & Territory
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Assign territory &amp; manage preset operating zones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer ${
              theme === 'light'
                ? 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                : 'hover:bg-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto scrollbar-thin flex-1">
          {/* Agent Identification Card */}
          <div className={`p-3.5 sm:p-4 rounded-2xl border flex items-center gap-3.5 ${
            theme === 'light' ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-950/60 border-slate-850'
          }`}>
            <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-700 shrink-0">
              <img
                referrerPolicy="no-referrer"
                src={agent.profilePic || ''}
                alt={agent.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className={`text-sm font-bold truncate ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  {agent.name}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-bold uppercase shrink-0">
                  Field Agent
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 font-mono mt-0.5 min-w-0 max-w-full">
                <span className="truncate max-w-[180px]">{agent.email || agent.cellNumber}</span>
                {agent.uid && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(agent.uid);
                      setCopiedUid(true);
                      setTimeout(() => setCopiedUid(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-[9.5px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono select-all break-all border border-slate-300/40 dark:border-slate-700/50 hover:border-sky-500/50 transition cursor-pointer max-w-full"
                    title="Click to copy full Agent UID"
                  >
                    <span className="text-slate-400 font-bold shrink-0">UID:</span>
                    <strong className="text-sky-500 font-bold">{agent.uid}</strong>
                    {copiedUid ? <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0 ml-0.5" /> : <Copy className="w-2.5 h-2.5 text-slate-400 shrink-0 ml-0.5" />}
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                <Navigation className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>Current Location:</span>
                <strong className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-sky-400'}`}>
                  {agent.location || 'Unassigned / Default'}
                </strong>
              </div>
            </div>
          </div>

          {/* Preset Territories Section with Edit Presets Feature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-mono font-semibold text-slate-400">
                {isManagingPresets ? 'Manage Preset Locations' : 'Select Preset Operating Territory'}
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsManagingPresets(!isManagingPresets);
                  setEditingPresetOldName(null);
                }}
                className={`text-xs font-mono px-2.5 py-1 rounded-xl transition cursor-pointer flex items-center gap-1.5 border font-semibold ${
                  isManagingPresets
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{isManagingPresets ? 'Done Editing' : 'Edit Presets'}</span>
              </button>
            </div>

            {/* Editing Mode Helper Notice & Quick Add */}
            {isManagingPresets && (
              <div className={`p-3 rounded-2xl border space-y-2.5 animate-in fade-in duration-200 ${
                theme === 'light' ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-900/40'
              }`}>
                <div className="flex items-center justify-between gap-2 text-xs font-mono text-amber-700 dark:text-amber-300">
                  <span>Click ✏️ to rename or ✕ to remove any preset</span>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="text-[11px] underline text-amber-800 dark:text-amber-400 hover:opacity-80 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPresetInput}
                    onChange={(e) => setNewPresetInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNewPreset();
                      }
                    }}
                    placeholder="Add new preset territory name..."
                    className={`flex-1 px-3 py-1.5 rounded-xl text-xs border focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border-amber-300 text-slate-900 focus:ring-1 focus:ring-amber-500'
                        : 'bg-slate-900 border-amber-800/80 text-white focus:ring-1 focus:ring-amber-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddNewPreset}
                    disabled={!newPresetInput.trim()}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            )}

            {/* Presets Grid */}
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {combinedLocations.map((loc) => {
                const isSelected = selectedLocation.toLowerCase().trim() === loc.toLowerCase().trim();
                const isEditingThis = editingPresetOldName === loc;

                if (isEditingThis) {
                  return (
                    <div
                      key={loc}
                      className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-xs font-mono ${
                        theme === 'light' ? 'bg-white border-amber-400 ring-1 ring-amber-400' : 'bg-slate-900 border-amber-500 ring-1 ring-amber-500'
                      }`}
                    >
                      <input
                        type="text"
                        value={editingPresetNewName}
                        onChange={(e) => setEditingPresetNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveEditPreset(loc, e as any);
                          } else if (e.key === 'Escape') {
                            handleCancelEditPreset(e as any);
                          }
                        }}
                        autoFocus
                        className="w-32 sm:w-40 px-1 py-0.5 text-xs bg-transparent border-none focus:outline-none font-bold"
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveEditPreset(loc, e)}
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                        title="Save name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditPreset}
                        className="p-1 rounded text-slate-400 hover:bg-slate-500/10 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={loc}
                    onClick={() => {
                      if (!isManagingPresets) {
                        handleSelectLocation(loc);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono transition flex items-center gap-1.5 border select-none ${
                      isManagingPresets
                        ? theme === 'light'
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-200'
                        : isSelected
                        ? 'bg-sky-600 border-sky-600 text-white font-bold shadow-xs cursor-pointer'
                        : theme === 'light'
                        ? 'bg-white border-slate-200 text-slate-700 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900 cursor-pointer'
                    }`}
                  >
                    {!isManagingPresets && (
                      isSelected ? <Check className="w-3.5 h-3.5" /> : <MapPin className="w-3 h-3 text-slate-400" />
                    )}
                    <span className="font-semibold">{loc}</span>

                    {/* Manage mode edit/delete buttons */}
                    {isManagingPresets && (
                      <div className="flex items-center gap-1 ml-1 border-l pl-1.5 border-slate-300 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={(e) => handleStartEditPreset(loc, e)}
                          className="p-1 rounded text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 transition cursor-pointer"
                          title={`Edit "${loc}"`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePreset(loc, e)}
                          className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                          title={`Delete "${loc}"`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Location Input */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5">
              Or Enter One-Off Site / Area Name
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => {
                    setCustomInput(e.target.value);
                    if (e.target.value.trim()) {
                      setSelectedLocation(e.target.value.trim());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCustom();
                    }
                  }}
                  placeholder="e.g. Masvingo West, Chinhoyi Urban, Kwekwe CBD..."
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none transition ${
                    theme === 'light'
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500'
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={handleApplyCustom}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold font-mono transition cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Use</span>
              </button>
            </div>
          </div>

          {/* Active Selection Summary */}
          <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
            theme === 'light' ? 'bg-sky-50/70 border-sky-200 text-sky-900' : 'bg-sky-950/30 border-sky-800/80 text-sky-300'
          }`}>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />
              <span>Assigned Location:</span>
            </span>
            <strong className="font-bold text-sm tracking-tight">
              {selectedLocation || 'None specified'}
            </strong>
          </div>

          {/* Sync Assigned Vouchers Option */}
          {assignedVouchersCount > 0 && (
            <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <input
                id="sync-agent-vouchers-checkbox"
                type="checkbox"
                checked={syncVouchers}
                onChange={(e) => setSyncVouchers(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <label htmlFor="sync-agent-vouchers-checkbox" className="text-xs leading-relaxed cursor-pointer select-none">
                <span className={`font-semibold block ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>
                  Synchronize {assignedVouchersCount} Assigned Voucher(s)
                </span>
                <span className="text-slate-400 font-mono text-[11px] block mt-0.5">
                  Update the location metadata on all active vouchers currently held by {agent.name} to match this new territory.
                </span>
              </label>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2 font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              theme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSaving || !selectedLocation.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-sky-500/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Location...</span>
              </>
            ) : (
              <>
                <MapPin className="w-3.5 h-3.5" />
                <span>Save Location</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
