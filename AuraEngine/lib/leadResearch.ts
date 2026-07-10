// AuraEngine/lib/leadResearch.ts
//
// On-demand AI lead research profile (Phase C, §3). Builds a context packet from
// the lead + the current business's profile + Mails.so validation + engagement,
// asks Gemini (via the credit-gated proxy) for a STRUCTURED profile, and stores
// it in lead_research_profiles. Strict no-fabrication: unknown fields must say so
// and be listed in missing_info; confidence reflects how much real data existed.

import { supabase } from './supabase';
import { generateContent } from './geminiClient';
import { AI_MODELS } from './aiConfig';
import { getBusinessProfile } from './businesses';
import { fetchBatchEmailSummary } from './emailTracking';
import { Lead } from '../types';

export interface LeadResearch {
  lead_id: string;
  company_summary: string | null;
  industry: string | null;
  target_customer: string | null;
  estimated_company_size: string | null;
  likely_decision_maker: string | null;
  possible_needs: string | null;
  pain_points: string | null;
  buying_triggers: string | null;
  objections: string | null;
  suggested_offer: string | null;
  suggested_pitch_angle: string | null;
  recommended_email_angle: string | null;
  recommended_call_angle: string | null;
  recommended_social_angle: string | null;
  best_channel: string | null;
  urgency: string | null;
  confidence: number | null;
  sources: unknown;
  missing_info: unknown;
  researched_at?: string;
  status?: string;
}

const FIELDS = [
  'company_summary', 'industry', 'target_customer', 'estimated_company_size',
  'likely_decision_maker', 'possible_needs', 'pain_points', 'buying_triggers',
  'objections', 'suggested_offer', 'suggested_pitch_angle', 'recommended_email_angle',
  'recommended_call_angle', 'recommended_social_angle', 'best_channel', 'urgency',
] as const;

function buildPrompt(
  lead: Lead,
  biz: Record<string, unknown> | null,
  validation: string,
  engagement: string,
): string {
  const bizCtx = biz
    ? `Products/services: ${biz.products_services ?? 'n/a'}\nAudience: ${biz.audience ?? 'n/a'}\nValue prop: ${biz.value_prop ?? 'n/a'}\nCompetitive advantage: ${biz.competitive_advantage ?? 'n/a'}`
    : 'No business profile on file.';

  return `You are a B2B sales research analyst. Produce a research profile for the LEAD below, to help the seller (whose business is described) reach out effectively.

STRICT RULES:
- Use ONLY the data provided plus careful, clearly-reasonable inference from it.
- DO NOT invent specific facts (people's names, revenue, headcount, funding, tools) that are not supported by the data. When you don't know, output exactly "unknown".
- List every field you had to guess or couldn't determine in "missing_info".
- "confidence" (0.0-1.0) must reflect how much real data supported the profile — low when the lead is sparse.

=== THE SELLER'S BUSINESS ===
${bizCtx}

=== THE LEAD ===
Name: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'unknown'}
Title: ${lead.title || 'unknown'}
Company: ${lead.company || 'unknown'}
Industry: ${lead.industry || 'unknown'}
Company size: ${lead.company_size || 'unknown'}
Email: ${lead.primary_email || 'unknown'} (validation: ${validation})
LinkedIn: ${lead.linkedin_url || 'unknown'}
Location: ${(lead as { location?: string }).location || 'unknown'}
Notes/insights: ${lead.insights || 'none'}
Email engagement: ${engagement}

=== OUTPUT ===
Return ONLY a JSON object (no markdown, no prose) with these string fields (use "unknown" where you cannot determine):
${FIELDS.join(', ')}.
Plus: "best_channel" (one of: email, call, linkedin, other), "urgency" (low|medium|high), "confidence" (number 0-1), "missing_info" (array of strings), "sources" (array of strings describing what each conclusion was based on).`;
}

function parseJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try { return JSON.parse(t); } catch { return null; }
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== 'unknown' && s.toLowerCase() !== 'n/a' ? s : null;
};

export async function generateLeadResearch(
  businessId: string, workspaceId: string, lead: Lead, userId: string,
): Promise<LeadResearch> {
  const email = (lead.primary_email ?? '').trim().toLowerCase();
  const [biz, valRes, engMap] = await Promise.all([
    getBusinessProfile(businessId),
    email
      ? supabase.from('email_validations').select('status').eq('business_id', businessId).eq('email', email).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchBatchEmailSummary([lead.id]),
  ]);
  const validation = (valRes as { data: { status?: string } | null }).data?.status ?? 'not validated';
  const eng = engMap.get(lead.id);
  const engagement = eng
    ? `sent=${eng.hasSent}, opened=${eng.hasOpened}, clicked=${eng.hasClicked}, opens=${eng.openCount}`
    : 'no emails sent yet';

  const res = await generateContent({
    model: AI_MODELS.text,
    contents: buildPrompt(lead, (biz as Record<string, unknown> | null), validation, engagement),
    operation: 'lead_research',
  });
  const parsed = parseJson(res.text) ?? {};

  const conf = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : null;
  const row: LeadResearch = {
    lead_id: lead.id,
    company_summary: str(parsed.company_summary),
    industry: str(parsed.industry) ?? (lead.industry || null),
    target_customer: str(parsed.target_customer),
    estimated_company_size: str(parsed.estimated_company_size) ?? (lead.company_size || null),
    likely_decision_maker: str(parsed.likely_decision_maker),
    possible_needs: str(parsed.possible_needs),
    pain_points: str(parsed.pain_points),
    buying_triggers: str(parsed.buying_triggers),
    objections: str(parsed.objections),
    suggested_offer: str(parsed.suggested_offer),
    suggested_pitch_angle: str(parsed.suggested_pitch_angle),
    recommended_email_angle: str(parsed.recommended_email_angle),
    recommended_call_angle: str(parsed.recommended_call_angle),
    recommended_social_angle: str(parsed.recommended_social_angle),
    best_channel: str(parsed.best_channel),
    urgency: str(parsed.urgency),
    confidence: conf,
    sources: Array.isArray(parsed.sources) ? parsed.sources : null,
    missing_info: Array.isArray(parsed.missing_info) ? parsed.missing_info : null,
  };

  const { error } = await supabase.from('lead_research_profiles').upsert({
    ...row, business_id: businessId, workspace_id: workspaceId,
    researched_by: userId, researched_at: new Date().toISOString(),
    status: parsed && Object.keys(parsed).length ? 'complete' : 'partial',
  }, { onConflict: 'lead_id' });
  if (error) throw new Error(error.message);
  return row;
}

export async function getLeadResearch(leadId: string): Promise<LeadResearch | null> {
  const { data } = await supabase.from('lead_research_profiles').select('*').eq('lead_id', leadId).maybeSingle();
  return (data as LeadResearch | null) ?? null;
}
