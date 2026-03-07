import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from './supabase';
import { Lead } from '../types';
import { queryClient } from './queryClient';
import { fetchBatchEmailSummary, type BatchEmailSummary } from './emailTracking';

// Canonical columns used by the app — avoids SELECT *
const LEAD_COLUMNS = 'id,client_id,first_name,last_name,primary_email,primary_phone,company,score,status,last_activity,insights,created_at,updated_at,knowledgeBase,emails,phones,linkedin_url,location,title,industry,company_size,source,import_batch_id,imported_at,custom_fields' as const;

/** Normalize DB rows → Lead objects with canonical + computed legacy aliases */
export function normalizeLeads(rows: Record<string, unknown>[]): Lead[] {
  return rows.map(r => {
    const firstName = (r.first_name as string) || '';
    const lastName = (r.last_name as string) || '';
    const primaryEmail = (r.primary_email as string) || '';
    const primaryPhone = (r.primary_phone as string) || '';
    const lastActivity = (r.last_activity as string) || '';
    return {
      ...r,
      first_name: firstName,
      last_name: lastName,
      primary_email: primaryEmail,
      primary_phone: primaryPhone,
      last_activity: lastActivity,
      company: (r.company as string) || '',
      // Legacy aliases (computed, never from DB)
      name: [firstName, lastName].filter(Boolean).join(' '),
      email: primaryEmail,
      lastActivity: lastActivity,
    } as Lead;
  });
}

/** Full display name from canonical fields */
export function leadDisplayName(lead: Pick<Lead, 'first_name' | 'last_name'>): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
}

/** Initials for avatar */
export function leadInitials(lead: Pick<Lead, 'first_name' | 'last_name'>): string {
  return [lead.first_name?.[0], lead.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

/** Fetches all leads for a client with only the columns used by the UI */
export function useLeads(userId: string | undefined) {
  return useQuery<Lead[]>({
    queryKey: ['leads', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('leads').select(LEAD_COLUMNS).eq('client_id', userId).order('score', { ascending: false });
      if (error) throw error;
      return normalizeLeads(data || []);
    },
    enabled: !!userId,
    placeholderData: keepPreviousData,
  });
}

/** Batch email summaries — keyed by userId, auto-derives leadIds from cached leads */
export function useEmailSummaries(userId: string | undefined, leadIds: string[]) {
  return useQuery<Map<string, BatchEmailSummary>>({
    queryKey: ['emailSummaries', userId, leadIds.length],
    queryFn: () => fetchBatchEmailSummary(leadIds),
    enabled: !!userId && leadIds.length > 0,
    staleTime: 2 * 60_000, // 2min — email events don't change fast
    placeholderData: keepPreviousData,
  });
}

/** Social post stats for dashboard */
export function useSocialStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['socialStats', userId],
    queryFn: async () => {
      if (!userId) return { scheduled: 0, published: 0 };
      const { data } = await supabase
        .from('social_posts')
        .select('status')
        .eq('user_id', userId)
        .in('status', ['scheduled', 'completed', 'published']);
      const posts = data || [];
      return {
        scheduled: posts.filter(p => p.status === 'scheduled').length,
        published: posts.filter(p => p.status === 'completed' || p.status === 'published').length,
      };
    },
    enabled: !!userId,
    staleTime: 2 * 60_000,
  });
}

// ── Prefetch helpers (for sidebar hover) ──

/** Prefetch leads + counts for a given user — call on sidebar hover */
export function prefetchPortalData(userId: string | undefined) {
  if (!userId) return;
  queryClient.prefetchQuery({
    queryKey: ['leads', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select(LEAD_COLUMNS).eq('client_id', userId).order('score', { ascending: false });
      if (error) throw error;
      return normalizeLeads(data || []);
    },
    staleTime: 60_000,
  });
  queryClient.prefetchQuery({
    queryKey: ['leadCounts', userId],
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const [todayRes, yesterdayRes, contentRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', userId).gte('created_at', todayStart),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', userId).gte('created_at', yesterdayStart).lt('created_at', todayStart),
        supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      return {
        leadsToday: todayRes.count ?? 0,
        leadsYesterday: yesterdayRes.count ?? 0,
        contentCreated: contentRes.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

/** Fetches lead counts for quick stats — uses head:true to avoid transferring rows */
export function useLeadCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['leadCounts', userId],
    queryFn: async () => {
      if (!userId) return { leadsToday: 0, leadsYesterday: 0, contentCreated: 0 };
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

      const [todayRes, yesterdayRes, contentRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', userId).gte('created_at', todayStart),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', userId).gte('created_at', yesterdayStart).lt('created_at', todayStart),
        supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);

      return {
        leadsToday: todayRes.count ?? 0,
        leadsYesterday: yesterdayRes.count ?? 0,
        contentCreated: contentRes.count ?? 0,
      };
    },
    enabled: !!userId,
  });
}

/** Fetches all leads for admin views (no client filter) */
export function useAllLeads(limit?: number, opts?: { enabled?: boolean }) {
  return useQuery<Lead[]>({
    queryKey: ['allLeads', limit],
    queryFn: async () => {
      let query = supabase.from('leads').select(LEAD_COLUMNS).order('score', { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return normalizeLeads(data || []);
    },
    staleTime: 5 * 60 * 1000, // 5 min — admin view tolerates slightly stale data
    enabled: opts?.enabled ?? true,
  });
}
