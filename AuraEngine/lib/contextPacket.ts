// AuraEngine/lib/contextPacket.ts
//
// Unified AI context orchestrator (Phase F, §9). One place that assembles the
// "context packet" every AI surface should feed on: current business + lead +
// score + AI research + validation + engagement. Every downstream generation
// formats this packet, and each output can report which sources it used and
// what was missing — so nothing is fabricated silently.

import { supabase } from './supabase';
import { Lead } from '../types';
import { generateContent } from './geminiClient';
import { AI_MODELS } from './aiConfig';
import { getBusinessProfile } from './businesses';
import { getLeadScore, LeadScoreBreakdown } from './leadScoring';
import { getLeadResearch, LeadResearch } from './leadResearch';
import { fetchBatchEmailSummary } from './emailTracking';

export interface LeadContextPacket {
  business: Record<string, unknown> | null;
  lead: Lead;
  score: LeadScoreBreakdown | null;
  research: LeadResearch | null;
  validation: string | null;
  engagement: { hasSent: boolean; hasOpened: boolean; hasClicked: boolean; openCount: number } | null;
  sourcesUsed: string[];
  missing: string[];
}

export async function buildLeadContextPacket(businessId: string, lead: Lead): Promise<LeadContextPacket> {
  const email = (lead.primary_email ?? '').trim().toLowerCase();
  const [biz, score, research, valRes, engMap] = await Promise.all([
    getBusinessProfile(businessId),
    getLeadScore(lead.id),
    getLeadResearch(lead.id),
    email
      ? supabase.from('email_validations').select('status').eq('business_id', businessId).eq('email', email).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchBatchEmailSummary([lead.id]),
  ]);
  const validation = (valRes as { data: { status?: string } | null }).data?.status ?? null;
  const engagement = engMap.get(lead.id) ?? null;

  const sourcesUsed: string[] = [];
  const missing: string[] = [];
  (biz ? sourcesUsed : missing).push('business profile');
  (score ? sourcesUsed : missing).push('lead score');
  (research ? sourcesUsed : missing).push('AI research');
  (validation ? sourcesUsed : missing).push('email validation');
  (engagement?.hasSent ? sourcesUsed : missing).push('email engagement');

  return { business: (biz as Record<string, unknown> | null), lead, score, research, validation, engagement, sourcesUsed, missing };
}

export function packetToPrompt(p: LeadContextPacket): string {
  const b = p.business;
  const name = [p.lead.first_name, p.lead.last_name].filter(Boolean).join(' ') || 'unknown';
  return `BUSINESS: products=${b?.products_services ?? 'n/a'}; audience=${b?.audience ?? 'n/a'}; value=${b?.value_prop ?? 'n/a'}; tone=${b?.tone ?? 'n/a'}.
LEAD: ${name}, ${p.lead.title ?? 'title unknown'} at ${p.lead.company ?? 'company unknown'} (${p.lead.industry ?? 'industry unknown'}). Email ${p.lead.primary_email ?? 'unknown'} [${p.validation ?? 'unvalidated'}].
SCORE: ${p.score ? `${p.score.total_score}/100 — ${p.score.reason_summary}` : 'not scored'}.
RESEARCH: ${p.research ? `pain=${p.research.pain_points ?? '?'}; triggers=${p.research.buying_triggers ?? '?'}; objections=${p.research.objections ?? '?'}; best channel=${p.research.best_channel ?? '?'}` : 'none'}.
ENGAGEMENT: ${p.engagement ? `sent=${p.engagement.hasSent}, opened=${p.engagement.hasOpened}, clicked=${p.engagement.hasClicked}, opens=${p.engagement.openCount}` : 'no emails sent'}.`;
}

function parseJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}
const str = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);

export interface NextAction { action: string; channel: string; reason: string; confidence: number | null }

/** Suggest the single best next action from the context packet (no fabrication). */
export async function suggestNextAction(packet: LeadContextPacket): Promise<NextAction> {
  const prompt = `${packetToPrompt(packet)}

Based ONLY on the data above (do not invent facts), recommend the single best NEXT ACTION to move this lead forward. If the email is invalid or the lead is non-contactable, do not recommend emailing them.
Return ONLY JSON: {"action": short imperative sentence, "channel": one of email/call/linkedin/wait/other, "reason": one sentence citing the data, "confidence": number 0-1}.`;
  const res = await generateContent({ model: AI_MODELS.text, contents: prompt, operation: 'dashboard_insights' });
  const p = parseJson(res.text) ?? {};
  return {
    action: str(p.action) ?? 'Review this lead',
    channel: str(p.channel) ?? 'other',
    reason: str(p.reason) ?? '',
    confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : null,
  };
}
