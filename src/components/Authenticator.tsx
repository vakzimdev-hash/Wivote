import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, Eye, EyeOff, LogIn, Key, AlertCircle, Fingerprint, Check, HelpCircle, LogOut } from 'lucide-react';

export const Authenticator: React.FC = () => {
  const { currentUser, unlockWorkspace, unlockWithBiometrics, logoutUser, theme } = useApp();
  const [activeTab, setActiveTab] = useState<'passcode' | 'biometrics'>('passcode');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  // Biometrics States
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');

  // Load biometrics status for the current user
  useEffect(() => {
    if (currentUser) {
      const isEnabled = localStorage.getItem(`wivote_biometrics_enabled_${currentUser.uid}`) === 'true';
      setIsBiometricsEnabled(isEnabled);
      // Auto-switch to biometrics tab if enabled
      if (isEnabled) {
        setActiveTab('biometrics');
      } else {
        setActiveTab('passcode');
      }
      setScanStatus('idle');
      setScanProgress(0);
      setIsScanning(false);
      setError(false);
    }
  }, [currentUser]);

  if (!currentUser) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    const success = unlockWorkspace(password.trim());
    if (!success) {
      setError(true);
      setPassword('');
    }
  };

  const handleSimulatedEnrollment = () => {
    setIsScanning(true);
    setScanStatus('scanning');
    setScanProgress(0);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          localStorage.setItem(`wivote_biometrics_enabled_${currentUser.uid}`, 'true');
          setIsBiometricsEnabled(true);
          setScanStatus('success');
          
          // Auto unlock after success animation
          setTimeout(() => {
            unlockWithBiometrics();
          }, 800);
        }, 400);
      }
    }, 120);
  };

  const handleBiometricScan = () => {
    if (isScanning) return;
    
    setIsScanning(true);
    setScanStatus('scanning');
    setScanProgress(0);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setScanStatus('success');
          
          // Auto unlock after success animation
          setTimeout(() => {
            unlockWithBiometrics();
          }, 800);
        }, 400);
      }
    }, 120);
  };

  return (
    <div className="flex-grow flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden p-8 relative ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500" />

        <div className="text-center mb-5">
          <div className="relative inline-flex items-center justify-center mb-3">
            <div className="absolute inset-0 bg-sky-500/25 rounded-2xl blur-lg scale-95 pointer-events-none" />
            <img
              src="/wivote_logo.png"
              alt="WiVoTe Logo"
              referrerPolicy="no-referrer"
              className="w-16 h-16 object-contain drop-shadow-lg rounded-2xl relative z-10"
            />
          </div>
          <h2 className="text-2xl font-black font-display tracking-tight uppercase">Workspace Locked</h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">Authentication Required</p>
        </div>

        {/* Selected User Badge */}
        <div className={`p-3.5 rounded-2xl flex items-center gap-4 mb-5 border ${
          theme === 'light'
            ? 'bg-slate-50 border-slate-150'
            : 'bg-slate-950 border-slate-850'
        }`}>
          <div className="w-11 h-11 rounded-full overflow-hidden border border-slate-700/50 shrink-0">
            {currentUser.profilePic ? (
              <img
                referrerPolicy="no-referrer"
                src={currentUser.profilePic}
                alt={currentUser.name || 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center text-sm font-bold uppercase ${
                theme === 'light' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
              }`}>
                {(currentUser.name || currentUser.email || 'User').substring(0, 2)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate">{currentUser.name || currentUser.email || 'Staff User'}</h3>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
              Role: <span className="text-sky-500 font-bold">{currentUser.role === 'WorkspaceMaster' ? 'Owner / Director' : currentUser.role}</span>
            </span>
          </div>
        </div>

        {/* Login Method Tab Selector */}
        <div className="flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('passcode');
              setError(false);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'passcode'
                ? theme === 'light'
                  ? 'bg-white text-slate-950 shadow-md'
                  : 'bg-slate-900 text-white shadow-md border border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" /> Passcode
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('biometrics');
              setError(false);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer relative ${
              activeTab === 'biometrics'
                ? theme === 'light'
                  ? 'bg-white text-slate-950 shadow-md'
                  : 'bg-slate-900 text-white shadow-md border border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" /> Biometrics
            {isBiometricsEnabled && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="min-h-[180px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {activeTab === 'passcode' ? (
              <motion.form
                key="passcode-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleSubmit}
                className="space-y-4 w-full"
              >
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(false);
                    }}
                    required
                    placeholder="Enter Workspace Password"
                    className={`w-full border rounded-2xl pl-11 pr-11 py-3 text-sm focus:outline-none transition font-mono ${
                      error
                        ? 'border-rose-500 bg-rose-500/5 focus:border-rose-500'
                        : theme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500 focus:bg-white'
                          : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500 focus:bg-slate-950'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Incorrect password. Please try again.</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:opacity-90 text-white py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" /> Unlock Workspace
                </button>
              </motion.form>
            ) : (
              <motion.div
                key="biometrics-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex flex-col items-center justify-center w-full space-y-4"
              >
                {!isBiometricsEnabled ? (
                  /* Not Registered flow */
                  <div className="text-center p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 w-full bg-slate-50/50 dark:bg-slate-950/20">
                    <Fingerprint className="w-10 h-10 mx-auto text-slate-400 mb-2.5" />
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-1">No Biometrics Registered</h4>
                    <p className="text-[11px] text-slate-400 leading-normal max-w-[280px] mx-auto mb-4">
                      Enable biometric authentication (Fingerprint / FaceID) to unlock this device instantly next time.
                    </p>
                    <button
                      type="button"
                      onClick={handleSimulatedEnrollment}
                      disabled={isScanning}
                      className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold font-mono text-xs uppercase px-4 py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
                      {isScanning ? 'Registering...' : 'Register & Unlock Now'}
                    </button>
                  </div>
                ) : (
                  /* Registered Active Scan area */
                  <div className="w-full flex flex-col items-center">
                    <button
                      type="button"
                      onClick={handleBiometricScan}
                      disabled={isScanning || scanStatus === 'success'}
                      className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer outline-none ${
                        scanStatus === 'success'
                          ? 'bg-emerald-500 text-white scale-105 shadow-xl shadow-emerald-500/20'
                          : isScanning
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                            : 'bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sky-500 shadow-inner'
                      }`}
                    >
                      {/* Interactive Visual Scanning elements */}
                      {isScanning && (
                        <>
                          <div className="absolute inset-0 rounded-full bg-sky-500/5 animate-ping" />
                          <div className="absolute inset-4 rounded-full border-2 border-dashed border-sky-400/40 animate-spin" />
                          <div className="absolute inset-x-5 h-[2px] bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-[bounce_1.5s_infinite]" />
                        </>
                      )}

                      {scanStatus === 'success' ? (
                        <Check className="w-12 h-12 stroke-[3px]" />
                      ) : (
                        <Fingerprint className={`w-14 h-14 ${isScanning ? 'opacity-80' : 'opacity-100'}`} />
                      )}
                    </button>

                    <div className="text-center mt-4">
                      <span className="text-xs font-bold uppercase tracking-wide block">
                        {scanStatus === 'scanning'
                          ? 'Scanning patterns...'
                          : scanStatus === 'success'
                            ? 'Access Granted!'
                            : 'Tap sensor to unlock'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block mt-1">
                        {scanStatus === 'scanning' ? `Verifying... ${scanProgress}%` : 'Secure Hardware Enclave Simulated'}
                      </span>
                    </div>

                    {isScanning && (
                      <div className="w-32 bg-slate-200 dark:bg-slate-950 h-1.5 rounded-full mt-3 overflow-hidden border border-slate-300 dark:border-slate-850">
                        <div
                          className="h-full bg-sky-500 transition-all duration-150"
                          style={{ width: `${scanProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Hint */}
        <div className={`mt-6 p-4 rounded-2xl text-left border ${
          theme === 'light'
            ? 'bg-slate-50 border-slate-150'
            : 'bg-slate-950 border-slate-850'
        }`}>
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wide">Workspace Security Policy</p>
              <p className={`text-[10px] mt-1 leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                Authorized personnel only. Secure passcode entry or registered biometric keys are required to unlock your active terminal session.
              </p>
            </div>
          </div>
        </div>

        {/* Sign Out / Switch User Option */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={logoutUser}
            className={`w-full py-2.5 px-4 rounded-2xl text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border ${
              theme === 'light'
                ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30'
            }`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out / Switch Account</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
