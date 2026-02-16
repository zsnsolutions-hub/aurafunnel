import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { Lead } from '../types';

// Columns actually used by the app — avoids SELECT *
const LEAD_COLUMNS = 'id,client_id,name,company,email,score,status,lastActivity,insights,created_at,knowledgeBase' as const;

/** Fetches all leads for a client with only the columns used by the UI */
export function useLeads(userId: string | undefined) {
  return useQuery<Lead[]>({
    queryKey: ['leads', userId],
    queryFn: async () => {
      if (!userId) return [];
      const query = supabase.from('leads').select(LEAD_COLUMNS).eq('client_id', userId).order('score', { ascending: false });
      const { data, error } = await query;

      if (error) {
        // Column may not exist — fall back to SELECT *
        const fallback = await supabase.from('leads').select('*').eq('client_id', userId).order('score', { ascending: false });
        if (fallback.error) throw fallback.error;
        return (fallback.data || []) as Lead[];
      }

      return (data || []) as Lead[];
    },
    enabled: !!userId,
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
export function useAllLeads(limit?: number) {
  return useQuery<Lead[]>({
    queryKey: ['allLeads', limit],
    queryFn: async () => {
      let query = supabase.from('leads').select(LEAD_COLUMNS).order('score', { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;

      if (error) {
        // Column may not exist — fall back to SELECT *
        let fallbackQuery = supabase.from('leads').select('*').order('score', { ascending: false });
        if (limit) fallbackQuery = fallbackQuery.limit(limit);
        const fallback = await fallbackQuery;
        if (fallback.error) throw fallback.error;
        return (fallback.data || []) as Lead[];
      }

      return (data || []) as Lead[];
    },
  });
}
