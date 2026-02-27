import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { useConversation } from '@elevenlabs/react';
import type { Status } from '@elevenlabs/react';
import { useUIMode } from '../ui-mode/UIModeProvider';
import { track } from '../../lib/analytics';
import { getPageTitle } from '../../lib/navConfig';
import {
  isValidMarketingRouteKey,
  resolveMarketingRoute,
  isValidSectionKey,
  resolveSectionAnchor,
  canNavigate,
  MARKETING_ROUTE_LABELS,
  SECTION_LABELS,
} from '../../lib/voiceActions';
import VoiceToast from './VoiceToast';
import type { User } from '../../types';

interface VoiceAgentProps {
  user?: User | null;
}

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;

const VoiceAgent: React.FC<VoiceAgentProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useUIMode();

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ label: string; path: string } | null>(null);

  // Keep refs so client tool handlers see fresh values
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const conversation = useConversation({
    clientTools: {
      navigate: async (params: { route_key: string }) => {
        const { route_key } = params;
        if (!isValidMarketingRouteKey(route_key)) {
          return 'Unknown page. Available pages: home, features, pricing, blog, about, contact, signup, login.';
        }
        if (!canNavigate()) {
          return 'Please wait a moment before navigating again.';
        }
        const path = resolveMarketingRoute(route_key)!;
        const label = MARKETING_ROUTE_LABELS[route_key] ?? route_key;

        setToast({ label, path });
        navigate(path);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        track('nav_executed', { routeKey: route_key });
        return `Navigated to ${label}.`;
      },

      scroll_to_section: async (params: { section_key: string }) => {
        const { section_key } = params;
        if (!isValidSectionKey(section_key)) {
          return 'Unknown section. Available sections: hero, logos, problem, features_section, how_it_works, testimonials, pricing_section, faq, cta.';
        }
        if (!canNavigate()) {
          return 'Please wait a moment.';
        }
        const anchorId = resolveSectionAnchor(section_key)!;
        const label = SECTION_LABELS[section_key] ?? section_key;

        // If not on home page, navigate there first
        if (locationRef.current.pathname !== '/') {
          navigate('/');
          // Wait for route change and DOM update
          await new Promise((r) => setTimeout(r, 400));
        }

        const el = document.getElementById(anchorId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setToast({ label, path: `/#${anchorId}` });
          track('nav_executed', { routeKey: `section:${section_key}` });
          return `Scrolled to ${label} section.`;
        }
        return `Could not find the ${label} section on this page.`;
      },

      get_page_context: async () => {
        return JSON.stringify({
          currentRoute: locationRef.current.pathname,
          currentHash: locationRef.current.hash,
          pageTitle: getPageTitle(locationRef.current.pathname) || document.title,
          uiMode: modeRef.current,
          isAuthenticated: !!user,
          userName: user?.name || 'Visitor',
        });
      },
    },

    onConnect: () => {
      setError(null);
      track('voice_opened');
      const ctx = JSON.stringify({
        currentRoute: locationRef.current.pathname,
        pageTitle: getPageTitle(locationRef.current.pathname) || document.title,
        userName: user?.name || 'Visitor',
      });
      conversation.sendContextualUpdate(ctx);
    },

    onDisconnect: () => {
      track('voice_closed');
      setToast(null);
    },

    onError: (message, context) => {
      console.error('[VoiceAgent] onError:', message, context);
      const errStr = typeof message === 'string' ? message : String(message || 'Connection error');
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
      currentHash: location.hash,
      pageTitle: getPageTitle(location.pathname) || document.title,
    });
    conversation.sendContextualUpdate(ctx);
  }, [location.pathname, location.hash, status]);

  // Auto-dismiss toast
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
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access denied');
      track('mic_permission_denied');
      return;
    }

    try {
      await conversation.startSession({
        agentId: AGENT_ID,
        connectionType: 'websocket',
      } as Parameters<typeof conversation.startSession>[0]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[VoiceAgent] startSession failed:', err);
      setError(msg || 'Failed to connect');
      track('voice_error', { message: msg || 'session_start_failed' });
    }
  }, [status, conversation]);

  const handleToastConfirm = useCallback(() => setToast(null), []);
  const handleToastCancel = useCallback(() => setToast(null), []);

  if (!AGENT_ID) return null;

  return (
    <>
      {toast && (
        <VoiceToast
          label={toast.label}
          onConfirm={handleToastConfirm}
          onCancel={handleToastCancel}
        />
      )}

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
        {status === 'connected' && !isSpeaking && (
          <span className="absolute inset-0 rounded-full animate-ping bg-green-400 opacity-20" />
        )}
      </button>

      {error && status === 'disconnected' && (
        <div className="fixed bottom-[5.5rem] right-6 z-[60] text-xs text-red-500 bg-white border border-red-200 rounded-lg px-3 py-1.5 shadow-sm max-w-[320px] text-center break-words">
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
