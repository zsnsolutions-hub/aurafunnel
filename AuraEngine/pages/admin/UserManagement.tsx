import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import { ShieldIcon, UsersIcon, CreditCardIcon, BoltIcon } from '../../components/Icons';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, subscription:subscriptions(*)')
        .order('createdAt', { ascending: false });
      
      if (data) {
        setUsers(data.map(u => ({
          ...u,
          subscription: Array.isArray(u.subscription) ? u.subscription[0] : u.subscription
        })));
      }
    } catch (err) {
      console.error("Unexpected fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (id: string, currentStatus: string) => {
    setIsProcessing(id);
    const nextStatus = currentStatus === 'active' ? 'disabled' : 'active';
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: nextStatus })
        .eq('id', id);
      
      if (!error) {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, status: nextStatus } : u));
      }
    } finally {
      setIsProcessing(null);
    }
  };

  const toggleUserRole = async (id: string, currentRole: UserRole) => {
    setIsProcessing(id);
    const nextRole = currentRole === UserRole.ADMIN ? UserRole.CLIENT : UserRole.ADMIN;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: nextRole })
        .eq('id', id);
      
      if (!error) {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, role: nextRole } : u));
      }
    } finally {
      setIsProcessing(null);
    }
  };

  const filteredUsers = users.filter(u => filter === 'all' || u.status === filter);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">User Directory</h1>
          <p className="text-slate-500 mt-1">Global account control and privilege management system.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            {['all', 'active', 'disabled'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Accessing Neural Directory...</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">
              <tr>
                <th className="px-8 py-5">Identity Node</th>
                <th className="px-8 py-5">Subscription Tier</th>
                <th className="px-8 py-5 text-center">Compute Load</th>
                <th className="px-8 py-5">Status / Role</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user: any) => {
                const creditsUsed = user.credits_used || 0;
                const creditsTotal = user.credits_total || 500;
                const usagePercent = Math.min((creditsUsed / creditsTotal) * 100, 100);
                const currentPlan = user.subscription?.plan_name || user.plan || 'Starter';

                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-sm border uppercase ${user.role === UserRole.ADMIN ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                          {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate font-heading">{user.name || 'Anonymous'}</p>
                          <p className="text-[10px] text-slate-400 font-mono tracking-tighter truncate max-w-[180px]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 bg-slate-50 rounded-lg group-hover:bg-indigo-50 transition-colors">
                           <CreditCardIcon className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                        </div>
                        <span className="text-xs font-bold text-slate-700">{currentPlan}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col items-center space-y-1">
                        <div className="w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${usagePercent > 80 ? 'bg-red-500' : 'bg-indigo-500'}`} 
                            style={{ width: `${usagePercent}%` }}
                          ></div>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 tracking-tighter uppercase">{creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col space-y-1.5">
                        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest w-fit border ${
                          user.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                        }`}>
                          {user.status}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest w-fit border ${
                          user.role === UserRole.ADMIN ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-slate-50 text-slate-600 border-slate-100'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => toggleUserRole(user.id, user.role)}
                          disabled={isProcessing === user.id}
                          className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-transparent hover:border-indigo-100"
                        >
                          {isProcessing === user.id ? 'Updating...' : 'Switch Role'}
                        </button>
                        <button 
                          onClick={() => toggleUserStatus(user.id, user.status)}
                          disabled={isProcessing === user.id}
                          className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all border ${
                            user.status === 'active' 
                              ? 'text-red-600 hover:bg-red-50 border-transparent hover:border-red-100' 
                              : 'text-emerald-600 hover:bg-emerald-50 border-transparent hover:border-emerald-100'
                          }`}
                        >
                          {isProcessing === user.id ? 'Updating...' : (user.status === 'active' ? 'Deactivate' : 'Restore')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      <div className="flex items-center justify-center space-x-3 opacity-30 text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 py-10">
         <ShieldIcon className="w-4 h-4" />
         <span>Admin Overrides Active • Secure Connection</span>
      </div>
    </div>
  );
};

export default UserManagement;