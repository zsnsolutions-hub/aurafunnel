import { resolvePlanName } from './credits';
import { getPlanByName, getPlanLimitsSync, type PlanLimits } from './plans';

export interface OutboundLimits {
  maxInboxes: number;
  emailsPerDayPerInbox: number;
  emailsPerMonth: number;
  linkedInPerDay: number;
  linkedInPerMonth: number;
}

// ── Hardcoded fallback (used only when DB is unreachable) ───────────────────

export const OUTBOUND_LIMITS: Record<string, OutboundLimits> = {
  Free: {
    maxInboxes: 1,
    emailsPerDayPerInbox: 5,
    emailsPerMonth: 5,
    linkedInPerDay: 5,
    linkedInPerMonth: 50,
  },
  Starter: {
    maxInboxes: 1,
    emailsPerDayPerInbox: 40,
    emailsPerMonth: 1_000,
    linkedInPerDay: 20,
    linkedInPerMonth: 600,
  },
  Growth: {
    maxInboxes: 5,
    emailsPerDayPerInbox: 60,
    emailsPerMonth: 10_000,
    linkedInPerDay: 40,
    linkedInPerMonth: 1_200,
  },
  Scale: {
    maxInboxes: 15,
    emailsPerDayPerInbox: 80,
    emailsPerMonth: 50_000,
    linkedInPerDay: 100,
    linkedInPerMonth: 3_000,
  },
};

/** Synchronous: resolve a raw plan name and return its outbound limits (uses hardcoded defaults). */
export function getOutboundLimits(planName: string): OutboundLimits {
  const resolved = resolvePlanName(planName);
  // Try sync fallback from plans.ts (which has identical defaults)
  const dbSync = getPlanLimitsSync(resolved);
  return {
    maxInboxes: dbSync.maxInboxes,
    emailsPerDayPerInbox: dbSync.emailsPerDayPerInbox,
    emailsPerMonth: dbSync.emailsPerMonth,
    linkedInPerDay: dbSync.linkedInPerDay,
    linkedInPerMonth: dbSync.linkedInPerMonth,
  };
}

/**
 * Async DB-driven: fetch outbound limits from DB plans table.
 * Falls back to hardcoded if DB fetch fails.
 */
export async function getOutboundLimitsAsync(planName: string): Promise<OutboundLimits> {
  const resolved = resolvePlanName(planName);
  try {
    const plan = await getPlanByName(resolved);
    if (plan) {
      return {
        maxInboxes: plan.limits.maxInboxes,
        emailsPerDayPerInbox: plan.limits.emailsPerDayPerInbox,
        emailsPerMonth: plan.limits.emailsPerMonth,
        linkedInPerDay: plan.limits.linkedInPerDay,
        linkedInPerMonth: plan.limits.linkedInPerMonth,
      };
    }
  } catch {
    // Fall through to hardcoded
  }
  return OUTBOUND_LIMITS[resolved] ?? OUTBOUND_LIMITS.Free;
}

/** Extract outbound limits from a PlanLimits object. */
export function extractOutboundLimits(limits: PlanLimits): OutboundLimits {
  return {
    maxInboxes: limits.maxInboxes,
    emailsPerDayPerInbox: limits.emailsPerDayPerInbox,
    emailsPerMonth: limits.emailsPerMonth,
    linkedInPerDay: limits.linkedInPerDay,
    linkedInPerMonth: limits.linkedInPerMonth,
  };
}
