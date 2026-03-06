/**
 * Bundled data hook for the mobile shell.
 *
 * - Fetches workspace snapshot (profile, credits, counts) in one batch
 * - Fetches top 25 priority leads separately (staleTime: 30s)
 * - All queries gated on workspaceId
 * - Returns pull-to-refresh helper
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { fetchWorkspaceSnapshot, type WorkspaceSnapshot } from '../lib/workspaceSnapshot';
import { cacheKeys, staleTimes } from '../lib/cacheKeys';
import { supabase } from '../lib/supabase';

export interface PriorityLead {
  id: string;
  first_name: string;
  last_name: string;
  company: string;
  score: number;
  status: string;
  primary_email: string;
}

async function fetchPriorityLeads(workspaceId: string): Promise<PriorityLead[]> {
  const { data } = await supabase
    .from('leads')
    .select('id, first_name, last_name, company, score, status, primary_email')
    .eq('client_id', workspaceId)
    .gte('score', 50)
    .order('score', { ascending: false })
    .limit(25);
  return (data ?? []) as PriorityLead[];
}

export function useMobileWorkspace(workspaceId: string | null) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refreshLockRef = useRef(false);

  const snapshotQuery = useQuery<WorkspaceSnapshot>({
    queryKey: cacheKeys.workspaceSnapshot(workspaceId ?? ''),
    queryFn: () => fetchWorkspaceSnapshot(workspaceId!),
    staleTime: staleTimes.standard,
    enabled: !!workspaceId,
  });

  const leadsQuery = useQuery<PriorityLead[]>({
    queryKey: [...cacheKeys.leads(workspaceId ?? ''), 'priority-mobile'],
    queryFn: () => fetchPriorityLeads(workspaceId!),
    staleTime: staleTimes.fast,
    enabled: !!workspaceId,
  });

  const pullToRefresh = useCallback(async () => {
    if (!workspaceId || refreshLockRef.current) return;
    refreshLockRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: cacheKeys.workspaceSnapshot(workspaceId) }),
        qc.invalidateQueries({ queryKey: cacheKeys.leads(workspaceId) }),
      ]);
    } finally {
      setRefreshing(false);
      refreshLockRef.current = false;
    }
  }, [workspaceId, qc]);

  return {
    snapshot: snapshotQuery.data ?? null,
    leads: leadsQuery.data ?? [],
    isLoading: snapshotQuery.isLoading,
    refreshing,
    pullToRefresh,
  };
}
