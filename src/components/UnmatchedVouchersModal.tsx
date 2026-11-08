import React, { useState, useMemo } from 'react';
import { X, Copy, Check, Download, AlertCircle, FileText, Search, ExternalLink, Filter, Layers, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Voucher } from '../types';

export interface UnmatchedVoucherToken {
  code: string;
  reason: 'not_found' | 'filtered_out' | 'archived';
  reasonText: string;
  existingVoucher?: Voucher;
}

interface UnmatchedVouchersModalProps {
  isOpen: boolean;
  onClose: () => void;
  unmatchedTokens: UnmatchedVoucherToken[];
  totalQueried: number;
  matchedCount: number;
  theme: 'light' | 'dark';
  onClearFilters?: () => void;
}

export const UnmatchedVouchersModal: React.FC<UnmatchedVouchersModalProps> = ({
  isOpen,
  onClose,
  unmatchedTokens,
  totalQueried,
  matchedCount,
  theme,
  onClearFilters
}) => {
  const [copyFormat, setCopyFormat] = useState<'comma' | 'newline'>('comma');
  const [hasCopied, setHasCopied] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [filterReason, setFilterReason] = useState<'all' | 'not_found' | 'filtered_out' | 'archived'>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'raw'>('list');

  // Filtered unmatched tokens based on inner search and reason filter
  const displayedTokens = useMemo(() => {
    return unmatchedTokens.filter(item => {
      const matchReason = filterReason === 'all' ? true : item.reason === filterReason;
      const matchSearch = !searchFilter.trim() 
        ? true 
        : item.code.toLowerCase().includes(searchFilter.toLowerCase().trim());
      return matchReason && matchSearch;
    });
  }, [unmatchedTokens, filterReason, searchFilter]);

  // Counts by category
  const notFoundCount = useMemo(() => unmatchedTokens.filter(t => t.reason === 'not_found').length, [unmatchedTokens]);
  const filteredOutCount = useMemo(() => unmatchedTokens.filter(t => t.reason === 'filtered_out').length, [unmatchedTokens]);
  const archivedCount = useMemo(() => unmatchedTokens.filter(t => t.reason === 'archived').length, [unmatchedTokens]);

  // Generate formatted text for copying/exporting
  const rawFormattedText = useMemo(() => {
    const codes = displayedTokens.map(t => t.code);
    return copyFormat === 'comma' ? codes.join(', ') : codes.join('\n');
  }, [displayedTokens, copyFormat]);

  if (!isOpen) return null;

  const handleCopyAll = async () => {
    if (!rawFormattedText) return;
    try {
      await navigator.clipboard.writeText(rawFormattedText);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // Fallback for clipboard
      const ta = document.createElement('textarea');
      ta.value = rawFormattedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  const handleCopySingle = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      // Fallback
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([rawFormattedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unmatched-voucher-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const headers = ['Voucher Code', 'Reason', 'Details'];
    const rows = displayedTokens.map(t => [
      `"${t.code.replace(/"/g, '""')}"`,
      `"${t.reason}"`,
      `"${t.reasonText.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unmatched-vouchers-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-300 ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-800' 
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className={`text-base sm:text-lg font-bold font-display truncate ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  Unmatched Voucher Codes
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold shrink-0">
                  {unmatchedTokens.length} Missing
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono truncate">
                Codes queried in multi-code search that have no matching records in current view
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
              theme === 'light'
                ? 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                : 'hover:bg-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Query Summary Metric Strip */}
        <div className={`p-4 border-b grid grid-cols-3 gap-2.5 sm:gap-3 text-center shrink-0 ${
          theme === 'light' ? 'bg-slate-50/80 border-slate-100' : 'bg-slate-950/40 border-slate-850'
        }`}>
          <div className={`p-2 rounded-xl border ${
            theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className="text-[10px] font-mono text-slate-400 block uppercase">Total Queried</span>
            <strong className="text-base sm:text-lg font-mono font-bold text-sky-600 dark:text-sky-400">
              {totalQueried}
            </strong>
          </div>
          <div className={`p-2 rounded-xl border ${
            theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className="text-[10px] font-mono text-slate-400 block uppercase">Matched In View</span>
            <strong className="text-base sm:text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {matchedCount}
            </strong>
          </div>
          <div className={`p-2 rounded-xl border ${
            theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className="text-[10px] font-mono text-slate-400 block uppercase">Unmatched Codes</span>
            <strong className="text-base sm:text-lg font-mono font-bold text-amber-600 dark:text-amber-400">
              {unmatchedTokens.length}
            </strong>
          </div>
        </div>

        {/* Filter and View Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter unmatched codes..."
                className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border focus:outline-none transition ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                }`}
              />
            </div>
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="text-[10px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className={`p-0.5 rounded-xl border flex items-center ${
              theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
                  viewMode === 'list'
                    ? theme === 'light' ? 'bg-white shadow-xs text-sky-600 font-bold' : 'bg-slate-800 text-sky-400 font-bold'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                List View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
                  viewMode === 'raw'
                    ? theme === 'light' ? 'bg-white shadow-xs text-sky-600 font-bold' : 'bg-slate-800 text-sky-400 font-bold'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                Raw Text
              </button>
            </div>

            {/* Copy Format Toggle */}
            <div className={`p-0.5 rounded-xl border flex items-center ${
              theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setCopyFormat('comma')}
                title="Format as Comma-separated: CODE1, CODE2"
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                  copyFormat === 'comma'
                    ? theme === 'light' ? 'bg-white shadow-xs text-slate-800 font-bold' : 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                CSV ( , )
              </button>
              <button
                type="button"
                onClick={() => setCopyFormat('newline')}
                title="Format as One per line (Newline)"
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                  copyFormat === 'newline'
                    ? theme === 'light' ? 'bg-white shadow-xs text-slate-800 font-bold' : 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Lines ( \n )
              </button>
            </div>
          </div>
        </div>

        {/* Reason Filter Pills */}
        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono shrink-0">
          <span className="text-slate-400 text-xs shrink-0 mr-1">Status:</span>
          <button
            type="button"
            onClick={() => setFilterReason('all')}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
              filterReason === 'all'
                ? 'bg-sky-500 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All ({unmatchedTokens.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterReason('not_found')}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
              filterReason === 'not_found'
                ? 'bg-rose-500 text-white font-bold'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
            }`}
          >
            Not in DB ({notFoundCount})
          </button>
          {filteredOutCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterReason('filtered_out')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                filterReason === 'filtered_out'
                  ? 'bg-amber-500 text-white font-bold'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
              }`}
            >
              Filtered Out ({filteredOutCount})
            </button>
          )}
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterReason('archived')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                filterReason === 'archived'
                  ? 'bg-purple-500 text-white font-bold'
                  : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20'
              }`}
            >
              Archived ({archivedCount})
            </button>
          )}

          {filteredOutCount > 0 && onClearFilters && (
            <button
              type="button"
              onClick={() => {
                onClearFilters();
                onClose();
              }}
              className="ml-auto text-[11px] text-sky-600 dark:text-sky-400 underline hover:opacity-80 shrink-0 cursor-pointer"
            >
              Reset active filters to reveal {filteredOutCount} item(s)
            </button>
          )}
        </div>

        {/* Content Body: List vs Raw Text */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-thin">
          {viewMode === 'raw' ? (
            <div className="space-y-2 h-full flex flex-col">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Direct text box (click to highlight &amp; copy):</span>
                <span>{displayedTokens.length} codes listed</span>
              </div>
              <textarea
                readOnly
                value={rawFormattedText}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className={`w-full flex-1 min-h-[220px] p-3.5 rounded-2xl border font-mono text-xs focus:outline-none resize-none transition leading-relaxed ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-1 focus:ring-sky-500'
                    : 'bg-slate-950 border-slate-800 text-emerald-400 focus:ring-1 focus:ring-sky-500'
                }`}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {displayedTokens.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-mono text-xs">
                  No unmatched codes match the active filter criteria.
                </div>
              ) : (
                displayedTokens.map((item, index) => {
                  const isCopied = copiedCode === item.code;
                  return (
                    <div
                      key={`${item.code}-${index}`}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                        theme === 'light'
                          ? 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/60'
                          : 'bg-slate-950/60 border-slate-850 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] font-mono text-slate-400 w-6 text-right shrink-0">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          <span className={`text-xs sm:text-sm font-mono font-bold tracking-tight block truncate ${
                            theme === 'light' ? 'text-slate-900' : 'text-white'
                          }`}>
                            {item.code}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block truncate mt-0.5">
                            {item.reasonText}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.reason === 'not_found' && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold uppercase">
                            Not in DB
                          </span>
                        )}
                        {item.reason === 'filtered_out' && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold uppercase">
                            Filtered
                          </span>
                        )}
                        {item.reason === 'archived' && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-semibold uppercase">
                            Archived
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopySingle(item.code)}
                          title="Copy voucher code"
                          className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                            isCopied
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                              : theme === 'light'
                              ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTxt}
              disabled={displayedTokens.length === 0}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-semibold border transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export TXT</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={displayedTokens.length === 0}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-semibold border transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleCopyAll}
              disabled={displayedTokens.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold font-mono shadow-lg shadow-amber-500/20 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {hasCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Copied {displayedTokens.length} Codes!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy {displayedTokens.length} Unmatched Codes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
