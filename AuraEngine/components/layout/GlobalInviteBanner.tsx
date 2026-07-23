import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { myPendingInvites, acceptInvite as acceptWorkspaceInvite, WorkspaceInvite } from '../../lib/invitations';
import { myPendingBoardInvites, acceptInvite as acceptBoardInvite, FlowInvite } from '../../pages/portal/team-hub/teamHubApi';
import { UsersIcon } from '../Icons';

interface GlobalInviteBannerProps {
  user: User;
}

type PendingBoardInvite = FlowInvite & { token: string; board_name?: string };

// Shows pending WORKSPACE and TEAMHUB-BOARD invitations addressed to the signed-in
// user's email and accepts each via its secure SECURITY DEFINER RPC (token + email
// verified server-side). Unifies the previously split team-invite banners.
const GlobalInviteBanner: React.FC<GlobalInviteBannerProps> = ({ user }) => {
  const [invites, setInvites] = useState<(WorkspaceInvite & { token: string })[]>([]);
  const [boardInvites, setBoardInvites] = useState<PendingBoardInvite[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    if (!user.email) return;
    let cancelled = false;
    myPendingInvites(user.email).then(list => { if (!cancelled) setInvites(list); }).catch(() => {});
    myPendingBoardInvites(user.email)
      .then(list => { if (!cancelled) setBoardInvites(list.filter((i): i is PendingBoardInvite => !!i.token)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user.email]);

  const visible = invites.filter(i => !dismissed.has(i.id));
  const visibleBoards = boardInvites.filter(i => !dismissed.has(i.id));
  if (visible.length === 0 && visibleBoards.length === 0) return null;

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

  const handleAcceptBoard = async (invite: PendingBoardInvite) => {
    setAccepting(invite.id);
    try {
      await acceptBoardInvite(invite.token);
      setBoardInvites(prev => prev.filter(i => i.id !== invite.id));
      // The joined board appears in the user's Team Hub list after reload.
      navigate('/portal/team-hub', { replace: true });
      window.location.reload();
    } catch (err) {
      console.error('Failed to accept board invite:', err);
    } finally {
      setAccepting(null);
    }
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

      {visibleBoards.map(invite => (
        <div key={invite.id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <UsersIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-900">
                You've been invited to collaborate on {invite.board_name ? `'${invite.board_name}'` : 'a board'}
              </p>
              <p className="text-xs text-emerald-600">
                Role: <span className="font-bold capitalize">{invite.role || 'member'}</span> · Team Hub board
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
              onClick={() => handleAcceptBoard(invite)}
              disabled={accepting === invite.id}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-lg shadow-emerald-200 transition-all disabled:opacity-60"
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
