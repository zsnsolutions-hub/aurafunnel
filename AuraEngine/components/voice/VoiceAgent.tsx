import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { useConversation } from '@elevenlabs/react';
import type { Status } from '@elevenlabs/react';
import { useUIMode } from '../ui-mode/UIModeProvider';
import { track } from '../../lib/analytics';
import { getPageTitle } from '../../lib/navConfig';
import {
  isValidRouteKey,
  resolveRoute,
  canNavigate,
  VOICE_ROUTE_LABELS,
} from '../../lib/voiceActions';
import VoiceToast from './VoiceToast';
import type { User } from '../../types';

interface VoiceAgentProps {
  user: User;
}

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;

const VoiceAgent: React.FC<VoiceAgentProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, isSimplified, toggle } = useUIMode();

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ label: string; path: string } | null>(null);

  // Keep a ref to latest location so client tool handlers see fresh values
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const isSimplifiedRef = useRef(isSimplified);
  useEffect(() => {
    isSimplifiedRef.current = isSimplified;
  }, [isSimplified]);

  const conversation = useConversation({
    clientTools: {
      navigate: async (params: { route_key: string }) => {
        const { route_key } = params;
        if (!isValidRouteKey(route_key)) {
          return 'Unknown page. Please try again.';
        }
        if (!canNavigate()) {
          return 'Please wait a moment before navigating again.';
        }
        const path = resolveRoute(route_key)!;
        const label = VOICE_ROUTE_LABELS[route_key] ?? route_key;

        // Show toast and navigate
        setToast({ label, path });
        navigate(path);
        track('nav_executed', { routeKey: route_key });
        return `Navigated to ${label}.`;
      },

      toggle_ui_mode: async () => {
        const wasSimplified = isSimplifiedRef.current;
        toggle();
        const newMode = wasSimplified ? 'advanced' : 'simplified';
        track('simplified_toggled', { newMode });
        return `Switched to ${newMode} mode.`;
      },

      open_command_palette: async () => {
        window.dispatchEvent(new CustomEvent('scaliyo:openCommandPalette'));
        return 'Command palette opened.';
      },

      get_page_context: async () => {
        return JSON.stringify({
          currentRoute: locationRef.current.pathname,
          currentSearch: locationRef.current.search,
          uiMode: modeRef.current,
          pageTitle: getPageTitle(locationRef.current.pathname) || document.title,
          isAuthenticated: true,
          userName: user.name || 'User',
        });
      },
    },

    onConnect: () => {
      setError(null);
      track('voice_opened');
      // Send initial context
      const ctx = JSON.stringify({
        currentRoute: locationRef.current.pathname,
        uiMode: modeRef.current,
        pageTitle: getPageTitle(locationRef.current.pathname) || document.title,
        userName: user.name || 'User',
      });
      conversation.sendContextualUpdate(ctx);
    },

    onDisconnect: () => {
      track('voice_closed');
      setToast(null);
    },

    onError: (message) => {
      const errStr = typeof message === 'string' ? message : 'Connection error';
      setError(errStr);
      track('voice_error', { message: errStr });
    },
  });

  const { status, isSpeaking } = conversation;

  // Send contextual update when route changes (only while connected)
  useEffect(() => {
    if (status !== 'connected') return;
    const ctx = JSON.stringify({
      currentRoute: location.pathname,
      currentSearch: location.search,
      uiMode: mode,
      pageTitle: getPageTitle(location.pathname) || document.title,
    });
    conversation.sendContextualUpdate(ctx);
  }, [location.pathname, location.search, status, mode]);

  // Auto-dismiss toast after navigation completes
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleToggle = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') {
      await conversation.endSession();
      return;
    }

    if (!AGENT_ID) {
      setError('Voice agent not configured');
      return;
    }

    setError(null);

    try {
      // Request mic permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access denied');
      track('mic_permission_denied');
      return;
    }

    try {
      await conversation.startSession({
        agentId: AGENT_ID,
        connectionType: 'webrtc',
      } as Parameters<typeof conversation.startSession>[0]);
    } catch (err) {
      setError('Failed to connect');
      track('voice_error', { message: 'session_start_failed' });
    }
  }, [status, conversation]);

  const handleToastConfirm = useCallback(() => {
    // Navigation already happened; just dismiss
    setToast(null);
  }, []);

  const handleToastCancel = useCallback(() => {
    setToast(null);
  }, []);

  // Don't render if no agent ID configured
  if (!AGENT_ID) return null;

  return (
    <>
      {/* Navigation toast */}
      {toast && (
        <VoiceToast
          label={toast.label}
          onConfirm={handleToastConfirm}
          onCancel={handleToastCancel}
        />
      )}

      {/* FAB */}
      <button
        onClick={handleToggle}
        className={`
          fixed bottom-6 right-6 z-[60]
          flex items-center justify-center
          w-14 h-14 rounded-full
          shadow-lg transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2
          ${fabStyles(status, isSpeaking, error)}
        `}
        aria-label={status === 'connected' ? 'End voice session' : 'Start voice session'}
        title={
          error
            ? error
            : status === 'connected'
              ? 'Click to end voice session'
              : status === 'connecting'
                ? 'Connecting...'
                : 'Talk to Scaliyo assistant'
        }
      >
        {fabIcon(status, isSpeaking, error)}

        {/* Pulsing ring when connected and listening */}
        {status === 'connected' && !isSpeaking && (
          <span className="absolute inset-0 rounded-full animate-ping bg-green-400 opacity-20" />
        )}
      </button>

      {/* Error indicator */}
      {error && status === 'disconnected' && (
        <div className="fixed bottom-[5.5rem] right-6 z-[60] text-xs text-red-500 bg-white border border-red-200 rounded-lg px-3 py-1.5 shadow-sm max-w-[200px] text-center">
          {error}
        </div>
      )}
    </>
  );
};

function fabStyles(status: Status, isSpeaking: boolean, error: string | null): string {
  if (error && status === 'disconnected') {
    return 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-400';
  }
  switch (status) {
    case 'connecting':
    case 'disconnecting':
      return 'bg-indigo-500 text-white cursor-wait focus:ring-indigo-400';
    case 'connected':
      return isSpeaking
        ? 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-400'
        : 'bg-green-500 hover:bg-green-600 text-white focus:ring-green-400';
    default:
      return 'bg-gray-800 hover:bg-gray-900 text-white focus:ring-gray-500';
  }
}

function fabIcon(status: Status, isSpeaking: boolean, error: string | null): React.ReactNode {
  if (error && status === 'disconnected') {
    return <MicOff size={22} />;
  }
  switch (status) {
    case 'connecting':
    case 'disconnecting':
      return <Loader2 size={22} className="animate-spin" />;
    case 'connected':
      return isSpeaking ? <Volume2 size={22} /> : <Mic size={22} />;
    default:
      return <Mic size={22} />;
  }
}

export default VoiceAgent;
