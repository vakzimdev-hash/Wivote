import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, AlertCircle, CheckCircle2, RefreshCw, Cpu, User, Phone, DollarSign, Shield, RotateCcw } from 'lucide-react';
import { LegacyDevice } from '../types';

interface RequestLeaseRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: LegacyDevice | null;
  onRequestRenewal: (deviceId: string, durationDays: 14 | 30, reason?: string) => Promise<{ success: boolean; error?: string }>;
  theme: 'light' | 'dark';
}

export const RequestLeaseRenewalModal: React.FC<RequestLeaseRenewalModalProps> = ({
  isOpen,
  onClose,
  device,
  onRequestRenewal,
  theme
}) => {
  const [durationDays, setDurationDays] = useState<14 | 30>(30);
  const [reason, setReason] = useState<string>('Customer paid cash renewal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (device && isOpen) {
      setErrorMessage(null);
      setDurationDays(30);
      setReason('Customer paid cash renewal');
    }
  }, [device, isOpen]);

  const currentExpiry = useMemo(() => {
    if (!device?.expiresAt) return null;
    const d = new Date(device.expiresAt);
    return isNaN(d.getTime()) ? null : d;
  }, [device]);

  const isAlreadyExpired = useMemo(() => {
    if (!currentExpiry) return true;
    return currentExpiry.getTime() <= Date.now();
  }, [currentExpiry]);

  const projectNewExpiry = useMemo(() => {
    const now = Date.now();
    const baseTime = (currentExpiry && currentExpiry.getTime() > now) ? currentExpiry.getTime() : now;
    return new Date(baseTime + durationDays * 24 * 60 * 60 * 1000);
  }, [currentExpiry, durationDays]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const res = await onRequestRenewal(device.id, durationDays, reason.trim() || undefined);
      if (res && !res.success && res.error) {
        setErrorMessage(res.error);
        return;
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit lease renewal request.');
    } finally {
      setIsSubmitting(false);
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
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
          theme === 'light' ? 'border-slate-100 bg-slate-50/50' : 'border-slate-800/80 bg-slate-950/40'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-sm sm:text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                Request Device Lease Renewal
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Submit 14-day or 30-day lease extension to Administrator
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

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-[11px] font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Device Target Card */}
          <div className={`p-3.5 rounded-2xl border space-y-2.5 ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
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

            {/* Current Lease Expiry Status */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-slate-400">
                Current Expiration Status:
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                !isAlreadyExpired
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
              }`}>
                {currentExpiry ? currentExpiry.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No Expiry Set'}
                <span className="ml-1 opacity-80">
                  {!isAlreadyExpired ? '(Active Lease)' : '(Expired Lease)'}
                </span>
              </span>
            </div>
          </div>

          {/* Lease Duration Selection (14 Days vs 30 Days) */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block tracking-wider">
              Select Requested Lease Duration
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDurationDays(14)}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 relative overflow-hidden ${
                  durationDays === 14
                    ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/50 text-indigo-600 dark:text-indigo-400 shadow-md'
                    : theme === 'light'
                    ? 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700'
                    : 'bg-slate-950 border-slate-800 hover:border-indigo-700 hover:bg-slate-850 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold font-display text-sm">14 Days Lease</span>
                  {durationDays === 14 && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />}
                </div>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  2-Week Mid-Cycle Extension
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDurationDays(30)}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 relative overflow-hidden ${
                  durationDays === 30
                    ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/50 text-indigo-600 dark:text-indigo-400 shadow-md'
                    : theme === 'light'
                    ? 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700'
                    : 'bg-slate-950 border-slate-800 hover:border-indigo-700 hover:bg-slate-850 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold font-display text-sm">30 Days Lease</span>
                  {durationDays === 30 && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />}
                </div>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Full 1-Month Lease Contract
                </span>
              </button>
            </div>
          </div>

          {/* New Expiry Projection Banner */}
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-mono text-[11px] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>
                New Expiration Date if Approved:
              </span>
            </div>
            <strong className="text-xs">
              {projectNewExpiry.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </strong>
          </div>

          {/* Agent Reason / Memo */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block tracking-wider">
              Reason / Payment Note <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer paid $5.00 cash renewal for October lease"
              className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                theme === 'light'
                  ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  : 'bg-slate-950 border-slate-800 text-white placeholder-slate-600'
              }`}
            />
          </div>

          {/* Action Buttons */}
          <div className={`pt-3 border-t flex items-center justify-end gap-2.5 ${
            theme === 'light' ? 'border-slate-100' : 'border-slate-800'
          }`}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
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
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-mono font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Submit Renewal Request ({durationDays}d)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
