// AuraEngine/lib/businessScope.ts
//
// Module-level mirror of the current business scope (Growth Platform v2, Phase A),
// following the same pattern as lib/dataPrefetch's setDataPrefetchUser. Lets
// non-hook code (insert handlers, plain async query fns) read the active business
// without threading it through every signature. BusinessProvider keeps it in sync.
//
// Reads are always current (no stale closures). Returns null when the
// multi_business flag is off, so callers behave exactly as before.

let _businessId: string | null = null;
let _enabled = false;

export function setBusinessScope(scope: { businessId: string | null; enabled: boolean }): void {
  _businessId = scope.businessId;
  _enabled = scope.enabled;
}

/** business_id to stamp on newly-created rows. Returns the current business
 *  ALWAYS (even when the multi_business flag is off) — every user has a default
 *  business, so stamping it keeps rows business-scoped and avoids NULLs that a
 *  future business-scoped RLS would orphan. Null only before the provider loads. */
export function activeBusinessId(): string | null {
  return _businessId;
}

/** True only when the multi_business flag is on AND a business is selected. */
export function businessScopeActive(): boolean {
  return _enabled && !!_businessId;
}

/** The current businessId for query keys (null when scoping is off). */
export function scopeKey(): string | null {
  return _enabled ? _businessId : null;
}

/** Apply the business filter to a supabase query builder when scoping is on.
 *  Typed loosely (any) on purpose — capturing the supabase filter-builder type in
 *  a generic here trips TS2589 ("excessively deep"). Callers keep their own types
 *  via the surrounding chain. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scopeLeads(query: any): any {
  return _enabled && _businessId ? query.eq('business_id', _businessId) : query;
}
