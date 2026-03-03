import React, { useState, useEffect, useCallback } from 'react';
import { Download, Zap, Mail, Users, CreditCard } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

type SubTab = 'ai' | 'email' | 'users' | 'revenue';

interface AIUsageRow {
  id: string;
  user_id: string;
  action: string;
  tokens_used: number;
  cost_estimate: number;
  success: boolean;
  created_at: string;
  profiles?: { email?: string; plan?: string } | null;
}

const ReportsTab: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('ai');
  const [loading, setLoading] = useState(true);

  // AI usage
  const [aiLogs, setAiLogs] = useState<AIUsageRow[]>([]);
  const [aiStats, setAiStats] = useState({ totalCalls: 0, totalTokens: 0, errorRate: 0, costEstimate: 0 });

  // Email analytics
  const [emailStats, setEmailStats] = useState({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 });

  // User growth
  const [userGrowth, setUserGrowth] = useState<{ period: string; count: number }[]>([]);

  // Revenue
  const [revenueStats, setRevenueStats] = useState<{ plan: string; count: number; mrr: number }[]>([]);

  // ── AI Report ───────────────────────────
  const fetchAI = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ai_usage_logs')
      .select('*, profiles(email, plan)')
      .order('created_at', { ascending: false })
      .limit(200);

    const logs = (data ?? []) as AIUsageRow[];
    setAiLogs(logs);

    const totalCalls = logs.length;
    const totalTokens = logs.reduce((s, l) => s + (l.tokens_used || 0), 0);
    const errors = logs.filter(l => !l.success).length;
    const costEstimate = logs.reduce((s, l) => s + (l.cost_estimate || 0), 0);
    setAiStats({
      totalCalls,
      totalTokens,
      errorRate: totalCalls ? Math.round((errors / totalCalls) * 100) : 0,
      costEstimate: Math.round(costEstimate * 100) / 100,
    });
    setLoading(false);
  }, []);

  // ── Email Report ────────────────────────
  const fetchEmail = useCallback(async () => {
    setLoading(true);
    const [sentRes, deliveredRes, bouncedRes, failedRes, openRes, clickRes] = await Promise.all([
      supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
      supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
      supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('status', 'bounced'),
      supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('email_events').select('id', { count: 'exact', head: true }).eq('event_type', 'open'),
      supabase.from('email_events').select('id', { count: 'exact', head: true }).eq('event_type', 'click'),
    ]);

    setEmailStats({
      sent: sentRes.count ?? 0,
      delivered: deliveredRes.count ?? 0,
      opened: openRes.count ?? 0,
      clicked: clickRes.count ?? 0,
      bounced: bouncedRes.count ?? 0,
      failed: failedRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  // ── User Growth Report ──────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('createdAt')
      .order('createdAt', { ascending: true });

    // Group by month
    const months: Record<string, number> = {};
    for (const p of (data ?? [])) {
      if (!p.createdAt) continue;
      const month = p.createdAt.slice(0, 7); // YYYY-MM
      months[month] = (months[month] || 0) + 1;
    }
    setUserGrowth(Object.entries(months).map(([period, count]) => ({ period, count })));
    setLoading(false);
  }, []);

  // ── Revenue Report ──────────────────────
  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('plan_name, status')
      .eq('status', 'active');

    const { data: plans } = await supabase
      .from('plans')
      .select('key, name, price');

    const priceMap: Record<string, number> = {};
    for (const p of (plans ?? [])) {
      priceMap[p.key] = p.price || 0;
    }

    const planCounts: Record<string, number> = {};
    for (const s of (subs ?? [])) {
      const key = s.plan_name || 'free';
      planCounts[key] = (planCounts[key] || 0) + 1;
    }

    setRevenueStats(
      Object.entries(planCounts).map(([plan, count]) => ({
        plan,
        count,
        mrr: count * (priceMap[plan] || 0),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    switch (subTab) {
      case 'ai': fetchAI(); break;
      case 'email': fetchEmail(); break;
      case 'users': fetchUsers(); break;
      case 'revenue': fetchRevenue(); break;
    }
  }, [subTab, fetchAI, fetchEmail, fetchUsers, fetchRevenue]);

  const exportAiCsv = () => {
    const rows = [['Timestamp', 'User Email', 'Plan', 'Action', 'Tokens', 'Cost', 'Success']];
    for (const l of aiLogs) {
      rows.push([l.created_at, l.profiles?.email || '', l.profiles?.plan || '', l.action || '', String(l.tokens_used || 0), String(l.cost_estimate || 0), String(l.success)]);
    }
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_usage_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-gray-200 -mb-px">
        {([
          { key: 'ai', label: 'AI Usage', icon: <Zap size={14} /> },
          { key: 'email', label: 'Email Analytics', icon: <Mail size={14} /> },
          { key: 'users', label: 'User Growth', icon: <Users size={14} /> },
          { key: 'revenue', label: 'Revenue', icon: <CreditCard size={14} /> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              subTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <>
          {/* AI Usage */}
          {subTab === 'ai' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="grid grid-cols-4 gap-4 flex-1">
                  {[
                    { label: 'Total Calls', value: aiStats.totalCalls.toLocaleString() },
                    { label: 'Total Tokens', value: aiStats.totalTokens.toLocaleString() },
                    { label: 'Error Rate', value: `${aiStats.errorRate}%` },
                    { label: 'Est. Cost', value: `$${aiStats.costEstimate}` },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
                      <p className="text-lg font-bold text-gray-900">{s.value}</p>
                      <p className="text-[10px] text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
                <button onClick={exportAiCsv} className="ml-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
                  <Download size={14} /> Export CSV
                </button>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Time</th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">User</th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Action</th>
                      <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Tokens</th>
                      <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiLogs.slice(0, 50).map(l => (
                      <tr key={l.id} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-xs text-gray-500">{new Date(l.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-4 py-2 text-xs text-gray-700">{l.profiles?.email || '—'}</td>
                        <td className="px-4 py-2 text-xs font-mono text-gray-600">{l.action}</td>
                        <td className="px-4 py-2 text-xs text-right text-gray-700">{l.tokens_used?.toLocaleString() || 0}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${l.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {l.success ? 'OK' : 'ERR'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Email Analytics */}
          {subTab === 'email' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Sent', value: emailStats.sent, color: 'text-blue-600' },
                { label: 'Delivered', value: emailStats.delivered, color: 'text-emerald-600' },
                { label: 'Opened', value: emailStats.opened, color: 'text-indigo-600' },
                { label: 'Clicked', value: emailStats.clicked, color: 'text-purple-600' },
                { label: 'Bounced', value: emailStats.bounced, color: 'text-amber-600' },
                { label: 'Failed', value: emailStats.failed, color: 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* User Growth */}
          {subTab === 'users' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Monthly Signups</h3>
              {userGrowth.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No signup data available.</p>
              ) : (
                <div className="space-y-2">
                  {userGrowth.map(g => {
                    const maxCount = Math.max(...userGrowth.map(x => x.count), 1);
                    return (
                      <div key={g.period} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 font-mono">{g.period}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full transition-all"
                            style={{ width: `${(g.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-8 text-right">{g.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Revenue */}
          {subTab === 'revenue' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900">${revenueStats.reduce((s, r) => s + r.mrr, 0).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">Monthly Recurring Revenue</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900">{revenueStats.reduce((s, r) => s + r.count, 0)}</p>
                  <p className="text-[10px] text-gray-500">Active Subscriptions</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900">
                    ${revenueStats.reduce((s, r) => s + r.count, 0)
                      ? Math.round(revenueStats.reduce((s, r) => s + r.mrr, 0) / revenueStats.reduce((s, r) => s + r.count, 0))
                      : 0}
                  </p>
                  <p className="text-[10px] text-gray-500">ARPU</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900">${(revenueStats.reduce((s, r) => s + r.mrr, 0) * 12).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">Projected Annual</p>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Plan</th>
                      <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Subscribers</th>
                      <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueStats.map(r => (
                      <tr key={r.plan} className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900 capitalize">{r.plan}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.count}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">${r.mrr.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportsTab;
