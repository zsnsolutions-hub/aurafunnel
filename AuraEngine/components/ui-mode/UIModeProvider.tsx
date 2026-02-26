import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { UIMode } from '../../types';

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

function readStoredMode(): UIMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'simplified' || stored === 'advanced') return stored;
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

export const UIModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<UIMode>(readStoredMode);

  const setMode = useCallback((next: UIMode) => {
    setModeState(next);
    writeStoredMode(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'simplified' ? 'advanced' : 'simplified');
  }, [mode, setMode]);

  // Cross-tab sync
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'simplified' || e.newValue === 'advanced')) {
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
