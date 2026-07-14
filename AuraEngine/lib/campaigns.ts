// AuraEngine/lib/campaigns.ts
//
// Data layer for the Campaigns page (saved email sequences). CRUD over
// email_sequences + sequence_steps, and launch() which assembles the enrolled
// leads + steps into the start-email-sequence-run payload (same contract as
// QuickLaunch) to actually begin sending.

import { supabase } from './supabase';

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
  created_at: string;
  step_count?: number;
}

export interface CampaignStep {
  id: string;
  sequence_id: string;
  step_number: number;
  subject: string;
  body_html: string;
  delay_days: number;
}

/** List the workspace's campaigns (newest first) with a step count each. */
export async function listCampaigns(userId: string): Promise<Campaign[]> {
  const { data, error } = await supabase.from('email_sequences')
    .select('id,name,description,status,goal,tone,total_leads,total_sent,total_opened,total_clicked,created_at')
    .eq('workspace_id', userId)
    .order('created_at', { ascending: false });
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
    .select('id,sequence_id,step_number,subject,body_html,delay_days')
    .eq('sequence_id', sequenceId)
    .order('step_number', { ascending: true });
  return (data ?? []) as CampaignStep[];
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

/** Remove a lead from the campaign audience and keep total_leads in sync. */
export async function removeEnrollment(enrollmentId: string, sequenceId: string): Promise<void> {
  await supabase.from('sequence_enrollments').delete().eq('id', enrollmentId);
  const { count } = await supabase.from('sequence_enrollments')
    .select('id', { count: 'exact', head: true }).eq('sequence_id', sequenceId);
  await supabase.from('email_sequences').update({ total_leads: count ?? 0 }).eq('id', sequenceId);
}

export async function updateCampaign(id: string, patch: Partial<Pick<Campaign, 'name' | 'description' | 'status' | 'goal' | 'tone'>>): Promise<string | null> {
  const { error } = await supabase.from('email_sequences').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  return error?.message ?? null;
}

export async function addStep(sequenceId: string, step: { subject: string; body_html: string; delay_days: number; step_number: number }): Promise<CampaignStep | null> {
  const { data, error } = await supabase.from('sequence_steps')
    .insert({ sequence_id: sequenceId, ...step })
    .select('id,sequence_id,step_number,subject,body_html,delay_days').single();
  if (error || !data) return null;
  return data as CampaignStep;
}

export async function updateStep(id: string, patch: Partial<Pick<CampaignStep, 'subject' | 'body_html' | 'delay_days' | 'step_number'>>): Promise<string | null> {
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

/** Launch a saved campaign: enrolled leads + steps → start-email-sequence-run. */
export async function launchCampaign(campaign: Campaign): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const steps = await getSteps(campaign.id);
  if (steps.length === 0) return { ok: false, error: 'Add at least one email step before sending.' };

  const { data: enr } = await supabase.from('sequence_enrollments')
    .select('lead_id, leads(id, primary_email, first_name, last_name, company, score, status, insights, industry, title)')
    .eq('sequence_id', campaign.id);
  const leads = (enr ?? [])
    .map(e => (e as unknown as { leads: Record<string, unknown> | null }).leads)
    .filter((l): l is Record<string, unknown> => Boolean(l && (l as { primary_email?: string }).primary_email))
    .map(l => ({
      id: l.id, email: l.primary_email,
      name: [l.first_name, l.last_name].filter(Boolean).join(' '),
      company: l.company, score: l.score, status: l.status,
      insights: l.insights, industry: l.industry, title: l.title,
    }));
  if (leads.length === 0) return { ok: false, error: 'No enrolled leads with a valid email.' };

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, error: 'Session expired — please refresh.' };

  const payload = {
    leads,
    steps: steps.map(s => ({ stepIndex: s.step_number, delayDays: s.delay_days, subject: s.subject, body: s.body_html })),
    config: { tone: campaign.tone ?? 'professional', goal: campaign.goal ?? '', sendMode: 'auto' },
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
