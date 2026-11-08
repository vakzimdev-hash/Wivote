import './utils/safeStorage';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Automatically recover from stale asset hashes when new builds are deployed
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[WiVoTe] Vite asset preload error detected. Auto-refreshing to load new version...', event);
  const retried = sessionStorage.getItem('wivote_preload_retried');
  if (!retried) {
    sessionStorage.setItem('wivote_preload_retried', 'true');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
