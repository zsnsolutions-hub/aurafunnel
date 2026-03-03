/**
 * Realtime email run hook — replaces polling in EmailWriterProgressModal.
 *
 * Two subscriptions:
 * - email_sequence_runs (by run ID) for run-level progress
 * - email_sequence_run_items (by run_id) for per-email status
 *
 * Merged connection status (both must be connected for green).
 * Fallback: exponential backoff 3s → 15s polling when disconnected.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtimeSubscription, type ConnectionStatus } from './useRealtimeSubscription';
import {
  pollRunProgress,
  triggerWriterWorker,
  type EmailSequenceRun,
  type EmailSequenceRunItem,
} from '../lib/emailWriterQueue';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type RealtimeMode = 'realtime' | 'polling' | 'idle';

interface UseRealtimeEmailRunOptions {
  runId: string | null;
  enabled?: boolean;
}

export function useRealtimeEmailRun({ runId, enabled = true }: UseRealtimeEmailRunOptions) {
  const [run, setRun] = useState<EmailSequenceRun | null>(null);
  const [items, setItems] = useState<EmailSequenceRunItem[]>([]);
  const [mode, setMode] = useState<RealtimeMode>('idle');
  const pollRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollIntervalRef = useRef(3000);

  const isActive = enabled && !!runId;

  // Initial fetch + refresh
  const refresh = useCallback(async () => {
    if (!runId) return;
    try {
      const progress = await pollRunProgress(runId);
      setRun(progress.run);
      setItems(progress.items);

      // Trigger worker if still processing
      if (progress.run?.status === 'processing') {
        triggerWriterWorker(runId).catch(() => {});
      }
    } catch {
      // Silent
    }
  }, [runId]);

  // Initial fetch
  useEffect(() => {
    if (isActive) refresh();
  }, [isActive, refresh]);

  // Handle run-level changes
  const handleRunPayload = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    const row = payload.new as unknown as EmailSequenceRun | undefined;
    if (row) setRun(row);
  }, []);

  // Handle item-level changes
  const handleItemPayload = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    const row = payload.new as unknown as EmailSequenceRunItem | undefined;
    if (!row) return;

    if (payload.eventType === 'INSERT') {
      setItems(prev => {
        if (prev.some(i => i.id === row.id)) return prev;
        return [...prev, row];
      });
    } else if (payload.eventType === 'UPDATE') {
      setItems(prev => prev.map(i => i.id === row.id ? row : i));
    }
  }, []);

  // Realtime: email_sequence_runs
  const runSub = useRealtimeSubscription({
    channelName: `email-run-${runId}`,
    table: 'email_sequence_runs',
    filter: runId ? `id=eq.${runId}` : undefined,
    events: ['UPDATE'],
    onPayload: handleRunPayload,
    enabled: isActive,
  });

  // Realtime: email_sequence_run_items
  const itemsSub = useRealtimeSubscription({
    channelName: `email-items-${runId}`,
    table: 'email_sequence_run_items',
    filter: runId ? `run_id=eq.${runId}` : undefined,
    events: ['INSERT', 'UPDATE'],
    onPayload: handleItemPayload,
    enabled: isActive,
  });

  // Merged connection status: both must be connected for "connected"
  const connectionStatus: ConnectionStatus =
    runSub.connectionStatus === 'connected' && itemsSub.connectionStatus === 'connected'
      ? 'connected'
      : runSub.connectionStatus === 'error' || itemsSub.connectionStatus === 'error'
        ? 'error'
        : runSub.connectionStatus === 'disconnected' || itemsSub.connectionStatus === 'disconnected'
          ? 'disconnected'
          : 'connecting';

  const shouldFallback = runSub.shouldFallback || itemsSub.shouldFallback;

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

  // Fallback polling with exponential backoff
  useEffect(() => {
    if (!shouldFallback || !isActive) {
      if (pollRef.current) clearTimeout(pollRef.current);
      pollIntervalRef.current = 3000;
      return;
    }

    const isTerminal = run && ['completed', 'failed', 'cancelled'].includes(run.status);
    if (isTerminal) return;

    const poll = async () => {
      await refresh();

      // Reset backoff when actively progressing
      if (run?.status === 'processing' && run.items_done > 0) {
        pollIntervalRef.current = 3000;
      }

      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, 15000);
      pollRef.current = setTimeout(poll, pollIntervalRef.current);
    };

    pollRef.current = setTimeout(poll, pollIntervalRef.current);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [shouldFallback, isActive, run?.status, run?.items_done, refresh]);

  return { run, items, connectionStatus, mode, refresh };
}
