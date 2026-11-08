import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, Users, Shield, Ticket, TrendingUp, Volume2, VolumeX, Sparkles, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { 
  resumeAudio, 
  playStartupSynth, 
  playWhoosh, 
  playDigitalBeep, 
  playConfirmationChime,
  setMuteState 
} from '../utils/splashAudio';

interface SplashProps {
  onComplete: () => void;
}

export const Splash: React.FC<SplashProps> = ({ onComplete }) => {
  const { activeWorkspace } = useApp();
  const [time, setTime] = useState(0); // Elapsed time in seconds
  const [isMuted, setIsMuted] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  
  // Refs to prevent double audio triggering
  const triggeredStartup = useRef(false);
  const triggeredWhoosh = useRef(false);
  const triggeredBeep1 = useRef(false);
  const triggeredBeep2 = useRef(false);
  const triggeredBeep3 = useRef(false);
  const triggeredChime = useRef(false);

  // Generate stable particle coordinates on mount
  const particles = useMemo(() => {
    return Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage x
      y: Math.random() * 100, // percentage y
      size: Math.random() * 3 + 1, // 1px to 4px
      speed: Math.random() * 1.5 + 0.5,
      delay: Math.random() * 5,
      opacity: Math.random() * 0.7 + 0.3
    }));
  }, []);

  // Frame loop for 60 FPS precision - snappy 0.75s max duration or instant on tap
  useEffect(() => {
    const startTime = performance.now();
    let animationFrameId: number;

    const tick = () => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000; // in seconds
      
      if (elapsed >= 0.75) {
        try {
          sessionStorage.setItem('wivote_splash_seen', 'true');
        } catch {}
        onComplete();
        return;
      }

      setTime(elapsed);
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [onComplete]);

  // Audio trigger effect synchronized with time
  useEffect(() => {
    // Attempt audio on any trigger if user interacted or context is ready
    if (!triggeredStartup.current && time >= 0.0) {
      playStartupSynth();
      triggeredStartup.current = true;
    }
    if (!triggeredWhoosh.current && time >= 0.2) {
      playWhoosh();
      triggeredWhoosh.current = true;
    }
    if (!triggeredBeep1.current && time >= 0.4) {
      playDigitalBeep(0);
      triggeredBeep1.current = true;
    }
    if (!triggeredBeep2.current && time >= 0.6) {
      playDigitalBeep(1);
      triggeredBeep2.current = true;
    }
    if (!triggeredBeep3.current && time >= 0.8) {
      playDigitalBeep(2);
      triggeredBeep3.current = true;
    }
    if (!triggeredChime.current && time >= 1.3) {
      playConfirmationChime();
      triggeredChime.current = true;
    }
  }, [time]);

  // User click to instantly skip / enter terminal
  const handleInteraction = async () => {
    try {
      sessionStorage.setItem('wivote_splash_seen', 'true');
    } catch {}
    onComplete();
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent main interaction handler
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setMuteState(nextMuted);
    if (!nextMuted) {
      resumeAudio();
    }
  };

  // Skip feature for development / quick user access
  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      sessionStorage.setItem('wivote_splash_seen', 'true');
    } catch {}
    onComplete();
  };

  // Calculations for animations based on timing
  const showCenterGlow = time >= 0.0;
  const logoScale = time < 0.1 ? 1.4 : Math.max(1.0, 1.4 - (time - 0.1) * 0.5); // Start bold, zoom out smoothly
  const showLogo = time >= 0.05;
  const showPulseRings = time >= 0.05;
  const showVoucher = time >= 0.15;
  const showWifiArcs = time >= 0.15;
  const showOrbitIcons = time >= 0.15;
  const showLoadingBar = time >= 0.2;
  const showSlogan = time >= 0.35;
  const showFlash = time >= 0.65 && time <= 0.75;

  // Loading bar calculations: 0.2s to 0.7s
  const loadPercentage = Math.max(0, Math.min(100, ((time - 0.2) / (0.7 - 0.2)) * 100));

  // Particle speed factor (accelerates near end)
  const particleSpeedFactor = time >= 0.55 ? 2.5 : 1.0;

  // Loading texts based on progress
  const getLoadingText = () => {
    if (time >= 0.55) return "Ready";
    if (time >= 0.3) return "Loading WiVoTe...";
    return "Connecting...";
  };

  // Orbit rotation calculations
  const orbitAngle = time * 90; // degrees per second

  return (
    <div 
      onClick={handleInteraction}
      className="fixed inset-0 bg-[#000814] flex flex-col items-center justify-between p-8 z-50 overflow-hidden select-none cursor-pointer"
      style={{
        background: 'radial-gradient(circle at center, #0B192C 0%, #020c1b 100%)'
      }}
    >
      {/* Sound enablement helper banner */}
      {!hasInteracted && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-sky-500/10 border border-sky-400/30 text-sky-400 text-xs px-4 py-2 rounded-full font-mono animate-pulse pointer-events-none">
          <Volume2 className="w-3.5 h-3.5" />
          <span>Tap anywhere to enter terminal</span>
        </div>
      )}

      {/* Top Header Row with Sound Control & Skip button */}
      <div className="w-full max-w-7xl flex justify-between items-center z-50">
        <button
          onClick={handleMuteToggle}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/10 bg-sky-950/20 text-sky-400 hover:bg-sky-950/40 hover:border-sky-500/30 transition text-xs font-mono"
        >
          {isMuted ? (
            <>
              <VolumeX className="w-4 h-4 text-rose-400" />
              <span>MUTED</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>AUDIO ON</span>
            </>
          )}
        </button>

        <button
          onClick={handleSkip}
          className="px-4 py-1.5 rounded-full border border-slate-700/50 bg-slate-900/40 text-slate-400 hover:text-white hover:border-slate-500 transition text-xs font-mono"
        >
          SKIP SPLASH
        </button>
      </div>

      {/* Background Star Particles */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {particles.map((p) => {
          // Adjust position smoothly with parallax based on speed
          const currentY = (p.y - time * p.speed * 4 * particleSpeedFactor + 100) % 100;
          return (
            <div
              key={p.id}
              className="absolute rounded-full bg-sky-400"
              style={{
                left: `${p.x}%`,
                top: `${currentY}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                opacity: p.opacity,
                filter: p.size > 2 ? 'drop-shadow(0 0 2px rgba(56, 189, 248, 0.8))' : 'none',
                transition: 'opacity 0.3s ease'
              }}
            />
          );
        })}
      </div>

      {/* Soft Ambient Center Glow */}
      {showCenterGlow && (
        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none z-0 transition-opacity duration-1000"
          style={{
            background: `radial-gradient(circle, ${time >= 4.5 ? 'rgba(14, 165, 233, 0.15)' : 'rgba(56, 189, 248, 0.08)'} 0%, transparent 70%)`
          }}
        />
      )}

      {/* Main Core Showcase (WiVote Logo & Voucher ticket with Orbit icons) */}
      <div className="relative flex-grow flex items-center justify-center w-full max-w-lg z-10">
        
        {/* Expanding concentric pulse rings (0.5s onwards) */}
        {showPulseRings && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div 
              className="absolute border border-sky-500/20 rounded-full animate-ping"
              style={{
                width: `${Math.max(100, ((time - 0.5) % 1.5) * 120)}px`,
                height: `${Math.max(100, ((time - 0.5) % 1.5) * 120)}px`,
                opacity: Math.max(0, 1 - ((time - 0.5) % 1.5) / 1.5),
                animationDuration: '1.5s'
              }}
            />
            <div 
              className="absolute border border-sky-400/15 rounded-full animate-ping"
              style={{
                width: `${Math.max(100, (((time - 0.5) + 0.5) % 1.5) * 120)}px`,
                height: `${Math.max(100, (((time - 0.5) + 0.5) % 1.5) * 120)}px`,
                opacity: Math.max(0, 1 - (((time - 0.5) + 0.5) % 1.5) / 1.5),
                animationDuration: '1.5s'
              }}
            />
          </div>
        )}

        {/* Floating orbiting utility icons (1.5s onwards) */}
        {showOrbitIcons && (
          <div className="absolute w-[280px] h-[280px] rounded-full border border-dashed border-sky-500/10 pointer-events-none">
            {/* 4 Orbiting Icons */}
            {[
              { Icon: Users, label: 'Users', index: 0, color: 'text-sky-400 bg-sky-950/80 border-sky-500/30' },
              { Icon: TrendingUp, label: 'Analytics', index: 1, color: 'text-emerald-400 bg-emerald-950/80 border-emerald-500/30' },
              { Icon: Shield, label: 'Security', index: 2, color: 'text-indigo-400 bg-indigo-950/80 border-indigo-500/30' },
              { Icon: Ticket, label: 'Vouchers', index: 3, color: 'text-rose-400 bg-rose-950/80 border-rose-500/30' }
            ].map((item) => {
              const baseAngle = (item.index * 90) + orbitAngle;
              const angleRad = (baseAngle * Math.PI) / 180;
              const x = Math.cos(angleRad) * 140; // radius is 140px
              const y = Math.sin(angleRad) * 140;

              return (
                <div
                  key={item.label}
                  className={`absolute p-2.5 rounded-full border shadow-lg flex items-center justify-center transition-all duration-300 ${item.color}`}
                  style={{
                    left: `calc(50% + ${x}px - 18px)`,
                    top: `calc(50% + ${y}px - 18px)`,
                    width: '36px',
                    height: '36px',
                    boxShadow: '0 0 10px rgba(56, 189, 248, 0.15)'
                  }}
                >
                  <item.Icon className="w-4 h-4" />
                </div>
              );
            })}
          </div>
        )}

        {/* Centerpiece Container with Logo & Ticket */}
        <div className="relative flex flex-col items-center">
          {/* Voucher Ticket Rising from below (1.5s onwards) */}
          <AnimatePresence>
            {showVoucher && (
              <motion.div
                initial={{ y: 120, opacity: 0, rotate: 0 }}
                animate={{ y: -50, opacity: 0.9, rotate: 5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="absolute w-[180px] h-[100px] border border-rose-500/40 bg-gradient-to-br from-rose-950/60 to-purple-950/60 rounded-xl flex flex-col justify-between p-3 shadow-[0_0_25px_rgba(244,63,94,0.15)] overflow-hidden"
              >
                {/* Decorative Ticket punch holes */}
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#000814] border-r border-rose-500/30" />
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#000814] border-l border-rose-500/30" />
                
                <div className="flex justify-between items-start font-mono text-[9px] text-rose-400 pl-4 pr-4">
                  <span>WVT-SECURE</span>
                  <Ticket className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                </div>
                
                {/* Visual WiFi symbol built one arc at a time (1.5s, 1.9s, 2.3s) */}
                <div className="flex justify-center items-center gap-1.5 my-1">
                  <div className="relative flex flex-col items-center justify-center">
                    {/* Arc 1 */}
                    <div 
                      className={`w-3 h-3 rounded-full bg-rose-500 transition-all duration-300 ${
                        time >= 1.5 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                      }`} 
                    />
                    {/* Arc 2 */}
                    <div 
                      className={`absolute w-7 h-7 rounded-full border-2 border-t-rose-500 border-x-transparent border-b-transparent transition-all duration-300 -mt-1.5 ${
                        time >= 1.9 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                      }`} 
                    />
                    {/* Arc 3 */}
                    <div 
                      className={`absolute w-11 h-11 rounded-full border-2 border-t-rose-500 border-x-transparent border-b-transparent transition-all duration-300 -mt-3 ${
                        time >= 2.3 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                      }`} 
                    />
                  </div>
                </div>

                <div className="flex justify-between items-end font-mono text-[8px] text-rose-300 pl-4 pr-4">
                  <span>EXP: 30 DAYS</span>
                  <span className="font-bold">ACTIVE</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* WiVote Brand Logo & Glowing Core (0.5s onwards) */}
          <AnimatePresence>
            {showLogo && (
              <motion.div
                initial={{ scale: 2.2, opacity: 0 }}
                animate={{ scale: 1.0, opacity: 1 }}
                transition={{ 
                  duration: 6.5,
                  ease: "easeOut"
                }}
                className="flex flex-col items-center text-center mt-20 relative"
              >
                {/* Outer Glow Shield */}
                <div className="absolute -inset-6 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 rounded-full blur-2xl animate-pulse pointer-events-none" />

                <div className="relative mb-6">
                  {/* Decorative glowing card surrounding the logo */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-4 sm:p-5 rounded-3xl border border-sky-500/30 shadow-[0_0_40px_rgba(14,165,233,0.35)] relative overflow-hidden flex items-center justify-center">
                    
                    {/* Blue light sweep line (0.5s - 1.5s) */}
                    <div 
                      className="absolute top-0 bottom-0 w-8 bg-gradient-to-r from-transparent via-sky-400/35 to-transparent skew-x-12"
                      style={{
                        left: `${((time - 0.5) % 2.0) * 120 - 40}%`,
                        transition: 'left 1.2s ease-in-out'
                      }}
                    />

                    <img
                      src="/wivote_logo.png"
                      alt="WiVoTe Logo"
                      referrerPolicy="no-referrer"
                      className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_0_15px_rgba(56,189,248,0.6)] relative z-10"
                    />
                  </div>
                </div>

                {/* Main branding Title */}
                <h1 className="text-6xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-200 to-sky-400 font-display uppercase mb-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  WiVoTe
                </h1>

                {/* Subtitle (twinkling words "wifi voucher terminal") */}
                <motion.div 
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  className="text-[10px] tracking-[0.5em] font-mono text-sky-400/80 uppercase font-semibold pl-2"
                >
                  wifi voucher terminal
                </motion.div>
                
                {/* VakZim ICT&E 2026 Text */}
                <div className="text-[10px] font-mono text-slate-500 tracking-wider uppercase mt-2.5 font-bold">
                  VakZim ICT&E 2026
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Loading Progression & Brand Slogans */}
      <div className="w-full max-w-sm flex flex-col items-center gap-6 z-10 mb-8">
        
        {/* "Connect. Manage. Grow." Slogan (4.5s onwards) */}
        <div className="h-6 flex items-center justify-center">
          <AnimatePresence>
            {showSlogan && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="text-xs font-mono text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-emerald-400 to-indigo-400 uppercase tracking-[0.3em] font-black pl-1"
              >
                Connect • Manage • Grow
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading Bar Slider (2.8s onwards) */}
        {showLoadingBar && (
          <div className="w-full">
            <div className="relative w-full bg-slate-950/80 h-[5px] rounded-full overflow-hidden border border-slate-800/60 shadow-inner">
              
              {/* Glowing progression line */}
              <div 
                className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 shadow-[0_0_12px_#38bdf8] transition-all duration-100 ease-out"
                style={{ width: `${loadPercentage}%` }}
              />

              {/* Glowing active spark traveling along the loading bar */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-sky-300 rounded-full blur-sm pointer-events-none"
                style={{ 
                  left: `calc(${loadPercentage}% - 8px)`,
                  opacity: loadPercentage > 0 && loadPercentage < 100 ? 1 : 0
                }}
              />
            </div>

            <div className="flex justify-between items-center mt-3 px-1">
              {/* Cycling Status message */}
              <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase transition-all duration-300">
                {getLoadingText()}
              </span>

              {/* Numerical Percentage */}
              <span className="text-[10px] text-sky-400 font-mono font-bold">
                {Math.floor(loadPercentage)}%
              </span>
            </div>
          </div>
        )}

        {/* Corporate Footer Signature */}
        <div className="flex flex-col items-center gap-1 mt-2">
          <div className="text-[9px] text-slate-600 font-mono tracking-widest uppercase">
            Secured Terminal Pipeline
          </div>
          <div className="text-xs font-bold tracking-widest text-slate-400 font-display italic">
            By {activeWorkspace?.name || 'VakZim ICT&E'} 2026
          </div>
        </div>
      </div>

      {/* Screen flash transition overlay (6.5s onwards) */}
      <AnimatePresence>
        {showFlash && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="absolute inset-0 bg-white z-50 pointer-events-none"
          />
        )}
      </AnimatePresence>
    </div>
  );
};
