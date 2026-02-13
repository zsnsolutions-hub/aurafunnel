import React, { useState, useEffect, useMemo } from 'react';
import { Lead, ContentType, User, DashboardQuickStats, AIInsight, ManualList, FunnelStage } from '../../types';
import { FlameIcon, BoltIcon, CheckIcon, SparklesIcon, TargetIcon, ChartIcon, ClockIcon, TrendUpIcon, TrendDownIcon } from '../../components/Icons';
import { generateLeadContent } from '../../lib/gemini';
import { generateDashboardInsights } from '../../lib/gemini';
import { supabase } from '../../lib/supabase';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { generateProgrammaticInsights } from '../../lib/insights';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import QuickActionsBar from '../../components/dashboard/QuickActionsBar';
import LiveActivityFeed from '../../components/dashboard/LiveActivityFeed';
import CSVImportModal from '../../components/dashboard/CSVImportModal';
import LeadActionsModal from '../../components/dashboard/LeadActionsModal';
import LeadSegmentation from '../../components/dashboard/LeadSegmentation';

const LISTS_STORAGE_KEY = 'aurafunnel_manual_lists';

interface ClientDashboardProps {
  user: User;
}

// Generate 30-day trend data for the AI Performance chart
const generateTrendData = (leads: Lead[]) => {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Simulated metrics based on lead data with some variance
    const baseAccuracy = leads.length > 0
      ? Math.min(95, 60 + leads.filter(l => l.score > 70).length * 2)
      : 72;
    const baseConversion = leads.length > 0
      ? Math.min(45, 10 + leads.filter(l => l.status === 'Qualified').length * 3)
      : 18;

    const variance = Math.sin(i * 0.5) * 5 + (Math.random() - 0.5) * 4;
    data.push({
      day: dayLabel,
      accuracy: Math.round(Math.max(50, Math.min(99, baseAccuracy + variance))),
      conversion: Math.round(Math.max(5, Math.min(50, baseConversion + variance * 0.6))),
      engagement: Math.round(Math.max(30, Math.min(85, baseAccuracy * 0.7 + variance)))
    });
  }
  return data;
};

const ClientDashboard: React.FC<ClientDashboardProps> = ({ user: initialUser }) => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedLeadForGen, setSelectedLeadForGen] = useState<Lead | null>(null);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isCSVOpen, setIsCSVOpen] = useState(false);

  // Lead Actions
  const [selectedLeadForActions, setSelectedLeadForActions] = useState<Lead | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  // Segmentation
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [manualLists, setManualLists] = useState<ManualList[]>(() => {
    try {
      const stored = localStorage.getItem(LISTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Quick Stats
  const [quickStats, setQuickStats] = useState<DashboardQuickStats>({
    leadsToday: 0, hotLeads: 0, contentCreated: 0, avgAiScore: 0,
    predictedConversions: 0, recommendations: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // AI Insights
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [deepAnalysisResult, setDeepAnalysisResult] = useState<string | null>(null);

  // Funnel
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);

  // Form states for adding lead
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', insights: '' });

  // Content Generation States
  const [contentType, setContentType] = useState<ContentType>(ContentType.EMAIL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');
  const [genError, setGenError] = useState('');

  // Trend data
  const trendData = useMemo(() => generateTrendData(leads), [leads]);

  useEffect(() => {
    fetchLeads();
    fetchQuickStats();
  }, [user]);

  const fetchLeads = async () => {
    setLoadingLeads(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('client_id', user.id)
      .order('score', { ascending: false });

    if (data) {
      setLeads(data);
      setFilteredLeads(data);
      setActiveSegmentId(null);
      setInsightsLoading(true);
      const programmaticInsights = generateProgrammaticInsights(data);
      setInsights(programmaticInsights);
      setInsightsLoading(false);

      // Calculate funnel stages
      const statusCounts: Record<string, number> = { New: 0, Contacted: 0, Qualified: 0, Converted: 0 };
      data.forEach(l => { if (statusCounts[l.status] !== undefined) statusCounts[l.status]++; });
      const total = data.length || 1;
      setFunnelStages([
        { label: 'Awareness', count: total, color: '#6366f1', percentage: 100 },
        { label: 'Interest', count: statusCounts.New + statusCounts.Contacted + statusCounts.Qualified, color: '#818cf8', percentage: Math.round(((statusCounts.New + statusCounts.Contacted + statusCounts.Qualified) / total) * 100) },
        { label: 'Intent', count: statusCounts.Contacted + statusCounts.Qualified, color: '#a5b4fc', percentage: Math.round(((statusCounts.Contacted + statusCounts.Qualified) / total) * 100) },
        { label: 'Decision', count: statusCounts.Qualified, color: '#c7d2fe', percentage: Math.round((statusCounts.Qualified / total) * 100) },
        { label: 'Action', count: Math.round(statusCounts.Qualified * 0.35), color: '#e0e7ff', percentage: Math.round((statusCounts.Qualified * 0.35 / total) * 100) }
      ]);
    }
    setLoadingLeads(false);
  };

  const fetchQuickStats = async () => {
    setStatsLoading(true);
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const [
        { data: allLeads },
        { count: leadsToday },
        { count: contentCreated }
      ] = await Promise.all([
        supabase.from('leads').select('*').eq('client_id', user.id),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', user.id).gte('created_at', todayStart),
        supabase.from('ai_usage_logs').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
      ]);

      const lds = allLeads || [];
      const hotLeads = lds.filter(l => l.score > 80).length;
      const avgScore = lds.length > 0
        ? Math.round(lds.reduce((a, b) => a + b.score, 0) / lds.length)
        : 0;
      const predictedConversions = Math.round(hotLeads * 0.35);
      const programmaticInsights = generateProgrammaticInsights(lds);

      setQuickStats({
        leadsToday: leadsToday || 0,
        hotLeads,
        contentCreated: contentCreated || 0,
        avgAiScore: avgScore,
        predictedConversions,
        recommendations: programmaticInsights.length
      });
    } catch (err) {
      console.error("Stats fetch error:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const openGenModal = (lead: Lead) => {
    setSelectedLeadForGen(lead);
    setGenResult('');
    setGenError('');
    setIsGenModalOpen(true);
    setIsActionsOpen(false);
  };

  const openActionsModal = (lead: Lead) => {
    setSelectedLeadForActions(lead);
    setIsActionsOpen(true);
  };

  const handleGenerate = async () => {
    if (!selectedLeadForGen) return;

    setIsGenerating(true);
    setGenError('');

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('consume_credits', { amount: 1 });
      if (rpcError) throw new Error(rpcError.message);
      if (!rpcData.success) {
        setGenError(rpcData.message || 'Insufficient credits.');
        setIsGenerating(false);
        return;
      }

      const aiResponse = await generateLeadContent(selectedLeadForGen, contentType);
      setGenResult(aiResponse.text);

      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        lead_id: selectedLeadForGen.id,
        action_type: contentType.toLowerCase().replace(' ', '_') + '_generation_quick',
        tokens_used: aiResponse.tokens_used,
        model_name: aiResponse.model_name,
        prompt_name: aiResponse.prompt_name,
        prompt_version: aiResponse.prompt_version
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_CONTENT_GENERATED_QUICK',
        details: `Quick gen ${contentType} for ${selectedLeadForGen.name}. Template: ${aiResponse.prompt_name} v${aiResponse.prompt_version}`
      });

      if (refreshProfile) await refreshProfile();
      fetchQuickStats();

    } catch (err: any) {
      console.error("Quick Gen Error:", err);
      setGenError(err.message || "An error occurred during generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const mockScore = Math.floor(Math.random() * 40) + 60;

    const { data, error } = await supabase
      .from('leads')
      .insert([{
        ...newLead,
        client_id: user.id,
        score: mockScore,
        status: 'New',
        lastActivity: 'Just now'
      }])
      .select()
      .single();

    if (data) {
      const updated = [data, ...leads];
      setLeads(updated);
      setFilteredLeads(updated);
      setActiveSegmentId(null);
      setIsAddLeadOpen(false);
      setNewLead({ name: '', email: '', company: '', insights: '' });
      fetchQuickStats();
    }
  };

  const handleStatusUpdate = (leadId: string, newStatus: Lead['status']) => {
    const updatedLeads = leads.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    );
    setLeads(updatedLeads);
    setFilteredLeads(activeSegmentId ? filteredLeads.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    ) : updatedLeads);
    if (selectedLeadForActions?.id === leadId) {
      setSelectedLeadForActions({ ...selectedLeadForActions, status: newStatus, lastActivity: `Status changed to ${newStatus}` });
    }
    fetchQuickStats();
  };

  const handleSegmentSelect = (segmentId: string | null, filtered: Lead[]) => {
    setActiveSegmentId(segmentId);
    setFilteredLeads(filtered);
  };

  const handleAddToManualList = (listId: string, leadId: string) => {
    const updated = manualLists.map(list =>
      list.id === listId ? { ...list, leadIds: [...list.leadIds, leadId] } : list
    );
    setManualLists(updated);
    localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleRefreshInsights = () => {
    setInsightsLoading(true);
    const programmaticInsights = generateProgrammaticInsights(leads);
    setInsights(programmaticInsights);
    setInsightsLoading(false);
  };

  const handleDeepAnalysis = async () => {
    setDeepAnalysisLoading(true);
    try {
      const result = await generateDashboardInsights(leads);
      setDeepAnalysisResult(result);
    } catch (err: any) {
      setDeepAnalysisResult(`Deep analysis unavailable: ${err.message}`);
    } finally {
      setDeepAnalysisLoading(false);
    }
  };

  const handleImportComplete = () => {
    fetchLeads();
    fetchQuickStats();
  };

  const copyResult = () => {
    navigator.clipboard.writeText(genResult);
  };

  // Derived stats
  const conversionRate = leads.length > 0
    ? Math.round((leads.filter(l => l.status === 'Qualified').length / leads.length) * 100)
    : 0;
  const topPredictions = leads.slice(0, 3);
  const leadsPerMin = leads.length > 0 ? Math.max(1, Math.round(leads.length / 12)) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Main Dashboard</h1>
          <p className="text-slate-500 mt-1">AI-powered growth intelligence at a glance.</p>
        </div>
        <div className="flex items-center space-x-3">
          <QuickActionsBar
            onImportCSV={() => setIsCSVOpen(true)}
            onGenerateContent={() => {
              if (leads.length > 0) openGenModal(leads[0]);
            }}
          />
          <button
            onClick={() => setIsAddLeadOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
          >
            Add Lead
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  TWO-PANEL LAYOUT: Left (30%) + Center (70%)                 */}
      {/* ============================================================ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT PANEL (30%) ── Live AI Insights ── */}
        <div className="w-full lg:w-[30%] space-y-6">
          {/* Live AI Insights Header */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
            <div className="flex items-center space-x-3 mb-5">
              <div className="p-2.5 bg-indigo-500/20 rounded-xl">
                <SparklesIcon className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h2 className="font-bold font-heading text-lg">Live AI Insights</h2>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Processing</span>
                </div>
              </div>
            </div>

            {/* Real-time Processing Stats */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <span className="text-xs text-slate-300">Leads Analyzed/min</span>
                <span className="text-sm font-bold text-indigo-300">{leadsPerMin}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <span className="text-xs text-slate-300">AI Accuracy</span>
                <span className="text-sm font-bold text-emerald-300">{quickStats.avgAiScore}%</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <span className="text-xs text-slate-300">Content Generated</span>
                <span className="text-sm font-bold text-amber-300">{quickStats.contentCreated}</span>
              </div>
            </div>
          </div>

          {/* Top Predictions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-5">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <TrendUpIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 font-heading">Top Predictions</h3>
                <p className="text-xs text-slate-400">Highest conversion potential</p>
              </div>
            </div>

            {statsLoading || loadingLeads ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-50 animate-pulse rounded-xl"></div>)}
              </div>
            ) : topPredictions.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-6">Add leads to see predictions.</p>
            ) : (
              <div className="space-y-3">
                {topPredictions.map((lead, idx) => (
                  <button
                    key={lead.id}
                    onClick={() => openActionsModal(lead)}
                    className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-indigo-50/50 transition-colors text-left group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${
                      idx === 0 ? 'bg-indigo-600' : idx === 1 ? 'bg-indigo-400' : 'bg-indigo-300'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{lead.company}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-indigo-600">{lead.score}%</p>
                      <p className="text-[10px] text-slate-400">chance</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 font-heading mb-4">Quick Actions</h3>
            <div className="space-y-2.5">
              <button
                onClick={() => setIsAddLeadOpen(true)}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-semibold text-sm"
              >
                <TargetIcon className="w-4 h-4" />
                <span>Add New Lead</span>
              </button>
              <button
                onClick={() => { if (leads.length > 0) openGenModal(leads[0]); }}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-semibold text-sm"
              >
                <SparklesIcon className="w-4 h-4" />
                <span>Generate Content</span>
              </button>
              <button
                onClick={() => navigate('/portal/content')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors font-semibold text-sm"
              >
                <ChartIcon className="w-4 h-4" />
                <span>Run Report</span>
              </button>
            </div>
          </div>

          {/* AI Insights List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <BoltIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm font-heading">AI Recommendations</h3>
              </div>
              <button onClick={handleRefreshInsights} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                Refresh
              </button>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto custom-scrollbar">
              {insightsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-lg"></div>)}
                </div>
              ) : insights.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">No insights yet.</p>
              ) : (
                <div className="space-y-2">
                  {insights.slice(0, 5).map(insight => (
                    <div key={insight.id} className="p-3 rounded-lg border border-slate-100 hover:border-indigo-100 transition-colors">
                      <div className="flex items-start justify-between">
                        <p className="text-xs font-bold text-slate-700 leading-relaxed">{insight.title}</p>
                        <span className="text-[9px] font-bold text-indigo-500 ml-2 flex-shrink-0">{insight.confidence}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-0.5 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${insight.confidence}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {insights.length > 0 && (
                <button
                  onClick={handleDeepAnalysis}
                  disabled={deepAnalysisLoading}
                  className="mt-3 w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50"
                >
                  {deepAnalysisLoading ? 'Analyzing...' : 'Deep AI Analysis'}
                </button>
              )}
              {deepAnalysisResult && (
                <div className="mt-3 p-3 bg-slate-950 rounded-xl">
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Gemini Analysis</p>
                  <p className="text-[11px] text-indigo-100 leading-relaxed whitespace-pre-wrap font-mono">{deepAnalysisResult}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER PANEL (70%) ── Performance Overview ── */}
        <div className="w-full lg:w-[70%] space-y-6">
          {/* Performance Overview - 4 Stat Cards */}
          <div>
            <h2 className="font-bold text-slate-800 font-heading text-lg mb-4">Performance Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Leads Today */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    <TargetIcon className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Leads Today</h3>
                {statsLoading ? (
                  <div className="h-8 w-16 bg-slate-100 animate-pulse rounded-lg mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-slate-900 mt-1 font-heading tracking-tight">{quickStats.leadsToday}</p>
                )}
              </div>

              {/* Hot Leads */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-colors duration-300">
                    <FlameIcon className="w-5 h-5" />
                  </div>
                  {!statsLoading && quickStats.hotLeads > 0 && (
                    <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                      <TrendUpIcon className="w-3 h-3" />
                      <span>Active</span>
                    </span>
                  )}
                </div>
                <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Hot Leads</h3>
                {statsLoading ? (
                  <div className="h-8 w-16 bg-slate-100 animate-pulse rounded-lg mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-slate-900 mt-1 font-heading tracking-tight">{quickStats.hotLeads}</p>
                )}
              </div>

              {/* Conversion Rate */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                    <ChartIcon className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Conv. Rate</h3>
                {statsLoading ? (
                  <div className="h-8 w-16 bg-slate-100 animate-pulse rounded-lg mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-slate-900 mt-1 font-heading tracking-tight">{conversionRate}%</p>
                )}
              </div>

              {/* AI Accuracy */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                    <BoltIcon className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">AI Accuracy</h3>
                {statsLoading ? (
                  <div className="h-8 w-16 bg-slate-100 animate-pulse rounded-lg mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-slate-900 mt-1 font-heading tracking-tight">{quickStats.avgAiScore}%</p>
                )}
              </div>
            </div>
          </div>

          {/* Conversion Funnel */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <ChartIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 font-heading">Conversion Funnel</h3>
                <p className="text-xs text-slate-400">Awareness &gt; Interest &gt; Intent &gt; Decision &gt; Action</p>
              </div>
            </div>
            <div className="p-6">
              {loadingLeads ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-xl" style={{ width: `${100 - i * 12}%`, margin: '0 auto' }}></div>
                  ))}
                </div>
              ) : funnelStages.length === 0 || leads.length === 0 ? (
                <p className="text-center text-slate-400 text-sm italic py-8">No funnel data available yet.</p>
              ) : (
                <div className="space-y-3">
                  {funnelStages.map((stage, index) => {
                    const maxCount = Math.max(...funnelStages.map(s => s.count), 1);
                    const widthPct = Math.max((stage.count / maxCount) * 100, 8);
                    return (
                      <div key={stage.label} className="flex items-center space-x-4">
                        <div className="w-20 flex-shrink-0 text-right">
                          <p className="text-xs font-bold text-slate-700">{stage.label}</p>
                          <p className="text-[10px] text-slate-400">{stage.percentage}%</p>
                        </div>
                        <div className="flex-grow">
                          <div className="relative h-9 rounded-xl overflow-hidden bg-slate-50">
                            <div
                              className="h-full rounded-xl flex items-center justify-end pr-3 transition-all duration-1000 ease-out"
                              style={{ width: `${widthPct}%`, backgroundColor: stage.color }}
                            >
                              <span className="text-white text-xs font-bold drop-shadow-sm">{stage.count}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* AI Performance Trends - 30 Day Line Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <TrendUpIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 font-heading">AI Performance Trends</h3>
                  <p className="text-xs text-slate-400">Last 30 days</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-[10px] font-bold uppercase tracking-widest">
                <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span><span className="text-slate-500">Accuracy</span></span>
                <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span className="text-slate-500">Conversion</span></span>
                <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span className="text-slate-500">Engagement</span></span>
              </div>
            </div>
            <div className="p-6">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAccuracy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradConversion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradEngagement" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.10} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '12px' }}
                    labelStyle={{ fontWeight: 700, marginBottom: 4 }}
                  />
                  <Area type="monotone" dataKey="accuracy" stroke="#6366f1" strokeWidth={2.5} fill="url(#gradAccuracy)" name="AI Accuracy" />
                  <Area type="monotone" dataKey="conversion" stroke="#10b981" strokeWidth={2} fill="url(#gradConversion)" name="Conversion %" />
                  <Area type="monotone" dataKey="engagement" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gradEngagement)" name="Engagement" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Team Activity Feed */}
          <LiveActivityFeed userId={user.id} />
        </div>
      </div>

      {/* ============================================================ */}
      {/*  LEADS TABLE + SEGMENTATION (full width below panels)        */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Segmentation Sidebar */}
        <div className="lg:col-span-1">
          <LeadSegmentation
            leads={leads}
            activeSegmentId={activeSegmentId}
            onSegmentSelect={handleSegmentSelect}
            manualLists={manualLists}
            onManualListsChange={setManualLists}
          />
        </div>

        {/* Priority Prospect List */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h3 className="font-bold text-slate-800 font-heading">Priority Prospect List</h3>
                {activeSegmentId && (
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    Filtered: {filteredLeads.length} leads
                  </span>
                )}
              </div>
              {loadingLeads && <span className="text-xs text-indigo-600 animate-pulse font-bold">Syncing...</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Lead Detail</th>
                    <th className="px-6 py-4">Company</th>
                    <th className="px-6 py-4 text-center">Aura Score</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <button onClick={() => openActionsModal(lead)} className="flex items-center space-x-3 text-left">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                            {lead.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate hover:text-indigo-600 transition-colors">{lead.name}</p>
                            <p className="text-xs text-slate-500 truncate">{lead.email}</p>
                          </div>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">{lead.company}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center space-y-1">
                          <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ease-out ${lead.score > 80 ? 'bg-indigo-500' : lead.score > 50 ? 'bg-orange-400' : 'bg-red-400'}`}
                              style={{ width: `${lead.score}%` }}
                            ></div>
                          </div>
                          <span className="text-[10px] font-black text-slate-800 tracking-tighter">{lead.score}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                          lead.status === 'Qualified' ? 'bg-indigo-50 text-indigo-600' :
                          lead.status === 'New' ? 'bg-blue-50 text-blue-600' :
                          lead.status === 'Contacted' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-600'
                        }`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openActionsModal(lead)}
                            className="inline-flex items-center px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg font-bold text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                          >
                            Actions
                          </button>
                          <button
                            onClick={() => openGenModal(lead)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs hover:bg-indigo-600 hover:text-white transition-all transform active:scale-90"
                          >
                            <SparklesIcon className="w-3.5 h-3.5" />
                            <span>GEN</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loadingLeads && filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                        {activeSegmentId ? 'No leads match this segment.' : 'No leads found. Start by adding your first prospect.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Lead Actions Modal */}
      {selectedLeadForActions && (
        <LeadActionsModal
          lead={selectedLeadForActions}
          allLeads={leads}
          isOpen={isActionsOpen}
          onClose={() => { setIsActionsOpen(false); setSelectedLeadForActions(null); }}
          onStatusUpdate={handleStatusUpdate}
          onSendEmail={openGenModal}
          manualLists={manualLists}
          onAddToManualList={handleAddToManualList}
        />
      )}

      {/* AI CONTENT MODAL */}
      {isGenModalOpen && selectedLeadForGen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => !isGenerating && setIsGenModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex flex-col md:flex-row h-full">
              <div className="w-full md:w-1/2 p-10 border-r border-slate-100">
                <div className="flex items-center space-x-3 mb-8">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                    <SparklesIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 font-heading">Content Studio</h2>
                    <p className="text-xs text-slate-500">Powering outreach for {selectedLeadForGen.name}</p>
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Target Context</p>
                    <p className="text-sm font-bold text-slate-800 mb-1">{selectedLeadForGen.company}</p>
                    <p className="text-xs text-slate-500 italic leading-relaxed">"{selectedLeadForGen.insights}"</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-4">Select Channel</p>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.values(ContentType).map((type) => (
                        <button
                          key={type}
                          onClick={() => setContentType(type)}
                          disabled={isGenerating}
                          className={`px-4 py-3 text-xs rounded-xl font-bold transition-all border ${
                            contentType === type
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center space-x-2 ${
                      isGenerating ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl shadow-slate-200'
                    }`}
                  >
                    {isGenerating ? 'AI Reasoning...' : 'Build Outreach'}
                  </button>
                  {genError && <p className="text-center text-xs text-red-500 font-bold uppercase tracking-tight">{genError}</p>}
                </div>
              </div>
              <div className="w-full md:w-1/2 bg-slate-950 flex flex-col">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <span className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Preview Mode</span>
                  {genResult && <button onClick={copyResult} className="px-3 py-1 bg-white/10 text-white hover:bg-white/20 rounded-md text-[10px] font-bold">COPY</button>}
                </div>
                <div className="flex-grow p-10 overflow-y-auto custom-scrollbar text-indigo-100 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {isGenerating ? 'Synchronizing with Neural Grid...' : genResult || 'Neural links ready for transmission.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD LEAD MODAL */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setIsAddLeadOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 p-10 flex flex-col">
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-slate-900 font-heading">New Lead Profile</h2>
              <p className="text-sm text-slate-500 mt-1">Add details for manual AI enrichment.</p>
            </div>
            <form className="space-y-6 flex-grow" onSubmit={handleAddLead}>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required type="text" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} placeholder="e.g. Robert Fox" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Email</label>
                <input required type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} placeholder="robert@stripe.com" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input required type="text" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} placeholder="e.g. Stripe" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Insights</label>
                <textarea rows={4} value={newLead.insights} onChange={e => setNewLead({...newLead, insights: e.target.value})} placeholder="What do we know?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none"></textarea>
              </div>
              <div className="pt-6 flex flex-col space-y-3">
                <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl">Create Lead Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={isCSVOpen}
        onClose={() => setIsCSVOpen(false)}
        userId={user.id}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
};

export default ClientDashboard;
