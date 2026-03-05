/**
 * Workspace snapshot — single fetch that bundles commonly-read data.
 *
 * Instead of 5+ parallel queries on every page load, this fetches
 * plan, usage, key counts in one round trip (or parallel batch).
 * Cached for 60s via React Query.
 */

import { supabase } from './supabase';

export interface WorkspaceSnapshot {
  profile: {
    id: string;
    email: string;
    name: string;
    role: string;
    plan: string;
    status: string;
    credits_total: number;
    credits_used: number;
  };
  subscription: {
    plan_name: string;
    status: string;
    expires_at: string | null;
  } | null;
  usage: {
    emails_sent: number;
    contacts_count: number;
    ai_credits_used: number;
  };
  counts: {
    leads: number;
    integrations: number;
    pendingEmails: number;
  };
}

/**
 * Fetch a bundled workspace snapshot. All queries run in parallel.
 * Reduces typical page-load from 5-6 sequential queries to 1 parallel batch.
 */
export async function fetchWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  const [profileRes, subsRes, usageRes, leadsRes, integrationsRes, pendingRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, name, role, plan, status, credits_total, credits_used')
      .eq('id', workspaceId)
      .single(),
    supabase
      .from('subscriptions')
      .select('plan_name, status, expires_at')
      .eq('user_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workspace_usage_counters')
      .select('emails_sent, ai_credits_used')
      .eq('workspace_id', workspaceId)
      .order('date_key', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', workspaceId),
    supabase
      .from('integrations')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', workspaceId)
      .eq('status', 'active'),
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', workspaceId)
      .eq('status', 'pending'),
  ]);

  return {
    profile: profileRes.data ?? {
      id: workspaceId, email: '', name: '', role: 'CLIENT',
      plan: 'free', status: 'active', credits_total: 0, credits_used: 0,
    },
    subscription: subsRes.data ?? null,
    usage: {
      emails_sent: usageRes.data?.emails_sent ?? 0,
      contacts_count: 0,
      ai_credits_used: usageRes.data?.ai_credits_used ?? 0,
    },
    counts: {
      leads: leadsRes.count ?? 0,
      integrations: integrationsRes.count ?? 0,
      pendingEmails: pendingRes.count ?? 0,
    },
  };
}
