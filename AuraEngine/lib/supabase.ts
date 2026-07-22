
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
// in dev. In PRODUCTION we keep a cross-tab lock so multiple open tabs don't race
// each other's token refresh (the refresh token rotates, so unsynchronized
// refreshes can invalidate a sibling tab's session) — but we DON'T use gotrue's
// default navigatorLock, because it can wedge the whole app.
const noopLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> =>
  await fn();

// ─── Self-healing cross-tab auth lock ────────────────────────────────────────
// gotrue's default navigatorLock serializes auth ops behind a Web Lock. But the
// Web Locks API is shared across ALL same-origin tabs, and a tab the browser
// FREEZES/DISCARDS mid-critical-section keeps the lock held while its timers
// (including timedFetch's 30s abort above) are suspended — so its lock-held fetch
// never aborts and the lock is NEVER released. gotrue's 10s lockAcquireTimeout
// then makes every getSession()/refresh in every other tab reject with "signal is
// aborted without reason" ~10s later, forever: the access token can't refresh and
// the whole app wedges (app-wide spinner → forced redirect to /auth). Confirmed
// live via navigator.locks.query() showing a lock held with 3 refreshes queued
// behind it hours after the holder died. (See [[supabase-auth-hang]].)
//
// This lock keeps cross-tab serialization but SELF-HEALS: it waits up to
// STEAL_CEILING_MS — set just above the 30s transport cap, so any *live* holder
// has provably finished its (bounded) lock-held request and released — then
// STEALS the lock, evicting the frozen/orphaned holder so this tab can proceed.
// Healthy contention still resolves in milliseconds; the ceiling only ever fires
// on a real wedge. acquireTimeout === 0 (gotrue's auto-refresh tick) keeps its
// non-blocking semantics so a busy lock just skips the tick.
const STEAL_CEILING_MS = REQUEST_TIMEOUT_MS + 5_000;

class LockAcquireTimeoutError extends Error {
  // gotrue detects acquire-timeouts via this flag, not instanceof.
  readonly isAcquireTimeout = true;
}

const selfHealingLock = async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  const locks = globalThis.navigator?.locks;
  if (!locks) return await fn(); // no Web Locks (old browser / insecure ctx) — run unguarded

  // Non-blocking probe: preserve gotrue's tick semantics (skip if lock is busy).
  if (acquireTimeout === 0) {
    return await locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) throw new LockAcquireTimeoutError(`Navigator lock "${name}" not immediately available`);
      return await fn();
    });
  }

  // Bounded wait — we override gotrue's short 10s acquireTimeout with our own
  // ceiling so a wedge self-heals (steals) instead of failing fast forever.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), STEAL_CEILING_MS);
  try {
    return await locks.request(name, { mode: 'exclusive', signal: ac.signal }, async () => await fn());
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
    // Ceiling elapsed with the lock still held → the holder has exceeded the max
    // possible legitimate hold time, so it is frozen/orphaned. Steal to break the
    // deadlock (`steal` can't be combined with signal/ifAvailable).
    return await locks.request(name, { mode: 'exclusive', steal: true }, async () => await fn());
  } finally {
    clearTimeout(timer);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: import.meta.env.DEV ? { lock: noopLock } : { lock: selfHealingLock },
  global: { fetch: timedFetch },
});
