import React from 'react';

/**
 * Wraps dynamic React.lazy imports with automated recovery against stale chunk cache mismatches.
 * 
 * When a new build is deployed to the server, Vite generates new hashed bundle filenames (e.g. AgentDashboard-[newhash].js).
 * If a client has an existing tab or stale HTML cached, requesting the previous hash (e.g. AgentDashboard-[oldhash].js)
 * results in HTTP 404 and the browser error: "Failed to fetch dynamically imported module".
 * 
 * This utility catches the chunk mismatch, sets a one-time session flag to avoid infinite loops,
 * and seamlessly refreshes the page to load the newest assets.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T } | any>,
  moduleKey: string
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const retryKey = `wivote_retry_${moduleKey}`;
    const pageHasBeenRetried = sessionStorage.getItem(retryKey);

    try {
      const module = await componentImport();
      // On successful import, clear the retry flag
      sessionStorage.removeItem(retryKey);
      return module.default ? module : { default: module };
    } catch (error: any) {
      console.warn(`[WiVoTe] Dynamic import for "${moduleKey}" failed. Checking recovery status...`, error);

      const errorMessage = String(error?.message || '').toLowerCase();
      const isChunkError =
        errorMessage.includes('failed to fetch dynamically imported module') ||
        errorMessage.includes('loading chunk') ||
        errorMessage.includes('importing a module script failed') ||
        errorMessage.includes('dynamically imported module') ||
        error?.name === 'ChunkLoadError';

      if (isChunkError && !pageHasBeenRetried) {
        sessionStorage.setItem(retryKey, String(Date.now()));
        console.info(`[WiVoTe] Automatically reloading to fetch latest bundle for: ${moduleKey}`);
        window.location.reload();
        // Return an unresolved promise to prevent rendering during reload
        return new Promise<{ default: T }>(() => {});
      }

      // If already retried or not a chunk error, rethrow to be safely caught by ErrorBoundary
      throw error;
    }
  });
}
