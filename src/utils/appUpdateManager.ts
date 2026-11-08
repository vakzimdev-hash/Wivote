/**
 * WiVoTe Automatic System Update Manager
 * Monitors server version & build hashes, dispatches system update notifications,
 * and coordinates the on-screen updating modal sequence.
 */

export interface AppVersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
  bootTime?: string;
  serverTime?: string;
  environment?: string;
}

const STORAGE_ACTIVE_BUILD_KEY = 'wivote_active_build_id';
const STORAGE_PREV_BUILD_KEY = 'wivote_prev_build_id';

let isUpdatingActive = false;
let updateWatcherTimer: ReturnType<typeof setInterval> | null = null;
let currentAppBuildId: string = (() => {
  try {
    return sessionStorage.getItem(STORAGE_ACTIVE_BUILD_KEY) || '';
  } catch {
    return '';
  }
})();

// Web Audio API synthesizer for the futuristic update chime
export const playUpdateChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // Upward futuristic 3-note progression (E5 -> G#5 -> B5)
    playTone(659.25, now, 0.28);
    playTone(830.61, now + 0.12, 0.32);
    playTone(987.77, now + 0.26, 0.55);

    // Subtle vibration on mobile terminals
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 60, 180]);
    }
  } catch (err) {
    console.warn('[WiVoTe Update] Audio chime notice suppressed:', err);
  }
};

/**
 * Dispatches an OS-level browser notification if supported and allowed.
 */
export const dispatchSystemPushNotification = (version: string) => {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('WiVoTe Terminal Update', {
          body: `New system version (${version}) detected from server. Updating terminal...`,
          icon: '/wivote_logo.png',
          badge: '/wivote_logo.png',
          tag: 'wivote-app-update',
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[WiVoTe Update] Browser notification failed:', e);
  }
};

/**
 * Fetch current version and buildId from the server.
 */
export const fetchServerVersion = async (): Promise<AppVersionInfo | null> => {
  try {
    const res = await fetch(`/api/version?_t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      }
    });
    if (!res.ok) return null;
    const data: AppVersionInfo = await res.json();
    return data;
  } catch (err) {
    return null;
  }
};

/**
 * Kicks in the update sequence immediately.
 */
export const triggerAppUpdateKickIn = (newInfo: AppVersionInfo, isSimulated = false) => {
  if (isUpdatingActive) return;
  isUpdatingActive = true;

  console.log(`[WiVoTe Update] ⚡ Updating kicked in! Detected version ${newInfo.version} (${newInfo.buildId})`);

  // Play audio chime and trigger notifications
  playUpdateChime();
  dispatchSystemPushNotification(newInfo.version);

  // Store update details for the modal to display
  try {
    sessionStorage.setItem(STORAGE_PREV_BUILD_KEY, currentAppBuildId || 'v1.0.0');
    sessionStorage.setItem(STORAGE_ACTIVE_BUILD_KEY, newInfo.buildId);
  } catch {}

  // Broadcast event across components so AppUpdateModal and Toasts kick in immediately
  window.dispatchEvent(new CustomEvent('wivote:system-update-detected', {
    detail: {
      version: newInfo.version,
      buildId: newInfo.buildId,
      buildTime: newInfo.buildTime,
      isSimulated
    }
  }));
};

/**
 * Checks for updates immediately against the server.
 */
export const checkServerUpdateNow = async (forceSimulate = false): Promise<{ hasUpdate: boolean; serverInfo?: AppVersionInfo }> => {
  const serverInfo = await fetchServerVersion();
  if (!serverInfo) {
    return { hasUpdate: false };
  }

  if (forceSimulate) {
    const simulatedInfo: AppVersionInfo = {
      ...serverInfo,
      buildId: `wivote_sim_${Date.now().toString(36)}`,
      buildTime: new Date().toISOString()
    };
    triggerAppUpdateKickIn(simulatedInfo, true);
    return { hasUpdate: true, serverInfo: simulatedInfo };
  }

  // First run: save current build ID in session storage
  if (!currentAppBuildId) {
    currentAppBuildId = serverInfo.buildId;
    try {
      sessionStorage.setItem(STORAGE_ACTIVE_BUILD_KEY, serverInfo.buildId);
    } catch {}
    return { hasUpdate: false, serverInfo };
  }

  // Comparison: new build detected on the server!
  if (serverInfo.buildId !== currentAppBuildId) {
    triggerAppUpdateKickIn(serverInfo, false);
    return { hasUpdate: true, serverInfo };
  }

  return { hasUpdate: false, serverInfo };
};

/**
 * Initializes the background update watcher.
 * Polls the server periodically and hooks into system visibility/focus events.
 */
export const initAppUpdateWatcher = () => {
  if (typeof window === 'undefined') return;

  // Initialize initial version
  fetchServerVersion().then((info) => {
    if (info) {
      if (!currentAppBuildId) {
        currentAppBuildId = info.buildId;
        try {
          sessionStorage.setItem(STORAGE_ACTIVE_BUILD_KEY, info.buildId);
        } catch {}
      } else if (currentAppBuildId !== info.buildId) {
        // Build mismatch already present on mount
        triggerAppUpdateKickIn(info, false);
      }
    }
  }).catch(() => {});

  // Periodic poll every 20 seconds
  if (updateWatcherTimer) clearInterval(updateWatcherTimer);
  updateWatcherTimer = setInterval(() => {
    if (!isUpdatingActive) {
      checkServerUpdateNow().catch(() => {});
    }
  }, 20000);

  // Check when window regains focus or visibility
  const handleCheckOnFocus = () => {
    if (document.visibilityState === 'visible' && !isUpdatingActive) {
      checkServerUpdateNow().catch(() => {});
    }
  };

  window.addEventListener('focus', handleCheckOnFocus);
  document.addEventListener('visibilitychange', handleCheckOnFocus);
  window.addEventListener('online', handleCheckOnFocus);

  // Hook into Vite preload errors (which occur when new chunk hashes are deployed)
  window.addEventListener('vite:preloadError', () => {
    console.warn('[WiVoTe Update] Vite preload error: new server build detected. Kicking in update...');
    checkServerUpdateNow(true).catch(() => {});
  });

  // Listen for manual trigger events from settings or debug panels
  window.addEventListener('wivote:trigger-simulate-update', () => {
    checkServerUpdateNow(true).catch(() => {});
  });
};

/**
 * Performs cache cleanup and safely reloads to the latest build.
 */
export const executeReloadToLatestVersion = async () => {
  try {
    // Clear browser CacheStorage if registered
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {}

  // Bust cache by reloading with unique timestamp query
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString());
  window.location.href = url.toString();
};
