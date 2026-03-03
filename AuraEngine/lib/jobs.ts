/**
 * Jobs client — create, track, and manage long-running jobs.
 *
 * Every long-running operation (email sequence, import, Apollo search, etc.)
 * creates a job row in the `jobs` table. The Activity Panel subscribes to
 * job updates via polling with exponential backoff.
 */

import { supabase } from './supabase';
import { getRequestId } from './requestId';

// ── Types ────────────────────────────────────────────────────

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

export interface Job {
  id: string;
  workspace_id: string;
  type: JobType;
  status: JobStatus;
  progress_current: number;
  progress_total: number;
  result: Record<string, unknown> | null;
  error: string | null;
  request_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobEvent {
  id: string;
  job_id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
}

// ── CRUD ─────────────────────────────────────────────────────

/** Create a new job and return its ID + request_id */
export async function createJob(
  workspaceId: string,
  type: JobType,
  userId: string,
  opts?: { requestId?: string; progressTotal?: number },
): Promise<{ jobId: string; requestId: string }> {
  const requestId = opts?.requestId ?? getRequestId();

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      workspace_id: workspaceId,
      type,
      status: 'queued',
      progress_total: opts?.progressTotal ?? 0,
      request_id: requestId,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return { jobId: data.id, requestId };
}

/** Get a single job by ID */
export async function getJob(jobId: string): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  return data as Job | null;
}

/** List jobs for a workspace, most recent first */
export async function listJobs(
  workspaceId: string,
  opts?: { status?: JobStatus; limit?: number },
): Promise<Job[]> {
  let query = supabase
    .from('jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 20);

  if (opts?.status) query = query.eq('status', opts.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Job[];
}

/** List active (queued + running) jobs for a workspace */
export async function listActiveJobs(workspaceId: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Job[];
}

/** Update job status/progress (for client-side updates) */
export async function updateJob(
  jobId: string,
  updates: Partial<Pick<Job, 'status' | 'progress_current' | 'progress_total' | 'result' | 'error'>>,
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', jobId);
  if (error) throw error;
}

/** Cancel a running/queued job */
export async function cancelJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({ status: 'canceled' })
    .eq('id', jobId)
    .in('status', ['queued', 'running']);
  if (error) throw error;
}

/** Get events for a job */
export async function getJobEvents(jobId: string, limit = 50): Promise<JobEvent[]> {
  const { data, error } = await supabase
    .from('job_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as JobEvent[];
}

/** Add an event to a job */
export async function addJobEvent(
  jobId: string,
  message: string,
  level: 'info' | 'warn' | 'error' = 'info',
  meta?: Record<string, unknown>,
): Promise<void> {
  await supabase.from('job_events').insert({
    job_id: jobId,
    level,
    message,
    meta: meta ?? {},
  });
}

// ── Polling with exponential backoff ─────────────────────────

export interface PollOptions {
  /** Initial interval in ms (default: 2000) */
  initialInterval?: number;
  /** Maximum interval in ms (default: 15000) */
  maxInterval?: number;
  /** Backoff multiplier (default: 1.5) */
  multiplier?: number;
  /** Callback on each poll */
  onUpdate?: (job: Job) => void;
  /** Abort signal */
  signal?: AbortSignal;
}

/**
 * Poll a job with exponential backoff until it reaches a terminal state.
 * Returns the final job state.
 *
 * Interval: 2s → 3s → 4.5s → 6.75s → 10s → 15s (capped)
 * This replaces the old 1.5s fixed-interval polling.
 */
export async function pollJobUntilDone(jobId: string, opts?: PollOptions): Promise<Job> {
  const initial = opts?.initialInterval ?? 2000;
  const max = opts?.maxInterval ?? 15000;
  const mult = opts?.multiplier ?? 1.5;
  let interval = initial;

  const TERMINAL = new Set<JobStatus>(['succeeded', 'failed', 'canceled']);

  while (true) {
    if (opts?.signal?.aborted) throw new DOMException('Polling aborted', 'AbortError');

    const job = await getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    opts?.onUpdate?.(job);

    if (TERMINAL.has(job.status)) return job;

    // If job is actively progressing, reset backoff to keep updates responsive
    if (job.status === 'running' && job.progress_current > 0) {
      interval = initial;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
    interval = Math.min(interval * mult, max);
  }
}
