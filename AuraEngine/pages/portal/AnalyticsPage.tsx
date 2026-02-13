import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Lead, ReportType, ExportFormat, AlertRule, AlertType, AlertNotifyMethod } from '../../types';
import { supabase } from '../../lib/supabase';
import { generateProgrammaticInsights } from '../../lib/insights';
import {
  ChartIcon, TrendUpIcon, TrendDownIcon, TargetIcon, SparklesIcon, CreditCardIcon,
  PieChartIcon, DownloadIcon, FilterIcon, AlertTriangleIcon, BellIcon, RefreshIcon,
  ClockIcon, CheckIcon, PlusIcon, XIcon, FlameIcon, ShieldIcon, MailIcon, CogIcon
} from '../../components/Icons';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

type DateRangePreset = '7d' | '14d' | '30d' | '90d';

const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  '7d': 'Last 7 Days',
  '14d': 'Last 14 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
};

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

// ─── Simulated Campaign Data ───
const generateCampaignData = (leads: Lead[]) => {
  const totalLeads = leads.length || 1;
  const hotCount = leads.filter(l => l.score > 80).length;
  return [
    { name: 'Q4 Launch Sequence', sent: Math.max(120, totalLeads * 3), openRate: 45.2, clickRate: 12.1, convRate: 4.2 },
    { name: 'Product Update Blast', sent: Math.max(85, totalLeads * 2), openRate: 38.7, clickRate: 8.4, convRate: 2.8 },
    { name: 'Webinar Follow-up', sent: Math.max(42, totalLeads), openRate: 52.3, clickRate: 15.2, convRate: 6.1 },
    { name: 'Re-engagement Series', sent: Math.max(65, Math.round(totalLeads * 1.5)), openRate: 28.4, clickRate: 5.6, convRate: 1.9 },
    { name: 'Hot Lead Nurture', sent: Math.max(30, hotCount * 2), openRate: 61.8, clickRate: 22.3, convRate: 9.4 },
  ];
};

// ─── Simulated AI Performance Data ───
const AI_PERFORMANCE_DATA = [
  { model: 'Lead Scoring', accuracy: 94.2, speed: '1.2s', costPer: '$0.08', satisfaction: 92 },
  { model: 'Content Generation', accuracy: 88.5, speed: '4.5s', costPer: '$0.15', satisfaction: 87 },
  { model: 'Predictive Analytics', accuracy: 91.3, speed: '2.1s', costPer: '$0.10', satisfaction: 90 },
  { model: 'Email Optimization', accuracy: 86.7, speed: '3.2s', costPer: '$0.12', satisfaction: 85 },
  { model: 'Sentiment Analysis', accuracy: 89.1, speed: '1.8s', costPer: '$0.06', satisfaction: 88 },
];

const AnalyticsPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('performance');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  // Alert modal
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alerts, setAlerts] = useState<AlertRule[]>(() => {
    const saved = localStorage.getItem(`aura_alerts_${user?.id}`);
    return saved ? JSON.parse(saved) : DEFAULT_ALERTS;
  });
  const [editingAlert, setEditingAlert] = useState<string | null>(null);

  // Insights
  const [insights, setInsights] = useState<ReturnType<typeof generateProgrammaticInsights>>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // ─── Fetch ───
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

      const newInsights = generateProgrammaticInsights(fetchedLeads);
      setInsights(newInsights);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    localStorage.setItem(`aura_alerts_${user?.id}`, JSON.stringify(alerts));
  }, [alerts, user?.id]);

  // ─── Computed Metrics ───
  const metrics = useMemo(() => {
    const total = leads.length;
    const hot = leads.filter(l => l.score > 80).length;
    const qualified = leads.filter(l => l.status === 'Qualified').length;
    const convRate = total > 0 ? ((qualified / total) * 100) : 0;
    const avgScore = total > 0 ? Math.round(leads.reduce((a, b) => a + b.score, 0) / total) : 0;

    // Simulated response time based on score distribution
    const avgResponseHrs = total > 0 ? Math.max(0.4, 3.5 - (avgScore / 40)) : 0;

    // Simulated ROI
    const planCost = user?.plan === 'Pro' ? 149 : user?.plan === 'Enterprise' ? 499 : 29;
    const roi = qualified > 0 ? Math.round((qualified * 500 - planCost) / planCost * 100) : 0;

    // Simulated trend deltas (percentage changes from "last period")
    const totalTrend = total > 5 ? 12 : total > 0 ? 5 : 0;
    const hotTrend = hot > 2 ? 8 : hot > 0 ? 3 : 0;
    const convTrend = convRate > 5 ? 2.3 : convRate > 0 ? 0.5 : 0;
    const responseTrend = avgResponseHrs > 1 ? -0.3 : -0.1;
    const roiTrend = roi > 100 ? 120 : roi > 0 ? 45 : 0;

    return {
      total, hot, convRate: +convRate.toFixed(1), avgResponseHrs: +avgResponseHrs.toFixed(1), roi,
      totalTrend, hotTrend, convTrend, responseTrend, roiTrend, avgScore
    };
  }, [leads, user?.plan]);

  // ─── 30-day Trend Line Data ───
  const trendData = useMemo(() => {
    const days = parseInt(dateRange);
    const data: { day: string; leads: number; conversions: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;

      const dayLeads = leads.filter(l => {
        if (!l.created_at) return false;
        const ld = new Date(l.created_at);
        return ld.getFullYear() === d.getFullYear() && ld.getMonth() === d.getMonth() && ld.getDate() === d.getDate();
      });

      // If real data is sparse, add simulated baseline
      const base = dayLeads.length > 0 ? dayLeads.length : Math.floor(Math.random() * 4) + 1;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      data.push({
        day: label,
        leads: isWeekend ? Math.max(1, Math.floor(base * 0.5)) : base,
        conversions: dayLeads.filter(l => l.status === 'Qualified').length || (Math.random() > 0.6 ? 1 : 0),
      });
    }
    return data;
  }, [leads, dateRange]);

  // ─── Funnel Data ───
  const funnelStages = useMemo(() => {
    const total = leads.length || 100;
    const contacted = leads.filter(l => l.status !== 'New').length || Math.round(total * 0.38);
    const qualified = leads.filter(l => l.status === 'Qualified').length || Math.round(total * 0.15);
    const hot = leads.filter(l => l.score > 80).length || Math.round(total * 0.035);
    const converted = Math.round(qualified * 0.57) || Math.round(total * 0.02);

    return [
      { label: 'Awareness', count: total, color: '#6366f1' },
      { label: 'Interest', count: contacted, color: '#8b5cf6' },
      { label: 'Intent', count: qualified, color: '#a855f7' },
      { label: 'Decision', count: hot, color: '#f59e0b' },
      { label: 'Action', count: converted, color: '#10b981' },
    ];
  }, [leads]);

  const campaignData = useMemo(() => generateCampaignData(leads), [leads]);

  // ─── Derived Insights & Recommendations ───
  const weeklyInsights = useMemo(() => {
    const items: string[] = [];
    const hotPct = metrics.total > 0 ? Math.round((metrics.hot / metrics.total) * 100) : 0;

    if (hotPct > 10) items.push(`Tech leads convert ${Math.max(2, Math.round(hotPct / 5))}x faster than average`);
    else items.push('High-score leads respond 2.5x faster to personalized emails');

    items.push('Tuesday emails get 40% more opens than other days');
    items.push('Case studies drive highest engagement across all content types');

    if (metrics.convRate > 5) items.push(`Qualification rate of ${metrics.convRate}% exceeds industry benchmark`);
    else items.push('Adding social proof to outreach increases reply rate by 35%');

    return items.slice(0, 4);
  }, [metrics]);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    if (metrics.hot > 3) recs.push(`Increase tech industry targeting by 30%`);
    else recs.push('Expand lead sourcing to adjacent industries');

    recs.push('Shift email sends to Tuesday AM for peak engagement');
    recs.push('Create 3 more case studies this month');

    if (metrics.total > 20) recs.push('Set up automated follow-ups for leads idle 7+ days');
    else recs.push('Increase lead volume with content marketing campaigns');

    return recs.slice(0, 4);
  }, [metrics]);

  // ─── Handlers ───
  const refreshInsights = useCallback(() => {
    setInsightsLoading(true);
    setTimeout(() => {
      const newInsights = generateProgrammaticInsights(leads);
      setInsights(newInsights);
      setInsightsLoading(false);
    }, 800);
  }, [leads]);

  const handleGenerateReport = () => {
    setReportGenerating(true);
    setReportReady(false);
    setTimeout(() => {
      setReportGenerating(false);
      setReportReady(true);
    }, 2500);
  };

  const handleDownloadReport = () => {
    const reportType = REPORT_TYPES.find(r => r.type === selectedReportType);
    if (selectedFormat === 'csv') {
      const csvContent = `Report Type,${reportType?.label}\nTotal Leads,${leads.length}\nConversion Rate,${metrics.convRate}%\nAI Score,${metrics.avgScore}\nROI,${metrics.roi}%\n\nLead Name,Company,Score,Status\n${leads.map(l => `${l.name},${l.company},${l.score},${l.status}`).join('\n')}`;
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

  const handleExportInsights = () => {
    const content = `AuraFunnel AI Insights Report\nGenerated: ${new Date().toLocaleDateString()}\n\n--- Top Insights ---\n${weeklyInsights.map((ins, i) => `${i + 1}. ${ins}`).join('\n')}\n\n--- Recommendations ---\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n--- Key Metrics ---\nTotal Leads: ${metrics.total}\nHot Leads: ${metrics.hot}\nConversion Rate: ${metrics.convRate}%\nAvg Response: ${metrics.avgResponseHrs} hrs\nROI: ${metrics.roi}%`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_insights_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER BAR                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
            Analytics <span className="text-slate-300 mx-1">&rsaquo;</span> Performance Overview
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Real-time intelligence across your entire pipeline</p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Date Range Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ClockIcon className="w-4 h-4 text-slate-400" />
              <span>{DATE_RANGE_LABELS[dateRange]}</span>
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {dateDropdownOpen && (
              <div className="absolute right-0 top-12 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-44 py-1">
                {(Object.entries(DATE_RANGE_LABELS) as [DateRangePreset, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setDateRange(key); setDateDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      dateRange === key ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Button */}
          <button
            onClick={() => { setShowExportModal(true); setReportReady(false); }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <DownloadIcon className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEY METRICS ROW                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Leads', value: metrics.total.toLocaleString(), trend: metrics.totalTrend, trendLabel: `${metrics.totalTrend}%`, up: true, color: 'indigo', icon: <TargetIcon className="w-5 h-5" /> },
          { label: 'Hot Leads', value: metrics.hot.toLocaleString(), trend: metrics.hotTrend, trendLabel: `${metrics.hotTrend}%`, up: true, color: 'rose', icon: <FlameIcon className="w-5 h-5" /> },
          { label: 'Conv. Rate', value: `${metrics.convRate}%`, trend: metrics.convTrend, trendLabel: `${metrics.convTrend}%`, up: true, color: 'emerald', icon: <TrendUpIcon className="w-5 h-5" /> },
          { label: 'Avg. Response', value: `${metrics.avgResponseHrs} hrs`, trend: metrics.responseTrend, trendLabel: `${Math.abs(metrics.responseTrend)} hrs`, up: false, color: 'amber', icon: <ClockIcon className="w-5 h-5" /> },
          { label: 'ROI', value: `${metrics.roi}%`, trend: metrics.roiTrend, trendLabel: `${metrics.roiTrend}%`, up: true, color: 'violet', icon: <CreditCardIcon className="w-5 h-5" /> },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl bg-${m.color}-50 flex items-center justify-center text-${m.color}-600`}>
                {m.icon}
              </div>
              {m.trend !== 0 && (
                <span className={`inline-flex items-center space-x-1 text-xs font-bold ${m.up ? 'text-emerald-600' : 'text-emerald-600'}`}>
                  {m.up ? <TrendUpIcon className="w-3.5 h-3.5" /> : <TrendDownIcon className="w-3.5 h-3.5" />}
                  <span>{m.up ? '\u25B2' : '\u25BC'} {m.trendLabel}</span>
                </span>
              )}
            </div>
            <p className="text-2xl font-black text-slate-900">{m.value}</p>
            <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">{m.label}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT (75%) + AI INSIGHTS SIDEBAR (25%)                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ─── Main Content (75%) ─── */}
        <div className="lg:w-[75%] space-y-6">

          {/* CHART AREA */}
          <div className="space-y-6">
            {/* Lead Generation Trend */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 font-heading">Lead Generation Trend</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{DATE_RANGE_LABELS[dateRange]} &middot; Daily new leads</p>
                </div>
                <div className="flex items-center space-x-3 text-xs">
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-1.5 bg-indigo-500 rounded-full"></span><span className="text-slate-500 font-medium">Leads</span></span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-1.5 bg-emerald-500 rounded-full"></span><span className="text-slate-500 font-medium">Conversions</span></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <defs>
                    <linearGradient id="leadLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={Math.max(0, Math.floor(trendData.length / 8) - 1)} />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} />
                  <Line type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#6366f1' }} />
                  <Line type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" activeDot={{ r: 4, fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Conversion Funnel */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-bold text-slate-800 font-heading">Conversion Funnel</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Awareness &rarr; Interest &rarr; Intent &rarr; Decision &rarr; Action</p>
                </div>
              </div>

              <div className="space-y-3">
                {funnelStages.map((stage, i) => {
                  const maxCount = funnelStages[0].count || 1;
                  const widthPct = Math.max(8, (stage.count / maxCount) * 100);
                  const prevCount = i > 0 ? funnelStages[i - 1].count : null;
                  const dropOff = prevCount ? Math.round(((prevCount - stage.count) / prevCount) * 100) : null;

                  return (
                    <div key={i} className="flex items-center space-x-4">
                      <div className="w-20 text-right shrink-0">
                        <p className="text-xs font-bold text-slate-600">{stage.label}</p>
                      </div>
                      <div className="flex-1 relative">
                        <div className="h-10 bg-slate-50 rounded-xl overflow-hidden">
                          <div
                            className="h-full rounded-xl flex items-center transition-all duration-700 relative"
                            style={{ width: `${widthPct}%`, backgroundColor: stage.color }}
                          >
                            <span className="absolute left-3 text-white font-black text-sm">
                              {stage.count.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        {dropOff !== null ? (
                          <span className="text-xs font-semibold text-slate-400">
                            <span className="text-rose-500">&darr;{dropOff}%</span> drop-off
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">100%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* DATA TABLES */}
          <div className="space-y-6">
            {/* Top Performing Campaigns */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 font-heading">Top Performing Campaigns</h3>
                <p className="text-xs text-slate-400 mt-0.5">Email sequence performance across active campaigns</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Campaign</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Sent</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Open %</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Click %</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Conv.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {campaignData.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3.5">
                          <span className="font-semibold text-sm text-slate-800">{c.name}</span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className="text-sm font-semibold text-slate-600">{c.sent.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className={`text-sm font-bold ${c.openRate > 50 ? 'text-emerald-600' : c.openRate > 35 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {c.openRate}%
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className={`text-sm font-bold ${c.clickRate > 15 ? 'text-emerald-600' : c.clickRate > 8 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {c.clickRate}%
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
                            c.convRate > 5 ? 'bg-emerald-50 text-emerald-700' : c.convRate > 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
                          }`}>
                            {c.convRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Performance Metrics */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 font-heading">AI Performance Metrics</h3>
                <p className="text-xs text-slate-400 mt-0.5">Model accuracy, speed, and cost efficiency</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Model</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Acc. %</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Speed</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Cost/Req</th>
                      <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Satis.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {AI_PERFORMANCE_DATA.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                              <SparklesIcon className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-sm text-slate-800">{row.model}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className={`text-sm font-bold ${row.accuracy > 90 ? 'text-emerald-600' : row.accuracy > 85 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {row.accuracy}%
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className="text-sm font-semibold text-slate-600">{row.speed}</span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className="text-sm font-semibold text-slate-600">{row.costPer}</span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${row.satisfaction > 90 ? 'bg-emerald-500' : row.satisfaction > 85 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${row.satisfaction}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-bold text-slate-500">{row.satisfaction}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ─── AI Insights Sidebar (25%) ─── */}
        <div className="lg:w-[25%] space-y-5">
          {/* Top Insights */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-sm font-heading">Top Insights This Week</h3>
              <button
                onClick={refreshInsights}
                disabled={insightsLoading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
              >
                <RefreshIcon className={`w-4 h-4 ${insightsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-3">
              {weeklyInsights.map((insight, i) => (
                <div key={i} className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-black text-indigo-600">{i + 1}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 text-sm font-heading mb-4">Recommendations</h3>
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start space-x-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckIcon className="w-3 h-3 text-emerald-600" />
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline Health Summary */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg">
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-200 mb-3">Pipeline Health</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-black">{metrics.total}</p>
                <p className="text-[10px] text-indigo-200 font-semibold">Total Leads</p>
              </div>
              <div>
                <p className="text-2xl font-black">{metrics.hot}</p>
                <p className="text-[10px] text-indigo-200 font-semibold">Hot Leads</p>
              </div>
              <div>
                <p className="text-2xl font-black">{metrics.convRate}%</p>
                <p className="text-[10px] text-indigo-200 font-semibold">Conv. Rate</p>
              </div>
              <div>
                <p className="text-2xl font-black">{metrics.avgScore}</p>
                <p className="text-[10px] text-indigo-200 font-semibold">Avg AI Score</p>
              </div>
            </div>
          </div>

          {/* Deep Insights (from programmatic engine) */}
          {insights.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 text-sm font-heading mb-3">AI Deep Analysis</h3>
              <div className="space-y-3">
                {insights.slice(0, 3).map((insight) => (
                  <div key={insight.id} className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-bold text-slate-700">{insight.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{insight.description}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <div className="w-12 h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${insight.confidence}%` }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{insight.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={() => setShowAlertModal(true)}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              <BellIcon className="w-4 h-4 text-amber-500" />
              <span>Create Alert</span>
            </button>
            <button
              onClick={handleExportInsights}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              <DownloadIcon className="w-4 h-4 text-indigo-500" />
              <span>Export Insights</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* EXPORT MODAL                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowExportModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900">Export Report</h2>
                <p className="text-xs text-slate-400 mt-0.5">Generate and download analytics reports</p>
              </div>
              <button onClick={() => setShowExportModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Report Type Selection */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-3">Report Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {REPORT_TYPES.map(rt => (
                    <button
                      key={rt.type}
                      onClick={() => { setSelectedReportType(rt.type); setReportReady(false); }}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        selectedReportType === rt.type
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                        selectedReportType === rt.type ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {rt.icon}
                      </div>
                      <p className="font-bold text-slate-800 text-xs">{rt.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Export Format</label>
                <div className="flex space-x-2">
                  {EXPORT_FORMATS.map(ef => (
                    <button
                      key={ef.format}
                      onClick={() => setSelectedFormat(ef.format)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        selectedFormat === ef.format
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {ef.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Preview</p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                    <p className="text-xl font-black text-slate-900">{metrics.total}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Leads</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-emerald-600">{metrics.convRate}%</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Conv.</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-indigo-600">{metrics.avgScore}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">AI Score</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-violet-600">{metrics.roi}%</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">ROI</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
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
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ALERT CONFIGURATION MODAL                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAlertModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900">Alert Configuration</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure automated notifications &middot; {alerts.filter(a => a.enabled).length} active
                </p>
              </div>
              <button onClick={() => setShowAlertModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`rounded-xl border transition-all ${
                    alert.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                  }`}
                >
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        alert.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {ALERT_TYPE_ICONS[alert.type]}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{alert.name}</p>
                        <p className="text-xs text-slate-500">{alert.condition}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="hidden md:flex items-center space-x-1">
                        {alert.notifyMethods.map(m => (
                          <span key={m} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[10px] font-bold uppercase">
                            {NOTIFY_METHOD_LABELS[m]}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => toggleAlert(alert.id)}
                        className={`relative w-11 h-6 rounded-full transition-all ${
                          alert.enabled ? 'bg-indigo-600' : 'bg-slate-200'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                          alert.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}></div>
                      </button>
                      <button
                        onClick={() => setEditingAlert(editingAlert === alert.id ? null : alert.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <CogIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {editingAlert === alert.id && (
                    <div className="px-4 pb-4 pt-0 border-t border-slate-100 mt-0">
                      <div className="pt-3 space-y-3">
                        {alert.threshold !== undefined && (
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Threshold</label>
                            <input
                              type="number"
                              value={alert.threshold}
                              onChange={e => updateAlertThreshold(alert.id, parseInt(e.target.value) || 0)}
                              className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">Notify Via</label>
                          <div className="flex flex-wrap gap-2">
                            {(Object.entries(NOTIFY_METHOD_LABELS) as [AlertNotifyMethod, string][]).map(([method, label]) => (
                              <button
                                key={method}
                                onClick={() => toggleAlertMethod(alert.id, method)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  alert.notifyMethods.includes(method)
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
