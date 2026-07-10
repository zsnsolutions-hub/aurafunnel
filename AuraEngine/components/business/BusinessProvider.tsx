// AuraEngine/components/business/BusinessProvider.tsx
//
// Global "current business" context for the portal (Growth Platform v2, Phase A).
// Loads the user's businesses (RLS-scoped), tracks the selected one (persisted
// per user), and resolves the `multi_business` feature flag so the switcher can
// stay dark until we flip it on. Wrapped around ClientLayout so both the sidebar
// switcher and every portal page (via Outlet) can call useCurrentBusiness().

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Business, listBusinesses, getOrCreateDefaultBusinessId } from '../../lib/businesses';
import { resolveWorkspaceForUser } from '../../lib/memory';
import { isFlagEnabled } from '../../lib/goals';

export interface BusinessContextValue {
  businesses: Business[];
  currentBusinessId: string | null;
  currentBusiness: Business | null;
  loading: boolean;
  /** True only when the `multi_business` workspace flag is enabled. */
  multiBusinessEnabled: boolean;
  setCurrentBusiness: (id: string) => void;
  refresh: () => Promise<void>;
}

const FALLBACK: BusinessContextValue = {
  businesses: [], currentBusinessId: null, currentBusiness: null,
  loading: false, multiBusinessEnabled: false,
  setCurrentBusiness: () => {}, refresh: async () => {},
};

const BusinessContext = createContext<BusinessContextValue | null>(null);

/** Safe even when called outside the provider (returns an inert fallback). */
export function useCurrentBusiness(): BusinessContextValue {
  return useContext(BusinessContext) ?? FALLBACK;
}

const storageKey = (userId: string) => `scaliyo:currentBusiness:${userId}`;

export const BusinessProvider: React.FC<{ userId: string; children: React.ReactNode }> = ({ userId, children }) => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [multiBusinessEnabled, setMultiBusinessEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let list = await listBusinesses();
    if (list.length === 0) {
      // Self-heal for any account without a business (e.g. brand-new signups).
      await getOrCreateDefaultBusinessId();
      list = await listBusinesses();
    }
    setBusinesses(list);

    const stored = localStorage.getItem(storageKey(userId));
    const next = stored && list.some(b => b.id === stored) ? stored : (list[0]?.id ?? null);
    setCurrentBusinessId(next);
    if (next) localStorage.setItem(storageKey(userId), next);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // Resolve the multi_business flag (dark by default) — non-blocking.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceForUser(userId);
        if (!ws || cancelled) return;
        const on = await isFlagEnabled(ws, 'multi_business');
        if (!cancelled) setMultiBusinessEnabled(on);
      } catch { /* flag stays off */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const setCurrentBusiness = useCallback((id: string) => {
    setCurrentBusinessId(id);
    localStorage.setItem(storageKey(userId), id);
  }, [userId]);

  const value = useMemo<BusinessContextValue>(() => ({
    businesses,
    currentBusinessId,
    currentBusiness: businesses.find(b => b.id === currentBusinessId) ?? null,
    loading,
    multiBusinessEnabled,
    setCurrentBusiness,
    refresh: load,
  }), [businesses, currentBusinessId, loading, multiBusinessEnabled, setCurrentBusiness, load]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
};
