// AuraEngine/lib/leadScoring.ts
//
// Deterministic lead scoring (Phase C). The score is a FORMULA over real data —
// firmographics, email engagement (opens/clicks), Mails.so validation, and
// suppression — never an AI guess and never random. Computes a 0-100 total from
// weighted sub-scores, stores the breakdown in lead_scores, and syncs leads.score
// so the existing UI reflects the real number.

import { supabase } from './supabase';
import { Lead } from '../types';
import { fetchBatchEmailSummary } from './emailTracking';
import { isFlagEnabledDefaultOn } from './goals';
import { resolveWorkspaceForUser } from './memory';

// Lead intelligence (score / research / next-action panels) is ON by default —
// a workspace_feature_flags row with enabled=false opts a workspace out. The
// panels only READ cached data on mount; AI generation stays behind explicit
// buttons (credit-gated), so default-on never burns credits unprompted.
export async function leadIntelligenceEnabled(userId: string): Promise<boolean> {
  try {
    const ws = await resolveWorkspaceForUser(userId);
    return ws ? await isFlagEnabledDefaultOn(ws, 'lead_intelligence') : true;
  } catch { return true; }
}

export interface LeadScoreBreakdown {
  lead_id: string;
  total_score: number;
  fit_score: number;
  intent_score: number;
  engagement_score: number;
  data_quality_score: number;
  deliverability_score: number;
  urgency_score: number;
  risk_score: number; // penalty magnitude (0..20)
  confidence: number; // 0..1 input coverage
  reason_summary: string;
  scoring_inputs: Record<string, unknown>;
  contactable: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const has = (v: unknown) => typeof v === 'string' ? v.trim().length > 0 : !!v;

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

interface Inputs {
  validation: { status?: string; is_disposable?: boolean; is_role?: boolean } | null;
  engagement: { hasSent: boolean; hasOpened: boolean; hasClicked: boolean; openCount: number };
  suppressed: boolean;
}

async function gather(businessId: string, lead: Lead): Promise<Inputs> {
  const email = (lead.primary_email ?? '').trim().toLowerCase();

  const [valRes, engMap, supRes] = await Promise.all([
    email
      ? supabase.from('email_validations').select('status,is_disposable,is_role')
          .eq('business_id', businessId).eq('email', email).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchBatchEmailSummary([lead.id]),
    email
      ? supabase.from('suppressions').select('reason').eq('email', email).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    validation: (valRes as { data: Inputs['validation'] }).data ?? null,
    engagement: engMap.get(lead.id) ?? { hasSent: false, hasOpened: false, hasClicked: false, openCount: 0 },
    suppressed: !!(supRes as { data: unknown }).data,
  };
}

export function computeScore(lead: Lead, i: Inputs): LeadScoreBreakdown {
  const eng = i.engagement;
  const vstatus = i.validation?.status;
  const recency = daysSince((lead as { last_activity_at?: string }).last_activity_at ?? lead.last_activity ?? lead.created_at);

  // Fit /25 — firmographic completeness
  const fit = clamp(
    (has(lead.industry) ? 7 : 0) + (has(lead.company) ? 7 : 0) +
    (has(lead.title) ? 6 : 0) + (has(lead.company_size) ? 5 : 0), 0, 25);

  // Intent /20 — buying signals (only real events)
  const intent = clamp(
    (eng.hasClicked ? 12 : 0) + (eng.hasOpened ? 6 : 0) + (eng.openCount >= 3 ? 2 : 0), 0, 20);

  // Engagement /20 — interaction volume + recency
  const recencyPts = recency == null ? 0 : recency <= 7 ? 7 : recency <= 30 ? 4 : recency <= 90 ? 2 : 0;
  const engagement = clamp(
    (eng.hasSent ? 4 : 0) + Math.min(eng.openCount * 3, 9) + recencyPts, 0, 20);

  // Data quality /15 — contact completeness
  const dataQuality = clamp(
    (has(lead.primary_email) ? 4 : 0) +
    (has(lead.first_name) || has(lead.last_name) ? 3 : 0) +
    (has(lead.primary_phone) ? 3 : 0) +
    (has(lead.linkedin_url) ? 3 : 0) +
    (has(lead.company) ? 2 : 0), 0, 15);

  // Deliverability /10 — from Mails.so
  const deliverability = vstatus === 'valid' ? 10 : vstatus === 'invalid' ? 0 : vstatus === 'risky' ? 4 : 5;

  // Urgency /10 — recency of last activity
  const urgency = recency == null ? 0 : recency <= 7 ? 10 : recency <= 30 ? 6 : recency <= 90 ? 3 : 0;

  // Risk penalty 0..20
  const risk = clamp(
    (vstatus === 'invalid' ? 15 : 0) +
    (i.validation?.is_disposable ? 10 : 0) +
    (i.validation?.is_role ? 3 : 0) +
    (i.suppressed ? 20 : 0), 0, 20);

  const total = clamp(fit + intent + engagement + dataQuality + deliverability + urgency - risk, 0, 100);

  // Confidence 0..1 — how much real data backed the score
  const confidence = clamp(
    (i.validation ? 0.35 : 0) + (eng.hasSent ? 0.25 : 0) +
    (has(lead.industry) && has(lead.company) ? 0.25 : 0) +
    (has(lead.primary_phone) || has(lead.linkedin_url) ? 0.15 : 0), 0, 1);

  const parts: string[] = [];
  if (i.suppressed) parts.push('Unsubscribed/suppressed — do not contact');
  if (vstatus === 'invalid') parts.push('email invalid');
  else if (vstatus === 'risky') parts.push('email risky');
  else if (vstatus === 'valid') parts.push('email valid');
  else parts.push('email unvalidated');
  if (eng.hasClicked) parts.push('clicked a recent email');
  else if (eng.hasOpened) parts.push('opened a recent email');
  else if (eng.hasSent) parts.push('no engagement yet');
  if (fit >= 18) parts.push('strong firmographic fit');
  else if (fit <= 7) parts.push('thin firmographic data');
  const reason_summary = parts.join('; ') + '.';

  return {
    lead_id: lead.id,
    total_score: total, fit_score: fit, intent_score: intent, engagement_score: engagement,
    data_quality_score: dataQuality, deliverability_score: deliverability, urgency_score: urgency,
    risk_score: risk, confidence: Math.round(confidence * 100) / 100, reason_summary,
    scoring_inputs: {
      validation: vstatus ?? 'none', is_disposable: !!i.validation?.is_disposable, is_role: !!i.validation?.is_role,
      suppressed: i.suppressed, hasSent: eng.hasSent, hasOpened: eng.hasOpened, hasClicked: eng.hasClicked,
      openCount: eng.openCount, days_since_activity: recency == null ? null : Math.round(recency),
    },
    contactable: !i.suppressed,
  };
}

/** Compute, persist to lead_scores, and sync leads.score. */
export async function recalcLeadScore(
  businessId: string, workspaceId: string, lead: Lead,
): Promise<LeadScoreBreakdown> {
  const inputs = await gather(businessId, lead);
  const s = computeScore(lead, inputs);

  const { error } = await supabase.from('lead_scores').upsert({
    lead_id: s.lead_id, business_id: businessId, workspace_id: workspaceId,
    total_score: s.total_score, fit_score: s.fit_score, intent_score: s.intent_score,
    engagement_score: s.engagement_score, data_quality_score: s.data_quality_score,
    deliverability_score: s.deliverability_score, urgency_score: s.urgency_score,
    risk_score: s.risk_score, confidence: s.confidence, reason_summary: s.reason_summary,
    scoring_inputs: s.scoring_inputs, last_calculated_at: new Date().toISOString(),
  }, { onConflict: 'lead_id' });
  if (error) throw new Error(error.message);

  // Keep the denormalized leads.score in sync (existing UI reads it).
  await supabase.from('leads').update({ score: s.total_score }).eq('id', lead.id);
  return s;
}

export async function getLeadScore(leadId: string): Promise<LeadScoreBreakdown | null> {
  const { data } = await supabase.from('lead_scores').select('*').eq('lead_id', leadId).maybeSingle();
  return (data as LeadScoreBreakdown | null) ?? null;
}

/** Batched recompute for many leads. Gathers validation / engagement /
 *  suppression once per chunk (instead of per lead), bulk-upserts lead_scores,
 *  and syncs leads.score. Deterministic — no AI, no credits. Returns count
 *  scored; calls onProgress(done,total) after each chunk. */
export async function recalcLeadScoresBulk(
  businessId: string,
  workspaceId: string,
  leads: Lead[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const total = leads.length;
  if (total === 0) return 0;
  const CHUNK = 100;
  let done = 0;

  for (let i = 0; i < total; i += CHUNK) {
    const batch = leads.slice(i, i + CHUNK);
    const emails = [...new Set(batch.map(l => (l.primary_email ?? '').trim().toLowerCase()).filter(Boolean))];
    const ids = batch.map(l => l.id);

    const [valRes, engMap, supRes] = await Promise.all([
      emails.length
        ? supabase.from('email_validations').select('email,status,is_disposable,is_role').eq('business_id', businessId).in('email', emails)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      fetchBatchEmailSummary(ids),
      emails.length
        ? supabase.from('suppressions').select('email').in('email', emails)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const valByEmail = new Map<string, Inputs['validation']>();
    for (const v of ((valRes as { data: Record<string, unknown>[] | null }).data ?? [])) {
      valByEmail.set(String(v.email).toLowerCase(), v as Inputs['validation']);
    }
    const suppressed = new Set<string>(
      ((supRes as { data: Record<string, unknown>[] | null }).data ?? []).map(s => String(s.email).toLowerCase()),
    );

    const scoreRows = batch.map(lead => {
      const email = (lead.primary_email ?? '').trim().toLowerCase();
      const s = computeScore(lead, {
        validation: valByEmail.get(email) ?? null,
        engagement: engMap.get(lead.id) ?? { hasSent: false, hasOpened: false, hasClicked: false, openCount: 0 },
        suppressed: suppressed.has(email),
      });
      return {
        lead_id: s.lead_id, business_id: businessId, workspace_id: workspaceId,
        total_score: s.total_score, fit_score: s.fit_score, intent_score: s.intent_score,
        engagement_score: s.engagement_score, data_quality_score: s.data_quality_score,
        deliverability_score: s.deliverability_score, urgency_score: s.urgency_score,
        risk_score: s.risk_score, confidence: s.confidence, reason_summary: s.reason_summary,
        scoring_inputs: s.scoring_inputs, last_calculated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from('lead_scores').upsert(scoreRows, { onConflict: 'lead_id' });
    if (error) throw new Error(error.message);

    // Sync the denormalized leads.score (one column update per lead, concurrent).
    await Promise.all(scoreRows.map(r => supabase.from('leads').update({ score: r.total_score }).eq('id', r.lead_id)));

    done += batch.length;
    onProgress?.(done, total);
  }
  return done;
}
