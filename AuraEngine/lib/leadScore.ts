// AuraEngine/lib/leadScore.ts
//
// Transparent, deterministic lead scoring from REAL signals. Replaces the old
// "+5 on a button click" placeholder. Additive components, each capped, summed
// and clamped to 0-100, with a human-readable breakdown so the number is
// explainable rather than magical.

export type ValidationState = 'valid' | 'risky' | 'invalid' | 'unknown' | null;

export interface LeadScoreSignals {
  status?: string | null;
  validation?: ValidationState;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasCompany?: boolean;
  hasTitle?: boolean;
  hasLinkedin?: boolean;
  uniqueOpens?: number;
  uniqueClicks?: number;
  bounced?: number;
  replies?: number;
  meetings?: number;
  calls?: number;
  activities?: number;
  createdAt?: string | null;
}

export interface ScoreBreakdown { label: string; points: number; }
export interface LeadScoreResult { score: number; breakdown: ScoreBreakdown[]; }

function statusPoints(status?: string | null): number {
  switch ((status || '').toLowerCase()) {
    case 'converted': return 25;
    case 'qualified': return 20;
    case 'contacted': return 10;
    case 'new': return 3;
    case 'lost': return 0;
    default: return 3;
  }
}

function validationPoints(v?: ValidationState): number {
  switch (v) {
    case 'valid': return 10;
    case 'risky': return 4;
    case 'invalid': return 0;
    default: return 4; // unknown/not-yet-validated: neutral-ish
  }
}

// nowMs is injectable so the function stays pure/testable.
export function computeLeadScore(s: LeadScoreSignals, nowMs: number = Date.now()): LeadScoreResult {
  const b: ScoreBreakdown[] = [];
  const add = (label: string, points: number) => { if (points !== 0) b.push({ label, points }); };

  // Data completeness (max 15)
  let completeness = 0;
  if (s.hasEmail) completeness += 5;
  if (s.hasPhone) completeness += 3;
  if (s.hasCompany) completeness += 3;
  if (s.hasTitle) completeness += 2;
  if (s.hasLinkedin) completeness += 2;
  add('Contact detail completeness', completeness);

  // Email deliverability (max 10)
  add('Email deliverability', validationPoints(s.validation));

  // Pipeline status (max 25)
  add('Pipeline status', statusPoints(s.status));

  // Email engagement (max 22, min -10)
  let eng = 0;
  if ((s.uniqueOpens ?? 0) > 0) eng += 10;
  if ((s.uniqueClicks ?? 0) > 0) eng += 12;
  if ((s.bounced ?? 0) > 0) eng -= 10;
  add('Email engagement', eng);

  // Inbound replies (max 15) — strongest intent signal
  if ((s.replies ?? 0) > 0) add('Replied to outreach', 15);

  // Direct touches (max 13)
  let touches = 0;
  if ((s.meetings ?? 0) > 0) touches += 10;
  if ((s.calls ?? 0) > 0) touches += 5;
  if ((s.calls ?? 0) === 0 && (s.meetings ?? 0) === 0 && (s.activities ?? 0) > 0) touches += 3;
  touches = Math.min(13, touches);
  add('Calls & meetings', touches);

  // Recency decay (max 0, min -10): stale leads lose points
  if (s.createdAt) {
    const days = Math.floor((nowMs - new Date(s.createdAt).getTime()) / 86400000);
    if (days > 180) add('Ageing (no recent activity)', -10);
    else if (days > 90) add('Ageing (no recent activity)', -5);
  }

  const raw = b.reduce((sum, x) => sum + x.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, breakdown: b };
}
