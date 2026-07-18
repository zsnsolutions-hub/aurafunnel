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
import { isFlagEnabledDefaultOn } from '../../lib/goals';
import { setBusinessScope } from '../../lib/businessScope';

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
const flagCacheKey = (userId: string) => `scaliyo:mbFlag:${userId}`;

export const BusinessProvider: React.FC<{ userId: string; children: React.ReactNode }> = ({ userId, children }) => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Seed from a cached value so the flag is known synchronously on repeat loads
  // (avoids a flash of unscoped/all-business data before the RPC resolves).
  // multi_business is on by default now (canonical model) — a workspace_feature_flags
  // row with enabled=false can explicitly opt out. Seed ON unless cached as '0'.
  const [multiBusinessEnabled, setMultiBusinessEnabled] = useState(() => {
    try { return localStorage.getItem(flagCacheKey(userId)) !== '0'; } catch { return true; }
  });

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
        const on = await isFlagEnabledDefaultOn(ws, 'multi_business');
        if (!cancelled) {
          setMultiBusinessEnabled(on);
          try { localStorage.setItem(flagCacheKey(userId), on ? '1' : '0'); } catch { /* ignore */ }
        }
      } catch { /* flag stays off */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Mirror the scope to the module-level helper so non-hook code (insert
  // handlers, plain async queries) can read the active business.
  useEffect(() => {
    setBusinessScope({ businessId: currentBusinessId, enabled: multiBusinessEnabled });
  }, [currentBusinessId, multiBusinessEnabled]);

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
