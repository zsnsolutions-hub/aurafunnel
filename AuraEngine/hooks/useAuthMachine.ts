/**
 * Auth state machine — deterministic auth flow with no timeouts.
 *
 * Phases:  idle → checking_session → checking_profile → checking_workspace → ready | error
 *
 * Every transition is an explicit Supabase response — no 2-second safety nets.
 * WORKSPACE_SKIPPED keeps this compatible even before workspace tables exist.
 */

import { useReducer, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchWorkspaceSnapshot } from '../lib/workspaceSnapshot';
import type { User } from '../types';

// ── Types ────────────────────────────────────────────────────

export type AuthPhase =
  | 'idle'
  | 'checking_session'
  | 'checking_profile'
  | 'checking_workspace'
  | 'ready'
  | 'error';

export interface AuthMachineState {
  phase: AuthPhase;
  user: User | null;
  error: string | null;
  /** Phase where the last failure occurred — RETRY resumes from here */
  failedPhase: AuthPhase | null;
}

type AuthAction =
  | { type: 'INIT' }
  | { type: 'SESSION_FOUND'; userId: string }
  | { type: 'SESSION_EMPTY' }
  | { type: 'PROFILE_LOADED'; user: User }
  | { type: 'PROFILE_FAILED'; error: string }
  | { type: 'WORKSPACE_LOADED' }
  | { type: 'WORKSPACE_SKIPPED' }
  | { type: 'WORKSPACE_FAILED'; error: string }
  | { type: 'RETRY' }
  | { type: 'LOGOUT' }
  | { type: 'EXTERNAL_USER_UPDATE'; user: User }
  | { type: 'TOKEN_REFRESHED'; userId: string };

const AUTH_CACHE_KEY = 'scaliyo_auth_cache';

/** Try to hydrate from sessionStorage for instant shell render on hard refresh. */
function getInitialState(): AuthMachineState {
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { user: User };
      if (cached.user?.id) {
        return { phase: 'ready', user: cached.user, error: null, failedPhase: null };
      }
    }
  } catch { /* corrupted cache — ignore */ }
  return { phase: 'idle', user: null, error: null, failedPhase: null };
}

/** Persist user to sessionStorage so next hard-refresh is instant. */
function cacheAuthState(user: User | null) {
  try {
    if (user) {
      sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ user }));
    } else {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch { /* quota exceeded — ignore */ }
}

// ── Reducer ──────────────────────────────────────────────────

function authReducer(state: AuthMachineState, action: AuthAction): AuthMachineState {
  switch (action.type) {
    case 'INIT':
      return { ...state, phase: 'checking_session', error: null, failedPhase: null };

    case 'SESSION_FOUND':
      return { ...state, phase: 'checking_profile' };

    case 'SESSION_EMPTY':
      return { ...state, phase: 'ready', user: null };

    case 'PROFILE_LOADED':
      return { ...state, phase: 'checking_workspace', user: action.user };

    case 'PROFILE_FAILED':
      return { ...state, phase: 'error', error: action.error, failedPhase: 'checking_profile' };

    case 'WORKSPACE_LOADED':
      return { ...state, phase: 'ready', error: null, failedPhase: null };

    case 'WORKSPACE_SKIPPED':
      // Workspace tables don't exist yet — skip gracefully
      return { ...state, phase: 'ready', error: null, failedPhase: null };

    case 'WORKSPACE_FAILED':
      return { ...state, phase: 'error', error: action.error, failedPhase: 'checking_workspace' };

    case 'RETRY':
      // Resume from the phase that failed
      if (state.failedPhase) {
        return { ...state, phase: state.failedPhase, error: null };
      }
      return { ...state, phase: 'checking_session', error: null, failedPhase: null };

    case 'LOGOUT':
      cacheAuthState(null);
      return { phase: 'ready', user: null, error: null, failedPhase: null };

    case 'EXTERNAL_USER_UPDATE':
      // If already ready (e.g. background refresh after hydration), stay ready
      if (state.phase === 'ready') {
        return { ...state, user: action.user };
      }
      // Otherwise (e.g. AuthPage's onLogin callback), proceed to workspace check
      return { ...state, phase: 'checking_workspace', user: action.user };

    case 'TOKEN_REFRESHED':
      // Session refreshed — if we already have the user, stay ready
      if (state.user && state.phase === 'ready') return state;
      return { ...state, phase: 'checking_profile' };

    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────

export function useAuthMachine() {
  const [state, dispatch] = useReducer(authReducer, undefined, getInitialState);
  const hydratedRef = useRef(state.phase === 'ready' && state.user !== null);
  const navigateRaw = useNavigate();
  const navigateRef = useRef(navigateRaw);
  navigateRef.current = navigateRaw;
  const loggingOutRef = useRef(false);
  const initCycleRef = useRef(0);
  const sessionUserIdRef = useRef<string | null>(null);

  // ── Fetch profile ──
  const fetchProfile = useCallback(async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, subscription:subscriptions(*)')
        .eq('id', userId)
        .maybeSingle();

      if (error) return null;
      if (data) {
        const subData = Array.isArray(data.subscription) ? data.subscription[0] : data.subscription;
        return { ...data, subscription: subData } as unknown as User;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // ── Fetch workspace snapshot ──
  const checkWorkspace = useCallback(async (userId: string) => {
    try {
      await fetchWorkspaceSnapshot(userId);
      dispatch({ type: 'WORKSPACE_LOADED' });
    } catch (err: unknown) {
      // 42P01 = relation does not exist — workspace tables not yet created
      const pgCode = (err as { code?: string })?.code;
      if (pgCode === '42P01') {
        dispatch({ type: 'WORKSPACE_SKIPPED' });
      } else {
        // Non-fatal: skip workspace check so the app still loads
        dispatch({ type: 'WORKSPACE_SKIPPED' });
      }
    }
  }, []);

  // ── Phase-driven side effects ──
  useEffect(() => {
    if (state.phase === 'checking_profile' && sessionUserIdRef.current) {
      const userId = sessionUserIdRef.current;
      fetchProfile(userId).then(user => {
        if (user) {
          dispatch({ type: 'PROFILE_LOADED', user });
        } else {
          dispatch({ type: 'PROFILE_FAILED', error: 'Failed to load profile. Please try again.' });
        }
      });
    }

    if (state.phase === 'checking_workspace' && state.user?.id) {
      checkWorkspace(state.user.id);
    }
  }, [state.phase, state.user?.id, fetchProfile, checkWorkspace]);

  // ── Init: check session + subscribe to auth changes ──
  useEffect(() => {
    const cycle = ++initCycleRef.current;

    const isHydrated = hydratedRef.current;

    // If not hydrated from cache, show loading phases as before
    if (!isHydrated) {
      dispatch({ type: 'INIT' });
    }

    const checkSession = async () => {
      if (cycle !== initCycleRef.current) return; // StrictMode guard

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cycle !== initCycleRef.current) return;

        if (session) {
          sessionUserIdRef.current = session.user.id;
          if (isHydrated) {
            // Silently refresh profile in background — shell already visible
            const profile = await fetchProfile(session.user.id);
            if (cycle !== initCycleRef.current) return;
            if (profile) {
              cacheAuthState(profile);
              dispatch({ type: 'EXTERNAL_USER_UPDATE', user: profile });
            }
            // If profile fetch fails, keep showing cached user — non-fatal
          } else {
            dispatch({ type: 'SESSION_FOUND', userId: session.user.id });
          }
        } else {
          sessionUserIdRef.current = null;
          cacheAuthState(null);
          dispatch({ type: 'SESSION_EMPTY' });
        }
      } catch {
        sessionUserIdRef.current = null;
        if (!isHydrated) {
          dispatch({ type: 'SESSION_EMPTY' });
        }
        // If hydrated and session check fails (network error), keep cached state
      }
    };

    checkSession();
    hydratedRef.current = false; // Only use hydration on first mount

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cycle !== initCycleRef.current) return;

      if (event === 'SIGNED_OUT' || loggingOutRef.current) {
        sessionUserIdRef.current = null;
        dispatch({ type: 'LOGOUT' });
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        navigateRef.current('/reset-password');
        return;
      }

      if (session) {
        sessionUserIdRef.current = session.user.id;
        if (event === 'TOKEN_REFRESHED') {
          dispatch({ type: 'TOKEN_REFRESHED', userId: session.user.id });
        } else {
          // SIGNED_IN or INITIAL_SESSION from auth listener
          const profile = await fetchProfile(session.user.id);
          if (profile && cycle === initCycleRef.current) {
            dispatch({ type: 'EXTERNAL_USER_UPDATE', user: profile });
          }
        }
      } else {
        sessionUserIdRef.current = null;
        dispatch({ type: 'SESSION_EMPTY' });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile, checkWorkspace]);

  // ── Cache auth state for instant hydration on hard refresh ──
  useEffect(() => {
    if (state.phase === 'ready') {
      cacheAuthState(state.user);
    } else if (state.phase === 'error') {
      cacheAuthState(null);
    }
  }, [state.phase, state.user]);

  // ── Public API ──

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
  }, []);

  const logout = useCallback(async () => {
    loggingOutRef.current = true;
    dispatch({ type: 'LOGOUT' });
    await supabase.auth.signOut({ scope: 'global' });
    loggingOutRef.current = false;
    navigateRef.current('/');
  }, []);

  const setUser = useCallback((user: User) => {
    dispatch({ type: 'EXTERNAL_USER_UPDATE', user });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (state.user?.id) {
      const profile = await fetchProfile(state.user.id);
      if (profile) {
        dispatch({ type: 'EXTERNAL_USER_UPDATE', user: profile });
      }
    }
  }, [state.user?.id, fetchProfile]);

  return {
    state,
    retry,
    logout,
    setUser,
    refreshProfile,
    isReady: state.phase === 'ready',
    isLoading: state.phase !== 'ready' && state.phase !== 'error',
    isAuthenticated: state.phase === 'ready' && state.user !== null,
  };
}
