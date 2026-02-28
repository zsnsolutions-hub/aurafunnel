import React, { useState, useCallback, Suspense, lazy } from 'react';

const VoiceAgent = lazy(() => import('./VoiceAgent'));

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;

/**
 * Lightweight shell that shows the mic FAB without loading @elevenlabs/react.
 * On first click it lazy-loads the full VoiceAgent component (and the SDK).
 */
const VoiceAgentLauncher: React.FC = () => {
  const [activated, setActivated] = useState(false);

  const handleActivate = useCallback(() => {
    setActivated(true);
  }, []);

  if (!AGENT_ID) return null;

  // Once activated, render the full VoiceAgent (which imports @elevenlabs/react)
  if (activated) {
    return (
      <Suspense fallback={
        <button
          className="fixed bottom-6 right-6 z-[60] flex items-center justify-center w-14 h-14 rounded-full bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] cursor-wait"
          aria-label="Loading voice agent..."
          disabled
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </button>
      }>
        <VoiceAgent />
      </Suspense>
    );
  }

  // Lightweight FAB — no @elevenlabs/react loaded
  return (
    <button
      onClick={handleActivate}
      className="fixed bottom-6 right-6 z-[60] flex items-center justify-center w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-400"
      aria-label="Talk to Scaliyo assistant"
      title="Talk to Scaliyo assistant"
    >
      {/* Mic icon — inline SVG */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    </button>
  );
};

export default VoiceAgentLauncher;
