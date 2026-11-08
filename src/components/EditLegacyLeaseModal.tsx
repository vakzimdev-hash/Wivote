import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, AlertCircle, CheckCircle2, Shield, Sparkles, RefreshCw, Cpu, User, Phone, DollarSign } from 'lucide-react';
import { LegacyDevice } from '../types';

interface EditLegacyLeaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: LegacyDevice | null;
  onSave: (deviceId: string, newExpiresAt: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  theme: 'light' | 'dark';
}

export const EditLegacyLeaseModal: React.FC<EditLegacyLeaseModalProps> = ({
  isOpen,
  onClose,
  device,
  onSave,
  theme
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync date when device changes
  useEffect(() => {
    if (device && isOpen) {
      setErrorMessage(null);
      setReason('');
      let initialDateStr = '';
      if (device.expiresAt) {
        const d = new Date(device.expiresAt);
        if (!isNaN(d.getTime())) {
          initialDateStr = d.toISOString().split('T')[0];
        }
      }
      if (!initialDateStr) {
        // Default to 30 days from now or enrolledAt
        const base = device.soldAt || device.approvedAt || device.enrolledAt;
        const baseTime = base ? new Date(base).getTime() : Date.now();
        initialDateStr = new Date(baseTime + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }
      setSelectedDate(initialDateStr);
    }
  }, [device, isOpen]);

  // Current status analysis
  const currentExpiry = useMemo(() => {
    if (!device?.expiresAt) return null;
    const d = new Date(device.expiresAt);
    return isNaN(d.getTime()) ? null : d;
  }, [device]);

  const targetDateObj = useMemo(() => {
    if (!selectedDate) return null;
    const d = new Date(`${selectedDate}T23:59:59`);
    return isNaN(d.getTime()) ? null : d;
  }, [selectedDate]);

  const daysDifference = useMemo(() => {
    if (!targetDateObj) return null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetDay = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate()).getTime();
    return Math.round((targetDay - startOfToday) / (24 * 60 * 60 * 1000));
  }, [targetDateObj]);

  const handleApplyPreset = (daysToAdd: number, fromCurrentExpiry: boolean = false) => {
    let baseTime = Date.now();
    if (fromCurrentExpiry && currentExpiry && currentExpiry.getTime() > Date.now()) {
      baseTime = currentExpiry.getTime();
    }
    const newDate = new Date(baseTime + daysToAdd * 24 * 60 * 60 * 1000);
    setSelectedDate(newDate.toISOString().split('T')[0]);
    setErrorMessage(null);
  };

  const handleSetExpireToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    if (!selectedDate) {
      setErrorMessage('Please select a valid expiration date.');
      return;
    }

    const expiryDate = new Date(`${selectedDate}T23:59:59Z`);
    if (isNaN(expiryDate.getTime())) {
      setErrorMessage('Invalid expiration date format.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      const res = await onSave(device.id, expiryDate.toISOString(), reason.trim() || undefined);
      if (res && !res.success && res.error) {
        setErrorMessage(res.error);
        return;
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update lease expiration date.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !device) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-lg rounded-2xl sm:rounded-3xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
          theme === 'light' ? 'border-slate-100 bg-slate-50/50' : 'border-slate-800/80 bg-slate-950/40'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-sm sm:text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                Edit Device Lease Expiry
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Update 30-day lease duration, apply renewals, or set custom expiration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl transition cursor-pointer shrink-0 ${
              theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
            }`}
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-[11px] font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Device Profile Summary Card */}
          <div className={`p-3.5 rounded-xl border space-y-2.5 ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="font-bold text-xs">{device.deviceNameModel}</span>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                MAC: {device.macAddress}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{device.customerName}</span>
              </div>
              {device.customerCell && (
                <div className="flex items-center gap-1.5 truncate">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{device.customerCell}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Rate: <strong className="text-emerald-600 dark:text-emerald-400">${(device.monthlyPrice || 0).toFixed(2)}/mo</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">Agent: {device.fieldAgentName}</span>
              </div>
            </div>

            {/* Current Expiry Status Banner */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-slate-400">
                Current Registered Expiry:
              </span>
              <div className="flex items-center gap-2">
                {currentExpiry && currentExpiry.getTime() <= Date.now() && (
                  <div className="inline-block transform -rotate-12 px-2 py-0.5 border-2 border-red-600 dark:border-red-500 bg-red-100/80 dark:bg-red-950/80 text-red-600 dark:text-red-400 font-black font-mono tracking-widest text-[9px] uppercase rounded shadow-2xs select-none">
                    EXPIRED
                  </div>
                )}
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  currentExpiry && currentExpiry.getTime() > Date.now()
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                }`}>
                  {currentExpiry ? currentExpiry.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No Expiry Set'}
                  {currentExpiry && (
                    <span className="ml-1 opacity-80">
                      ({currentExpiry.getTime() > Date.now() ? 'Active Lease' : 'Expired'})
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Extension Preset Buttons */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block tracking-wider">
              Quick Lease Extension Presets
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPreset(7, false)}
                className={`px-2 py-1.5 rounded-xl border text-[10px] font-mono font-bold transition cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 hover:bg-sky-50 hover:border-sky-300 text-sky-700'
                    : 'bg-slate-950 border-slate-800 hover:bg-sky-950/40 hover:border-sky-700 text-sky-400'
                }`}
                title="Set 7 days lease from today"
              >
                <span>7 Days</span>
                <span className="text-[8px] font-normal opacity-75">1 Week</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset(14, false)}
                className={`px-2 py-1.5 rounded-xl border text-[10px] font-mono font-bold transition cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 hover:bg-sky-50 hover:border-sky-300 text-sky-700'
                    : 'bg-slate-950 border-slate-800 hover:bg-sky-950/40 hover:border-sky-700 text-sky-400'
                }`}
                title="Set 14 days lease from today"
              >
                <span>14 Days</span>
                <span className="text-[8px] font-normal opacity-75">2 Weeks</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset(30, true)}
                className={`px-2 py-1.5 rounded-xl border text-[10px] font-mono font-bold transition cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 hover:bg-sky-50 hover:border-sky-300 text-sky-700'
                    : 'bg-slate-950 border-slate-800 hover:bg-sky-950/40 hover:border-sky-700 text-sky-400'
                }`}
                title="Add 30 days to existing expiration (or from today if expired)"
              >
                <span>+30 Days</span>
                <span className="text-[8px] font-normal opacity-75">1 Month</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset(60, true)}
                className={`px-2 py-1.5 rounded-xl border text-[10px] font-mono font-bold transition cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 hover:bg-sky-50 hover:border-sky-300 text-sky-700'
                    : 'bg-slate-950 border-slate-800 hover:bg-sky-950/40 hover:border-sky-700 text-sky-400'
                }`}
                title="Add 60 days to existing expiration"
              >
                <span>+60 Days</span>
                <span className="text-[8px] font-normal opacity-75">2 Months</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset(90, true)}
                className={`px-2 py-1.5 rounded-xl border text-[10px] font-mono font-bold transition cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 hover:bg-sky-50 hover:border-sky-300 text-sky-700'
                    : 'bg-slate-950 border-slate-800 hover:bg-sky-950/40 hover:border-sky-700 text-sky-400'
                }`}
                title="Add 90 days to existing expiration"
              >
                <span>+90 Days</span>
                <span className="text-[8px] font-normal opacity-75">3 Months</span>
              </button>

              <button
                type="button"
                onClick={handleSetExpireToday}
                className={`px-2 py-1.5 rounded-xl border text-[10px] font-mono font-bold transition cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-rose-700'
                    : 'bg-slate-950 border-slate-800 hover:bg-rose-950/40 hover:border-rose-700 text-rose-400'
                }`}
                title="Set lease expiration to today (triggers unenrolment protocol)"
              >
                <span>Expire Today</span>
                <span className="text-[8px] font-normal opacity-75">End Lease</span>
              </button>
            </div>
          </div>

          {/* Date Picker Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block tracking-wider">
              Exact Expiration Date
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setErrorMessage(null);
                }}
                className={`w-full border rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 transition ${
                  theme === 'light'
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>

            {/* Live calculation banner */}
            {daysDifference !== null && (
              <div className={`p-2.5 rounded-xl border flex items-center justify-between text-[11px] font-mono ${
                daysDifference > 0
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : daysDifference === 0
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
              }`}>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {daysDifference > 0 
                      ? `Active: ${daysDifference} day(s) remaining on lease`
                      : daysDifference === 0
                      ? 'Lease expires today (due for unenrolment)'
                      : `Lease expired ${Math.abs(daysDifference)} day(s) ago`}
                  </span>
                </div>
                <span className="font-bold">
                  {targetDateObj?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>

          {/* Reason / Admin Memo */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block tracking-wider">
              Admin Memo / Reason <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Customer paid $25.00 cash renewal for October"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`w-full border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 transition ${
                theme === 'light'
                  ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  : 'bg-slate-950 border-slate-800 text-white placeholder-slate-600'
              }`}
            />
          </div>

          {/* Modal Actions */}
          <div className={`pt-3 border-t flex items-center justify-end gap-2.5 ${
            theme === 'light' ? 'border-slate-100' : 'border-slate-800'
          }`}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-medium transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving || !selectedDate}
              className="px-5 py-2 rounded-xl text-xs font-mono font-bold bg-sky-600 hover:bg-sky-700 text-white transition cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Lease Expiry</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
