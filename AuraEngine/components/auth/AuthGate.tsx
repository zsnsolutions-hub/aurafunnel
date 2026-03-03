/**
 * AuthGate — wraps the route tree and shows phase-specific UI
 * until the auth state machine reaches 'ready'.
 *
 * - Shows contextual loading messages per phase
 * - Shows error screen with retry on failure
 * - Renders children only when phase === 'ready'
 */

import React from 'react';
import type { AuthPhase } from '../../hooks/useAuthMachine';

interface AuthGateProps {
  phase: AuthPhase;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}

const PHASE_MESSAGES: Record<string, string> = {
  idle: 'Initializing...',
  checking_session: 'Checking session...',
  checking_profile: 'Loading your profile...',
  checking_workspace: 'Loading workspace...',
};

export const AuthGate: React.FC<AuthGateProps> = ({ phase, error, onRetry, children }) => {
  // Ready — render the app
  if (phase === 'ready') {
    return <>{children}</>;
  }

  // Error — show retry screen
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-sm px-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Something went wrong</h2>
          <p className="text-sm text-slate-500 mb-6">{error || 'An unexpected error occurred.'}</p>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Loading — phase-specific spinner
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500 animate-pulse">
          {PHASE_MESSAGES[phase] || 'Loading...'}
        </p>
      </div>
    </div>
  );
};
