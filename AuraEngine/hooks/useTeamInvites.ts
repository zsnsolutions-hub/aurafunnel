import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TeamInvite } from '../types';

interface UseTeamInvitesResult {
  pendingInvites: TeamInvite[];
  acceptInvite: (invite: TeamInvite) => Promise<void>;
  declineInvite: (invite: TeamInvite) => Promise<void>;
  refresh: () => void;
}

export function useTeamInvites(userEmail: string, userId: string): UseTeamInvitesResult {
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;

    const load = async () => {
      // Try with teams join first
      let { data, error } = await supabase
        .from('team_invites')
        .select('*, teams(name)')
        .eq('email', userEmail.toLowerCase())
        .eq('status', 'pending');

      // Fallback: if the join fails (e.g. teams RLS blocks the read), retry without it
      if (error || !data) {
        console.warn('team_invites query with join failed, retrying without join:', error?.message);
        const fallback = await supabase
          .from('team_invites')
          .select('*')
          .eq('email', userEmail.toLowerCase())
          .eq('status', 'pending');
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.error('Failed to load team invites:', error.message);
        return;
      }

      if (!cancelled && data) {
        setPendingInvites(
          data.map((inv: any) => ({
            ...inv,
            team_name: inv.teams?.name || 'Unknown Team',
          }))
        );
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userEmail, version]);

  const acceptInvite = useCallback(async (invite: TeamInvite) => {
    const { error: memberErr } = await supabase
      .from('team_members')
      .insert({ team_id: invite.team_id, user_id: userId, role: invite.role || 'member' });
    if (memberErr) throw memberErr;

    await supabase
      .from('team_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
  }, [userId]);

  const declineInvite = useCallback(async (invite: TeamInvite) => {
    await supabase
      .from('team_invites')
      .update({ status: 'declined' })
      .eq('id', invite.id);

    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
  }, []);

  return { pendingInvites, acceptInvite, declineInvite, refresh };
}
