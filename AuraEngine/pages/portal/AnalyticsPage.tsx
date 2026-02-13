import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Lead, ReportType, ExportFormat, AlertRule, AlertType, AlertNotifyMethod } from '../../types';
import { supabase } from '../../lib/supabase';
import { generateProgrammaticInsights } from '../../lib/insights';
import {
  ChartIcon, TrendUpIcon, TrendDownIcon, TargetIcon, SparklesIcon, CreditCardIcon,
  PieChartIcon, DownloadIcon, FilterIcon, AlertTriangleIcon, BellIcon, RefreshIcon,
  ClockIcon, CheckIcon, PlusIcon, XIcon, FlameIcon, ShieldIcon, MailIcon
} from '../../components/Icons';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

const REPORT_TYPES: { type: ReportType; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'performance', label: 'Performance Overview', desc: 'Lead pipeline health, conversion rates, and scoring trends', icon: <ChartIcon className="w-5 h-5" /> },
  { type: 'lead_source', label: 'Lead Source Analysis', desc: 'Breakdown of lead origins and quality by source', icon: <TargetIcon className="w-5 h-5" /> },
  { type: 'roi_cost', label: 'ROI & Cost Analysis', desc: 'Cost per lead, revenue attribution, and ROI calculations', icon: <CreditCardIcon className="w-5 h-5" /> },
  { type: 'ai_effectiveness', label: 'AI Effectiveness', desc: 'AI scoring accuracy, content performance, and model metrics', icon: <SparklesIcon className="w-5 h-5" /> },
  { type: 'email_campaign', label: 'Email Campaign Report', desc: 'Open rates, click-through, reply rates across campaigns', icon: <MailIcon className="w-5 h-5" /> },
  { type: 'team_productivity', label: 'Team Productivity', desc: 'Activity per user, response times, and task completion', icon: <PieChartIcon className="w-5 h-5" /> },
];

const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'pdf', label: 'PDF Report' },
  { format: 'excel', label: 'Excel Spreadsheet' },
  { format: 'csv', label: 'CSV Data' },
  { format: 'pptx', label: 'PowerPoint Deck' },
];

const DEFAULT_ALERTS: AlertRule[] = [
  { id: 'alert-1', name: 'Hot Lead Detected', type: 'hot_lead', enabled: true, condition: 'Lead score exceeds threshold', threshold: 80, notifyMethods: ['in_app', 'email'], triggerCount: 0 },
  { id: 'alert-2', name: 'Lead Stagnation Warning', type: 'stagnation', enabled: true, condition: 'No activity for 14+ days', threshold: 14, notifyMethods: ['in_app'], triggerCount: 0 },
  { id: 'alert-3', name: 'Campaign Performance Drop', type: 'campaign_drop', enabled: false, condition: 'Conversion rate drops below threshold', threshold: 10, notifyMethods: ['in_app', 'slack'], triggerCount: 0 },
  { id: 'alert-4', name: 'High-Value Engagement', type: 'high_value', enabled: true, condition: 'Lead from target account engages', notifyMethods: ['in_app', 'email', 'sms'], triggerCount: 0 },
  { id: 'alert-5', name: 'AI Accuracy Drop', type: 'ai_accuracy_drop', enabled: false, condition: 'AI prediction accuracy falls below threshold', threshold: 70, notifyMethods: ['in_app'], triggerCount: 0 },
  { id: 'alert-6', name: 'System Health Alert', type: 'system_health', enabled: true, condition: 'API errors exceed threshold per hour', threshold: 5, notifyMethods: ['in_app', 'email', 'slack'], triggerCount: 0 },
];

const ALERT_TYPE_ICONS: Record<AlertType, React.ReactNode> = {
  hot_lead: <FlameIcon className="w-4 h-4" />,
  stagnation: <ClockIcon className="w-4 h-4" />,
  campaign_drop: <TrendDownIcon className="w-4 h-4" />,
  high_value: <TargetIcon className="w-4 h-4" />,
  ai_accuracy_drop: <SparklesIcon className="w-4 h-4" />,
  system_health: <ShieldIcon className="w-4 h-4" />,
};

const NOTIFY_METHOD_LABELS: Record<AlertNotifyMethod, string> = {
  in_app: 'In-App',
  email: 'Email',
  slack: 'Slack',
  sms: 'SMS',
};

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

const AnalyticsPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'insights' | 'alerts'>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Dashboard metrics
  const [dailyActiveLeads, setDailyActiveLeads] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [contentPerformance, setContentPerformance] = useState(0);
  const [aiAccuracyScore, setAiAccuracyScore] = useState(0);
  const [costPerLead, setCostPerLead] = useState(0);
  const [roi, setRoi] = useState(0);
  const [scoreDistribution, setScoreDistribution] = useState<{ name: string; value: number }[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<{ day: string; leads: number; conversions: number }[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number }[]>([]);

  // Reports
  const [selectedReportType, setSelectedReportType] = useState<ReportType | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [reportDateRange, setReportDateRange] = useState({ start: '', end: '' });
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  // Insights
  const [insights, setInsights] = useState<ReturnType<typeof generateProgrammaticInsights>>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Alerts
  const [alerts, setAlerts] = useState<AlertRule[]>(() => {
    const saved = localStorage.getItem(`aura_alerts_${user?.id}`);
    return saved ? JSON.parse(saved) : DEFAULT_ALERTS;
  });
  const [editingAlert, setEditingAlert] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: leadsData } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });

      const fetchedLeads = (leadsData || []) as Lead[];
      setLeads(fetchedLeads);

      // Compute metrics
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayLeads = fetchedLeads.filter(l => l.created_at && new Date(l.created_at) >= today);
      setDailyActiveLeads(todayLeads.length || fetchedLeads.length);

      const qualified = fetchedLeads.filter(l => l.status === 'Qualified').length;
      setConversionRate(fetchedLeads.length > 0 ? Math.round((qualified / fetchedLeads.length) * 100) : 0);

      // Content performance = percentage of contacted/qualified leads (simulated)
      const engaged = fetchedLeads.filter(l => l.status !== 'New' && l.status !== 'Lost').length;
      setContentPerformance(fetchedLeads.length > 0 ? Math.round((engaged / fetchedLeads.length) * 100) : 0);

      const avgScore = fetchedLeads.length > 0
        ? Math.round(fetchedLeads.reduce((a, b) => a + b.score, 0) / fetchedLeads.length)
        : 0;
      setAiAccuracyScore(avgScore);

      // Simulated cost metrics based on plan
      const planCost = user.plan === 'Pro' ? 149 : user.plan === 'Enterprise' ? 499 : 29;
      setCostPerLead(fetchedLeads.length > 0 ? Math.round((planCost / fetchedLeads.length) * 100) / 100 : 0);
      setRoi(qualified > 0 ? Math.round((qualified * 500 - planCost) / planCost * 100) : 0);

      // Score distribution for pie chart
      const hot = fetchedLeads.filter(l => l.score > 80).length;
      const warm = fetchedLeads.filter(l => l.score > 50 && l.score <= 80).length;
      const cold = fetchedLeads.filter(l => l.score <= 50).length;
      setScoreDistribution([
        { name: 'Hot (80+)', value: hot },
        { name: 'Warm (50-80)', value: warm },
        { name: 'Cold (<50)', value: cold },
      ].filter(d => d.value > 0));

      // Status breakdown
      const statusMap: Record<string, number> = {};
      fetchedLeads.forEach(l => { statusMap[l.status] = (statusMap[l.status] || 0) + 1; });
      setStatusBreakdown(Object.entries(statusMap).map(([name, value]) => ({ name, value })));

      // Weekly trend (simulated from created_at dates)
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const trendData = days.map((day, i) => {
        const dayLeads = fetchedLeads.filter(l => {
          if (!l.created_at) return false;
          return new Date(l.created_at).getDay() === (i + 1) % 7;
        });
        return {
          day,
          leads: dayLeads.length,
          conversions: dayLeads.filter(l => l.status === 'Qualified').length,
        };
      });
      setWeeklyTrend(trendData);

      // Generate insights
      const newInsights = generateProgrammaticInsights(fetchedLeads);
      setInsights(newInsights);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.plan]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    localStorage.setItem(`aura_alerts_${user?.id}`, JSON.stringify(alerts));
  }, [alerts, user?.id]);

  const refreshInsights = useCallback(() => {
    setInsightsLoading(true);
    setTimeout(() => {
      const newInsights = generateProgrammaticInsights(leads);
      setInsights(newInsights);
      setInsightsLoading(false);
    }, 800);
  }, [leads]);

  const handleGenerateReport = () => {
    if (!selectedReportType) return;
    setReportGenerating(true);
    setReportReady(false);
    setTimeout(() => {
      setReportGenerating(false);
      setReportReady(true);
    }, 2500);
  };

  const handleDownloadReport = () => {
    const reportType = REPORT_TYPES.find(r => r.type === selectedReportType);
    const csvContent = selectedFormat === 'csv'
      ? `Report Type,${reportType?.label}\nTotal Leads,${leads.length}\nConversion Rate,${conversionRate}%\nAI Score,${aiAccuracyScore}\nCost Per Lead,$${costPerLead}\nROI,${roi}%\n\nLead Name,Company,Score,Status\n${leads.map(l => `${l.name},${l.company},${l.score},${l.status}`).join('\n')}`
      : '';

    if (selectedFormat === 'csv' && csvContent) {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType?.label || 'report'}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert(`${selectedFormat.toUpperCase()} export would be generated server-side in production. CSV export is available now.`);
    }
  };

  const toggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const toggleAlertMethod = (alertId: string, method: AlertNotifyMethod) => {
    setAlerts(prev => prev.map(a => {
      if (a.id !== alertId) return a;
      const methods = a.notifyMethods.includes(method)
        ? a.notifyMethods.filter(m => m !== method)
        : [...a.notifyMethods, method];
      return { ...a, notifyMethods: methods };
    }));
  };

  const updateAlertThreshold = (alertId: string, threshold: number) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, threshold } : a));
  };

  const tabs = [
    { key: 'dashboard' as const, label: 'Real-Time Dashboard', icon: <ChartIcon className="w-4 h-4" /> },
    { key: 'reports' as const, label: 'Custom Reports', icon: <PieChartIcon className="w-4 h-4" /> },
    { key: 'insights' as const, label: 'AI Insights', icon: <SparklesIcon className="w-4 h-4" /> },
    { key: 'alerts' as const, label: 'Alert System', icon: <BellIcon className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">Analytics Command Center</h1>
          <p className="text-slate-500 mt-1 text-sm">Real-time intelligence across your entire pipeline</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
        >
          <RefreshIcon className="w-4 h-4" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* === TAB: Real-Time Dashboard === */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* 6 Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Active Leads', value: dailyActiveLeads, color: 'indigo', icon: <TargetIcon className="w-5 h-5" />, unit: '' },
              { label: 'Conversion Rate', value: conversionRate, color: 'emerald', icon: <TrendUpIcon className="w-5 h-5" />, unit: '%' },
              { label: 'Content Perf.', value: contentPerformance, color: 'violet', icon: <SparklesIcon className="w-5 h-5" />, unit: '%' },
              { label: 'AI Accuracy', value: aiAccuracyScore, color: 'amber', icon: <ChartIcon className="w-5 h-5" />, unit: '/100' },
              { label: 'Cost Per Lead', value: costPerLead, color: 'rose', icon: <CreditCardIcon className="w-5 h-5" />, unit: '$', prefix: true },
              { label: 'ROI', value: roi, color: 'cyan', icon: <TrendUpIcon className="w-5 h-5" />, unit: '%' },
            ].map((metric, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 rounded-xl bg-${metric.color}-50 flex items-center justify-center text-${metric.color}-600 mb-3`}>
                  {metric.icon}
                </div>
                <p className="text-2xl font-black text-slate-900">
                  {metric.prefix && '$'}{metric.value.toLocaleString()}{!metric.prefix && metric.unit}
                </p>
                <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">{metric.label}</p>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Trend */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Weekly Pipeline Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={weeklyTrend}>
                  <defs>
                    <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area type="monotone" dataKey="leads" stroke="#6366f1" fill="url(#gradLeads)" strokeWidth={2} name="Leads" />
                  <Area type="monotone" dataKey="conversions" stroke="#10b981" fill="url(#gradConv)" strokeWidth={2} name="Conversions" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Score Distribution + Status Breakdown */}
            <div className="grid grid-rows-2 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">Lead Score Distribution</h3>
                <div className="flex items-center space-x-6">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={scoreDistribution} cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={3} dataKey="value">
                        {scoreDistribution.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {scoreDistribution.map((item, i) => (
                      <div key={item.name} className="flex items-center space-x-2 text-xs">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                        <span className="text-slate-600 font-medium">{item.name}: <span className="font-bold text-slate-900">{item.value}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">Status Breakdown</h3>
                <ResponsiveContainer width="100%" height={90}>
                  <BarChart data={statusBreakdown} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" width={70} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                    <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Conversion Funnel */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Conversion Funnel</h3>
            <div className="flex items-end justify-center space-x-2 h-48">
              {[
                { label: 'All Leads', count: leads.length, color: '#6366f1' },
                { label: 'Contacted', count: leads.filter(l => l.status === 'Contacted').length + leads.filter(l => l.status === 'Qualified').length, color: '#8b5cf6' },
                { label: 'Qualified', count: leads.filter(l => l.status === 'Qualified').length, color: '#10b981' },
                { label: 'Hot (80+)', count: leads.filter(l => l.score > 80).length, color: '#f59e0b' },
              ].map((stage, i, arr) => {
                const maxCount = arr[0].count || 1;
                const heightPct = Math.max(15, (stage.count / maxCount) * 100);
                return (
                  <div key={i} className="flex flex-col items-center flex-1 max-w-[140px]">
                    <div
                      className="w-full rounded-t-xl transition-all duration-700 relative group"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: stage.color,
                        minHeight: '24px',
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-black text-lg">{stage.count}</span>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-600 mt-2 text-center">{stage.label}</p>
                    {i < arr.length - 1 && (
                      <p className="text-[10px] text-slate-400 font-semibold">
                        {maxCount > 0 ? Math.round((stage.count / maxCount) * 100) : 0}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* === TAB: Custom Reports === */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">Select Report Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.type}
                  onClick={() => { setSelectedReportType(rt.type); setReportReady(false); }}
                  className={`text-left p-5 rounded-2xl border-2 transition-all ${
                    selectedReportType === rt.type
                      ? 'border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100'
                      : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                    selectedReportType === rt.type ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {rt.icon}
                  </div>
                  <p className="font-bold text-slate-900 text-sm">{rt.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{rt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedReportType && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Configure & Export</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={reportDateRange.start}
                    onChange={e => setReportDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={reportDateRange.end}
                    onChange={e => setReportDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Export Format</label>
                  <div className="flex space-x-2">
                    {EXPORT_FORMATS.map(ef => (
                      <button
                        key={ef.format}
                        onClick={() => setSelectedFormat(ef.format)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                          selectedFormat === ef.format
                            ? 'bg-indigo-600 text-white shadow-lg'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {ef.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Report Preview */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Report Preview</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-black text-slate-900">{leads.length}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Leads</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-emerald-600">{conversionRate}%</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Conv. Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-indigo-600">{aiAccuracyScore}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Avg AI Score</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-amber-600">${costPerLead}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Cost/Lead</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleGenerateReport}
                  disabled={reportGenerating}
                  className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                >
                  {reportGenerating ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <FilterIcon className="w-4 h-4" />
                  )}
                  <span>{reportGenerating ? 'Generating...' : 'Generate Report'}</span>
                </button>

                {reportReady && (
                  <button
                    onClick={handleDownloadReport}
                    className="flex items-center space-x-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    <span>Download {selectedFormat.toUpperCase()}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === TAB: AI Insights === */}
      {activeTab === 'insights' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">Weekly AI Recommendations</h3>
              <p className="text-xs text-slate-500 mt-0.5">Data-driven insights from your pipeline analysis</p>
            </div>
            <button
              onClick={refreshInsights}
              disabled={insightsLoading}
              className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
            >
              <RefreshIcon className={`w-4 h-4 ${insightsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Analysis</span>
            </button>
          </div>

          {insights.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
              <SparklesIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">Add more leads to generate AI insights</p>
              <p className="text-xs text-slate-400 mt-1">Insights are computed from your lead data patterns</p>
            </div>
          ) : (
            <div className="space-y-4">
              {insights.map((insight, i) => {
                const categoryColors: Record<string, string> = {
                  score: 'indigo', timing: 'amber', company: 'violet',
                  conversion: 'emerald', engagement: 'rose',
                };
                const color = categoryColors[insight.category] || 'slate';
                return (
                  <div key={insight.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4">
                        <div className={`w-10 h-10 rounded-xl bg-${color}-50 flex items-center justify-center text-${color}-600 shrink-0 mt-0.5`}>
                          <span className="text-lg font-black">{i + 1}</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{insight.title}</p>
                          <p className="text-sm text-slate-500 mt-1">{insight.description}</p>
                          {insight.action && (
                            <div className="mt-3">
                              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold">
                                <CheckIcon className="w-3 h-3" />
                                <span>{insight.action}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-${color}-50 text-${color}-600`}>
                          {insight.category}
                        </span>
                        <div className="mt-2">
                          <div className="flex items-center space-x-1.5">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full bg-${color}-500 rounded-full`} style={{ width: `${insight.confidence}%` }}></div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">{insight.confidence}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary Stats */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-xl">
            <h3 className="text-sm font-black uppercase tracking-wider text-indigo-200 mb-4">Pipeline Health Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-3xl font-black">{leads.length}</p>
                <p className="text-xs text-indigo-200 font-semibold mt-0.5">Total Pipeline</p>
              </div>
              <div>
                <p className="text-3xl font-black">{leads.filter(l => l.score > 80).length}</p>
                <p className="text-xs text-indigo-200 font-semibold mt-0.5">Hot Leads</p>
              </div>
              <div>
                <p className="text-3xl font-black">{conversionRate}%</p>
                <p className="text-xs text-indigo-200 font-semibold mt-0.5">Conversion Rate</p>
              </div>
              <div>
                <p className="text-3xl font-black">{aiAccuracyScore}</p>
                <p className="text-xs text-indigo-200 font-semibold mt-0.5">Avg AI Score</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === TAB: Alert System === */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">Alert Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure automated notifications for key pipeline events</p>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="font-bold text-slate-500">{alerts.filter(a => a.enabled).length} active alerts</span>
            </div>
          </div>

          <div className="space-y-4">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={`bg-white rounded-2xl border transition-all ${
                  alert.enabled ? 'border-slate-100 shadow-sm' : 'border-slate-50 opacity-60'
                }`}
              >
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      alert.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'
                    }`}>
                      {ALERT_TYPE_ICONS[alert.type]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{alert.name}</p>
                      <p className="text-xs text-slate-500">{alert.condition}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    {/* Notify methods badges */}
                    <div className="hidden md:flex items-center space-x-1.5">
                      {alert.notifyMethods.map(m => (
                        <span key={m} className="px-2 py-1 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-bold uppercase">
                          {NOTIFY_METHOD_LABELS[m]}
                        </span>
                      ))}
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => toggleAlert(alert.id)}
                      className={`relative w-12 h-6 rounded-full transition-all ${
                        alert.enabled ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                        alert.enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}></div>
                    </button>

                    {/* Expand */}
                    <button
                      onClick={() => setEditingAlert(editingAlert === alert.id ? null : alert.id)}
                      className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <CogIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Config */}
                {editingAlert === alert.id && (
                  <div className="px-5 pb-5 pt-0 border-t border-slate-50 mt-0">
                    <div className="pt-4 space-y-4">
                      {/* Threshold */}
                      {alert.threshold !== undefined && (
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">Threshold</label>
                          <input
                            type="number"
                            value={alert.threshold}
                            onChange={e => updateAlertThreshold(alert.id, parseInt(e.target.value) || 0)}
                            className="w-32 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                          />
                        </div>
                      )}

                      {/* Notification Methods */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-2">Notification Methods</label>
                        <div className="flex flex-wrap gap-2">
                          {(Object.entries(NOTIFY_METHOD_LABELS) as [AlertNotifyMethod, string][]).map(([method, label]) => (
                            <button
                              key={method}
                              onClick={() => toggleAlertMethod(alert.id, method)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                alert.notifyMethods.includes(method)
                                  ? 'bg-indigo-600 text-white shadow-lg'
                                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {alert.triggerCount > 0 && (
                        <p className="text-xs text-slate-400">
                          Triggered {alert.triggerCount} time{alert.triggerCount > 1 ? 's' : ''}
                          {alert.lastTriggered && ` • Last: ${new Date(alert.lastTriggered).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
