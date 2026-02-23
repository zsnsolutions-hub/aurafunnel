import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../../types';
import { useTeamInvites } from '../../hooks/useTeamInvites';
import { UsersIcon } from '../Icons';

interface GlobalInviteBannerProps {
  user: User;
}

const GlobalInviteBanner: React.FC<GlobalInviteBannerProps> = ({ user }) => {
  const { pendingInvites, acceptInvite, declineInvite } = useTeamInvites(user.email, user.id);
  const [accepting, setAccepting] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  if (pendingInvites.length === 0) return null;

  const handleAccept = async (invite: typeof pendingInvites[0]) => {
    setAccepting(invite.id);
    try {
      await acceptInvite(invite);
      // Navigate to Team Hub so it loads with fresh team data
      if (location.pathname === '/portal/strategy') {
        // Already on Team Hub — force remount via replace
        navigate('/portal', { replace: true });
        setTimeout(() => navigate('/portal/strategy', { replace: true }), 50);
      } else {
        navigate('/portal/strategy');
      }
    } catch (err) {
      console.error('Failed to accept invite:', err);
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div className="space-y-3 mb-5">
      {pendingInvites.map(invite => (
        <div
          key={invite.id}
          className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
              <UsersIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-900">
                You've been invited to join '{invite.team_name}'
              </p>
              <p className="text-xs text-indigo-600">
                Role: <span className="font-bold capitalize">{invite.role || 'member'}</span> &middot; Collaborate on tasks and notes with your team
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => declineInvite(invite)}
              disabled={accepting === invite.id}
              className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg bg-white transition-all disabled:opacity-40"
            >
              Decline
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
