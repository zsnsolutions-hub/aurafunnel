// AuraEngine/components/background/LeadEnrichmentWatcher.tsx
//
// Polls the lead_enrichment_jobs table for the signed-in user and mirrors each
// active / recently-finished job into the BackgroundTasks indicator. Because the
// job lives in the DB, the live timer is restored after a full page reload — the
// server keeps working regardless of the client. Mounted once at the app root.

import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useBackgroundTasks } from './BackgroundTasks';

const POLL_MS = 3000;
const RECENT_WINDOW_MS = 20_000; // keep finished jobs visible briefly

interface JobRow {
  id: string;
  label: string | null;
  status: 'processing' | 'done' | 'error';
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export const LeadEnrichmentWatcher: React.FC<{ userId?: string }> = ({ userId }) => {
  const { upsertExternalTask, removeExternalTask } = useBackgroundTasks();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let active = true;

    const poll = async () => {
      const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from('lead_enrichment_jobs')
        .select('id,label,status,error,started_at,finished_at')
        .eq('client_id', userId)
        .or(`status.eq.processing,finished_at.gte.${since}`)
        .order('started_at', { ascending: false })
        .limit(10);
      if (!active || error) return;

      const rows = (data ?? []) as JobRow[];
      const current = new Set<string>();
      for (const r of rows) {
        const id = `job-${r.id}`;
        current.add(id);
        upsertExternalTask({
          id,
          label: r.label || 'Enriching lead…',
          startedAt: new Date(r.started_at).getTime(),
          endedAt: r.finished_at ? new Date(r.finished_at).getTime() : undefined,
          status: r.status === 'processing' ? 'running' : r.status,
          error: r.error || undefined,
        });
      }
      // Drop jobs that aged out of the recent window.
      for (const id of seen.current) if (!current.has(id)) removeExternalTask(id);
      seen.current = current;
    };

    void poll();
    const iv = setInterval(() => void poll(), POLL_MS);
    return () => { active = false; clearInterval(iv); };
  }, [userId, upsertExternalTask, removeExternalTask]);

  return null;
};

export default LeadEnrichmentWatcher;
