/**
 * Data prefetch map — prefetches React Query data on sidebar hover.
 * Works alongside routePrefetchMap (which prefetches JS chunks).
 */
import { prefetchPortalData } from './queries';

let _userId: string | undefined;

/** Call once from ClientLayout to set the current user ID for data prefetching */
export function setDataPrefetchUser(userId: string | undefined) {
  _userId = userId;
}

/** Routes that benefit from leads data prefetch */
const LEADS_DATA_ROUTES = new Set([
  '/portal',
  '/portal/leads',
  '/portal/leads/apollo',
  '/portal/intelligence',
  '/portal/content',
  '/portal/content-studio',
  '/portal/analytics',
  '/portal/automation',
]);

const prefetched = new Set<string>();

/** Prefetch query data for a route — called from PrefetchLink on hover */
export function prefetchDataForRoute(path: string): void {
  if (!_userId || prefetched.has(path)) return;
  if (LEADS_DATA_ROUTES.has(path)) {
    prefetched.add(path);
    prefetchPortalData(_userId);
  }
}
