/**
 * Realtime jobs hook — replaces polling in ActivityPanel.
 *
 * - Initial fetch via listJobs() to seed state
 * - Realtime: INSERT + UPDATE on jobs table filtered by workspace_id
 * - Fallback: adaptive polling (3s active / 15s idle) when shouldFallback
 * - On reconnect: full refresh to reconcile missed events
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtimeSubscription, type ConnectionStatus } from './useRealtimeSubscription';
import { listJobs, type Job } from '../lib/jobs';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type RealtimeMode = 'realtime' | 'polling' | 'idle';

interface UseRealtimeJobsOptions {
  workspaceId: string | null;
  limit?: number;
}

export function useRealtimeJobs({ workspaceId, limit = 15 }: UseRealtimeJobsOptions) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [mode, setMode] = useState<RealtimeMode>('idle');
  const pollRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevStatusRef = useRef<ConnectionStatus>('connecting');

  // Initial fetch + refresh function
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await listJobs(workspaceId, { limit });
      setJobs(data);
    } catch {
      // Silent — don't break the panel on fetch errors
    }
  }, [workspaceId, limit]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Handle realtime payloads
  const handlePayload = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    const row = (payload.new ?? payload.old) as unknown as Job | undefined;
    if (!row) return;

    if (payload.eventType === 'INSERT') {
      setJobs(prev => [row, ...prev].slice(0, limit));
    } else if (payload.eventType === 'UPDATE') {
      setJobs(prev => prev.map(j => j.id === row.id ? row : j));
    }
  }, [limit]);

  // Realtime subscription
  const { connectionStatus, shouldFallback } = useRealtimeSubscription({
    channelName: `jobs-${workspaceId}`,
    table: 'jobs',
    filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
    events: ['INSERT', 'UPDATE'],
    onPayload: handlePayload,
    enabled: !!workspaceId,
  });

  // Track mode
  useEffect(() => {
    if (shouldFallback) {
      setMode('polling');
    } else if (connectionStatus === 'connected') {
      setMode('realtime');
    } else {
      setMode('idle');
    }
  }, [connectionStatus, shouldFallback]);

  // Reconcile on reconnect: full refresh when going from non-connected → connected
  useEffect(() => {
    if (connectionStatus === 'connected' && prevStatusRef.current !== 'connected') {
      refresh();
    }
    prevStatusRef.current = connectionStatus;
  }, [connectionStatus, refresh]);

  // Fallback polling when Realtime is down
  useEffect(() => {
    if (!shouldFallback || !workspaceId) {
      if (pollRef.current) clearTimeout(pollRef.current);
      return;
    }

    const poll = () => {
      const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'running');
      const interval = hasActive ? 3000 : 15000;
      pollRef.current = setTimeout(async () => {
        await refresh();
        poll();
      }, interval);
    };

    poll();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [shouldFallback, workspaceId, refresh, jobs]);

  return { jobs, mode, connectionStatus, refresh };
}
