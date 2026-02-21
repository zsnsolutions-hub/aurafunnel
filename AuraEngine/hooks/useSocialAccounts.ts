// File: AuraEngine/hooks/useSocialAccounts.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface SocialAccount {
  id: string;
  user_id: string;
  provider: 'meta' | 'linkedin';
  meta_page_id: string | null;
  meta_page_name: string | null;
  meta_ig_user_id: string | null;
  meta_ig_username: string | null;
  linkedin_member_urn: string | null;
  linkedin_org_urn: string | null;
  linkedin_org_name: string | null;
  token_expires_at: string | null;
  created_at: string;
}

export interface PublishTarget {
  channel: 'facebook_page' | 'instagram' | 'linkedin_member' | 'linkedin_org';
  target_id: string;
  target_label: string;
  account_id: string;
}

export function useSocialAccounts(userId: string | undefined) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      setAccounts(data || []);
    } catch (err) {
      console.error('Failed to fetch social accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const availableTargets: PublishTarget[] = [];
  for (const acc of accounts) {
    if (acc.provider === 'meta') {
      if (acc.meta_page_id) {
        availableTargets.push({
          channel: 'facebook_page',
          target_id: acc.meta_page_id,
          target_label: acc.meta_page_name || `Page ${acc.meta_page_id}`,
          account_id: acc.id,
        });
      }
      if (acc.meta_ig_user_id) {
        availableTargets.push({
          channel: 'instagram',
          target_id: acc.meta_ig_user_id,
          target_label: acc.meta_ig_username ? `@${acc.meta_ig_username}` : `IG ${acc.meta_ig_user_id}`,
          account_id: acc.id,
        });
      }
    } else if (acc.provider === 'linkedin') {
      if (acc.linkedin_member_urn) {
        availableTargets.push({
          channel: 'linkedin_member',
          target_id: acc.linkedin_member_urn,
          target_label: 'LinkedIn Profile',
          account_id: acc.id,
        });
      }
      if (acc.linkedin_org_urn) {
        availableTargets.push({
          channel: 'linkedin_org',
          target_id: acc.linkedin_org_urn,
          target_label: acc.linkedin_org_name || 'LinkedIn Organization',
          account_id: acc.id,
        });
      }
    }
  }

  const hasMetaConnected = accounts.some(a => a.provider === 'meta');
  const hasLinkedInConnected = accounts.some(a => a.provider === 'linkedin');

  const disconnectAccount = async (accountId: string) => {
    await supabase.from('social_accounts').delete().eq('id', accountId);
    await fetchAccounts();
  };

  return {
    accounts,
    availableTargets,
    hasMetaConnected,
    hasLinkedInConnected,
    loading,
    refetch: fetchAccounts,
    disconnectAccount,
  };
}
