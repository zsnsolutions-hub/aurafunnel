// AuraEngine/lib/leadActivities.ts
//
// Persistent manual activity log (lead_activities) — the freeform call/email/
// meeting/note entries logged from the Leads list "Log Activity" modal.
// Previously UI-only (lost on reload). RLS: select requires
// is_workspace_member(workspace_id); insert also requires author_id = auth.uid().
import { supabase } from './supabase';
import { resolveWorkspaceId } from './tenancy';

export type ActivityKind = 'call' | 'email' | 'meeting' | 'note';

export interface LeadActivity {
  id: string;
  type: ActivityKind;
  details: string;
  outcome: string | null;
  occurredAt: string;
  authorId: string | null;
}

const COLS = 'id, type, details, outcome, occurred_at, author_id';

function map(r: Record<string, unknown>): LeadActivity {
  return {
    id: r.id as string,
    type: (r.type as ActivityKind) ?? 'note',
    details: (r.details as string) ?? '',
    outcome: (r.outcome as string) ?? null,
    occurredAt: r.occurred_at as string,
    authorId: (r.author_id as string) ?? null,
  };
}

export async function listActivities(leadId: string, limit = 50): Promise<LeadActivity[]> {
  const { data } = await supabase
    .from('lead_activities')
    .select(COLS)
    .eq('lead_id', leadId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(map);
}

export interface NewActivity {
  type: ActivityKind;
  details: string;
  outcome?: string | null;
  businessId?: string | null;
}

export async function logActivity(userId: string, leadId: string, a: NewActivity): Promise<LeadActivity | null> {
  const workspaceId = await resolveWorkspaceId(userId);
  const { data, error } = await supabase
    .from('lead_activities')
    .insert({
      lead_id: leadId,
      workspace_id: workspaceId,
      business_id: a.businessId ?? null,
      author_id: userId,
      type: a.type,
      details: a.details,
      outcome: a.outcome ?? null,
    })
    .select(COLS)
    .single();
  if (error || !data) { console.error('logActivity failed:', error?.message); return null; }
  return map(data);
}
