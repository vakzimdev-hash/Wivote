import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, LogOut, Shield } from 'lucide-react';

export const InactivityTimer: React.FC = () => {
  const { currentUser, isLoggedIn, logoutUser, theme } = useApp();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(30);
  
  const lastActivityRef = useRef<number>(Date.now());
  const throttleRef = useRef<number>(Date.now());
  
  // Get active timeout from local storage or default to 15 minutes
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(15);

  // Update timeout minutes and immediately refresh active timestamp when currentUser or login state changes
  useEffect(() => {
    lastActivityRef.current = Date.now();
    throttleRef.current = Date.now();
    if (currentUser) {
      const saved = localStorage.getItem(`wivote_auto_logout_minutes_${currentUser.uid}`);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        setTimeoutMinutes(isNaN(parsed) || parsed < 3 ? 15 : parsed);
      } else {
        setTimeoutMinutes(15);
      }
    }
  }, [currentUser, isLoggedIn]);

  const lastStorageWriteRef = useRef<number>(0);

  // Handle activity resets
  const resetTimer = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (currentUser && now - lastStorageWriteRef.current > 15000) {
      lastStorageWriteRef.current = now;
      try {
        localStorage.setItem(`wivote_last_activity_timestamp_${currentUser.uid}`, now.toString());
      } catch (e) {}
    }
    setShowWarning(false);
  };

  const getLatestActivityTime = () => {
    if (!currentUser) return lastActivityRef.current;
    const localSaved = localStorage.getItem(`wivote_last_activity_timestamp_${currentUser.uid}`);
    if (localSaved) {
      const parsed = parseInt(localSaved, 10);
      if (!isNaN(parsed) && parsed > lastActivityRef.current) {
        lastActivityRef.current = parsed;
      }
    }
    return lastActivityRef.current;
  };

  useEffect(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    throttleRef.current = now;
    if (currentUser) {
      try {
        localStorage.setItem(`wivote_last_activity_timestamp_${currentUser.uid}`, now.toString());
      } catch (e) {}
    }

    if (!isLoggedIn || !currentUser || timeoutMinutes <= 0) {
      setShowWarning(false);
      return;
    }

    const checkInactivity = () => {
      const latestActivity = getLatestActivityTime();
      if (latestActivity <= 0) return false;
      const elapsedMs = Date.now() - latestActivity;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      const totalTimeoutSeconds = Math.max(180, timeoutMinutes * 60);

      if (elapsedSeconds >= totalTimeoutSeconds) {
        sessionStorage.setItem('wivote_logout_reason', 'inactivity');
        logoutUser();
        return true;
      }
      return false;
    };

    const onActivity = () => {
      const curTime = Date.now();
      // Throttle event listeners so they only run at most once every 1000ms
      if (curTime - throttleRef.current > 1000) {
        // Double check if we are already timed out before resetting
        const wasLoggedOut = checkInactivity();
        if (wasLoggedOut) return;

        resetTimer();
        throttleRef.current = curTime;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };

    const handleWindowFocus = () => {
      checkInactivity();
    };

    // Listen to user interaction events
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, onActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    // Check inactivity state every second
    const interval = setInterval(() => {
      const latestActivity = getLatestActivityTime();
      const elapsedMs = Date.now() - latestActivity;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      const totalTimeoutSeconds = Math.max(180, timeoutMinutes * 60);
      const warningStartSeconds = totalTimeoutSeconds - 30; // warning starts 30s before logout

      if (elapsedSeconds >= totalTimeoutSeconds && latestActivity > 0) {
        clearInterval(interval);
        sessionStorage.setItem('wivote_logout_reason', 'inactivity');
        logoutUser();
      } else if (elapsedSeconds >= warningStartSeconds) {
        setShowWarning(true);
        setRemainingSeconds(Math.max(1, totalTimeoutSeconds - elapsedSeconds));
      } else {
        setShowWarning(prev => (prev ? false : prev));
      }
    }, 1000);

    // Initial check on mount just in case we were already expired
    checkInactivity();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, onActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(interval);
    };
  }, [isLoggedIn, currentUser?.uid, timeoutMinutes]);

  if (!isLoggedIn || !currentUser || !showWarning) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`border rounded-3xl w-full max-w-md p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden transition-all duration-300 ${
            theme === 'light'
              ? 'bg-white border-amber-200 text-slate-850 shadow-sm'
              : 'bg-slate-900 border-amber-950/30 text-white shadow-xl'
          }`}
        >
          {/* Top border highlight */}
          <div className="absolute top-0 inset-x-0 h-1 bg-amber-500 animate-pulse" />
          
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-5 text-amber-500">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <h3 className={`text-xl sm:text-2xl font-black font-display uppercase tracking-wide ${
            theme === 'light' ? 'text-slate-950' : 'text-white'
          }`}>
            Inactivity Timeout Warning
          </h3>
          
          <p className="text-xs text-amber-500 font-mono mt-1.5 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Terminal auto-lock active
          </p>

          <p className={`text-sm mt-4 leading-relaxed ${
            theme === 'light' ? 'text-slate-600' : 'text-slate-300'
          }`}>
            You have been inactive for quite some time. To protect your terminal and customer billing details, you will be automatically logged out in:
          </p>

          {/* Large dynamic countdown */}
          <div className="my-6">
            <div className={`text-5xl font-black font-mono tracking-tight transition-all duration-300 ${
              remainingSeconds <= 10 ? 'text-rose-500 scale-105 animate-bounce' : 'text-amber-500'
            }`}>
              {remainingSeconds}s
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-950/50 border border-slate-800/20 h-2 rounded-full overflow-hidden mt-3 max-w-xs mx-auto">
              <motion.div
                className={`h-full ${remainingSeconds <= 10 ? 'bg-rose-500' : 'bg-amber-500'}`}
                initial={{ width: '100%' }}
                animate={{ width: `${(remainingSeconds / 30) * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>
          </div>

          <p className={`text-xs leading-normal mb-6 ${
            theme === 'light' ? 'text-slate-400' : 'text-slate-400'
          }`}>
            Performing any activity or clicking the button below will instantly restore and extend your active session.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <button
              onClick={() => {
                sessionStorage.setItem('wivote_logout_reason', 'inactivity');
                logoutUser();
              }}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wide border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-white'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" /> Logout Now
            </button>
            <button
              onClick={resetTimer}
              className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wide shadow-lg shadow-amber-500/15 transition cursor-pointer"
            >
              Extend Session
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
