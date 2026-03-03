/**
 * Centralized React Query cache keys and invalidation helpers.
 *
 * Cache key hierarchy:
 *   ['workspace', workspaceId, 'snapshot']   → plan, usage, counts (staleTime: 60s)
 *   ['plans']                                → all plan definitions (staleTime: 30min)
 *   ['integrations', workspaceId]            → installed integrations (staleTime: 60s)
 *   ['dashboard', workspaceId, range]        → dashboard KPIs (staleTime: 30s)
 *   ['jobs', workspaceId]                    → active jobs list (staleTime: 5s)
 *   ['leads', workspaceId, ...]              → leads data (staleTime: 30s)
 *   ['invoices', workspaceId]                → invoices (staleTime: 60s)
 *   ['audit', ...]                           → audit logs (staleTime: 10s)
 */

import type { QueryClient } from '@tanstack/react-query';

// ── Key factories ────────────────────────────────────────────

export const cacheKeys = {
  // Workspace
  workspace: (id: string) => ['workspace', id] as const,
  workspaceSnapshot: (id: string) => ['workspace', id, 'snapshot'] as const,

  // Plans (global)
  plans: () => ['plans'] as const,

  // Integrations
  integrations: (workspaceId: string) => ['integrations', workspaceId] as const,

  // Dashboard
  dashboard: (workspaceId: string, range?: string) => ['dashboard', workspaceId, range ?? 'default'] as const,

  // Jobs
  jobs: (workspaceId: string) => ['jobs', workspaceId] as const,
  job: (jobId: string) => ['job', jobId] as const,

  // Leads
  leads: (workspaceId: string) => ['leads', workspaceId] as const,
  lead: (leadId: string) => ['lead', leadId] as const,

  // Email
  emailRun: (runId: string) => ['emailRun', runId] as const,

  // Invoices
  invoices: (workspaceId: string) => ['invoices', workspaceId] as const,

  // Audit
  audit: (scope?: string) => ['audit', scope ?? 'all'] as const,
} as const;

// ── Stale time presets (milliseconds) ────────────────────────

export const staleTimes = {
  /** Near-realtime data: jobs, email progress */
  realtime: 5_000,
  /** Frequently changing: dashboard KPIs, lead counts */
  fast: 30_000,
  /** Moderate: workspace snapshot, integrations, invoices */
  standard: 60_000,
  /** Slow-changing: plans, pricing, audit */
  slow: 5 * 60_000,
  /** Very slow: plan definitions, config */
  glacial: 30 * 60_000,
} as const;

// ── Invalidation helpers ─────────────────────────────────────

/**
 * Invalidate all workspace-scoped caches after a mutation.
 * Call this after imports, email sends, plan changes, etc.
 */
export function invalidateWorkspace(qc: QueryClient, workspaceId: string): void {
  qc.invalidateQueries({ queryKey: cacheKeys.workspaceSnapshot(workspaceId) });
  qc.invalidateQueries({ queryKey: cacheKeys.dashboard(workspaceId) });
  qc.invalidateQueries({ queryKey: cacheKeys.integrations(workspaceId) });
  qc.invalidateQueries({ queryKey: cacheKeys.leads(workspaceId) });
  qc.invalidateQueries({ queryKey: cacheKeys.invoices(workspaceId) });
  qc.invalidateQueries({ queryKey: cacheKeys.jobs(workspaceId) });
}

/** Invalidate jobs cache (after job status change) */
export function invalidateJobs(qc: QueryClient, workspaceId: string): void {
  qc.invalidateQueries({ queryKey: cacheKeys.jobs(workspaceId) });
}

/** Invalidate a specific job */
export function invalidateJob(qc: QueryClient, jobId: string): void {
  qc.invalidateQueries({ queryKey: cacheKeys.job(jobId) });
}

/** Invalidate leads after import or enrichment */
export function invalidateLeads(qc: QueryClient, workspaceId: string): void {
  qc.invalidateQueries({ queryKey: cacheKeys.leads(workspaceId) });
  qc.invalidateQueries({ queryKey: cacheKeys.dashboard(workspaceId) });
}

/** Invalidate plans cache (after admin plan change) */
export function invalidatePlans(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: cacheKeys.plans() });
}
