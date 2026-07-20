// AuraEngine/lib/deals.ts
//
// Opportunities / deals (deals table). A deal gives the pipeline real value and
// forecast on top of a lead. RLS: select/update/delete require
// is_workspace_member(workspace_id); insert also requires created_by = auth.uid().
import { supabase } from './supabase';
import { resolveWorkspaceId } from './tenancy';

export type DealStage = 'discovery' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export const DEAL_STAGES: { key: DealStage; label: string; defaultProbability: number }[] = [
  { key: 'discovery', label: 'Discovery', defaultProbability: 10 },
  { key: 'qualified', label: 'Qualified', defaultProbability: 25 },
  { key: 'proposal', label: 'Proposal', defaultProbability: 50 },
  { key: 'negotiation', label: 'Negotiation', defaultProbability: 75 },
  { key: 'won', label: 'Won', defaultProbability: 100 },
  { key: 'lost', label: 'Lost', defaultProbability: 0 },
];

export interface Deal {
  id: string;
  title: string;
  valueAmount: number;
  currency: string;
  stage: DealStage;
  probability: number;
  expectedCloseDate: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  notes: string | null;
  leadId: string | null;
  createdAt: string;
}

const COLS = 'id, title, value_amount, currency, stage, probability, expected_close_date, won_at, lost_at, lost_reason, notes, lead_id, created_at';

function map(r: Record<string, unknown>): Deal {
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    valueAmount: Number(r.value_amount ?? 0),
    currency: (r.currency as string) ?? 'USD',
    stage: (r.stage as DealStage) ?? 'discovery',
    probability: Number(r.probability ?? 0),
    expectedCloseDate: (r.expected_close_date as string) ?? null,
    wonAt: (r.won_at as string) ?? null,
    lostAt: (r.lost_at as string) ?? null,
    lostReason: (r.lost_reason as string) ?? null,
    notes: (r.notes as string) ?? null,
    leadId: (r.lead_id as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function listDealsForLead(leadId: string): Promise<Deal[]> {
  const { data } = await supabase
    .from('deals')
    .select(COLS)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(map);
}

export interface DealWithLead extends Deal {
  leadName: string | null;
  leadCompany: string | null;
}

/** All deals for the pipeline board. RLS already scopes to the caller's
 *  workspace; pass a businessId to scope to the active business. */
export async function listDeals(businessId: string | null): Promise<DealWithLead[]> {
  let q = supabase
    .from('deals')
    .select(`${COLS}, lead:lead_id(first_name, last_name, company)`)
    .order('created_at', { ascending: false });
  if (businessId) q = q.eq('business_id', businessId);
  const { data } = await q;
  return (data ?? []).map(r => {
    const lead = (r as { lead?: { first_name?: string; last_name?: string; company?: string } | null }).lead;
    const name = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : '';
    return { ...map(r), leadName: name || null, leadCompany: lead?.company ?? null };
  });
}

export interface DealForecast {
  openCount: number;
  openValue: number;      // sum of open (not won/lost) deal values
  weightedValue: number;  // sum of value × probability for open deals
  wonCount: number;
  wonValue: number;
  lostCount: number;
  winRate: number;        // won / (won + lost), 0..1
}

/** Pure forecast aggregation over a set of deals. */
export function computeForecast(deals: Deal[]): DealForecast {
  const open = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
  const won = deals.filter(d => d.stage === 'won');
  const lost = deals.filter(d => d.stage === 'lost');
  const openValue = open.reduce((s, d) => s + d.valueAmount, 0);
  const weightedValue = open.reduce((s, d) => s + d.valueAmount * d.probability / 100, 0);
  const wonValue = won.reduce((s, d) => s + d.valueAmount, 0);
  const closed = won.length + lost.length;
  return {
    openCount: open.length,
    openValue,
    weightedValue: Math.round(weightedValue),
    wonCount: won.length,
    wonValue,
    lostCount: lost.length,
    winRate: closed > 0 ? won.length / closed : 0,
  };
}

export interface NewDeal {
  title: string;
  valueAmount?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  expectedCloseDate?: string | null;
  leadId?: string | null;
  businessId?: string | null;
}

export async function createDeal(userId: string, deal: NewDeal): Promise<Deal | null> {
  const workspaceId = await resolveWorkspaceId(userId);
  const stage = deal.stage ?? 'discovery';
  const probability = deal.probability ?? (DEAL_STAGES.find(s => s.key === stage)?.defaultProbability ?? 10);
  const { data, error } = await supabase
    .from('deals')
    .insert({
      workspace_id: workspaceId,
      business_id: deal.businessId ?? null,
      lead_id: deal.leadId ?? null,
      created_by: userId,
      assigned_to: userId,
      title: deal.title,
      value_amount: deal.valueAmount ?? 0,
      currency: deal.currency ?? 'USD',
      stage,
      probability,
      expected_close_date: deal.expectedCloseDate ?? null,
    })
    .select(COLS)
    .single();
  if (error || !data) { console.error('createDeal failed:', error?.message); return null; }
  return map(data);
}

// Move a deal to a stage. Stamps won_at/lost_at and snaps probability to the
// stage default (100 for won, 0 for lost) unless an explicit probability is given.
export async function setDealStage(id: string, stage: DealStage, opts?: { probability?: number; lostReason?: string | null }): Promise<Deal | null> {
  const patch: Record<string, unknown> = {
    stage,
    probability: opts?.probability ?? (DEAL_STAGES.find(s => s.key === stage)?.defaultProbability ?? 10),
    won_at: stage === 'won' ? new Date().toISOString() : null,
    lost_at: stage === 'lost' ? new Date().toISOString() : null,
    lost_reason: stage === 'lost' ? (opts?.lostReason ?? null) : null,
  };
  const { data, error } = await supabase.from('deals').update(patch).eq('id', id).select(COLS).single();
  if (error || !data) { console.error('setDealStage failed:', error?.message); return null; }
  return map(data);
}

export async function deleteDeal(id: string): Promise<boolean> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) console.error('deleteDeal failed:', error.message);
  return !error;
}
