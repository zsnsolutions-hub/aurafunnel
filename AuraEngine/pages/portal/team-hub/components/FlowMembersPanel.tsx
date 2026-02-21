import React, { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Trash2, Loader2, Mail } from 'lucide-react';
import type { FlowMember, FlowInvite, FlowRole } from '../teamHubApi';
import * as api from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';
import RoleBadge from './RoleBadge';
import RoleSelector from './RoleSelector';

interface FlowMembersPanelProps {
  flowId: string;
  permissions: FlowPermissions;
  onClose: () => void;
}

const FlowMembersPanel: React.FC<FlowMembersPanelProps> = ({ flowId, permissions, onClose }) => {
  const [members, setMembers] = useState<FlowMember[]>([]);
  const [invites, setInvites] = useState<FlowInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FlowRole>('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, inv] = await Promise.all([
        api.fetchFlowMembers(flowId),
        permissions.canManageMembers ? api.fetchFlowInvites(flowId) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvites(inv);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setLoading(false);
    }
  }, [flowId, permissions.canManageMembers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setError('');
    setInviting(true);
    try {
      const { data: { user } } = await (await import('../../../../lib/supabase')).supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await api.inviteToFlow(flowId, email, inviteRole, user.id);
      setInviteEmail('');
      loadData();
    } catch (err: any) {
      setError(err?.message?.includes('duplicate') ? 'This email has already been invited' : (err?.message || 'Failed to send invite'));
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: FlowMember, newRole: FlowRole) => {
    if (member.role === 'owner') return;
    if (newRole === 'owner') return;
    try {
      await api.updateFlowMemberRole(flowId, member.id, newRole);
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m));
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  };

  const handleRemoveMember = async (member: FlowMember) => {
    if (member.role === 'owner') return;
    if (permissions.isAdmin && member.role === 'admin') return;
    try {
      await api.removeFlowMember(flowId, member.id);
      setMembers(prev => prev.filter(m => m.id !== member.id));
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleRevokeInvite = async (invite: FlowInvite) => {
    try {
      await api.revokeInvite(invite.id);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (err) {
      console.error('Failed to revoke invite:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Team Members</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Invite section (owner/admin only) */}
          {permissions.canManageMembers && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Invite by Email</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={inviteEmail}
                    onChange={e => { setInviteEmail(e.target.value); setError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleInvite(); }}
                    placeholder="teammate@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 placeholder-slate-400"
                  />
                </div>
                <RoleSelector value={inviteRole} onChange={setInviteRole} hideOwner />
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {inviting ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                  Invite
                </button>
              </div>
              {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
            </div>
          )}

          {/* Members list */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
              Members ({members.length})
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="text-slate-300 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {members.map(member => (
                  <div key={member.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                      {(member.user_name || member.user_email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{member.user_name || 'Unnamed'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{member.user_email}</p>
                    </div>
                    {permissions.canManageMembers && member.role !== 'owner' ? (
                      <RoleSelector
                        value={member.role}
                        onChange={r => handleRoleChange(member, r)}
                        hideOwner
                      />
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                    {permissions.canManageMembers && member.role !== 'owner' && !(permissions.isAdmin && member.role === 'admin') && (
                      <button
                        onClick={() => handleRemoveMember(member)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        title="Remove member"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending invites (owner/admin only) */}
          {permissions.canManageMembers && invites.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                Pending Invites ({invites.length})
              </p>
              <div className="space-y-2">
                {invites.map(invite => (
                  <div key={invite.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-amber-50/50 border border-amber-100">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-600 shrink-0">
                      <Mail size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{invite.email}</p>
                      <p className="text-[10px] text-slate-400">Pending</p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <button
                      onClick={() => handleRevokeInvite(invite)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      title="Revoke invite"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlowMembersPanel;
