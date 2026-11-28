import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

// Recover cleanly from stale hashed chunks right after a new deploy
const CHUNK_RELOAD_KEY = 'openhr_chunk_reload_at';
function triggerSafeChunkReload() {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
}

window.addEventListener('vite:preloadError', () => {
  triggerSafeChunkReload();
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = String((event.reason as any)?.message || event.reason || '');
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    triggerSafeChunkReload();
  }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}
