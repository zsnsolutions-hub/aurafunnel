
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// ─── Transport timeout ──────────────────────────────────────────────────────
// @supabase/auth-js gives token-refresh and REST requests NO timeout, and gotrue
// serializes auth operations behind an internal lock (pendingInLock /
// refreshingDeferred). So a single stuck request (e.g. a hung POST to
// /token?grant_type=refresh_token on a flaky network) wedges the ENTIRE tab: the
// lock never releases and every later getSession()/query awaits a promise that
// never settles — a permanent, reload-only hang. This was the true root cause of
// the "analyzing forever" spinner and could surface at any of the ~29 getSession
// call sites.
//
// We bound the auth + PostgREST endpoints (always short-lived) with an
// AbortController so a stuck request aborts into a recoverable error instead of
// hanging forever — which lets gotrue settle its deferred and release the lock.
// Storage, Edge Functions and realtime are passed through UNTOUCHED so long
// uploads and streaming responses are never cut short.
const REQUEST_TIMEOUT_MS = 30_000;
const timedFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!/\/(auth|rest)\/v1\//.test(url)) return fetch(input, init);

  const controller = new AbortController();
  const callerSignal = init?.signal ?? undefined;
  const onCallerAbort = () => controller.abort((callerSignal as AbortSignal).reason);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort((callerSignal as AbortSignal).reason);
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(new DOMException('Supabase request timed out', 'TimeoutError')),
    REQUEST_TIMEOUT_MS,
  );
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  });
};

// React StrictMode double-mounts in DEV only, which can deadlock navigator.locks
// (the original reason this override existed). So we disable locking with a no-op
// in dev, but in PRODUCTION we let supabase-js fall back to its default
// navigatorLock — restoring cross-tab serialization so multiple open tabs don't
// race each other's token refresh (the refresh token rotates, so unsynchronized
// refreshes can invalidate a sibling tab's session). This is safe because
// timedFetch caps every lock-held request at 30s, so a lock can never be held
// indefinitely and acquisition can never wait forever.
const noopLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> =>
  await fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: import.meta.env.DEV ? { lock: noopLock } : {},
  global: { fetch: timedFetch },
});
