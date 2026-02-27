import { resolvePlanName } from './credits';

export interface OutboundLimits {
  maxInboxes: number;
  emailsPerDayPerInbox: number;
  emailsPerMonth: number;
  linkedInPerDay: number;
  linkedInPerMonth: number;
}

export const OUTBOUND_LIMITS: Record<string, OutboundLimits> = {
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

/** Resolve a raw plan name and return its outbound limits (defaults to Starter). */
export function getOutboundLimits(planName: string): OutboundLimits {
  const resolved = resolvePlanName(planName);
  return OUTBOUND_LIMITS[resolved] ?? OUTBOUND_LIMITS.Starter;
}
