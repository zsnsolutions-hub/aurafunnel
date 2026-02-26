import React, { useState, useEffect } from 'react';
import { useSupport } from './SupportProvider';

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs > 0) return `${hrs}h ${rem}m`;
  return `${mins}m`;
}

export const SupportBanner: React.FC = () => {
  const { activeSession, viewingAsUser, isImpersonating, endSession, stopImpersonation } = useSupport();
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!activeSession) return;
    const tick = () => setTimeLeft(formatTimeLeft(activeSession.expires_at));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [activeSession]);

  if (!activeSession) return null;

  return (
    <>
      {/* Amber session banner */}
      <div className="fixed top-0 left-0 right-0 z-[9990] bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-4 py-1.5 px-4 shadow-lg">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Support Mode Active
        </span>
        {viewingAsUser && (
          <span className="opacity-90">
            — Workspace: {viewingAsUser.email}
          </span>
        )}
        <span className="opacity-75">— Expires in {timeLeft}</span>
        <button
          onClick={endSession}
          className="ml-2 px-3 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs font-bold transition-colors"
        >
          End Session
        </button>
      </div>

      {/* Red impersonation banner */}
      {isImpersonating && viewingAsUser && (
        <div className="fixed top-[30px] left-0 right-0 z-[9989] bg-red-600 text-white text-xs font-bold flex items-center justify-center gap-4 py-1.5 px-4 shadow-lg">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 bg-white rounded-full" />
            Impersonating: {viewingAsUser.name || 'Unknown'} ({viewingAsUser.email})
          </span>
          <span className="opacity-75">— Read-Only</span>
          <button
            onClick={stopImpersonation}
            className="ml-2 px-3 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs font-bold transition-colors"
          >
            Stop
          </button>
        </div>
      )}
    </>
  );
};
