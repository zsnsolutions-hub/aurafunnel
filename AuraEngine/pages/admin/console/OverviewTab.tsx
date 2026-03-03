import React, { useState, useEffect } from 'react';
import { Users, CreditCard, Target, Zap, Mail, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Props { adminId: string }

interface KPI {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

interface RecentAction {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  profile_email?: string;
}

const OverviewTab: React.FC<Props> = ({ adminId }) => {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const [recentSignups, setRecentSignups] = useState<{ id: string; email: string; name: string; plan: string; created_at: string }[]>([]);
  const [alerts, setAlerts] = useState<{ label: string; count: number }[]>([]);

  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      const [usersRes, subsRes, leadsRes, aiRes, pendingEmails, failedEmails, actionsRes, signupsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }),
        supabase.from('scheduled_emails').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('audit_logs').select('id, action, entity_type, created_at, profiles(email)').order('created_at', { ascending: false }).limit(10),
        supabase.from('profiles').select('id, email, name, plan, createdAt').order('createdAt', { ascending: false }).limit(5),
      ]);

      if (cancelled) return;

      setKpis([
        { label: 'Total Users', value: usersRes.count ?? 0, icon: <Users size={18} />, color: 'bg-blue-50 text-blue-600' },
        { label: 'Active Plans', value: subsRes.count ?? 0, icon: <CreditCard size={18} />, color: 'bg-emerald-50 text-emerald-600' },
        { label: 'Total Leads', value: leadsRes.count ?? 0, icon: <Target size={18} />, color: 'bg-purple-50 text-purple-600' },
        { label: 'AI Operations', value: aiRes.count ?? 0, icon: <Zap size={18} />, color: 'bg-amber-50 text-amber-600' },
        { label: 'Pending Emails', value: pendingEmails.count ?? 0, icon: <Mail size={18} />, color: 'bg-indigo-50 text-indigo-600' },
        { label: 'Failed Emails', value: failedEmails.count ?? 0, icon: <AlertTriangle size={18} />, color: 'bg-red-50 text-red-600' },
      ]);

      setAlerts([
        { label: 'Pending emails in queue', count: pendingEmails.count ?? 0 },
        { label: 'Failed email deliveries', count: failedEmails.count ?? 0 },
      ]);

      const actions = (actionsRes.data ?? []).map((a: any) => ({
        id: a.id,
        action: a.action,
        entity_type: a.entity_type ?? '',
        created_at: a.created_at,
        profile_email: a.profiles?.email,
      }));
      setRecentActions(actions);

      setRecentSignups(
        (signupsRes.data ?? []).map((p: any) => ({
          id: p.id,
          email: p.email,
          name: p.name || '',
          plan: p.plan || 'free',
          created_at: p.createdAt,
        }))
      );

      setLoading(false);
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [adminId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${k.color}`}>
              {k.icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">{typeof k.value === 'number' ? k.value.toLocaleString() : k.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {alerts.some(a => a.count > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">Attention Required</h3>
          <div className="space-y-1">
            {alerts.filter(a => a.count > 0).map(a => (
              <p key={a.label} className="text-sm text-amber-700">{a.label}: <span className="font-bold">{a.count}</span></p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent admin activity */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Admin Activity</h3>
          {recentActions.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {recentActions.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.action}</p>
                    <p className="text-xs text-gray-400">{a.profile_email || 'system'} &middot; {a.entity_type}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap ml-3">
                    {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent signups */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Signups</h3>
          {recentSignups.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No recent signups</p>
          ) : (
            <div className="space-y-2">
              {recentSignups.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.name || u.email}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <div className="text-right ml-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                      u.plan === 'scale' ? 'bg-purple-50 text-purple-700' :
                      u.plan === 'growth' ? 'bg-blue-50 text-blue-700' :
                      u.plan === 'starter' ? 'bg-emerald-50 text-emerald-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{u.plan}</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
