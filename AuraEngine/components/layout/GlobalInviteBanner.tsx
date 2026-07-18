import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { myPendingInvites, acceptInvite as acceptWorkspaceInvite, WorkspaceInvite } from '../../lib/invitations';
import { UsersIcon } from '../Icons';

interface GlobalInviteBannerProps {
  user: User;
}

// Shows pending WORKSPACE invitations addressed to the signed-in user's email
// and accepts them via the secure accept_workspace_invite RPC (token + email
// verified server-side). Unifies the previously split team-invite banners.
const GlobalInviteBanner: React.FC<GlobalInviteBannerProps> = ({ user }) => {
  const [invites, setInvites] = useState<(WorkspaceInvite & { token: string })[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    if (!user.email) return;
    let cancelled = false;
    myPendingInvites(user.email).then(list => { if (!cancelled) setInvites(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user.email]);

  const visible = invites.filter(i => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  const handleAccept = async (invite: WorkspaceInvite & { token: string }) => {
    setAccepting(invite.id);
    const res = await acceptWorkspaceInvite(invite.token);
    setAccepting(null);
    if ('error' in res) { console.error('Failed to accept invite:', res.error); return; }
    setInvites(prev => prev.filter(i => i.id !== invite.id));
    // Reload so the newly-joined workspace/business is picked up everywhere.
    navigate('/portal', { replace: true });
    window.location.reload();
  };

  return (
    <div className="space-y-3 mb-5">
      {visible.map(invite => (
        <div key={invite.id} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
              <UsersIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-900">
                You've been invited to join {invite.name ? `'${invite.name}'` : 'a workspace'}
              </p>
              <p className="text-xs text-indigo-600">
                Role: <span className="font-bold capitalize">{invite.role || 'member'}</span>
                {invite.business_id ? ' · with access to a business' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDismissed(prev => new Set(prev).add(invite.id))}
              disabled={accepting === invite.id}
              className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg bg-white transition-all disabled:opacity-40"
            >
              Dismiss
            </button>
            <button
              onClick={() => handleAccept(invite)}
              disabled={accepting === invite.id}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-200 transition-all disabled:opacity-60"
            >
              {accepting === invite.id ? 'Joining...' : 'Accept Invite'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GlobalInviteBanner;
