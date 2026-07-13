// Cache-proofing: detect when the running app is an OLDER build than what the
// server is serving (a browser/HTTP cache, CDN, or a stuck service worker held
// onto stale assets) and self-recover — unregister service workers, clear the
// Cache API, and reload once with a cache-buster. This is what keeps users (and
// us) from getting trapped on a stale bundle after a deploy.

declare const __BUILD_SHA__: string;

const RUNNING_VERSION = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';
const GUARD_KEY = '__versionReloadFor';

async function forceRefresh(serverVersion: string): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch { /* best-effort */ }

  // Cache-bust the document URL so the browser fetches a fresh index.html even if
  // it (or an intermediary) HTTP-cached the old one. Keep the hash-router route.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', serverVersion);
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/** Compare the running build to the server's version.json; self-recover if stale. */
export async function checkAppVersion(): Promise<void> {
  if (RUNNING_VERSION === 'dev') return; // no version.json in dev
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { version?: string } | null;
    const serverVersion = data?.version;
    if (!serverVersion || serverVersion === RUNNING_VERSION) return; // up to date

    // Stale. Recover only once per server version so we can never loop (e.g. if
    // the server itself is briefly serving mismatched files mid-deploy).
    if (sessionStorage.getItem(GUARD_KEY) === serverVersion) return;
    sessionStorage.setItem(GUARD_KEY, serverVersion);
    await forceRefresh(serverVersion);
  } catch { /* offline / fetch failed — ignore */ }
}

/** Strip the _v cache-buster from the URL after a successful recovery. */
export function cleanVersionParam(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('_v')) {
      url.searchParams.delete('_v');
      window.history.replaceState({}, '', url.toString());
    }
  } catch { /* ignore */ }
}

/** Wire up version checks: on load + whenever the tab becomes visible again. */
export function initVersionGuard(): void {
  cleanVersionParam();
  void checkAppVersion();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkAppVersion();
  });
}
