import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768; // matches Tailwind `md:`

function subscribe(cb: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

/**
 * Returns true when viewport is below 768px (mobile).
 * Uses useSyncExternalStore for tear-free reads.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
