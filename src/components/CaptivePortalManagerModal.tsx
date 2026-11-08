import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { CaptivePortalUrlItem } from '../types';
import { 
  X, 
  Globe, 
  Plus, 
  Edit2, 
  Trash2, 
  Copy, 
  ExternalLink, 
  Check, 
  Star, 
  Search, 
  Wifi, 
  MapPin, 
  AlertTriangle, 
  Info,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';

interface CaptivePortalManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CaptivePortalManagerModal: React.FC<CaptivePortalManagerModalProps> = ({ isOpen, onClose }) => {
  const {
    theme,
    activeWorkspace,
    captivePortalUrls,
    addCaptivePortalUrl,
    editCaptivePortalUrl,
    deleteCaptivePortalUrl,
    setDefaultCaptivePortalUrl,
    showToast
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    networkName: '',
    location: '',
    notes: '',
    isDefault: false
  });

  // Deletion Confirmation State
  const [deletingItem, setDeletingItem] = useState<CaptivePortalUrlItem | null>(null);
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);
  const [isSavingLoading, setIsSavingLoading] = useState(false);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filtered Portal URLs
  const filteredUrls = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return captivePortalUrls;
    return captivePortalUrls.filter(item => 
      (item.name || '').toLowerCase().includes(q) ||
      (item.url || '').toLowerCase().includes(q) ||
      (item.networkName || '').toLowerCase().includes(q) ||
      (item.location || '').toLowerCase().includes(q)
    );
  }, [captivePortalUrls, searchQuery]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setFormData({
      name: '',
      url: '',
      networkName: '',
      location: '',
      notes: '',
      isDefault: captivePortalUrls.length === 0
    });
    setEditingId(null);
    setIsAdding(true);
  };

  const handleStartEdit = (item: CaptivePortalUrlItem) => {
    setFormData({
      name: item.name || '',
      url: item.url || '',
      networkName: item.networkName || '',
      location: item.location || '',
      notes: item.notes || '',
      isDefault: !!item.isDefault
    });
    setEditingId(item.id);
    setIsAdding(false);
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      name: '',
      url: '',
      networkName: '',
      location: '',
      notes: '',
      isDefault: false
    });
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Please provide a descriptive portal name (e.g. Main Router Gateway).', 'error');
      return;
    }
    if (!formData.url.trim()) {
      showToast('Please enter a valid captive portal login URL.', 'error');
      return;
    }

    setIsSavingLoading(true);
    try {
      if (editingId) {
        const res = await editCaptivePortalUrl(editingId, {
          name: formData.name.trim(),
          url: formData.url.trim(),
          networkName: formData.networkName.trim() || undefined,
          location: formData.location.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          isDefault: formData.isDefault
        });
        if (res.success) {
          handleCancelForm();
        }
      } else {
        const res = await addCaptivePortalUrl({
          name: formData.name.trim(),
          url: formData.url.trim(),
          networkName: formData.networkName.trim() || undefined,
          location: formData.location.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          isDefault: formData.isDefault
        });
        if (res.success) {
          handleCancelForm();
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to save captive portal URL', 'error');
    } finally {
      setIsSavingLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeletingLoading(true);
    try {
      const res = await deleteCaptivePortalUrl(deletingItem.id);
      if (res.success) {
        setDeletingItem(null);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete captive portal URL', 'error');
    } finally {
      setIsDeletingLoading(false);
    }
  };

  const handleCopyUrl = (item: CaptivePortalUrlItem) => {
    navigator.clipboard.writeText(item.url);
    setCopiedId(item.id);
    showToast(`✓ Copied portal URL for "${item.name}" to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSetDefault = async (item: CaptivePortalUrlItem) => {
    if (item.isDefault) return;
    await setDefaultCaptivePortalUrl(item.id);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col my-auto transition-all ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-900' 
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header Bar */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
          theme === 'light' ? 'border-slate-150 bg-slate-50/70' : 'border-slate-800 bg-slate-950/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0 shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-display flex items-center gap-2">
                <span>Captive Portal URLs Manager</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
                  {captivePortalUrls.length} Configured
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Add, edit, or delete hotspot login URLs & router gateways for {activeWorkspace?.name || 'Workspace'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Top Controls: Search Bar + Add New Button */}
          {!isAdding && !editingId && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search portal by name, URL, SSID or location..."
                  className={`w-full pl-9 pr-4 py-2 text-xs font-mono rounded-xl border transition-all focus:outline-hidden focus:ring-2 ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:ring-indigo-500/20'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500/20'
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-mono"
                  >
                    Clear
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleStartAdd}
                className="h-9 px-4 rounded-xl text-xs font-bold font-mono bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Portal URL</span>
              </button>
            </div>
          )}

          {/* Add / Edit Form Panel */}
          {(isAdding || editingId) && (
            <form onSubmit={handleSubmitForm} className={`p-4 sm:p-5 rounded-2xl border space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 ${
              theme === 'light' ? 'bg-indigo-50/40 border-indigo-200' : 'bg-indigo-950/20 border-indigo-500/30'
            }`}>
              <div className="flex items-center justify-between border-b pb-3 border-indigo-200/50 dark:border-indigo-800/40">
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  <span>{editingId ? 'Edit Captive Portal URL' : 'Add New Captive Portal URL'}</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  Changes persist automatically to cloud DB
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Portal Name */}
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300 block">
                    Portal / Gateway Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. MikroTik Main Gateway"
                    required
                    className={`w-full px-3 py-2 text-xs font-mono rounded-xl border transition-all focus:outline-hidden ${
                      theme === 'light'
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* Portal Login URL */}
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300 block">
                    Captive Portal URL <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="http://192.168.88.1/login or https://portal..."
                    required
                    className={`w-full px-3 py-2 text-xs font-mono rounded-xl border transition-all focus:outline-hidden ${
                      theme === 'light'
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* WiFi SSID / Network Name */}
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300 block">
                    WiFi SSID / Network (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.networkName}
                    onChange={(e) => setFormData(prev => ({ ...prev, networkName: e.target.value }))}
                    placeholder="e.g. WiVoTe-Hotspot"
                    className={`w-full px-3 py-2 text-xs font-mono rounded-xl border transition-all focus:outline-hidden ${
                      theme === 'light'
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* Location / Node */}
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300 block">
                    Operating Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. Central Node A"
                    className={`w-full px-3 py-2 text-xs font-mono rounded-xl border transition-all focus:outline-hidden ${
                      theme === 'light'
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                    }`}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300 block">
                  Notes / Technical Instructions (Optional)
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Default gateway for MikroTik RouterBoard 750Gr3"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border transition-all focus:outline-hidden ${
                    theme === 'light'
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                  }`}
                />
              </div>

              {/* Checkbox: Set as Primary Default */}
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold font-mono text-slate-700 dark:text-slate-200 select-none pt-1">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Set as Primary Default Captive Portal for this Workspace</span>
              </label>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingLoading}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold font-mono bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingLoading ? 'Saving...' : editingId ? 'Save Changes' : 'Add Portal URL'}</span>
                </button>
              </div>
            </form>
          )}

          {/* List of Configured Captive Portal URLs */}
          <div className="space-y-3">
            {filteredUrls.length === 0 ? (
              <div className={`p-8 rounded-2xl border text-center space-y-3 ${
                theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/40 border-slate-800 text-slate-400'
              }`}>
                <Globe className="w-10 h-10 mx-auto text-slate-400 opacity-60" />
                <p className="text-sm font-bold">No Captive Portal URLs Found</p>
                <p className="text-xs font-mono text-slate-400 max-w-md mx-auto">
                  {searchQuery 
                    ? `No portal URLs matched your search query "${searchQuery}".` 
                    : 'Click "Add Portal URL" above to configure your hotspot router login page.'}
                </p>
                {!isAdding && !editingId && (
                  <button
                    type="button"
                    onClick={handleStartAdd}
                    className="mt-2 px-4 py-2 rounded-xl text-xs font-bold font-mono bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add First Portal URL</span>
                  </button>
                )}
              </div>
            ) : (
              filteredUrls.map((item) => {
                const isItemDefault = !!item.isDefault;
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full max-w-full min-w-0 overflow-hidden box-border ${
                      isItemDefault
                        ? theme === 'light'
                          ? 'bg-indigo-50/60 border-indigo-300 shadow-xs'
                          : 'bg-indigo-950/30 border-indigo-500/40 shadow-xs'
                        : theme === 'light'
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 w-full max-w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold font-display text-slate-900 dark:text-white truncate">
                          {item.name}
                        </h4>

                        {isItemDefault && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Star className="w-3 h-3 fill-current text-amber-500" />
                            Primary Default
                          </span>
                        )}

                        {item.networkName && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 flex items-center gap-1">
                            <Wifi className="w-3 h-3" />
                            {item.networkName}
                          </span>
                        )}

                        {item.location && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {item.location}
                          </span>
                        )}
                      </div>

                      {/* URL Display */}
                      <div className="flex items-center gap-2 text-xs font-mono text-indigo-600 dark:text-indigo-400 break-all font-semibold">
                        <Globe className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          <span>{item.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                        </a>
                      </div>

                      {item.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono italic">
                          "{item.notes}"
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-start sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-150 dark:border-slate-800">
                      {/* Copy Link Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(item)}
                        className={`p-2 rounded-xl text-xs font-bold font-mono border transition cursor-pointer flex items-center gap-1 ${
                          copiedId === item.id
                            ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                            : theme === 'light'
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                            : 'bg-slate-850 hover:bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                        title="Copy portal URL"
                      >
                        {copiedId === item.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      {/* Set Default Button */}
                      {!isItemDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(item)}
                          className="p-2 rounded-xl text-xs font-bold font-mono bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/25 transition cursor-pointer flex items-center gap-1"
                          title="Set as Primary Default Portal"
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Set Default</span>
                        </button>
                      )}

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-2 rounded-xl text-xs font-bold font-mono bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/25 transition cursor-pointer flex items-center gap-1"
                        title="Edit portal URL details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => setDeletingItem(item)}
                        className="p-2 rounded-xl text-xs font-bold font-mono bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/25 transition cursor-pointer flex items-center gap-1"
                        title="Delete this captive portal URL"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer info banner */}
        <div className={`p-4 border-t flex items-center justify-between text-[11px] font-mono text-slate-500 ${
          theme === 'light' ? 'border-slate-150 bg-slate-50/50' : 'border-slate-800 bg-slate-950/40'
        }`}>
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>All edits and deletions automatically sync across field agents & cloud database</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal Overlay */}
      {deletingItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl space-y-4 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display uppercase tracking-wide">
                  Confirm Deletion
                </h3>
                <p className="text-[11px] font-mono text-slate-400">
                  Permanent cloud database removal
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 font-mono">
              Are you sure you want to delete captive portal URL entry <strong className="text-slate-900 dark:text-white">"{deletingItem.name}"</strong> (<span className="text-indigo-500">{deletingItem.url}</span>)?
            </p>

            <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
              ⚠️ This operation will immediately remove this portal entry and save the updated configuration to cloud database.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={isDeletingLoading}
                className="px-4 py-2 rounded-xl text-xs font-bold font-mono text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingLoading}
                className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-rose-600 hover:bg-rose-700 text-white transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingLoading ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
