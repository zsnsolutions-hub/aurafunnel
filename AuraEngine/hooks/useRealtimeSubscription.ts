/**
 * Base hook for managing a Supabase Realtime channel.
 *
 * Handles:
 * - Unique channel names (mount counter for StrictMode safety)
 * - Connection status tracking
 * - shouldFallback flag (true when disconnected >10s)
 * - Cleanup: supabase.removeChannel() on unmount
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RealtimeSubscriptionConfig {
  /** Unique channel name prefix */
  channelName: string;
  /** Table to subscribe to */
  table: string;
  /** Column filter (e.g. 'workspace_id=eq.abc') */
  filter?: string;
  /** Postgres schema (default: 'public') */
  schema?: string;
  /** Events to listen for */
  events?: Array<'INSERT' | 'UPDATE' | 'DELETE'>;
  /** Callback when a change is received */
  onPayload: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  /** Whether the subscription is enabled */
  enabled?: boolean;
}

let mountCounter = 0;

export function useRealtimeSubscription(config: RealtimeSubscriptionConfig) {
  const {
    channelName,
    table,
    filter,
    schema = 'public',
    events = ['INSERT', 'UPDATE'],
    onPayload,
    enabled = true,
  } = config;

  // Serialize events for stable dependency comparison — inline array literals
  // like `events: ['INSERT', 'UPDATE']` create a new reference every render,
  // which would cause the useEffect to run every render (infinite loop).
  const eventsKey = events.join(',');

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [shouldFallback, setShouldFallback] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const cleanup = useCallback(() => {
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = undefined;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      setConnectionStatus('disconnected');
      setShouldFallback(true);
      return;
    }

    const mountId = ++mountCounter;
    const uniqueName = `${channelName}-${mountId}`;

    // Build channel with postgres_changes listeners
    let channel = supabase.channel(uniqueName);

    for (const event of eventsRef.current) {
      const opts: Record<string, string> = {
        event,
        schema,
        table,
      };
      if (filter) opts.filter = filter;

      channel = channel.on(
        'postgres_changes' as never,
        opts,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          onPayloadRef.current(payload);
        },
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnectionStatus('connected');
        setShouldFallback(false);
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = undefined;
        }
      } else if (status === 'CHANNEL_ERROR') {
        setConnectionStatus('error');
        // Start fallback timer
        if (!disconnectTimerRef.current) {
          disconnectTimerRef.current = setTimeout(() => {
            setShouldFallback(true);
          }, 10_000);
        }
      } else if (status === 'CLOSED') {
        setConnectionStatus('disconnected');
        setShouldFallback(true);
      } else if (status === 'TIMED_OUT') {
        setConnectionStatus('disconnected');
        if (!disconnectTimerRef.current) {
          disconnectTimerRef.current = setTimeout(() => {
            setShouldFallback(true);
          }, 10_000);
        }
      }
    });

    channelRef.current = channel;

    return cleanup;
    // eventsKey is a serialized string of the events array — avoids reference instability
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, filter, schema, enabled, cleanup, eventsKey]);

  return { connectionStatus, shouldFallback };
}
