import React, { useEffect, useState } from 'react';
import { UserPlus, Loader2, X } from 'lucide-react';
import { createInvite, sendInviteEmail, revokeInvite, listInvites, WorkspaceRole, WorkspaceInvite } from '../../lib/invitations';

interface Props {
  /** When set, the invitee is also granted access to this business on accept. */
  businessId?: string | null;
  businessName?: string | null;
}

// Workspace-level invite: send (email), list pending, revoke/resend. Owner/admin
// only (enforced server-side by the RPCs; non-owners just get an error toast).
const InviteMemberForm: React.FC<Props> = ({ businessId, businessName }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [assignBusiness, setAssignBusiness] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, setPending] = useState<WorkspaceInvite[]>([]);

  const loadPending = () => { listInvites('pending').then(setPending).catch(() => {}); };
  useEffect(loadPending, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true); setMsg(null);
    const res = await createInvite(email.trim(), role, assignBusiness ? businessId : null);
    if ('error' in res) { setMsg({ kind: 'err', text: res.error }); setSending(false); return; }
    const mail = await sendInviteEmail({ email: email.trim(), token: res.token, role, workspaceName: businessName ?? undefined });
    setSending(false);
    setMsg({ kind: 'ok', text: 'error' in mail ? 'Invite created, but the email could not be sent.' : `Invitation sent to ${email.trim()}.` });
    setEmail(''); loadPending();
  };

  const revoke = async (id: string) => { await revokeInvite(id); loadPending(); };

  return (
    <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-indigo-600" />
        <h3 className="text-sm font-bold text-slate-900">Invite a teammate</h3>
      </div>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        />
        <select value={role} onChange={e => setRole(e.target.value as WorkspaceRole)}
          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="submit" disabled={sending}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send invite'}
        </button>
      </form>
      {businessId && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={assignBusiness} onChange={e => setAssignBusiness(e.target.checked)} />
          Also give access to {businessName ? `'${businessName}'` : 'this business'}
        </label>
      )}
      {msg && <p className={`text-xs font-semibold ${msg.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}

      {pending.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending invites</p>
          {pending.map(p => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600 truncate">{p.email} · <span className="capitalize text-slate-400">{p.role}</span></span>
              <button onClick={() => revoke(p.id)} title="Revoke" className="text-slate-400 hover:text-red-500 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InviteMemberForm;
