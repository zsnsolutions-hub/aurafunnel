// AuraEngine/lib/repPerformance.ts
//
// Per-rep (workspace member) sales performance. Aggregates real signals —
// assigned leads, deals (open/won/lost + value), logged activities and completed
// tasks — per member. RLS already scopes every query to the caller's workspace;
// pass a businessId to scope to the active business. Deterministic, no AI.
import { supabase } from './supabase';
import { listWorkspaceMembers } from './members';

export interface RepStats {
  userId: string;
  name: string;
  email: string;
  leadsAssigned: number;
  openDeals: number;
  openValue: number;
  wonDeals: number;
  wonValue: number;
  lostDeals: number;
  winRate: number;      // won / (won + lost), 0..1
  activities: number;   // logged in the selected window
  tasksCompleted: number;
}

/** activityWindowDays = null → all-time. */
export async function getRepPerformance(
  userId: string,
  businessId: string | null,
  activityWindowDays: number | null = 30,
): Promise<RepStats[]> {
  const members = await listWorkspaceMembers(userId);
  const byId = new Map<string, RepStats>();
  for (const m of members) {
    byId.set(m.userId, {
      userId: m.userId, name: m.name, email: m.email,
      leadsAssigned: 0, openDeals: 0, openValue: 0, wonDeals: 0, wonValue: 0,
      lostDeals: 0, winRate: 0, activities: 0, tasksCompleted: 0,
    });
  }

  // Assigned leads (only fetch assigned rows — most leads are unassigned).
  {
    let q = supabase.from('leads').select('assigned_to').not('assigned_to', 'is', null);
    if (businessId) q = q.eq('business_id', businessId);
    const { data } = await q;
    for (const r of (data ?? []) as { assigned_to: string }[]) {
      const rep = byId.get(r.assigned_to);
      if (rep) rep.leadsAssigned++;
    }
  }

  // Deals by assignee + stage.
  {
    let q = supabase.from('deals').select('assigned_to, stage, value_amount').not('assigned_to', 'is', null);
    if (businessId) q = q.eq('business_id', businessId);
    const { data } = await q;
    for (const d of (data ?? []) as { assigned_to: string; stage: string; value_amount: number }[]) {
      const rep = byId.get(d.assigned_to);
      if (!rep) continue;
      const v = Number(d.value_amount ?? 0);
      if (d.stage === 'won') { rep.wonDeals++; rep.wonValue += v; }
      else if (d.stage === 'lost') { rep.lostDeals++; }
      else { rep.openDeals++; rep.openValue += v; }
    }
  }

  // Logged activities in the window.
  {
    let q = supabase.from('lead_activities').select('author_id').not('author_id', 'is', null);
    if (businessId) q = q.eq('business_id', businessId);
    if (activityWindowDays != null) {
      const since = new Date(Date.now() - activityWindowDays * 86400000).toISOString();
      q = q.gte('occurred_at', since);
    }
    const { data } = await q;
    for (const a of (data ?? []) as { author_id: string }[]) {
      const rep = byId.get(a.author_id);
      if (rep) rep.activities++;
    }
  }

  // Completed tasks.
  {
    let q = supabase.from('tasks').select('assigned_to').eq('status', 'done').not('assigned_to', 'is', null);
    if (businessId) q = q.eq('business_id', businessId);
    const { data } = await q;
    for (const t of (data ?? []) as { assigned_to: string }[]) {
      const rep = byId.get(t.assigned_to);
      if (rep) rep.tasksCompleted++;
    }
  }

  for (const rep of byId.values()) {
    const closed = rep.wonDeals + rep.lostDeals;
    rep.winRate = closed > 0 ? rep.wonDeals / closed : 0;
  }

  return [...byId.values()].sort((a, b) => b.wonValue - a.wonValue || b.openValue - a.openValue || b.leadsAssigned - a.leadsAssigned);
}
