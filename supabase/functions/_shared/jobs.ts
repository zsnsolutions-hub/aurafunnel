/**
 * Shared job helpers for Supabase Edge Functions.
 *
 * Edge functions can import this to create/update jobs in the `jobs` table,
 * which the frontend Activity Panel reads.
 *
 * Usage in an edge function:
 *   import { createEdgeJob, updateEdgeJob, addEdgeJobEvent } from '../_shared/jobs.ts';
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

export type JobType =
  | 'email_sequence'
  | 'bulk_import'
  | 'apollo_import'
  | 'apollo_search'
  | 'social_publish'
  | 'analytics_refresh'
  | 'lead_enrichment'
  | 'invoice_send'
  | 'integration_validate';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

/** Create a job row and return its ID */
export async function createEdgeJob(opts: {
  workspaceId: string;
  type: JobType;
  userId: string;
  requestId?: string;
  progressTotal?: number;
}): Promise<string | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      workspace_id: opts.workspaceId,
      type: opts.type,
      status: 'queued' as JobStatus,
      progress_total: opts.progressTotal ?? 0,
      request_id: opts.requestId ?? null,
      created_by: opts.userId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[EdgeJob] createEdgeJob failed:', error.message);
    return null;
  }
  return data.id;
}

/** Update job status/progress */
export async function updateEdgeJob(
  jobId: string,
  updates: Partial<{
    status: JobStatus;
    progress_current: number;
    progress_total: number;
    result: Record<string, unknown>;
    error: string;
  }>
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    console.error('[EdgeJob] updateEdgeJob failed:', error.message);
  }
}

/** Add a job event */
export async function addEdgeJobEvent(
  jobId: string,
  message: string,
  level: 'info' | 'warn' | 'error' = 'info',
  meta?: Record<string, unknown>
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from('job_events').insert({
    job_id: jobId,
    level,
    message,
    meta: meta ?? {},
  });

  if (error) {
    console.error('[EdgeJob] addEdgeJobEvent failed:', error.message);
  }
}
