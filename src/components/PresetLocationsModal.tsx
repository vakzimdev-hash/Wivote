import React, { useState, useMemo } from 'react';
import { 
  X, 
  MapPin, 
  Check, 
  Plus, 
  Edit2, 
  Trash2, 
  RotateCcw, 
  Search, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { DEFAULT_TERRITORIES } from './AgentLocationModal';

interface PresetLocationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetLocations: string[];
  onAddLocation: (name: string) => void;
  onEditLocation: (oldName: string, newName: string) => void;
  onDeleteLocation: (name: string) => void;
  onResetDefaults?: () => void;
  theme: 'light' | 'dark';
}

export const PresetLocationsModal: React.FC<PresetLocationsModalProps> = ({
  isOpen,
  onClose,
  presetLocations,
  onAddLocation,
  onEditLocation,
  onDeleteLocation,
  onResetDefaults,
  theme
}) => {
  const [newLocationInput, setNewLocationInput] = useState('');
  const [editingLocOldName, setEditingLocOldName] = useState<string | null>(null);
  const [editingLocNewName, setEditingLocNewName] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtered preset locations
  const filteredLocations = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return presetLocations;
    return presetLocations.filter(loc => loc.toLowerCase().includes(q));
  }, [presetLocations, searchFilter]);

  if (!isOpen) return null;

  const handleAdd = () => {
    const trimmed = newLocationInput.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a valid location name.');
      return;
    }
    if (presetLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`"${trimmed}" is already in the preset list.`);
      return;
    }
    onAddLocation(trimmed);
    setNewLocationInput('');
    setErrorMsg(null);
    setSuccessMsg(`Added "${trimmed}" to preset locations.`);
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  const handleStartEdit = (loc: string) => {
    setEditingLocOldName(loc);
    setEditingLocNewName(loc);
    setErrorMsg(null);
  };

  const handleSaveEdit = (oldName: string) => {
    const trimmed = editingLocNewName.trim();
    if (!trimmed) {
      setErrorMsg('Location name cannot be blank.');
      return;
    }
    if (trimmed.toLowerCase() !== oldName.toLowerCase() && presetLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`Location "${trimmed}" already exists.`);
      return;
    }
    if (trimmed !== oldName) {
      onEditLocation(oldName, trimmed);
      setSuccessMsg(`Renamed "${oldName}" to "${trimmed}".`);
      setTimeout(() => setSuccessMsg(null), 2500);
    }
    setEditingLocOldName(null);
    setEditingLocNewName('');
    setErrorMsg(null);
  };

  const handleCancelEdit = () => {
    setEditingLocOldName(null);
    setEditingLocNewName('');
    setErrorMsg(null);
  };

  const handleDelete = (loc: string) => {
    onDeleteLocation(loc);
    if (editingLocOldName === loc) {
      setEditingLocOldName(null);
      setEditingLocNewName('');
    }
    setSuccessMsg(`Removed "${loc}" from presets.`);
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-900' 
            : 'bg-slate-950 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
          theme === 'light' ? 'border-slate-150 bg-slate-50/50' : 'border-slate-850 bg-slate-900/40'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">
                <span>Manage Preset Locations</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  {presetLocations.length} Presets
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Edit, add, or customize operating territories across vouchers & agents
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-mono flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-mono flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
          {/* Add New Preset Input Bar */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Add New Preset Territory / Location
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newLocationInput}
                onChange={(e) => {
                  setNewLocationInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="e.g., Harare Central, Bulawayo North, Mutare Hub..."
                className={`flex-1 border rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                  theme === 'light' 
                    ? 'bg-slate-50 border-slate-200 text-slate-900' 
                    : 'bg-slate-900 border-slate-800 text-white'
                }`}
              />
              <button
                type="button"
                onClick={handleAdd}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Preset</span>
              </button>
            </div>
          </div>

          {/* Search Filter if more than 5 locations */}
          {presetLocations.length > 5 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter preset locations..."
                className={`w-full border rounded-xl pl-9 pr-3 py-1.5 text-xs font-mono focus:outline-none ${
                  theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-850 text-white'
                }`}
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Presets List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider">
                Existing Preset Locations ({filteredLocations.length})
              </span>
              {onResetDefaults && (
                <button
                  type="button"
                  onClick={onResetDefaults}
                  className="text-[10px] font-mono text-slate-400 hover:text-sky-500 flex items-center gap-1 cursor-pointer transition"
                  title="Restore factory default territory names"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset Defaults</span>
                </button>
              )}
            </div>

            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {filteredLocations.map((loc) => {
                const isEditing = editingLocOldName === loc;
                return (
                  <div
                    key={loc}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
                      theme === 'light'
                        ? 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        <input
                          type="text"
                          value={editingLocNewName}
                          onChange={(e) => setEditingLocNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveEdit(loc);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                          className={`flex-1 border rounded-lg px-2.5 py-1 text-xs font-mono font-bold focus:outline-none ${
                            theme === 'light'
                              ? 'bg-white border-sky-400 text-slate-900'
                              : 'bg-slate-950 border-sky-500 text-white'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(loc)}
                          className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer shrink-0"
                          title="Save Changes"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="p-1.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white rounded-lg transition cursor-pointer shrink-0"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          <span className={`font-mono font-bold text-xs truncate ${
                            theme === 'light' ? 'text-slate-800' : 'text-slate-100'
                          }`}>
                            {loc}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(loc)}
                            className="p-1.5 text-slate-400 hover:text-sky-500 rounded-lg hover:bg-sky-500/10 transition cursor-pointer"
                            title={`Edit "${loc}"`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(loc)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                            title={`Delete "${loc}"`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {filteredLocations.length === 0 && (
                <div className="p-6 text-center text-slate-400 font-mono text-xs border border-dashed rounded-xl">
                  {searchFilter ? `No locations match "${searchFilter}"` : 'No preset locations configured. Add one above.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between gap-2 ${
          theme === 'light' ? 'border-slate-150 bg-slate-50/50' : 'border-slate-850 bg-slate-900/40'
        }`}>
          <span className="text-[11px] font-mono text-slate-500">
            Changes save automatically to workspace presets
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
