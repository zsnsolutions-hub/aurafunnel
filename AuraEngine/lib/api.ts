/**
 * Supabase query wrapper with timeout, retry, and performance tracking.
 *
 * Usage:
 *   const data = await fromQuery(
 *     supabase.from('teamhub_boards').select('*').eq('id', flowId),
 *     { label: 'fetchBoard', timeout: 8000 }
 *   );
 */

import { perfTracker } from './perfTracker';

// ─── Types ───

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string } | null;
}

/** Any Supabase query builder that resolves to { data, error } */
type SupabaseQuery<T> = PromiseLike<QueryResult<T>>;

interface FromQueryOptions {
  /** Human-readable label for logs / perf panel */
  label?: string;
  /** Timeout in ms (default 10 000) */
  timeout?: number;
  /** Max retries (default 3). Only retries network errors and 5xx. */
  maxRetries?: number;
  /** AbortSignal for caller-controlled cancellation */
  signal?: AbortSignal;
}

// ─── Helpers ───

const RETRY_DELAYS = [250, 750, 2000];
const DEFAULT_TIMEOUT = 10_000;
const SLOW_THRESHOLD = 800;

let _reqCounter = 0;
function reqId(): string {
  _reqCounter = (_reqCounter + 1) % 1_000_000;
  return `q${_reqCounter.toString(36)}`;
}

function isRetryable(error: QueryResult<unknown>['error']): boolean {
  if (!error) return false;
  const msg = error.message?.toLowerCase() ?? '';
  const code = error.code ?? '';
  // Network-level failures
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('aborted')) {
    return true;
  }
  // Postgres / PostgREST 5xx
  if (code.startsWith('5') || msg.includes('internal server error') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return true;
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

// ─── Core wrapper ───

export class QueryTimeoutError extends Error {
  constructor(label: string, timeout: number) {
    super(`Query "${label}" timed out after ${timeout}ms`);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Wraps a Supabase query with timeout, retry, and perf tracking.
 * Returns the resolved data or throws on unrecoverable errors.
 */
export async function fromQuery<T>(
  queryFn: SupabaseQuery<T> | (() => SupabaseQuery<T>),
  opts: FromQueryOptions = {},
): Promise<T> {
  const label = opts.label ?? 'query';
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const maxRetries = opts.maxRetries ?? RETRY_DELAYS.length;
  const signal = opts.signal;
  const id = reqId();

  let lastError: QueryResult<unknown>['error'] = null;
  const t0 = performance.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Wait before retry (skip first attempt)
    if (attempt > 0) {
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
      perfTracker.record({ id, label, type: 'retry', attempt, delay });
      await sleep(delay, signal);
    }

    try {
      const query = typeof queryFn === 'function' ? queryFn() : queryFn;

      const result = await Promise.race<QueryResult<T>>([
        query as Promise<QueryResult<T>>,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new QueryTimeoutError(label, timeout)), timeout);
          signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
        }),
      ]);

      const elapsed = performance.now() - t0;

      if (result.error) {
        lastError = result.error;
        // Only retry if retryable and we have attempts left
        if (isRetryable(result.error) && attempt < maxRetries) continue;
        // Non-retryable or exhausted retries — report and throw
        perfTracker.record({ id, label, type: 'error', elapsed, error: result.error.message, attempt });
        throw new Error(`[${label}] ${result.error.message}`);
      }

      // Success
      if (elapsed > SLOW_THRESHOLD) {
        console.warn(`[api] Slow query "${label}" (${id}): ${elapsed.toFixed(0)}ms`);
      }
      perfTracker.record({ id, label, type: 'success', elapsed, attempt });
      return result.data as T;
    } catch (err) {
      // Abort — do not retry
      if (err instanceof DOMException && err.name === 'AbortError') {
        perfTracker.record({ id, label, type: 'abort', elapsed: performance.now() - t0 });
        throw err;
      }
      // Timeout — retry
      if (err instanceof QueryTimeoutError && attempt < maxRetries) {
        lastError = { message: err.message };
        continue;
      }
      // Final failure
      const elapsed = performance.now() - t0;
      perfTracker.record({ id, label, type: 'error', elapsed, error: (err as Error).message, attempt });
      throw err;
    }
  }

  // Should not reach here, but safety net
  throw new Error(`[${label}] All ${maxRetries + 1} attempts failed: ${lastError?.message ?? 'unknown error'}`);
}
