import React, { Component, ReactNode, ErrorInfo } from 'react';
import { RefreshCw, LogOut, ShieldAlert } from 'lucide-react';
import { cleanupStorageForSpace } from '../utils/safeStorage';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in WiVoTe Application:', error, errorInfo);
    this.setState({ errorInfo });

    const msg = String(error?.message || '').toLowerCase();
    const isQuotaOrFirestoreError =
      msg.includes('quota') ||
      msg.includes('b815') ||
      msg.includes('failed to execute \'setitem\' on \'storage\'') ||
      msg.includes('firestore clients') ||
      msg.includes('unsupported field value') ||
      msg.includes('setdoc');

    if (isQuotaOrFirestoreError) {
      console.warn('[ErrorBoundary] Storage Quota or Firestore client state issue detected. Purging storage cache...');
      cleanupStorageForSpace();
    }

    const isChunkMismatch =
      msg.includes('failed to fetch dynamically imported module') ||
      msg.includes('loading chunk') ||
      msg.includes('importing a module script failed') ||
      error?.name === 'ChunkLoadError';

    if (isChunkMismatch) {
      const reloadKey = 'wivote_eb_auto_reloaded';
      const alreadyReloaded = sessionStorage.getItem(reloadKey);
      if (!alreadyReloaded) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        // Immediately reload to automatically fetch updated assets without requiring manual button clicks
        setTimeout(() => {
          window.location.reload();
        }, 200);
      }
    }
  }

  private handleReload = () => {
    try {
      cleanupStorageForSpace();
      sessionStorage.removeItem('wivote_eb_auto_reloaded');
      sessionStorage.removeItem('wivote_preload_retried');
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('wivote_retry_')) sessionStorage.removeItem(k);
      });
    } catch (e) {
      console.warn('Error clearing retry flags:', e);
    }
    window.location.reload();
  };

  private handleResetSession = () => {
    try {
      cleanupStorageForSpace();
      sessionStorage.clear();
      localStorage.removeItem('wivote_is_logged_in');
      localStorage.removeItem('wivote_current_user_id');
      localStorage.removeItem('wivote_current_user_role');
      localStorage.removeItem('wivote_current_user_workspace_id');
      localStorage.removeItem('wivote_workspace_unlocked');
    } catch (e) {
      console.error('Error clearing session cache:', e);
    }
    window.location.reload();
  };

  private handleAutoRepairSession = () => {
    try {
      cleanupStorageForSpace();
      sessionStorage.removeItem('wivote_eb_auto_reloaded');
      sessionStorage.removeItem('wivote_preload_retried');
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('wivote_retry_') || k.startsWith('wivote_temp_')) sessionStorage.removeItem(k);
      });
      // Clear volatile transient markers while keeping wivote_is_logged_in and user identity intact
      localStorage.removeItem('wivote_active_tab');
      localStorage.removeItem('wivote_modal_state');
    } catch (e) {
      console.warn('Error during session auto-repair:', e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const msgLower = (this.state.error?.message || '').toLowerCase();
      const isChunkError =
        msgLower.includes('failed to fetch dynamically imported module') ||
        msgLower.includes('loading chunk') ||
        msgLower.includes('importing a module script failed') ||
        this.state.error?.name === 'ChunkLoadError';

      const isInitError =
        msgLower.includes('before initialization') ||
        msgLower.includes('referenceerror') ||
        this.state.error?.name === 'ReferenceError';

      let headerTitle = 'Terminal Session Protected';
      let headerDesc = 'The application caught an unexpected state during session rendering. Safe recovery actions are available below.';

      if (isChunkError) {
        headerTitle = 'New Terminal Build Deployed';
        headerDesc = 'A new version of the WiVoTe terminal codebase was deployed to the server. Your open session had the previous asset hash in memory. Simply reload to activate the latest build.';
      } else if (isInitError) {
        headerTitle = 'State Initialization Protected';
        headerDesc = 'A state initialization sequence was safely intercepted before causing data corruption. Click Auto-Repair to safely resume your session.';
      }

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans select-none">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center">
            <div className={`absolute top-0 inset-x-0 h-1.5 ${
              isChunkError
                ? 'bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400'
                : isInitError
                  ? 'bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-400'
                  : 'bg-gradient-to-r from-amber-500 via-rose-500 to-sky-500'
            }`} />

            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${
              isChunkError
                ? 'bg-sky-500/10 border border-sky-500/20 text-sky-400'
                : isInitError
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            }`}>
              {isChunkError ? (
                <RefreshCw className="w-8 h-8 animate-spin-slow" />
              ) : isInitError ? (
                <RefreshCw className="w-8 h-8 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-8 h-8" />
              )}
            </div>

            <h1 className="text-2xl font-black font-display tracking-tight text-white mb-2 uppercase">
              {headerTitle}
            </h1>

            <p className="text-xs text-slate-400 font-mono mb-6 leading-relaxed">
              {headerDesc}
            </p>

            {this.state.error?.message && (
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 text-[11px] font-mono text-slate-400 text-left mb-6 break-all max-h-28 overflow-y-auto">
                <span className="text-slate-500 font-bold block mb-1">Diagnostic Log:</span>
                <span className={isChunkError ? 'text-sky-400' : isInitError ? 'text-emerald-400' : 'text-rose-400'}>
                  {this.state.error.message}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isInitError ? (
                <button
                  type="button"
                  onClick={this.handleAutoRepairSession}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-mono font-bold uppercase tracking-wider shadow-lg shadow-emerald-500/20 hover:opacity-95 active:scale-[0.98] transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Auto-Repair & Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-xs font-mono font-bold uppercase tracking-wider shadow-lg shadow-sky-500/20 hover:opacity-95 active:scale-[0.98] transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{isChunkError ? 'Reload & Activate Update' : 'Reload Terminal'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={this.handleResetSession}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/60 text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span>Reset Session</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
