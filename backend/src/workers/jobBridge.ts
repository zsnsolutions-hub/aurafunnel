/**
 * Job Bridge — server-side helpers for creating/updating jobs from BullMQ workers.
 *
 * Workers call these instead of writing to `ai_jobs` directly.
 * This writes to the `jobs` + `job_events` tables that the Activity Panel reads.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

// ── Create a job row ────────────────────────────────────────

export async function createJob(opts: {
  workspaceId: string;
  type: JobType;
  userId: string;
  requestId?: string;
  progressTotal?: number;
}): Promise<string> {
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
    console.error('[JobBridge] createJob failed:', error.message);
    throw error;
  }
  return data.id;
}

// ── Update job status/progress ──────────────────────────────

export async function updateJob(
  jobId: string,
  updates: Partial<{
    status: JobStatus;
    progress_current: number;
    progress_total: number;
    result: Record<string, unknown>;
    error: string;
  }>
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    console.error('[JobBridge] updateJob failed:', error.message);
  }
}

// ── Add a job event ─────────────────────────────────────────

export async function addJobEvent(
  jobId: string,
  message: string,
  level: 'info' | 'warn' | 'error' = 'info',
  meta?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('job_events').insert({
    job_id: jobId,
    level,
    message,
    meta: meta ?? {},
  });

  if (error) {
    console.error('[JobBridge] addJobEvent failed:', error.message);
  }
}

// ── Mark job as running ─────────────────────────────────────

export async function markRunning(jobId: string): Promise<void> {
  await updateJob(jobId, { status: 'running' });
  await addJobEvent(jobId, 'Job started processing');
}

// ── Mark job as succeeded ───────────────────────────────────

export async function markSucceeded(
  jobId: string,
  result?: Record<string, unknown>
): Promise<void> {
  await updateJob(jobId, { status: 'succeeded', result: result ?? {} });
  await addJobEvent(jobId, 'Job completed successfully');
}

// ── Mark job as failed ──────────────────────────────────────

export async function markFailed(jobId: string, errorMsg: string): Promise<void> {
  await updateJob(jobId, { status: 'failed', error: errorMsg });
  await addJobEvent(jobId, `Job failed: ${errorMsg}`, 'error');
}

// ── Update progress ─────────────────────────────────────────

export async function updateProgress(
  jobId: string,
  current: number,
  total?: number
): Promise<void> {
  const updates: Record<string, unknown> = { progress_current: current };
  if (total !== undefined) updates.progress_total = total;
  await updateJob(jobId, updates as any);
}
