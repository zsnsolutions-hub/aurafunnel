import React, { useState, useEffect, useCallback } from 'react';
import { Search, UserCheck, UserX, ChevronDown, Download } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { logUserAction } from '../../../lib/auditLogger';
import { executeRpc } from '../../../lib/adminActions';

interface Props { adminId: string; isSuperAdmin: boolean }

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  plan: string;
  credits_total: number;
  credits_used: number;
  is_super_admin: boolean;
  createdAt: string;
  subscription?: { plan_name?: string; status?: string } | null;
}

const UsersTab: React.FC<Props> = ({ adminId, isSuperAdmin }) => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'ADMIN' | 'CLIENT'>('all');
  const [processing, setProcessing] = useState<string | null>(null);
  const [plans, setPlans] = useState<{ id: string; name: string; key: string }[]>([]);
  const [grantModal, setGrantModal] = useState<{ userId: string; name: string } | null>(null);
  const [grantAmount, setGrantAmount] = useState('100');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, email, name, role, status, plan, credits_total, credits_used, is_super_admin, createdAt, subscription:subscriptions(*)')
      .order('createdAt', { ascending: false });

    setUsers(
      (data ?? []).map((u: any) => ({
        ...u,
        subscription: Array.isArray(u.subscription) ? u.subscription[0] : u.subscription,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    supabase.from('plans').select('id, name, key').then(({ data }) => {
      if (data) setPlans(data);
    });
  }, []);

  const filtered = users.filter(u => {
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
    }
    return true;
  });

  const toggleStatus = async (user: UserRow) => {
    setProcessing(user.id);
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    const action = newStatus === 'disabled' ? 'user.suspend' : 'user.unsuspend';

    await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id);
    await logUserAction(adminId, action as any, user.id, { status: user.status }, { status: newStatus });

    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
    setProcessing(null);
  };

  const toggleRole = async (user: UserRow) => {
    setProcessing(user.id);
    const newRole = user.role === 'ADMIN' ? 'CLIENT' : 'ADMIN';

    await supabase.from('profiles').update({ role: newRole }).eq('id', user.id);
    await logUserAction(adminId, 'user.role_change', user.id, { role: user.role }, { role: newRole });

    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    setProcessing(null);
  };

  const changePlan = async (user: UserRow, planKey: string) => {
    setProcessing(user.id);
    await executeRpc(adminId, 'admin_change_user_plan', {
      target_user_id: user.id,
      new_plan_key: planKey,
      reason: 'Admin Console plan change',
    }, 'user.plan_change');
    await fetchUsers();
    setProcessing(null);
  };

  const grantCredits = async () => {
    if (!grantModal) return;
    const amount = parseInt(grantAmount, 10);
    if (!amount || amount <= 0) return;
    setProcessing(grantModal.userId);

    await executeRpc(adminId, 'admin_grant_credits', {
      target_user_id: grantModal.userId,
      amount,
      reason: 'Admin Console credit grant',
    }, 'user.credit_grant');

    await logUserAction(adminId, 'user.credit_grant', grantModal.userId, undefined, { amount });
    await fetchUsers();
    setGrantModal(null);
    setGrantAmount('100');
    setProcessing(null);
  };

  const exportCsv = () => {
    const rows = [['Email', 'Name', 'Role', 'Status', 'Plan', 'Credits Total', 'Credits Used', 'Created']];
    for (const u of filtered) {
      rows.push([u.email, u.name, u.role, u.status, u.plan || '', String(u.credits_total ?? 0), String(u.credits_used ?? 0), u.createdAt || '']);
    }
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as any)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl"
        >
          <option value="all">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="CLIENT">Client</option>
        </select>
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-gray-500">{filtered.length} users</span>
        <span className="text-emerald-600">{filtered.filter(u => u.status === 'active').length} active</span>
        <span className="text-red-500">{filtered.filter(u => u.status === 'disabled').length} disabled</span>
        <span className="text-indigo-600">{filtered.filter(u => u.role === 'ADMIN').length} admins</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Credits</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">{u.name || u.email}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleRole(u)}
                        disabled={processing === u.id || u.id === adminId}
                        className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md transition-colors ${
                          u.role === 'ADMIN' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        } disabled:opacity-50`}
                      >
                        {u.role}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleStatus(u)}
                        disabled={processing === u.id || u.id === adminId}
                        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-1 rounded-md transition-colors ${
                          u.status === 'active' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-600 hover:bg-red-100'
                        } disabled:opacity-50`}
                      >
                        {u.status === 'active' ? <UserCheck size={12} /> : <UserX size={12} />}
                        {u.status}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative inline-block">
                        <select
                          value={u.subscription?.plan_name || u.plan || ''}
                          onChange={e => changePlan(u, e.target.value)}
                          disabled={processing === u.id}
                          className="text-xs font-medium bg-transparent border border-gray-200 rounded-lg px-2 py-1 pr-6 appearance-none disabled:opacity-50"
                        >
                          {!plans.length && <option>{u.plan || 'free'}</option>}
                          {plans.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-700">{u.credits_used ?? 0}/{u.credits_total ?? 0}</span>
                        <button
                          onClick={() => setGrantModal({ userId: u.id, name: u.name || u.email })}
                          className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          +Grant
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {processing === u.id && (
                        <span className="text-[10px] text-gray-400 animate-pulse">Processing...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grant credits modal */}
      {grantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setGrantModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Grant Credits</h3>
            <p className="text-sm text-gray-500 mb-4">To: {grantModal.name}</p>
            <input
              type="number"
              value={grantAmount}
              onChange={e => setGrantAmount(e.target.value)}
              min={1}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl mb-4"
              placeholder="Amount"
            />
            <div className="flex gap-3">
              <button onClick={() => setGrantModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={grantCredits} disabled={processing === grantModal.userId} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">Grant</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersTab;
