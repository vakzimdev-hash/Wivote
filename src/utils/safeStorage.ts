/**
 * Safe LocalStorage Utility with automatic quota eviction & in-memory fallback.
 * Prevents DOMException: QuotaExceededError ('Failed to execute setItem on Storage')
 * and intercepts internal browser storage failures before they crash Firestore/React.
 * 
 * RELIES ON FIREBASE GLOBAL DB FOR PERSISTENCE TO PREVENT BROWSER FREEZING AND OOM CRASHES.
 */

const memoryFallbackStore = new Map<string, string>();
let isCleaningUp = false;

export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    (typeof e.message === 'string' &&
      (e.message.toLowerCase().includes('quota') ||
        e.message.toLowerCase().includes('exceeded the quota') ||
        e.message.toLowerCase().includes('storage') ||
        e.message.includes('b815')))
  );
}

/**
 * Proactively or reactively purges bulky non-essential localStorage caches
 * to guarantee vital operational data always fits without browser crashes.
 */
export function cleanupStorageForSpace(): boolean {
  if (typeof window === 'undefined' || !window.localStorage || isCleaningUp) return false;
  isCleaningUp = true;
  let spaceRecovered = false;

  try {
    const originalRemove = Storage.prototype.removeItem;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('firestore') ||
          k.startsWith('__sak') ||
          k.startsWith('wivote_vouchers') ||
          k.startsWith('wivote_ws_vouchers') ||
          k.startsWith('wivote_customers') ||
          k.startsWith('wivote_ws_customers') ||
          k.startsWith('wivote_legacy') ||
          k.startsWith('wivote_ws_legacy') ||
          k.startsWith('wivote_cash_drops') ||
          k.startsWith('wivote_ws_cash_drops') ||
          k.startsWith('wivote_requests') ||
          k.startsWith('wivote_audit_logs') ||
          k.startsWith('wivote_full_database') ||
          k.startsWith('wivote_entire_app') ||
          k.startsWith('wivote_workspace_backups') ||
          k.startsWith('wivote_account_backups'))
      ) {
        keysToRemove.push(k);
      }
    }

    keysToRemove.forEach((k) => {
      try {
        originalRemove.call(localStorage, k);
        spaceRecovered = true;
      } catch {}
    });
  } catch (cleanErr) {
    console.warn('[SafeStorage] Storage cleanup warning:', cleanErr);
  } finally {
    isCleaningUp = false;
  }

  return spaceRecovered;
}

/**
 * Installs a global proxy interceptor around window.localStorage.setItem.
 * Guarantees that any write to localStorage never throws an uncaught QuotaExceededError or loops infinitely.
 */
export function installStorageQuotaInterceptor(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const storageProto = Object.getPrototypeOf(window.localStorage) || Storage.prototype;
  if ((storageProto as any).__wivote_intercepted) return;

  const originalSetItem = storageProto.setItem;
  storageProto.setItem = function (this: Storage, key: string, value: string) {
    try {
      originalSetItem.call(this, key, value);
    } catch (err: unknown) {
      memoryFallbackStore.set(key, String(value));
      if (isQuotaExceededError(err) && !isCleaningUp) {
        console.warn(`[SafeStorage Proxy] Intercepted QuotaExceededError on key "${key}". Storing in memory fallback.`);
        cleanupStorageForSpace();
      }
    }
  };

  (storageProto as any).__wivote_intercepted = true;
  console.log('[SafeStorage] Storage Quota Interceptor successfully initialized.');
}

// Proactively install interceptor and clean storage immediately
if (typeof window !== 'undefined') {
  try {
    installStorageQuotaInterceptor();
    cleanupStorageForSpace();
  } catch (e) {
    console.warn('[SafeStorage] Initialization error:', e);
  }
}

/**
 * Safely writes a value to memory store / localStorage with QuotaExceeded handling.
 */
export function safeSetItem(key: string, value: string): boolean {
  memoryFallbackStore.set(key, value);

  // Skip bulky JSON string writes to physical localStorage to prevent UI freezing & OOM tab crashes
  if (
    key === 'wivote_vouchers' ||
    key.startsWith('wivote_ws_vouchers') ||
    key.startsWith('wivote_customers') ||
    key.startsWith('wivote_ws_customers') ||
    key.startsWith('wivote_legacy') ||
    key.startsWith('wivote_ws_legacy') ||
    key.startsWith('wivote_cash_drops') ||
    key.startsWith('wivote_ws_cash_drops') ||
    key.startsWith('wivote_requests') ||
    key.startsWith('wivote_audit_logs') ||
    key.startsWith('wivote_full_database') ||
    key.startsWith('wivote_entire_app') ||
    key.startsWith('wivote_workspace_backups')
  ) {
    return true;
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  try {
    Storage.prototype.setItem.call(window.localStorage, key, value);
    return true;
  } catch (err: unknown) {
    if (isQuotaExceededError(err) && !isCleaningUp) {
      cleanupStorageForSpace();
    }
    return false;
  }
}

/**
 * Safely reads a value from memory store fallback or localStorage.
 */
export function safeGetItem(key: string): string | null {
  if (memoryFallbackStore.has(key)) {
    return memoryFallbackStore.get(key) ?? null;
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    return Storage.prototype.getItem.call(window.localStorage, key);
  } catch (err) {
    return null;
  }
}

/**
 * Safely removes a key from both localStorage and memory fallback.
 */
export function safeRemoveItem(key: string): void {
  memoryFallbackStore.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      Storage.prototype.removeItem.call(window.localStorage, key);
    }
  } catch (err) {}
}

/**
 * Intelligent helper for caching vouchers in memory fallback store.
 */
export function saveVouchersCache(vouchers: any[], key = 'wivote_vouchers'): void {
  if (!Array.isArray(vouchers)) return;
  memoryFallbackStore.set(key, JSON.stringify(vouchers.slice(0, 50)));
}

/**
 * Robust JSON parser with fallback.
 */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T, maxChars = 500_000): T {
  if (!value || typeof value !== 'string') return fallback;
  if (value.length > maxChars) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}
