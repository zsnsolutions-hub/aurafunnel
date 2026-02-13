import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { BoltIcon, RefreshIcon, UsersIcon, CreditCardIcon, ShieldIcon, TrendUpIcon, TargetIcon, ActivityIcon, SparklesIcon, RocketIcon } from '../../components/Icons';
import { supabase } from '../../lib/supabase';
import { DashboardQuickStats, AIInsight, FunnelStage, Lead } from '../../types';
import { generateProgrammaticInsights } from '../../lib/insights';
import QuickStatsRow from '../../components/dashboard/QuickStatsRow';
import AIInsightsPanel from '../../components/dashboard/AIInsightsPanel';
import QuickActionsBar from '../../components/dashboard/QuickActionsBar';
import LiveActivityFeed from '../../components/dashboard/LiveActivityFeed';
import ConversionFunnel from '../../components/dashboard/ConversionFunnel';
import CSVImportModal from '../../components/dashboard/CSVImportModal';
import { generateDashboardInsights } from '../../lib/gemini';

interface RecentUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  createdAt: string;
}

const AdminDashboard: React.FC = () => {
  const [quickStats, setQuickStats] = useState<DashboardQuickStats>({
    leadsToday: 0, hotLeads: 0, contentCreated: 0, avgAiScore: 0,
    predictedConversions: 0, recommendations: 0, leadsYesterday: 0, hotLeadsYesterday: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [isCSVOpen, setIsCSVOpen] = useState(false);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [deepAnalysisResult, setDeepAnalysisResult] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('Admin');

  // New state for platform metrics
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalLeadsCount, setTotalLeadsCount] = useState(0);
  const [activeSubs, setActiveSubs] = useState(0);
  const [estimatedRevenue, setEstimatedRevenue] = useState(0);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

      const [
        { count: totalLeads },
        { data: allLeads },
        { count: leadsToday },
        { count: leadsYesterday },
        { count: contentCreated },
        { data: subs },
        { data: recentUsersData },
        { data: sessionData },
        { count: userCount },
        { data: latestUsers },
        { data: adminProfile }
      ] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*').order('score', { ascending: false }),
        supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', yesterdayStart).lt('created_at', todayStart),
        supabase.from('ai_usage_logs').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('plan_name').eq('status', 'active'),
        supabase.from('profiles').select('id, plan, createdAt').gte('createdAt', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.auth.getSession(),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('id, name, email, plan, createdAt').order('createdAt', { ascending: false }).limit(5),
        supabase.auth.getSession().then(async ({ data: s }) => {
          if (s?.session?.user?.id) {
            const { data } = await supabase.from('profiles').select('name').eq('id', s.session.user.id).single();
            return { data };
          }
          return { data: null };
        })
      ]);

      if (sessionData?.session?.user?.id) {
        setAdminUserId(sessionData.session.user.id);
      }
      if (adminProfile?.name) {
        setAdminName(adminProfile.name);
      }

      // Platform metrics
      setTotalUsers(userCount || 0);
      setTotalLeadsCount(totalLeads || 0);

      if (latestUsers) {
        setRecentUsers(latestUsers.map((u: any) => ({
          id: u.id,
          name: u.name || 'Unnamed',
          email: u.email || '',
          plan: u.plan || 'Free',
          createdAt: u.createdAt
        })));
      }

      const activeSubCount = (subs || []).length;
      setActiveSubs(activeSubCount);

      const revenue = (subs || []).reduce((acc: number, sub: any) => {
        if (sub.plan_name === 'Starter') return acc + 49;
        if (sub.plan_name === 'Professional') return acc + 149;
        return acc;
      }, 0);
      setEstimatedRevenue(revenue);

      const leads: Lead[] = allLeads || [];
      const hotLeads = leads.filter(l => l.score > 80).length;
      const hotLeadsYesterdayCount = leads.filter(l => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return d < new Date(todayStart) && l.score > 80;
      }).length;

      const avgScore = leads.length > 0
        ? Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length)
        : 0;

      // Funnel calculation
      const statusCounts: Record<string, number> = { New: 0, Contacted: 0, Qualified: 0, Converted: 0 };
      leads.forEach(l => {
        if (l.status in statusCounts) statusCounts[l.status]++;
      });
      const convertedCount = leads.filter(l => l.score > 90).length;
      const total = totalLeads || 1;

      setFunnelStages([
        { label: 'All Leads', count: totalLeads || 0, color: '#6366f1', percentage: 100 },
        { label: 'Hot', count: hotLeads, color: '#f97316', percentage: Math.round((hotLeads / total) * 100) },
        { label: 'Qualified', count: statusCounts['Qualified'], color: '#10b981', percentage: Math.round((statusCounts['Qualified'] / total) * 100) },
        { label: 'Converted', count: convertedCount, color: '#8b5cf6', percentage: Math.round((convertedCount / total) * 100) }
      ]);

      const predictedConversions = Math.round(hotLeads * 0.35);

      setQuickStats({
        leadsToday: leadsToday || 0,
        hotLeads,
        contentCreated: contentCreated || 0,
        avgAiScore: avgScore,
        predictedConversions,
        recommendations: 0,
        leadsYesterday: leadsYesterday || 0,
        hotLeadsYesterday: hotLeadsYesterdayCount
      });

      // Generate insights
      setInsightsLoading(true);
      const programmaticInsights = generateProgrammaticInsights(leads);
      setInsights(programmaticInsights);
      setQuickStats(prev => ({ ...prev, recommendations: programmaticInsights.length }));
      setInsightsLoading(false);

      // Chart data
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const trendMap: Record<string, { name: string, users: number, revenue: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = days[d.getDay()];
        const dateStr = d.toISOString().split('T')[0];
        trendMap[dateStr] = { name: dayName, users: 0, revenue: 0 };
      }
      (recentUsersData || []).forEach((u: any) => {
        const dateStr = u.createdAt.split('T')[0];
        if (trendMap[dateStr]) {
          trendMap[dateStr].users += 1;
          const price = u.plan === 'Professional' ? 149 : u.plan === 'Starter' ? 49 : 0;
          trendMap[dateStr].revenue += price;
        }
      });
      setChartData(Object.values(trendMap));
    } catch (err: any) {
      console.error("Dashboard Fetch Error:", err);
      setError(err.message || "Failed to load dashboard telemetry.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshInsights = () => {
    fetchDashboardData();
  };

  const handleDeepAnalysis = async () => {
    setDeepAnalysisLoading(true);
    try {
      const { data: allLeads } = await supabase.from('leads').select('*').order('score', { ascending: false }).limit(50);
      const result = await generateDashboardInsights(allLeads || []);
      setDeepAnalysisResult(result);
    } catch (err: any) {
      setDeepAnalysisResult(`Deep analysis unavailable: ${err.message}`);
    } finally {
      setDeepAnalysisLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  if (error) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
          <BoltIcon className="w-8 h-8" />
        </div>
        <div className="max-w-md">
          <h2 className="text-xl font-bold text-slate-900 font-heading">Telemetry Offline</h2>
          <p className="text-slate-500 text-sm mt-2">{error}</p>
        </div>
        <button onClick={fetchDashboardData} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg flex items-center space-x-2">
           <RefreshIcon className="w-4 h-4" />
           <span>Retry Connection</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  HERO BANNER                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 md:p-10 text-white relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4"></div>

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: Greeting */}
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2.5 bg-indigo-500/20 rounded-xl">
                <ShieldIcon className="w-6 h-6 text-indigo-300" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Platform Online</span>
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-heading">{getGreeting()}, {adminName}</h1>
            <p className="text-slate-400 mt-2 text-sm">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Right: Platform KPIs */}
          <div className="flex items-center space-x-3 md:space-x-4">
            <div className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-center min-w-[100px]">
              <div className="flex items-center justify-center space-x-1.5 mb-1.5">
                <UsersIcon className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-[9px] font-bold text-blue-300 uppercase tracking-widest">Users</span>
              </div>
              {loading ? (
                <div className="h-7 w-12 bg-white/10 animate-pulse rounded-lg mx-auto"></div>
              ) : (
                <p className="text-2xl font-bold font-heading">{totalUsers.toLocaleString()}</p>
              )}
            </div>
            <div className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-center min-w-[100px]">
              <div className="flex items-center justify-center space-x-1.5 mb-1.5">
                <CreditCardIcon className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">MRR</span>
              </div>
              {loading ? (
                <div className="h-7 w-12 bg-white/10 animate-pulse rounded-lg mx-auto"></div>
              ) : (
                <p className="text-2xl font-bold font-heading">${estimatedRevenue.toLocaleString()}</p>
              )}
            </div>
            <div className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-center min-w-[100px]">
              <div className="flex items-center justify-center space-x-1.5 mb-1.5">
                <TargetIcon className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[9px] font-bold text-amber-300 uppercase tracking-widest">Leads</span>
              </div>
              {loading ? (
                <div className="h-7 w-12 bg-white/10 animate-pulse rounded-lg mx-auto"></div>
              ) : (
                <p className="text-2xl font-bold font-heading">{totalLeadsCount.toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  QUICK ACTIONS ROW                                            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <QuickActionsBar onImportCSV={() => setIsCSVOpen(true)} isAdmin />
        <button
          onClick={handleRefreshInsights}
          disabled={loading}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-sm font-semibold hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm disabled:opacity-50"
        >
          <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  QUICK STATS ROW (6 cards)                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <QuickStatsRow stats={quickStats} loading={loading} />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  AI INSIGHTS + CONVERSION FUNNEL                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AIInsightsPanel
          insights={insights}
          loading={insightsLoading}
          onRefresh={handleRefreshInsights}
          onDeepAnalysis={handleDeepAnalysis}
          deepAnalysisLoading={deepAnalysisLoading}
          deepAnalysisResult={deepAnalysisResult}
        />
        <ConversionFunnel stages={funnelStages} loading={loading} />
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  CHARTS                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <TrendUpIcon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 font-heading">User Acquisition Trends</h3>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last 7 Days</span>
          </div>
          <div className="h-72">
            {chartData.length === 0 && !loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">Waiting for initial users...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <CreditCardIcon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 font-heading">Revenue Growth Potential</h3>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Subs Value ($)</span>
          </div>
          <div className="h-72">
            {chartData.length === 0 && !loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">Awaiting first transactions...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip
                    formatter={(value: any) => [`$${value}`, 'Value']}
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="#818cf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  ACTIVITY FEED + RECENT USERS                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <LiveActivityFeed />

        {/* Recent Users Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 font-heading">Recent Signups</h3>
                <p className="text-xs text-slate-400">{totalUsers} total users on platform</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">
              {activeSubs} active plan{activeSubs !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 animate-pulse flex-shrink-0"></div>
                    <div className="flex-grow space-y-2">
                      <div className="h-3.5 bg-slate-50 animate-pulse rounded-full w-2/3"></div>
                      <div className="h-3 bg-slate-50 animate-pulse rounded-full w-1/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentUsers.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm italic">No users registered yet.</p>
            ) : (
              recentUsers.map((u) => (
                <div key={u.id} className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-xs text-indigo-600 flex-shrink-0">
                    {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                      u.plan === 'Professional' ? 'bg-indigo-50 text-indigo-600' :
                      u.plan === 'Starter' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-slate-50 text-slate-500'
                    }`}>
                      {u.plan}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatRelativeTime(u.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bottom summary bar */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Revenue Estimate</span>
              <span className="text-indigo-600">${estimatedRevenue}/mo</span>
            </div>
          </div>
        </div>
      </div>

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={isCSVOpen}
        onClose={() => setIsCSVOpen(false)}
        userId={adminUserId}
        onImportComplete={fetchDashboardData}
      />
    </div>
  );
};

export default AdminDashboard;
