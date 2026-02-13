import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { BoltIcon, RefreshIcon } from '../../components/Icons';
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
        { data: recentUsers },
        { data: sessionData }
      ] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*').order('score', { ascending: false }),
        supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', yesterdayStart).lt('created_at', todayStart),
        supabase.from('ai_usage_logs').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('plan_name').eq('status', 'active'),
        supabase.from('profiles').select('id, plan, createdAt').gte('createdAt', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.auth.getSession()
      ]);

      if (sessionData?.session?.user?.id) {
        setAdminUserId(sessionData.session.user.id);
      }

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
      // Treat score > 90 as "Converted" for funnel
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
      const estimatedRevenue = (subs || []).reduce((acc, sub) => {
        if (sub.plan_name === 'Starter') return acc + 49;
        if (sub.plan_name === 'Professional') return acc + 149;
        return acc;
      }, 0);

      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const trendMap: Record<string, { name: string, users: number, revenue: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = days[d.getDay()];
        const dateStr = d.toISOString().split('T')[0];
        trendMap[dateStr] = { name: dayName, users: 0, revenue: 0 };
      }
      (recentUsers || []).forEach(u => {
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
      {/* Header with Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Command Center</h1>
          <p className="text-slate-500 mt-1">Platform-wide intelligence overview</p>
        </div>
        <QuickActionsBar onImportCSV={() => setIsCSVOpen(true)} isAdmin />
      </div>

      {/* Quick Stats Row - 6 cards */}
      <QuickStatsRow stats={quickStats} loading={loading} />

      {/* AI Insights Panel */}
      <AIInsightsPanel
        insights={insights}
        loading={insightsLoading}
        onRefresh={handleRefreshInsights}
        onDeepAnalysis={handleDeepAnalysis}
        deepAnalysisLoading={deepAnalysisLoading}
        deepAnalysisResult={deepAnalysisResult}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 font-heading">User Acquisition Trends</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last 7 Days</span>
          </div>
          <div className="h-80">
            {chartData.length === 0 && !loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">Waiting for initial users...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} className="text-[10px] font-bold text-slate-400" />
                  <YAxis axisLine={false} tickLine={false} className="text-[10px] font-bold text-slate-400" />
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontFamily: 'Inter' }}
                  />
                  <Area type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorUsers)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 font-heading">Revenue Growth Potential</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Subs Value ($)</span>
          </div>
          <div className="h-80">
            {chartData.length === 0 && !loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">Awaiting first transactions...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} className="text-[10px] font-bold text-slate-400" />
                  <YAxis axisLine={false} tickLine={false} className="text-[10px] font-bold text-slate-400" />
                  <Tooltip
                    formatter={(value: any) => [`$${value}`, 'Value']}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontFamily: 'Inter' }}
                  />
                  <Bar dataKey="revenue" fill="#818cf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Conversion Funnel */}
      <ConversionFunnel stages={funnelStages} loading={loading} />

      {/* Live Activity Feed */}
      <LiveActivityFeed />

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
