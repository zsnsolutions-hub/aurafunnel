/**
 * Redis cache key definitions and TTL rules for backend services.
 *
 * Complements the frontend cacheKeys.ts (React Query) with server-side
 * Redis key patterns used by workers and edge functions.
 */

// ── Key builders ────────────────────────────────────────────

export const redisKeys = {
  /** Credit balance for a workspace */
  creditBalance: (workspaceId: string) => `credits:${workspaceId}`,

  /** Email analytics for a workspace */
  emailAnalytics: (workspaceId: string) => `email_analytics:${workspaceId}`,

  /** Workspace snapshot (plan, usage, counts) */
  workspaceSnapshot: (workspaceId: string) => `snapshot:${workspaceId}`,

  /** Active jobs count for a workspace */
  activeJobs: (workspaceId: string) => `active_jobs:${workspaceId}`,

  /** Dashboard KPIs for a workspace + time range */
  dashboard: (workspaceId: string, range = 'default') => `dashboard:${workspaceId}:${range}`,

  /** Lead count for a workspace */
  leadCount: (workspaceId: string) => `lead_count:${workspaceId}`,

  /** Integration list for a workspace */
  integrations: (workspaceId: string) => `integrations:${workspaceId}`,

  /** Plan definitions (global) */
  plans: () => 'plans:all',

  /** Research job result by domain */
  research: (domain: string) => `research:${domain}`,

  /** Rate limit counter */
  rateLimit: (workspaceId: string, action: string) => `ratelimit:${workspaceId}:${action}`,
} as const;

// ── TTL presets (seconds) ───────────────────────────────────

export const redisTTL = {
  /** Near-realtime: active jobs, progress (10s) */
  realtime: 10,

  /** Frequently changing: dashboard KPIs, credit balance (60s) */
  fast: 60,

  /** Moderate: workspace snapshot, integrations (120s) */
  standard: 120,

  /** Slow-changing: email analytics (5 min) */
  slow: 300,

  /** Very slow: plan definitions, config (30 min) */
  glacial: 1800,

  /** Research cache: domain research results (1 hour) */
  research: 3600,
} as const;

// ── Invalidation patterns ───────────────────────────────────

export const invalidationPatterns = {
  /** All caches for a workspace */
  workspace: (workspaceId: string) => [
    redisKeys.creditBalance(workspaceId),
    redisKeys.emailAnalytics(workspaceId),
    redisKeys.workspaceSnapshot(workspaceId),
    redisKeys.activeJobs(workspaceId),
    redisKeys.leadCount(workspaceId),
    redisKeys.integrations(workspaceId),
    `dashboard:${workspaceId}:*`,
  ],

  /** After email events */
  email: (workspaceId: string) => [
    redisKeys.emailAnalytics(workspaceId),
    redisKeys.creditBalance(workspaceId),
    redisKeys.workspaceSnapshot(workspaceId),
  ],

  /** After lead import/enrichment */
  leads: (workspaceId: string) => [
    redisKeys.leadCount(workspaceId),
    redisKeys.workspaceSnapshot(workspaceId),
    `dashboard:${workspaceId}:*`,
  ],

  /** After plan/subscription change */
  plan: (workspaceId: string) => [
    redisKeys.creditBalance(workspaceId),
    redisKeys.workspaceSnapshot(workspaceId),
    redisKeys.plans(),
  ],

  /** After integration connect/disconnect */
  integration: (workspaceId: string) => [
    redisKeys.integrations(workspaceId),
    redisKeys.workspaceSnapshot(workspaceId),
  ],
} as const;
