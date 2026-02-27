import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { UIMode } from '../../types';
import { supabase } from '../../lib/supabase';

const STORAGE_KEY = 'scaliyo_ui_mode';
const DEFAULT_MODE: UIMode = 'simplified';

interface UIModeContextValue {
  mode: UIMode;
  isSimplified: boolean;
  isAdvanced: boolean;
  toggle: () => void;
  setMode: (mode: UIMode) => void;
}

const UIModeContext = createContext<UIModeContextValue | null>(null);

function isValidMode(v: unknown): v is UIMode {
  return v === 'simplified' || v === 'advanced';
}

function readStoredMode(): UIMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidMode(stored)) return stored;
  } catch {
    // localStorage unavailable — fall through
  }
  return DEFAULT_MODE;
}

function writeStoredMode(mode: UIMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable — ignore
  }
}

async function writeSupabaseMode(userId: string, mode: UIMode) {
  try {
    await supabase
      .from('profiles')
      .update({ ui_preferences: { ui_mode: mode } })
      .eq('id', userId);
  } catch {
    // Non-critical — localStorage is the fallback
  }
}

interface UIModeProviderProps {
  userId?: string;
  children: React.ReactNode;
}

export const UIModeProvider: React.FC<UIModeProviderProps> = ({ userId, children }) => {
  const [mode, setModeState] = useState<UIMode>(readStoredMode);
  const syncedRef = useRef(false);

  // Sync from Supabase when user logs in
  useEffect(() => {
    if (!userId) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('ui_preferences')
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;
        const serverMode = data?.ui_preferences?.ui_mode;
        if (isValidMode(serverMode)) {
          setModeState(serverMode);
          writeStoredMode(serverMode);
        } else {
          // First login or column empty — seed server with current localStorage value
          writeSupabaseMode(userId, readStoredMode());
        }
        syncedRef.current = true;
      } catch {
        // Supabase unavailable — continue with localStorage
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const setMode = useCallback((next: UIMode) => {
    setModeState(next);
    writeStoredMode(next);
    if (userId) writeSupabaseMode(userId, next);
  }, [userId]);

  const toggle = useCallback(() => {
    setMode(mode === 'simplified' ? 'advanced' : 'simplified');
  }, [mode, setMode]);

  // Cross-tab sync
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isValidMode(e.newValue)) {
        setModeState(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <UIModeContext.Provider value={{ mode, isSimplified: mode === 'simplified', isAdvanced: mode === 'advanced', toggle, setMode }}>
      {children}
    </UIModeContext.Provider>
  );
};

export function useUIMode(): UIModeContextValue {
  const ctx = useContext(UIModeContext);
  if (!ctx) throw new Error('useUIMode must be used within a UIModeProvider');
  return ctx;
}
