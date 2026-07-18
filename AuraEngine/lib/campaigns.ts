// AuraEngine/lib/campaigns.ts
//
// Data layer for the Campaigns page (saved email sequences). CRUD over
// email_sequences + sequence_steps, and launch() which assembles the enrolled
// leads + steps into the start-email-sequence-run payload (same contract as
// QuickLaunch) to actually begin sending.

import { supabase } from './supabase';
import { resolveWorkspaceId } from './tenancy';
import { scopeBusiness, activeBusinessId } from './businessScope';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  goal: string | null;
  tone: string | null;
  total_leads: number;
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  ai_personalize: boolean;
  ab_auto_optimize: boolean;
  send_best_time: boolean;
  send_window_start: number | null;
  send_window_end: number | null;
  send_weekdays_only: boolean;
  send_timezone: string | null;
  created_at: string;
  step_count?: number;
}

interface MergeLead {
  name?: string; company?: string; title?: string; industry?: string; location?: string;
  website?: string; linkedin?: string; source?: string; company_size?: string; email?: string;
  phone?: string; custom_fields?: Record<string, unknown> | null;
}

// Mail-merge (client mirror of the server mergeFields in start-email-sequence-run).
const mergeClient = (tpl: string, lead: MergeLead): string => {
  const first = (lead.name || '').trim().split(/\s+/)[0] || 'there';
  const map: Record<string, string> = {
    first_name: first, last_name: (lead.name || '').trim().split(/\s+/).slice(1).join(' '),
    name: lead.name || 'there', full_name: lead.name || 'there',
    company: lead.company || 'your company', title: lead.title || '', industry: lead.industry || '',
    location: lead.location || '', website: lead.website || '', linkedin: lead.linkedin || '',
    source: lead.source || '', company_size: lead.company_size || '', email: lead.email || '', phone: lead.phone || '', your_name: '',
  };
  return (tpl || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, k) => {
    const key = String(k).toLowerCase();
    if (key.startsWith('custom.')) { const v = lead.custom_fields?.[key.slice(7)]; return v == null ? '' : String(v); }
    return key in map ? map[key] : m;
  });
};

/** Available merge fields for the editor's field picker. */
export const MERGE_FIELDS: { token: string; label: string }[] = [
  { token: '{{first_name}}', label: 'First name' },
  { token: '{{last_name}}', label: 'Last name' },
  { token: '{{company}}', label: 'Company' },
  { token: '{{title}}', label: 'Job title' },
  { token: '{{industry}}', label: 'Industry' },
  { token: '{{location}}', label: 'Location' },
  { token: '{{website}}', label: 'Website' },
  { token: '{{linkedin}}', label: 'LinkedIn' },
  { token: '{{source}}', label: 'Lead source' },
  { token: '{{company_size}}', label: 'Company size' },
  { token: '{{phone}}', label: 'Phone' },
  { token: '{{your_name}}', label: 'Your name' },
];
const nl2br = (s: string): string => /<(p|br|div|ul|ol|table|a|strong|em|span|h[1-6])\b/i.test(s || '') ? (s || '') : (s || '').replace(/\n/g, '<br>');

export interface CampaignStep {
  id: string;
  sequence_id: string;
  step_number: number;
  subject: string;
  subject_variants: string[];
  body_html: string;
  body_variants: string[];
  delay_days: number;
}

/** List the workspace's campaigns (newest first) with a step count each. */
export async function listCampaigns(userId: string): Promise<Campaign[]> {
  // Membership-based workspace + business scoping (business filter is dormant
  // until the multi_business flag is enabled — same gating as leads).
  const workspaceId = await resolveWorkspaceId(userId);
  const { data, error } = await scopeBusiness(
    supabase.from('email_sequences')
      .select('id,name,description,status,goal,tone,total_leads,total_sent,total_opened,total_clicked,ai_personalize,ab_auto_optimize,send_best_time,send_window_start,send_window_end,send_weekdays_only,send_timezone,created_at')
      .eq('workspace_id', workspaceId)
  ).order('created_at', { ascending: false });
  if (error || !data) return [];
  const campaigns = data as Campaign[];
  const ids = campaigns.map(c => c.id);
  if (ids.length) {
    const { data: steps } = await supabase.from('sequence_steps').select('sequence_id').in('sequence_id', ids);
    const counts = new Map<string, number>();
    for (const s of (steps ?? []) as { sequence_id: string }[]) counts.set(s.sequence_id, (counts.get(s.sequence_id) ?? 0) + 1);
    for (const c of campaigns) c.step_count = counts.get(c.id) ?? 0;
  }
  return campaigns;
}

export async function getSteps(sequenceId: string): Promise<CampaignStep[]> {
  const { data } = await supabase.from('sequence_steps')
    .select('id,sequence_id,step_number,subject,subject_variants,body_html,body_variants,delay_days')
    .eq('sequence_id', sequenceId)
    .order('step_number', { ascending: true });
  return (data ?? []) as CampaignStep[];
}

export interface VariantStat { step: number; variant: number; sent: number; opened: number; clicked: number; replied: number }

/** A/B results: sent/opened/clicked/replied per (step, subject variant). */
export async function getVariantStats(campaignId: string): Promise<VariantStat[]> {
  const { data } = await supabase.rpc('campaign_variant_stats', { p_campaign_id: campaignId });
  return (data ?? []).map((r: Record<string, number>) => ({
    step: Number(r.step), variant: Number(r.variant),
    sent: Number(r.sent), opened: Number(r.opened), clicked: Number(r.clicked), replied: Number(r.replied ?? 0),
  }));
}

export async function getEnrolledCount(sequenceId: string): Promise<number> {
  const { count } = await supabase.from('sequence_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('sequence_id', sequenceId);
  return count ?? 0;
}

export interface EnrolledLead {
  enrollmentId: string;
  leadId: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
}

/** The campaign's target audience — the leads enrolled in it. */
export async function getEnrolledLeads(sequenceId: string): Promise<EnrolledLead[]> {
  const { data } = await supabase.from('sequence_enrollments')
    .select('id, lead_id, status, leads(first_name, last_name, primary_email, company)')
    .eq('sequence_id', sequenceId)
    .order('enrolled_at', { ascending: false });
  type Row = { id: string; lead_id: string; status: string; leads: { first_name: string | null; last_name: string | null; primary_email: string | null; company: string | null } | null };
  return ((data ?? []) as unknown as Row[]).map(r => ({
    enrollmentId: r.id,
    leadId: r.lead_id,
    status: r.status,
    name: [r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(' ') || (r.leads?.primary_email ?? 'Unknown lead'),
    email: r.leads?.primary_email ?? '',
    company: r.leads?.company ?? null,
  }));
}

export interface LeadHit { id: string; name: string; email: string; company: string | null }

/** Search the user's leads by name/email/company to add to a campaign. */
export async function searchLeadsForCampaign(userId: string, query: string, excludeIds: string[]): Promise<LeadHit[]> {
  // Strip characters that would break the PostgREST or() filter grammar.
  const term = query.trim().replace(/[,()]/g, ' ').trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const { data } = await supabase.from('leads')
    .select('id, first_name, last_name, primary_email, company')
    .eq('client_id', userId)
    .or(`first_name.ilike.${like},last_name.ilike.${like},primary_email.ilike.${like},company.ilike.${like}`)
    .limit(20);
  const exclude = new Set(excludeIds);
  return ((data ?? []) as { id: string; first_name: string | null; last_name: string | null; primary_email: string | null; company: string | null }[])
    .filter(l => !exclude.has(l.id))
    .slice(0, 8)
    .map(l => ({
      id: l.id,
      name: [l.first_name, l.last_name].filter(Boolean).join(' ') || (l.primary_email ?? 'Unknown lead'),
      email: l.primary_email ?? '',
      company: l.company ?? null,
    }));
}

/** Enroll a lead into a campaign (no-op if already enrolled). Returns the new
 *  enrollment id, or null if it was already enrolled. */
export async function addLeadToCampaign(sequenceId: string, userId: string, leadId: string): Promise<string | null> {
  const { data: existing } = await supabase.from('sequence_enrollments')
    .select('id').eq('sequence_id', sequenceId).eq('lead_id', leadId).maybeSingle();
  if (existing) return null;
  const workspaceId = await resolveWorkspaceId(userId);
  const { data, error } = await supabase.from('sequence_enrollments')
    .insert({ sequence_id: sequenceId, lead_id: leadId, workspace_id: workspaceId, business_id: activeBusinessId(), status: 'active', current_step: 0 })
    .select('id').single();
  if (error || !data) return null;
  const { count } = await supabase.from('sequence_enrollments')
    .select('id', { count: 'exact', head: true }).eq('sequence_id', sequenceId);
  await supabase.from('email_sequences').update({ total_leads: count ?? 0 }).eq('id', sequenceId);
  return data.id;
}

/** Remove a lead from the campaign audience and keep total_leads in sync. */
export async function removeEnrollment(enrollmentId: string, sequenceId: string): Promise<void> {
  await supabase.from('sequence_enrollments').delete().eq('id', enrollmentId);
  const { count } = await supabase.from('sequence_enrollments')
    .select('id', { count: 'exact', head: true }).eq('sequence_id', sequenceId);
  await supabase.from('email_sequences').update({ total_leads: count ?? 0 }).eq('id', sequenceId);
}

export async function updateCampaign(id: string, patch: Partial<Pick<Campaign, 'name' | 'description' | 'status' | 'goal' | 'tone' | 'ai_personalize' | 'ab_auto_optimize' | 'send_best_time' | 'send_window_start' | 'send_window_end' | 'send_weekdays_only' | 'send_timezone'>>): Promise<string | null> {
  const { error } = await supabase.from('email_sequences').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  return error?.message ?? null;
}

export async function addStep(sequenceId: string, step: { subject: string; body_html: string; delay_days: number; step_number: number; subject_variants?: string[]; body_variants?: string[] }): Promise<CampaignStep | null> {
  const { data, error } = await supabase.from('sequence_steps')
    .insert({ sequence_id: sequenceId, ...step })
    .select('id,sequence_id,step_number,subject,subject_variants,body_html,body_variants,delay_days').single();
  if (error || !data) return null;
  return data as CampaignStep;
}

export async function updateStep(id: string, patch: Partial<Pick<CampaignStep, 'subject' | 'subject_variants' | 'body_html' | 'body_variants' | 'delay_days' | 'step_number'>>): Promise<string | null> {
  const { error } = await supabase.from('sequence_steps').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  return error?.message ?? null;
}

export async function deleteStep(id: string): Promise<void> {
  await supabase.from('sequence_steps').delete().eq('id', id);
}

/** Delete a campaign and its steps + enrollments (no FK cascade on these). */
export async function deleteCampaign(id: string): Promise<void> {
  await supabase.from('sequence_steps').delete().eq('sequence_id', id);
  await supabase.from('sequence_enrollments').delete().eq('sequence_id', id);
  await supabase.from('email_sequences').delete().eq('id', id);
}

/** The current user's business profile (used as AI context for send + preview). */
async function getMyBusinessProfile(): Promise<Record<string, unknown> | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const { data } = await supabase.from('profiles').select('businessProfile').eq('id', user.id).single();
  return (data?.businessProfile as Record<string, unknown> | null) ?? undefined;
}

/** Verbatim/mail-merge preview from lead FIELDS (no DB fetch) — deterministic. */
export function previewVerbatimFields(templateSubject: string, templateBody: string, lead: MergeLead): { subject: string; body_html: string } {
  return { subject: mergeClient(templateSubject, lead), body_html: nl2br(mergeClient(templateBody, lead)) };
}

/** Verbatim/mail-merge preview — deterministic {{field}} substitution, no AI. */
export async function previewVerbatimForLead(step: CampaignStep, leadId: string): Promise<{ subject: string; body_html: string } | { error: string }> {
  const { data: lead } = await supabase.from('leads')
    .select('first_name, last_name, company, title, industry, location, website, linkedin_url, source, company_size, primary_phone, primary_email, custom_fields')
    .eq('id', leadId).single();
  if (!lead) return { error: 'Lead not found.' };
  const l: MergeLead = {
    name: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
    company: lead.company ?? undefined, title: lead.title ?? undefined, industry: lead.industry ?? undefined,
    location: lead.location ?? undefined, website: lead.website ?? undefined, linkedin: lead.linkedin_url ?? undefined,
    source: lead.source ?? undefined, company_size: lead.company_size ?? undefined,
    phone: lead.primary_phone ?? undefined, email: lead.primary_email ?? undefined,
    custom_fields: (lead.custom_fields as Record<string, unknown> | null) ?? undefined,
  };
  return { subject: mergeClient(step.subject, l), body_html: nl2br(mergeClient(step.body_html, l)) };
}

export interface PreviewLeadFields {
  name?: string; company?: string | null; title?: string | null; industry?: string | null;
  score?: number | null; insights?: string | null; knowledgeBase?: unknown;
  location?: string | null; website?: string | null; linkedin?: string | null;
  source?: string | null; company_size?: string | null; custom_fields?: unknown;
}

/** Shared AI preview: runs the SAME prompt as the send (preview-sequence-email).
 *  Takes lead FIELDS directly (works for saved campaigns AND ad-hoc leads). */
export async function previewEmail(p: {
  templateSubject: string; templateBody: string; stepIndex: number;
  lead: PreviewLeadFields; tone?: string; goal?: string;
}): Promise<{ subject: string; body_html: string } | { error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Session expired — please sign in again.' };
  const businessProfile = await getMyBusinessProfile();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-sequence-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      template_subject: p.templateSubject, template_body: p.templateBody, step_index: p.stepIndex,
      lead: p.lead,
      config: { tone: p.tone ?? 'professional', goal: p.goal ?? '', businessProfile },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) return { error: data.error || `Preview failed (HTTP ${res.status})` };
  return { subject: data.subject, body_html: data.body_html };
}

/** Generate the AI-personalized email a lead would receive for a step — same
 *  prompt as the send, so it's an accurate preview. */
export async function previewStepForLead(
  campaign: Campaign, step: CampaignStep, leadId: string,
): Promise<{ subject: string; body_html: string } | { error: string }> {
  const { data: lead } = await supabase.from('leads')
    .select('first_name, last_name, company, title, industry, score, insights, knowledgeBase, location, website, linkedin_url, source, company_size, custom_fields')
    .eq('id', leadId).single();
  if (!lead) return { error: 'Lead not found.' };
  return previewEmail({
    templateSubject: step.subject, templateBody: step.body_html, stepIndex: step.step_number - 1,
    lead: {
      name: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
      company: lead.company, title: lead.title, industry: lead.industry,
      score: lead.score, insights: lead.insights, knowledgeBase: lead.knowledgeBase,
      location: lead.location, website: lead.website, linkedin: lead.linkedin_url,
      source: lead.source, company_size: lead.company_size, custom_fields: lead.custom_fields,
    },
    tone: campaign.tone ?? 'professional', goal: campaign.goal ?? '',
  });
}

/** Launch a saved campaign: enrolled leads + steps → start-email-sequence-run. */
export async function launchCampaign(campaign: Campaign): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const steps = await getSteps(campaign.id);
  if (steps.length === 0) return { ok: false, error: 'Add at least one email step before sending.' };

  const { data: enr } = await supabase.from('sequence_enrollments')
    .select('lead_id, leads(id, primary_email, first_name, last_name, company, score, status, insights, industry, title, location, website, linkedin_url, source, company_size, primary_phone, custom_fields, knowledgeBase)')
    .eq('sequence_id', campaign.id);
  const leads = (enr ?? [])
    .map(e => (e as unknown as { leads: Record<string, unknown> | null }).leads)
    .filter((l): l is Record<string, unknown> => Boolean(l && (l as { primary_email?: string }).primary_email))
    .map(l => ({
      id: l.id, email: l.primary_email,
      name: [l.first_name, l.last_name].filter(Boolean).join(' '),
      company: l.company, score: l.score, status: l.status,
      insights: l.insights, industry: l.industry, title: l.title,
      location: l.location, website: l.website, linkedin: l.linkedin_url,
      source: l.source, company_size: l.company_size, phone: l.primary_phone,
      custom_fields: l.custom_fields, knowledgeBase: l.knowledgeBase,
    }));
  if (leads.length === 0) return { ok: false, error: 'No enrolled leads with a valid email.' };

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, error: 'Session expired — please refresh.' };

  const businessProfile = await getMyBusinessProfile();
  const sendWindow = (campaign.send_window_start != null && campaign.send_window_end != null)
    ? { start: campaign.send_window_start, end: campaign.send_window_end, weekdaysOnly: campaign.send_weekdays_only, timezone: campaign.send_timezone ?? 'UTC' }
    : undefined;
  const payload = {
    leads,
    steps: steps.map(s => ({ stepIndex: s.step_number, delayDays: s.delay_days, subject: s.subject, subjectVariants: s.subject_variants, body: s.body_html, bodyVariants: s.body_variants })),
    config: { tone: campaign.tone ?? 'professional', goal: campaign.goal ?? '', sendMode: 'auto', campaignId: campaign.id, businessProfile, aiPersonalize: campaign.ai_personalize, sendWindow, sendBestTime: campaign.send_best_time },
  };
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-email-sequence-run`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: `Send failed (HTTP ${res.status}): ${(await res.text()).slice(0, 160)}` };
  const data = await res.json() as { items_total?: number };
  await updateCampaign(campaign.id, { status: 'active' });
  return { ok: true, total: data.items_total ?? leads.length * steps.length };
}
