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

/** business_id to stamp on newly-created rows — null when scoping is off. */
export function activeBusinessId(): string | null {
  return _enabled ? _businessId : null;
}

/** True only when the multi_business flag is on AND a business is selected. */
export function businessScopeActive(): boolean {
  return _enabled && !!_businessId;
}
