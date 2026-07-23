// AuraEngine/components/team/MembersPanel.tsx
//
// Roadmap 6.1 — workspace member management. Lists workspace_members and lets an
// owner/admin change roles or remove people. Guards (owner/admin-only, last-owner
// protection) are enforced SERVER-SIDE in the RPCs; the UI mirrors them.

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  listWorkspaceMembers, updateWorkspaceMemberRole, removeWorkspaceMember,
  ASSIGNABLE_ROLES, type WorkspaceMember, type WorkspaceRole,
} from '../../lib/members';
import { useToast } from '../ui/Toast';

const MembersPanel: React.FC = () => {
  const { toast } = useToast();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setMe(user?.id ?? '');
    if (user) setMembers(await listWorkspaceMembers(user.id));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const myRole = members.find(m => m.userId === me)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  const changeRole = async (m: WorkspaceMember, role: WorkspaceRole) => {
    setBusy(m.userId);
    const res = await updateWorkspaceMemberRole(m.userId, role);
    setBusy(null);
    if (!res.success) { toast(res.message || 'Could not change role', 'error'); return; }
    setMembers(prev => prev.map(x => x.userId === m.userId ? { ...x, role } : x));
    toast('Role updated', 'success');
  };

  const remove = async (m: WorkspaceMember) => {
    setBusy(m.userId);
    const res = await removeWorkspaceMember(m.userId);
    setBusy(null);
    if (!res.success) { toast(res.message || 'Could not remove member', 'error'); return; }
    setMembers(prev => prev.filter(x => x.userId !== m.userId));
    toast(m.userId === me ? 'You left the workspace' : 'Member removed', 'success');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={16} className="text-indigo-600" /> Team members</h2>
      <p className="text-xs text-gray-500 mb-4">Everyone with access to this workspace. {canManage ? 'Change roles or remove people below.' : 'Only an owner or admin can change roles.'}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-400">No members yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {members.map(m => {
            const isOwner = m.role === 'owner';
            const isSelf = m.userId === me;
            return (
              <div key={m.userId} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500 flex-shrink-0">
                  {(m.name || m.email || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{m.name}{isSelf && <span className="text-gray-400 font-normal"> (you)</span>}</p>
                  <p className="text-xs text-gray-400 truncate">{m.email}</p>
                </div>
                {isOwner || !canManage ? (
                  <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-slate-100 text-slate-500">{m.role}</span>
                ) : (
                  <select
                    value={m.role ?? 'member'}
                    disabled={busy === m.userId}
                    onChange={e => changeRole(m, e.target.value as WorkspaceRole)}
                    className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1 disabled:opacity-50"
                  >
                    {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
                {canManage && !isOwner && (
                  <button
                    onClick={() => remove(m)}
                    disabled={busy === m.userId}
                    title={isSelf ? 'Leave workspace' : 'Remove member'}
                    className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 disabled:opacity-50"
                  >
                    {busy === m.userId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MembersPanel;
