import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { initSentry } from './lib/sentry';
import { initVersionGuard } from './lib/versionCheck';
import { ToastProvider } from './components/ui/Toast';
import App from './App';
import './index.css';

initSentry();
// Cache-proofing: self-recover if this build is stale vs. the server.
initVersionGuard();

// Build stamp — survives esbuild console.* stripping
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;
if (typeof __BUILD_SHA__ !== 'undefined') {
  (window as any).__SCALIYO_BUILD__ = { sha: __BUILD_SHA__, time: __BUILD_TIME__ };
}
// Also set a meta tag so it's visible in page source
try {
  const meta = document.createElement('meta');
  meta.name = 'scaliyo-build';
  meta.content = `${__BUILD_SHA__} @ ${__BUILD_TIME__}`;
  document.head.appendChild(meta);
} catch { /* SSR guard */ }

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
