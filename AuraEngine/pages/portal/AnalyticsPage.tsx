import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Lead, ReportType, ExportFormat, AlertRule, AlertType, AlertNotifyMethod } from '../../types';
import { supabase } from '../../lib/supabase';
import { generateProgrammaticInsights } from '../../lib/insights';
import { useAnalyticsData, computeTrend } from '../../hooks/useAnalyticsData';
import {
  ChartIcon, TrendUpIcon, TrendDownIcon, TargetIcon, SparklesIcon, CreditCardIcon,
  PieChartIcon, DownloadIcon, FilterIcon, AlertTriangleIcon, BellIcon, RefreshIcon,
  ClockIcon, CheckIcon, PlusIcon, XIcon, FlameIcon, ShieldIcon, MailIcon, CogIcon,
  ArrowRightIcon, ArrowLeftIcon, CalendarIcon, UsersIcon, LinkIcon, SendIcon, CopyIcon,
  BookIcon, BoltIcon, EyeIcon, KeyboardIcon, ActivityIcon, BrainIcon, MessageIcon
} from '../../components/Icons';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

type DateRangePreset = '7d' | '14d' | '30d' | '90d';
type ReportBuilderStep = 1 | 2 | 3;
type ReportMode = 'quick' | 'custom';
type VizType = 'bar' | 'line' | 'pie' | 'table' | 'scorecard' | 'heatmap';

interface QuickReportOption {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  type: ReportType;
  presetMetrics: string[];
  presetTimeframe: string;
}

interface ReportFinding {
  title: string;
  detail: string;
  action: string;
  trend: 'up' | 'down' | 'flat';
  delta: string;
}

interface ReportSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
}

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

const QUICK_REPORTS: QuickReportOption[] = [
  { id: 'daily', label: 'Daily Snapshot', desc: 'What happened today', icon: <ClockIcon className="w-5 h-5" />, type: 'performance', presetMetrics: ['lead_volume', 'conversion_rate', 'ai_accuracy', 'team_response'], presetTimeframe: '1d' },
  { id: 'weekly', label: 'Weekly Performance', desc: 'Week-over-week trends', icon: <ChartIcon className="w-5 h-5" />, type: 'performance', presetMetrics: ['lead_volume', 'conversion_rate', 'campaign_perf', 'content_engagement'], presetTimeframe: '7d' },
  { id: 'monthly', label: 'Monthly Deep Dive', desc: 'Comprehensive analysis', icon: <BookIcon className="w-5 h-5" />, type: 'performance', presetMetrics: ['lead_volume', 'conversion_rate', 'ai_accuracy', 'cost_per_lead', 'roi', 'team_response', 'campaign_perf', 'content_engagement'], presetTimeframe: '30d' },
  { id: 'campaign_roi', label: 'Campaign ROI', desc: 'Return on investment', icon: <CreditCardIcon className="w-5 h-5" />, type: 'roi_cost', presetMetrics: ['campaign_perf', 'cost_per_lead', 'roi', 'content_engagement'], presetTimeframe: '30d' },
  { id: 'team_prod', label: 'Team Productivity', desc: 'Individual performance', icon: <UsersIcon className="w-5 h-5" />, type: 'team_productivity', presetMetrics: ['team_response', 'lead_volume', 'conversion_rate'], presetTimeframe: '7d' },
];

const REPORT_METRICS = [
  { id: 'lead_volume', label: 'Lead Volume', category: 'Pipeline' },
  { id: 'conversion_rate', label: 'Conversion Rate', category: 'Pipeline' },
  { id: 'ai_accuracy', label: 'AI Accuracy', category: 'AI' },
  { id: 'cost_per_lead', label: 'Cost per Lead', category: 'Financial' },
  { id: 'team_response', label: 'Team Response Time', category: 'Team' },
  { id: 'roi', label: 'ROI', category: 'Financial' },
  { id: 'campaign_perf', label: 'Campaign Performance', category: 'Marketing' },
  { id: 'content_engagement', label: 'Content Engagement', category: 'Marketing' },
];

const REPORT_FILTERS = [
  { id: 'team_member', label: 'By Team Member', options: ['Sarah Chen', 'Alex Rivera', 'Jordan Kim', 'Casey Morgan', 'Taylor Brooks'] },
  { id: 'lead_source', label: 'By Lead Source', options: ['LinkedIn', 'Website', 'Referral', 'Cold Outreach', 'Webinar'] },
  { id: 'industry', label: 'By Industry', options: ['SaaS', 'FinTech', 'Healthcare', 'E-commerce', 'Manufacturing'] },
  { id: 'campaign', label: 'By Campaign', options: ['Q4 Launch', 'Product Update', 'Webinar Series', 'Re-engagement', 'Hot Lead Nurture'] },
];

const VIZ_OPTIONS: { id: VizType; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'bar', label: 'Bar Chart', desc: 'Compare categories', icon: <ChartIcon className="w-4 h-4" /> },
  { id: 'line', label: 'Line Chart', desc: 'Show trends', icon: <TrendUpIcon className="w-4 h-4" /> },
  { id: 'pie', label: 'Pie Chart', desc: 'Show proportions', icon: <PieChartIcon className="w-4 h-4" /> },
  { id: 'table', label: 'Data Table', desc: 'Detailed data', icon: <FilterIcon className="w-4 h-4" /> },
  { id: 'scorecard', label: 'Scorecards', desc: 'Key metrics', icon: <TargetIcon className="w-4 h-4" /> },
  { id: 'heatmap', label: 'Heatmap', desc: 'Pattern analysis', icon: <BoltIcon className="w-4 h-4" /> },
];

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#f59e0b', '#10b981', '#f43f5e'];

// (Simulated data removed — replaced with real Supabase queries via useAnalyticsData hook)

const AnalyticsPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  // Report state
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('performance');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  // Alert modal
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alerts, setAlerts] = useState<AlertRule[]>(() => {
    try {
      const saved = localStorage.getItem(`aura_alerts_${user?.id}`);
      return saved ? JSON.parse(saved) : DEFAULT_ALERTS;
    } catch { return DEFAULT_ALERTS; }
  });
  const [editingAlert, setEditingAlert] = useState<string | null>(null);

  // Report Builder
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [reportStep, setReportStep] = useState<ReportBuilderStep>(1);
  const [reportMode, setReportMode] = useState<ReportMode>('quick');
  const [selectedQuickReport, setSelectedQuickReport] = useState<string>('weekly');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['lead_volume', 'conversion_rate', 'campaign_perf', 'content_engagement']);
  const [reportTimeframe, setReportTimeframe] = useState<string>('30d');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [vizType, setVizType] = useState<VizType>('bar');
  const [reportFindings, setReportFindings] = useState<ReportFinding[]>([]);
  const [reportSchedule, setReportSchedule] = useState<ReportSchedule>({ enabled: false, frequency: 'weekly', recipients: [] });
  const [shareLink, setShareLink] = useState('');
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Insights
  const [insights, setInsights] = useState<ReturnType<typeof generateProgrammaticInsights>>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // ─── Enhanced UI state ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showBenchmarks, setShowBenchmarks] = useState(true);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [showCohortAnalysis, setShowCohortAnalysis] = useState(false);
  const [showPredictiveForecast, setShowPredictiveForecast] = useState(false);
  const [showChannelAttribution, setShowChannelAttribution] = useState(false);

  // ─── Real Analytics Data Hook ───
  const { data: analyticsData, loading: analyticsLoading, refresh: refreshAnalytics } = useAnalyticsData(user?.id, dateRange, comparisonMode);

  // ─── Fetch Leads ───
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLeadsLoading(false);
      return;
    }
    setLeadsLoading(true);
    try {
      const { data: leadsData, error } = await supabase
        .from('leads')
        .select('id,client_id,name,company,email,score,status,lastActivity,insights,created_at,knowledgeBase')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const fetchedLeads = (leadsData || []) as Lead[];
      setLeads(fetchedLeads);
      setLastRefreshed(new Date());

      const newInsights = generateProgrammaticInsights(fetchedLeads);
      setInsights(newInsights);
    } catch (err: unknown) {
      console.error('Analytics fetch error:', err instanceof Error ? err.message : err);
    } finally {
      setLeadsLoading(false);
    }
  }, [user?.id]);

  const handleRefreshAll = useCallback(() => {
    fetchData();
    refreshAnalytics();
  }, [fetchData, refreshAnalytics]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loading = leadsLoading || analyticsLoading;

  useEffect(() => {
    try { localStorage.setItem(`aura_alerts_${user?.id}`, JSON.stringify(alerts)); } catch {}
  }, [alerts, user?.id]);

  // ─── Computed Metrics (real data) ───
  const metrics = useMemo(() => {
    const total = leads.length;
    const hot = leads.filter(l => l.score > 80).length;
    const qualified = leads.filter(l => l.status === 'Qualified').length;
    const convRate = total > 0 ? ((qualified / total) * 100) : 0;
    const avgScore = total > 0 ? Math.round(leads.reduce((a, b) => a + b.score, 0) / total) : 0;

    // Real email metrics from analytics hook
    const emailsSent = analyticsData.emailAnalytics.totalSent;
    const openRate = analyticsData.emailAnalytics.openRate;

    // Real workflow ROI from Supabase
    const workflowRoi = analyticsData.workflowAnalytics.totalWorkflowRoi;

    // Real trend deltas via comparison mode
    const prevEmail = analyticsData.prevEmailAnalytics;
    const emailSentTrend = prevEmail ? computeTrend(emailsSent, prevEmail.totalSent) : { value: 0, label: '--', up: true };
    const openRateTrend = prevEmail ? computeTrend(openRate, prevEmail.openRate) : { value: 0, label: '--', up: true };
    const prevWf = analyticsData.prevWorkflowAnalytics;
    const roiTrend = prevWf ? computeTrend(workflowRoi, prevWf.totalWorkflowRoi) : { value: 0, label: '--', up: true };

    return {
      total, hot, convRate: +convRate.toFixed(1), avgScore,
      emailsSent, openRate, workflowRoi,
      emailSentTrend, openRateTrend, roiTrend
    };
  }, [leads, analyticsData]);

  // ─── Lead Generation Trend (real data, no simulated baseline) ───
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

      data.push({
        day: label,
        leads: dayLeads.length,
        conversions: dayLeads.filter(l => l.status === 'Qualified' || l.status === 'Converted').length,
      });
    }
    return data;
  }, [leads, dateRange]);

  // ─── Funnel Data (real status counts) ───
  const funnelStages = useMemo(() => {
    const total = leads.length;
    const contacted = leads.filter(l => l.status === 'Contacted').length;
    const qualified = leads.filter(l => l.status === 'Qualified').length;
    const converted = leads.filter(l => l.status === 'Converted').length;
    const lost = leads.filter(l => l.status === 'Lost').length;

    return [
      { label: 'New', count: leads.filter(l => l.status === 'New').length, color: '#6366f1' },
      { label: 'Contacted', count: contacted, color: '#8b5cf6' },
      { label: 'Qualified', count: qualified, color: '#a855f7' },
      { label: 'Converted', count: converted, color: '#10b981' },
      { label: 'Lost', count: lost, color: '#ef4444' },
    ];
  }, [leads]);

  // ─── Data-Driven Insights & Recommendations ───
  const weeklyInsights = useMemo(() => {
    const items: string[] = [];
    const ea = analyticsData.emailAnalytics;
    const wa = analyticsData.workflowAnalytics;
    const newLeads = leads.filter(l => l.status === 'New').length;

    if (ea.totalSent > 0) {
      items.push(`Sent ${ea.totalSent} emails with ${ea.openRate}% open rate and ${ea.clickRate}% click rate`);
    }
    if (ea.bounceRate > 5) {
      items.push(`Bounce rate is ${ea.bounceRate}% — consider cleaning your email list`);
    }
    if (wa.totalExecutions > 0) {
      items.push(`${wa.totalExecutions} workflow executions with ${wa.successRate}% success rate`);
    }
    if (metrics.hot > 0) {
      items.push(`${metrics.hot} hot leads (score > 80) ready for immediate outreach`);
    }
    if (newLeads > 0) {
      items.push(`${newLeads} leads haven't been contacted yet — automate outreach`);
    }
    if (metrics.convRate > 5) {
      items.push(`Qualification rate of ${metrics.convRate}% exceeds industry benchmark`);
    }
    if (items.length === 0) {
      items.push('Start sending emails and running workflows to generate insights');
    }

    return items.slice(0, 4);
  }, [metrics, analyticsData, leads]);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    const ea = analyticsData.emailAnalytics;
    const wa = analyticsData.workflowAnalytics;
    const ta = analyticsData.taskAnalytics;
    const newLeads = leads.filter(l => l.status === 'New').length;

    if (ea.bounceRate > 5) recs.push(`Bounce rate is ${ea.bounceRate}% — clean your email list`);
    if (newLeads > 5) recs.push(`${newLeads} leads uncontacted — set up automated outreach`);
    if (wa.failedCount > 0) recs.push(`${wa.failedCount} workflow executions failed — review error logs`);
    if (ta.overdue > 0) recs.push(`${ta.overdue} strategy tasks overdue — prioritize completion`);
    if (ea.totalSent === 0) recs.push('Send your first email campaign to start tracking engagement');
    if (wa.totalExecutions === 0) recs.push('Create a workflow to automate your lead pipeline');
    if (metrics.total > 20 && metrics.hot < 3) recs.push('Enrich lead profiles to improve scoring accuracy');
    if (recs.length === 0) recs.push('Great work! Keep monitoring your pipeline for new opportunities');

    return recs.slice(0, 4);
  }, [metrics, analyticsData, leads]);

  // ─── Score Distribution ───
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { range: '0-20', min: 0, max: 20, count: 0, color: '#ef4444' },
      { range: '21-40', min: 21, max: 40, count: 0, color: '#f59e0b' },
      { range: '41-60', min: 41, max: 60, count: 0, color: '#8b5cf6' },
      { range: '61-80', min: 61, max: 80, count: 0, color: '#6366f1' },
      { range: '81-100', min: 81, max: 100, count: 0, color: '#10b981' },
    ];
    leads.forEach(l => {
      const bucket = buckets.find(b => l.score >= b.min && l.score <= b.max);
      if (bucket) bucket.count++;
    });
    return buckets;
  }, [leads]);

  // ─── Lead Source Breakdown (real data, includes imports) ───
  const leadSourceBreakdown = useMemo(() => {
    const sourceMap: Record<string, number> = {};
    leads.forEach(l => {
      const source = l.source || 'Unknown';
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    });
    // Add Apollo imports as a source if present
    const importTotal = analyticsData.importAnalytics.totalImported;
    if (importTotal > 0 && !sourceMap['Apollo Import']) {
      sourceMap['Apollo Import'] = importTotal;
    }
    const entries = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));
    if (entries.length === 0) {
      return [{ name: 'No data', value: 0 }];
    }
    return entries.sort((a, b) => b.value - a.value).slice(0, 6);
  }, [leads, analyticsData.importAnalytics]);

  // ─── Industry Benchmarks (real "Yours" column) ───
  const benchmarks = useMemo(() => [
    { metric: 'Conversion Rate', yours: metrics.convRate, industry: 3.2, top10: 8.5, unit: '%' },
    { metric: 'Open Rate', yours: metrics.openRate, industry: 21.5, top10: 45.0, unit: '%' },
    { metric: 'Click Rate', yours: analyticsData.emailAnalytics.clickRate, industry: 2.6, top10: 8.0, unit: '%' },
    { metric: 'Hot Lead %', yours: metrics.total > 0 ? Math.round((metrics.hot / metrics.total) * 100) : 0, industry: 8, top10: 18, unit: '%' },
    { metric: 'Workflow Success', yours: analyticsData.workflowAnalytics.successRate, industry: 85, top10: 97, unit: '%' },
  ], [metrics, analyticsData]);

  // ─── Cohort Analysis (real weekly cohorts from leads) ───
  const cohortData = useMemo(() => {
    if (leads.length === 0) return [];
    // Group leads by the week they were created
    const weekMap = new Map<string, Lead[]>();
    const now = new Date();
    for (const lead of leads) {
      if (!lead.created_at) continue;
      const created = new Date(lead.created_at);
      const weeksAgo = Math.floor((now.getTime() - created.getTime()) / (7 * 86400000));
      if (weeksAgo > 3) continue; // Only last 4 weeks
      const label = `Week ${4 - weeksAgo}`;
      if (!weekMap.has(label)) weekMap.set(label, []);
      weekMap.get(label)!.push(lead);
    }
    // Sort so Week 1 is oldest
    return ['Week 1', 'Week 2', 'Week 3', 'Week 4']
      .filter(w => weekMap.has(w))
      .map(week => {
        const cohort = weekMap.get(week)!;
        const cohortSize = cohort.length;
        const retained = cohort.filter(l => l.status !== 'Lost').length;
        const converted = cohort.filter(l => l.status === 'Qualified' || l.status === 'Converted').length;
        const avgScore = cohortSize > 0 ? Math.round(cohort.reduce((s, l) => s + l.score, 0) / cohortSize) : 0;
        const retentionRate = cohortSize > 0 ? Math.round((retained / cohortSize) * 100) : 0;
        return { week, cohortSize, retained, converted, avgScore, retentionRate };
      });
  }, [leads]);

  const cohortHealthScore = useMemo(() => {
    if (cohortData.length === 0) return 0;
    const avgRetention = cohortData.reduce((s, c) => s + c.retentionRate, 0) / cohortData.length;
    return Math.round(avgRetention);
  }, [cohortData]);

  // ─── Predictive Forecast (real period-over-period growth) ───
  const forecastData = useMemo(() => {
    const baseLeads = leads.length;
    // Calculate real growth rate from lead trend over date range
    const days = parseInt(dateRange);
    const now = new Date();
    const halfPoint = new Date(now);
    halfPoint.setDate(halfPoint.getDate() - Math.floor(days / 2));
    const firstHalf = leads.filter(l => l.created_at && new Date(l.created_at) < halfPoint).length;
    const secondHalf = leads.filter(l => l.created_at && new Date(l.created_at) >= halfPoint).length;
    const growthRate = firstHalf > 0 ? 1 + ((secondHalf - firstHalf) / firstHalf) : 1.05;
    const baseConvRate = metrics.convRate > 0 ? metrics.convRate / 100 : 0.03;
    const hotPct = baseLeads > 0 ? metrics.hot / baseLeads : 0.1;

    const periods = [
      { label: 'Next 30 Days', days: 30 },
      { label: 'Next 60 Days', days: 60 },
      { label: 'Next 90 Days', days: 90 },
    ];
    return periods.map(p => {
      const factor = p.days / 30;
      const projectedLeads = Math.round(baseLeads * Math.pow(Math.max(growthRate, 1), factor));
      const projectedConversions = Math.round(projectedLeads * baseConvRate);
      const projectedHot = Math.round(projectedLeads * hotPct);
      const confidence = Math.max(60, 92 - Math.round(factor * 12));
      return { ...p, projectedLeads, projectedConversions, projectedHot, confidence };
    });
  }, [leads, metrics, dateRange]);

  const forecastTrend = useMemo(() => {
    const data: { day: string; actual: number; predicted: number }[] = [];
    const totalDays = 14;
    const avgDaily = leads.length > 0 ? leads.length / parseInt(dateRange) : 0;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (totalDays - i - 1));
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      // Actual: count leads created on that day
      const dayLeads = leads.filter(l => {
        if (!l.created_at) return false;
        const ld = new Date(l.created_at);
        return ld.getFullYear() === d.getFullYear() && ld.getMonth() === d.getMonth() && ld.getDate() === d.getDate();
      }).length;
      data.push({
        day: label,
        actual: dayLeads,
        predicted: Math.round(avgDaily * (1 + i * 0.01)),
      });
    }
    return data;
  }, [leads, dateRange]);

  // ─── Channel Attribution (real derivation from lead sources) ───
  const channelAttribution = useMemo(() => {
    const sourceMap = new Map<string, { leads: number; totalScore: number; conversions: number }>();
    leads.forEach(l => {
      const source = l.source || 'Unknown';
      const entry = sourceMap.get(source) ?? { leads: 0, totalScore: 0, conversions: 0 };
      entry.leads++;
      entry.totalScore += l.score;
      if (l.status === 'Qualified' || l.status === 'Converted') entry.conversions++;
      sourceMap.set(source, entry);
    });

    const totalLeads = leads.length;
    const channels = Array.from(sourceMap.entries()).map(([name, data]) => {
      const avgScore = data.leads > 0 ? Math.round(data.totalScore / data.leads) : 0;
      const pct = totalLeads > 0 ? Math.round((data.leads / totalLeads) * 100) : 0;
      const attribution = Math.round(((data.leads / Math.max(totalLeads, 1)) * 50) + ((avgScore / 100) * 50));
      return {
        name,
        leads: data.leads,
        conversions: data.conversions,
        avgScore,
        pct,
        attribution,
      };
    }).sort((a, b) => b.attribution - a.attribution);

    return channels;
  }, [leads]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput || reportBuilderOpen || showAlertModal) return;

      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showCohortAnalysis) { setShowCohortAnalysis(false); return; }
        if (showPredictiveForecast) { setShowPredictiveForecast(false); return; }
        if (showChannelAttribution) { setShowChannelAttribution(false); return; }
        return;
      }

      const shortcuts: Record<string, () => void> = {
        'r': () => handleRefreshAll(),
        'g': () => openReportBuilder(),
        'a': () => setShowAlertModal(true),
        'b': () => setShowBenchmarks(prev => !prev),
        'c': () => setComparisonMode(prev => !prev),
        'e': () => handleExportInsights(),
        'h': () => setShowCohortAnalysis(prev => !prev),
        'f': () => setShowPredictiveForecast(prev => !prev),
        'd': () => setShowChannelAttribution(prev => !prev),
        '?': () => setShowShortcuts(prev => !prev),
      };

      if (shortcuts[e.key]) {
        e.preventDefault();
        shortcuts[e.key]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reportBuilderOpen, showAlertModal, showShortcuts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ───
  const refreshInsights = useCallback(() => {
    setInsightsLoading(true);
    const newInsights = generateProgrammaticInsights(leads);
    setInsights(newInsights);
    setInsightsLoading(false);
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
      const csvContent = `Report Type,${reportType?.label}\nTotal Leads,${leads.length}\nConversion Rate,${metrics.convRate}%\nAI Score,${metrics.avgScore}\nEmails Sent,${metrics.emailsSent}\nOpen Rate,${metrics.openRate}%\n\nLead Name,Company,Score,Status\n${leads.map(l => `${l.name},${l.company},${l.score},${l.status}`).join('\n')}`;
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
    const content = `AuraFunnel AI Insights Report\nGenerated: ${new Date().toLocaleDateString()}\n\n--- Top Insights ---\n${weeklyInsights.map((ins, i) => `${i + 1}. ${ins}`).join('\n')}\n\n--- Recommendations ---\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n--- Key Metrics ---\nTotal Leads: ${metrics.total}\nHot Leads: ${metrics.hot}\nConversion Rate: ${metrics.convRate}%\nEmails Sent: ${metrics.emailsSent}\nOpen Rate: ${metrics.openRate}%\nWorkflow ROI: ${metrics.workflowRoi}%`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_insights_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Report Builder Handlers ───
  const openReportBuilder = () => {
    setReportBuilderOpen(true);
    setReportStep(1);
    setReportReady(false);
    setReportGenerating(false);
    setReportFindings([]);
    setShareLink('');
  };

  const selectQuickReport = (id: string) => {
    const qr = QUICK_REPORTS.find(r => r.id === id);
    if (qr) {
      setSelectedQuickReport(id);
      setSelectedReportType(qr.type);
      setSelectedMetrics(qr.presetMetrics);
      setReportTimeframe(qr.presetTimeframe);
    }
  };

  const toggleMetric = (id: string) => {
    setSelectedMetrics(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const toggleFilter = (filterId: string, value: string) => {
    setActiveFilters(prev => {
      const current = prev[filterId] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [filterId]: updated };
    });
  };

  const generateReportFindings = useCallback(() => {
    setReportGenerating(true);
    setReportReady(false);

    // Generate synchronously from fetched real data (no setTimeout delay)
    const findings: ReportFinding[] = [];
    const ea = analyticsData.emailAnalytics;
    const wa = analyticsData.workflowAnalytics;
    const ca = analyticsData.contentAnalytics;
    const ai = analyticsData.aiUsageAnalytics;

    if (selectedMetrics.includes('conversion_rate')) {
      findings.push({
        title: `Conversion rate is ${metrics.convRate}%`,
        detail: `${leads.filter(l => l.status === 'Qualified').length} qualified out of ${metrics.total} total leads`,
        action: metrics.convRate > 5 ? 'Maintain current qualifying criteria' : 'Refine lead scoring to improve qualification',
        trend: metrics.convRate > 3.2 ? 'up' : 'flat',
        delta: `${metrics.convRate}%`,
      });
    }

    if (selectedMetrics.includes('campaign_perf')) {
      const topCamp = analyticsData.campaignPerformance[0];
      if (topCamp) {
        findings.push({
          title: `Top campaign: ${topCamp.name} (${topCamp.sent} sent)`,
          detail: `Open rate: ${topCamp.openRate}%, Click rate: ${topCamp.clickRate}%`,
          action: 'Apply successful patterns to other campaigns',
          trend: topCamp.openRate > 30 ? 'up' : 'flat',
          delta: `${topCamp.openRate}% opens`,
        });
      } else {
        findings.push({
          title: 'No campaigns running yet',
          detail: `${ea.totalSent} individual emails sent. Consider creating sequences for better tracking.`,
          action: 'Create your first email sequence',
          trend: 'flat',
          delta: '0 campaigns',
        });
      }
    }

    if (selectedMetrics.includes('ai_accuracy') && ai.requestCount > 0) {
      findings.push({
        title: `${ai.requestCount} AI requests using ${ai.totalTokens.toLocaleString()} tokens`,
        detail: `Average ${ai.avgTokensPerRequest} tokens per request across the period`,
        action: ai.avgTokensPerRequest > 2000 ? 'Optimize prompts to reduce token usage' : 'Token usage is efficient',
        trend: 'flat',
        delta: `${ai.avgTokensPerRequest} avg`,
      });
    }

    if (selectedMetrics.includes('lead_volume')) {
      const topSource = leadSourceBreakdown[0];
      findings.push({
        title: `Pipeline has ${metrics.total} leads (${metrics.hot} hot)`,
        detail: topSource ? `Top source: ${topSource.name} with ${topSource.value} leads` : 'No source data available',
        action: metrics.hot > 3 ? 'Prioritize hot lead outreach' : 'Focus on enriching lead profiles',
        trend: metrics.total > 10 ? 'up' : 'flat',
        delta: `${metrics.total} leads`,
      });
    }

    if (selectedMetrics.includes('content_engagement') && ca.totalPosts > 0) {
      findings.push({
        title: `${ca.totalPosts} blog posts created (${ca.published} published)`,
        detail: `${ca.drafts} drafts, ${ca.pendingReview} pending review`,
        action: ca.drafts > 2 ? 'Review and publish pending drafts' : 'Maintain content cadence',
        trend: ca.published > 0 ? 'up' : 'flat',
        delta: `${ca.published} published`,
      });
    }

    if (selectedMetrics.includes('roi') && wa.totalExecutions > 0) {
      findings.push({
        title: `Workflows: ${wa.totalExecutions} executions at ${wa.successRate}% success`,
        detail: `${wa.totalLeadsProcessed} leads processed, ${wa.failedCount} failures`,
        action: wa.failedCount > 0 ? 'Investigate failed workflow executions' : 'Workflows running smoothly',
        trend: wa.successRate > 90 ? 'up' : wa.successRate > 70 ? 'flat' : 'down',
        delta: `${wa.successRate}% success`,
      });
    }

    setReportFindings(findings.slice(0, 6));
    setReportGenerating(false);
    setReportReady(true);
    setReportStep(3);
  }, [selectedMetrics, metrics, analyticsData, leads, leadSourceBreakdown]);

  const generateShareLink = () => {
    const link = `https://app.aurafunnel.io/reports/shared/${Date.now().toString(36)}`;
    setShareLink(link);
    navigator.clipboard.writeText(link);
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  const handleScheduleReport = async () => {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'REPORT_SCHEDULED',
      details: `Scheduled ${reportSchedule.frequency} report: ${REPORT_TYPES.find(r => r.type === selectedReportType)?.label}. Metrics: ${selectedMetrics.join(', ')}.`,
    });
    if (error) console.error('Schedule report log error:', error.message);
    setReportSchedule(prev => ({ ...prev, enabled: true }));
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

        <div data-guide="analytics-reports" className="flex items-center space-x-2">
          {/* Data Freshness */}
          <div className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400">
              Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
            <button onClick={handleRefreshAll} className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors">
              <RefreshIcon className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Comparison Toggle */}
          <button
            onClick={() => setComparisonMode(!comparisonMode)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${comparisonMode ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <ActivityIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Compare</span>
          </button>

          {/* Analysis Panels */}
          <button
            onClick={() => setShowCohortAnalysis(prev => !prev)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showCohortAnalysis ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <UsersIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cohorts</span>
          </button>
          <button
            onClick={() => setShowPredictiveForecast(prev => !prev)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showPredictiveForecast ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Forecast</span>
          </button>
          <button
            onClick={() => setShowChannelAttribution(prev => !prev)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showChannelAttribution ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Attribution</span>
          </button>

          {/* Shortcuts */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white text-slate-500 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
            <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px]">?</kbd>
          </button>

          {/* Date Range Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              className="flex items-center space-x-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
              <span>{DATE_RANGE_LABELS[dateRange]}</span>
              <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {dateDropdownOpen && (
              <div className="absolute right-0 top-11 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-44 py-1">
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

          {/* Generate Report Button */}
          <button
            data-guide="analytics-export"
            onClick={openReportBuilder}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <FilterIcon className="w-4 h-4" />
            <span>Report</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEY METRICS ROW                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Leads', value: metrics.total.toLocaleString(), trendLabel: comparisonMode ? metrics.emailSentTrend.label : '', up: true, color: 'indigo', icon: <TargetIcon className="w-4 h-4" /> },
          { label: 'Hot Leads', value: metrics.hot.toLocaleString(), trendLabel: '', up: true, color: 'rose', icon: <FlameIcon className="w-4 h-4" /> },
          { label: 'Conv. Rate', value: `${metrics.convRate}%`, trendLabel: '', up: true, color: 'emerald', icon: <TrendUpIcon className="w-4 h-4" /> },
          { label: 'Emails Sent', value: metrics.emailsSent.toLocaleString(), trendLabel: comparisonMode ? metrics.emailSentTrend.label : '', up: metrics.emailSentTrend.up, color: 'amber', icon: <MailIcon className="w-4 h-4" /> },
          { label: 'Open Rate', value: `${metrics.openRate}%`, trendLabel: comparisonMode ? metrics.openRateTrend.label : '', up: metrics.openRateTrend.up, color: 'violet', icon: <EyeIcon className="w-4 h-4" /> },
          { label: 'Workflow ROI', value: `${metrics.workflowRoi}%`, trendLabel: comparisonMode ? metrics.roiTrend.label : '', up: metrics.roiTrend.up, color: 'cyan', icon: <CreditCardIcon className="w-4 h-4" /> },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg bg-${m.color}-50 flex items-center justify-center text-${m.color}-600`}>
                {m.icon}
              </div>
              {m.trendLabel && (
                <span className={`inline-flex items-center space-x-0.5 text-[10px] font-bold ${m.up ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {m.up ? <TrendUpIcon className="w-3 h-3" /> : <TrendDownIcon className="w-3 h-3" />}
                  <span>{m.trendLabel}</span>
                </span>
              )}
            </div>
            <p className="text-xl font-black text-slate-900">{m.value}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{m.label}</p>
            {comparisonMode && m.trendLabel && (
              <p className="text-[10px] font-semibold text-indigo-500 mt-1">vs prev: {m.trendLabel}</p>
            )}
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
          <div data-guide="analytics-charts" className="space-y-6">
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

          {/* EMAIL ENGAGEMENT CHART (NEW — real data) */}
          {analyticsData.emailTimeSeries.length > 0 && analyticsData.emailTimeSeries.some(d => d.sent > 0) ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 font-heading">Email Engagement</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{DATE_RANGE_LABELS[dateRange]} &middot; Opens, clicks, bounces</p>
                </div>
                <div className="flex items-center space-x-3 text-xs">
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-1.5 bg-indigo-500 rounded-full"></span><span className="text-slate-500 font-medium">Opens</span></span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-1.5 bg-emerald-500 rounded-full"></span><span className="text-slate-500 font-medium">Clicks</span></span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-1.5 bg-rose-400 rounded-full"></span><span className="text-slate-500 font-medium">Bounces</span></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={analyticsData.emailTimeSeries}>
                  <defs>
                    <linearGradient id="emailOpens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="emailClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="opens" stroke="#6366f1" fill="url(#emailOpens)" strokeWidth={2} />
                  <Area type="monotone" dataKey="clicks" stroke="#10b981" fill="url(#emailClicks)" strokeWidth={2} />
                  <Area type="monotone" dataKey="bounces" stroke="#f43f5e" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
              <MailIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-500">No email data yet</p>
              <p className="text-xs text-slate-400 mt-1">Send emails from workflows to start tracking engagement</p>
            </div>
          )}

          {/* SCORE DISTRIBUTION + LEAD SOURCE CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Lead Score Distribution */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Score Distribution</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Lead quality breakdown by AI score range</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {scoreDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center space-x-4 mt-3">
                {scoreDistribution.map(b => (
                  <div key={b.range} className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
                    <span className="text-[10px] font-bold text-slate-400">{b.range}: {b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lead Source Breakdown */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Lead Source Breakdown</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Where your leads come from</p>
                </div>
              </div>
              <div className="flex items-center">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={leadSourceBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                      {leadSourceBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-[45%] space-y-2 pl-2">
                  {leadSourceBreakdown.map((source, i) => {
                    const total = leadSourceBreakdown.reduce((s, e) => s + e.value, 0);
                    const pct = total > 0 ? Math.round((source.value / total) * 100) : 0;
                    return (
                      <div key={source.name} className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-xs text-slate-600 flex-1 truncate">{source.name}</span>
                        <span className="text-xs font-black text-slate-700">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* DATA TABLES */}
          <div className="space-y-6">
            {/* Top Performing Campaigns (real from scheduled_emails) */}
            {analyticsData.campaignPerformance.length > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 font-heading">Top Performing Campaigns</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Email sequence performance from real campaigns</p>
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
                      {analyticsData.campaignPerformance.map((c, i) => (
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
            ) : (
              <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
                <SendIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-500">No campaigns yet</p>
                <p className="text-xs text-slate-400 mt-1">Create a workflow with email steps to start tracking campaign performance</p>
              </div>
            )}

            {/* AI Usage Metrics (real from ai_usage_logs) */}
            {analyticsData.aiUsageAnalytics.requestCount > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 font-heading">AI Usage Metrics</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real token usage and request volume from ai_usage_logs</p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                      <p className="text-xl font-black text-indigo-600">{analyticsData.aiUsageAnalytics.requestCount.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Requests</p>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                      <p className="text-xl font-black text-violet-600">{analyticsData.aiUsageAnalytics.totalTokens.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Tokens Used</p>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                      <p className="text-xl font-black text-amber-600">{analyticsData.aiUsageAnalytics.avgTokensPerRequest.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Avg Tokens/Req</p>
                    </div>
                  </div>
                  {analyticsData.aiUsageAnalytics.tokensByDay.some(d => d.tokens > 0) && (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={analyticsData.aiUsageAnalytics.tokensByDay}>
                        <defs>
                          <linearGradient id="aiTokens" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                        <Area type="monotone" dataKey="tokens" stroke="#8b5cf6" fill="url(#aiTokens)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
                <BrainIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-500">No AI usage data yet</p>
                <p className="text-xs text-slate-400 mt-1">Use AI features like lead scoring and content generation to see usage metrics</p>
              </div>
            )}
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

          {/* AI Usage Card (NEW — real data) */}
          {analyticsData.aiUsageAnalytics.requestCount > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 text-sm font-heading mb-3">AI Usage</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-lg font-black text-violet-600">{analyticsData.aiUsageAnalytics.totalTokens.toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">Tokens</p>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-lg font-black text-indigo-600">{analyticsData.aiUsageAnalytics.requestCount}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">Requests</p>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full" style={{ width: `${Math.min(100, (analyticsData.aiUsageAnalytics.totalTokens / 100000) * 100)}%` }} />
              </div>
              <p className="text-[9px] text-slate-400 font-medium mt-1">{analyticsData.aiUsageAnalytics.avgTokensPerRequest} avg tokens/request</p>
            </div>
          )}

          {/* Industry Benchmarks */}
          {showBenchmarks && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm font-heading">Industry Benchmarks</h3>
                <button onClick={() => setShowBenchmarks(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-3">
                {benchmarks.map(b => {
                  const isGood = b.lower ? b.yours <= b.industry : b.yours >= b.industry;
                  const isTop = b.lower ? b.yours <= b.top10 : b.yours >= b.top10;
                  return (
                    <div key={b.metric} className="p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-600">{b.metric}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                          isTop ? 'bg-emerald-100 text-emerald-600' : isGood ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          {isTop ? 'Top 10%' : isGood ? 'Above Avg' : 'Below Avg'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-sm font-black text-indigo-600">{b.yours}{b.unit}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Yours</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-500">{b.industry}{b.unit}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Avg</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-600">{b.top10}{b.unit}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Top 10%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
      {/* 3-STEP REPORT BUILDER MODAL                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {reportBuilderOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setReportBuilderOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-black text-slate-900 font-heading">Generate Report</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Step {reportStep} of 3 &middot; {['Choose Report Type', 'Configure Report', 'Interpret & Act'][reportStep - 1]}
                </p>
              </div>
              <button onClick={() => setReportBuilderOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Step Indicator */}
            <div className="px-6 py-3 border-b border-slate-50 bg-slate-50/50 flex items-center justify-center space-x-4 shrink-0">
              {[
                { num: 1 as ReportBuilderStep, label: 'Choose Type' },
                { num: 2 as ReportBuilderStep, label: 'Configure' },
                { num: 3 as ReportBuilderStep, label: 'Interpret' },
              ].map((step, i) => (
                <React.Fragment key={step.num}>
                  <button
                    onClick={() => step.num <= reportStep && setReportStep(step.num)}
                    className={`flex items-center space-x-2 ${step.num <= reportStep ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black transition-all ${
                      step.num === reportStep ? 'bg-indigo-600 text-white' : step.num < reportStep ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {step.num < reportStep ? <CheckIcon className="w-3.5 h-3.5" /> : step.num}
                    </div>
                    <span className={`text-xs font-bold hidden sm:inline ${step.num === reportStep ? 'text-indigo-600' : step.num < reportStep ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                  </button>
                  {i < 2 && <div className={`w-12 h-0.5 rounded-full ${step.num < reportStep ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                </React.Fragment>
              ))}
            </div>

            {/* Scrollable Content */}
            <div className="flex-grow overflow-y-auto p-6">

              {/* ═══ STEP 1: CHOOSE REPORT TYPE ═══ */}
              {reportStep === 1 && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Mode Tabs */}
                  <div className="flex items-center space-x-1 bg-slate-100 rounded-xl p-1 w-fit">
                    <button
                      onClick={() => setReportMode('quick')}
                      className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${reportMode === 'quick' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Quick Reports
                    </button>
                    <button
                      onClick={() => setReportMode('custom')}
                      className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${reportMode === 'custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Custom Reports
                    </button>
                  </div>

                  {reportMode === 'quick' ? (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Pre-built Reports</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {QUICK_REPORTS.map(qr => (
                          <button
                            key={qr.id}
                            onClick={() => selectQuickReport(qr.id)}
                            className={`text-left p-5 rounded-2xl border-2 transition-all ${
                              selectedQuickReport === qr.id
                                ? 'border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100'
                                : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                              selectedQuickReport === qr.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {qr.icon}
                            </div>
                            <p className="font-bold text-sm text-slate-800">{qr.label}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{qr.desc}</p>
                            <p className="text-[10px] text-indigo-500 font-bold mt-2">{qr.presetMetrics.length} metrics included</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custom Report Options</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { id: 'build', label: 'Build Custom Report', desc: 'Select metrics and build from scratch', icon: <PlusIcon className="w-5 h-5" /> },
                          { id: 'duplicate', label: 'Duplicate Existing', desc: 'Modify a successful report template', icon: <CopyIcon className="w-5 h-5" /> },
                          { id: 'ai_suggested', label: 'AI-Suggested', desc: 'Based on your data patterns', icon: <SparklesIcon className="w-5 h-5" /> },
                        ].map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => {
                              if (opt.id === 'ai_suggested') {
                                setSelectedMetrics(['lead_volume', 'conversion_rate', 'ai_accuracy', 'cost_per_lead', 'campaign_perf']);
                              } else if (opt.id === 'duplicate') {
                                setSelectedMetrics(['lead_volume', 'conversion_rate', 'campaign_perf', 'content_engagement']);
                              } else {
                                setSelectedMetrics([]);
                              }
                            }}
                            className="text-left p-5 rounded-2xl border-2 border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
                              {opt.icon}
                            </div>
                            <p className="font-bold text-sm text-slate-800">{opt.label}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</p>
                          </button>
                        ))}
                      </div>

                      {/* Report Type Selection */}
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Report Category</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {REPORT_TYPES.map(rt => (
                            <button
                              key={rt.type}
                              onClick={() => { setSelectedReportType(rt.type); setReportReady(false); }}
                              className={`flex items-center space-x-2.5 p-3 rounded-xl border transition-all ${
                                selectedReportType === rt.type
                                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                  : 'border-slate-100 text-slate-600 hover:border-slate-200'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                selectedReportType === rt.type ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                              }`}>
                                {rt.icon}
                              </div>
                              <span className="text-xs font-bold">{rt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ STEP 2: CONFIGURE REPORT ═══ */}
              {reportStep === 2 && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* 1. Select Metrics */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                      <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">1</span>
                      <span>Select Metrics</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {REPORT_METRICS.map(m => (
                        <label
                          key={m.id}
                          className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedMetrics.includes(m.id)
                              ? 'border-indigo-600 bg-indigo-50'
                              : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedMetrics.includes(m.id)}
                            onChange={() => toggleMetric(m.id)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                            <p className={`text-xs font-bold ${selectedMetrics.includes(m.id) ? 'text-indigo-700' : 'text-slate-700'}`}>{m.label}</p>
                            <p className="text-[9px] text-slate-400">{m.category}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 2. Set Timeframe */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                      <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">2</span>
                      <span>Set Timeframe</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[
                        { id: '1d', label: 'Today' },
                        { id: '7d', label: 'Last 7 days' },
                        { id: '30d', label: 'Last 30 days' },
                        { id: '90d', label: 'Last quarter' },
                        { id: 'custom', label: 'Custom range' },
                      ].map(tf => (
                        <button
                          key={tf.id}
                          onClick={() => setReportTimeframe(tf.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            reportTimeframe === tf.id
                              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                    {reportTimeframe === 'custom' && (
                      <div className="flex items-center space-x-3 animate-in fade-in duration-200">
                        <input
                          type="date"
                          value={customDateStart}
                          onChange={e => setCustomDateStart(e.target.value)}
                          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                        />
                        <span className="text-xs text-slate-400 font-bold">to</span>
                        <input
                          type="date"
                          value={customDateEnd}
                          onChange={e => setCustomDateEnd(e.target.value)}
                          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* 3. Apply Filters */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                      <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">3</span>
                      <span>Apply Filters</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {REPORT_FILTERS.map(filter => (
                        <div key={filter.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-xs font-bold text-slate-600 mb-2.5">{filter.label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {filter.options.map(opt => (
                              <button
                                key={opt}
                                onClick={() => toggleFilter(filter.id, opt)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                  (activeFilters[filter.id] || []).includes(opt)
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-200'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. Choose Visualization */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                      <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">4</span>
                      <span>Choose Visualization</span>
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {VIZ_OPTIONS.map(v => (
                        <button
                          key={v.id}
                          onClick={() => setVizType(v.id)}
                          className={`p-3 rounded-xl border-2 transition-all text-center ${
                            vizType === v.id
                              ? 'border-indigo-600 bg-indigo-50'
                              : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center mb-1.5 ${
                            vizType === v.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {v.icon}
                          </div>
                          <p className={`text-[10px] font-bold ${vizType === v.id ? 'text-indigo-700' : 'text-slate-500'}`}>{v.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ STEP 3: INTERPRET & ACT ═══ */}
              {reportStep === 3 && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Report Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                          <CheckIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">
                            {reportMode === 'quick'
                              ? QUICK_REPORTS.find(r => r.id === selectedQuickReport)?.label
                              : REPORT_TYPES.find(r => r.type === selectedReportType)?.label
                            }
                          </p>
                          <p className="text-[10px] text-slate-400">Generated {new Date().toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase">Report Ready</span>
                  </div>

                  {/* Report Visualization Preview */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Data Visualization</p>
                    {vizType === 'bar' || vizType === 'line' ? (
                      <ResponsiveContainer width="100%" height={220}>
                        {vizType === 'bar' ? (
                          <BarChart data={trendData.slice(-14)}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                            <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                            <Bar dataKey="leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="conversions" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        ) : (
                          <LineChart data={trendData.slice(-14)}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                            <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                            <Line type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    ) : vizType === 'pie' ? (
                      <div className="flex items-center justify-center">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={funnelStages} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={85} label={(props: any) => `${props.label}: ${props.count}`}>
                              {funnelStages.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : vizType === 'scorecard' ? (
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: 'Total Leads', value: metrics.total, delta: `${metrics.total}` },
                          { label: 'Conv. Rate', value: `${metrics.convRate}%`, delta: `${metrics.convRate}%` },
                          { label: 'Open Rate', value: `${metrics.openRate}%`, delta: `${metrics.openRate}%` },
                          { label: 'Emails Sent', value: metrics.emailsSent, delta: `${metrics.emailsSent}` },
                        ].map(sc => (
                          <div key={sc.label} className="bg-white rounded-xl p-4 text-center border border-slate-100">
                            <p className="text-xl font-black text-slate-900">{sc.value}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{sc.label}</p>
                            <span className="text-[10px] font-bold text-emerald-600">{sc.delta}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* table / heatmap fallback: show table */
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-slate-200">
                            <th className="text-left py-2 text-[10px] font-black text-slate-500 uppercase">Metric</th>
                            <th className="text-right py-2 text-[10px] font-black text-slate-500 uppercase">Value</th>
                            <th className="text-right py-2 text-[10px] font-black text-slate-500 uppercase">Change</th>
                          </tr></thead>
                          <tbody>
                            {[
                              { m: 'Total Leads', v: metrics.total.toString(), c: `${metrics.total}` },
                              { m: 'Hot Leads', v: metrics.hot.toString(), c: `${metrics.hot}` },
                              { m: 'Conversion Rate', v: `${metrics.convRate}%`, c: `${metrics.convRate}%` },
                              { m: 'Emails Sent', v: `${metrics.emailsSent}`, c: comparisonMode ? metrics.emailSentTrend.label : '--' },
                              { m: 'Open Rate', v: `${metrics.openRate}%`, c: comparisonMode ? metrics.openRateTrend.label : '--' },
                              { m: 'Avg AI Score', v: metrics.avgScore.toString(), c: `${metrics.avgScore}` },
                            ].map(r => (
                              <tr key={r.m} className="border-b border-slate-50">
                                <td className="py-2.5 text-xs font-medium text-slate-700">{r.m}</td>
                                <td className="py-2.5 text-xs font-black text-slate-900 text-right">{r.v}</td>
                                <td className="py-2.5 text-xs font-bold text-emerald-600 text-right">{r.c}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Key Findings */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Key Findings</p>
                    <div className="space-y-3">
                      {reportFindings.map((finding, i) => (
                        <div key={i} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3 flex-1">
                              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-xs font-black">{i + 1}</span>
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-slate-800">{finding.title}</p>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{finding.detail}</p>
                                <div className="flex items-center space-x-2 mt-2">
                                  <ArrowRightIcon className="w-3 h-3 text-indigo-500" />
                                  <p className="text-xs font-bold text-indigo-600">Action: {finding.action}</p>
                                </div>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ml-3 ${
                              finding.trend === 'up' ? 'bg-emerald-50 text-emerald-600' :
                              finding.trend === 'down' ? 'bg-rose-50 text-rose-600' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {finding.trend === 'up' ? '\u25B2' : finding.trend === 'down' ? '\u25BC' : '\u2022'} {finding.delta}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Export Options */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Export Options</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { fmt: 'pdf' as ExportFormat, label: 'PDF', desc: 'For presentations', icon: '\u{1F4C4}' },
                        { fmt: 'excel' as ExportFormat, label: 'Excel', desc: 'For detailed analysis', icon: '\u{1F4CA}' },
                        { fmt: 'pptx' as ExportFormat, label: 'PowerPoint', desc: 'For meetings', icon: '\u{1F4C8}' },
                        { fmt: 'csv' as ExportFormat, label: 'CSV', desc: 'Raw data export', icon: '\u{1F4CB}' },
                      ].map(opt => (
                        <button
                          key={opt.fmt}
                          onClick={() => { setSelectedFormat(opt.fmt); handleDownloadReport(); }}
                          className="p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-200 hover:shadow-sm transition-all text-center"
                        >
                          <span className="text-lg">{opt.icon}</span>
                          <p className="text-xs font-bold text-slate-700 mt-1">{opt.label}</p>
                          <p className="text-[9px] text-slate-400">{opt.desc}</p>
                        </button>
                      ))}
                      <button
                        onClick={generateShareLink}
                        className="p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-200 hover:shadow-sm transition-all text-center"
                      >
                        <span className="text-lg">{shareLinkCopied ? '\u2705' : '\u{1F517}'}</span>
                        <p className="text-xs font-bold text-slate-700 mt-1">{shareLinkCopied ? 'Copied!' : 'Share Link'}</p>
                        <p className="text-[9px] text-slate-400">Team collab</p>
                      </button>
                    </div>
                  </div>

                  {/* Schedule Auto-generation */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <CalendarIcon className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-bold text-slate-700">Schedule Auto-generation</p>
                          <p className="text-[10px] text-slate-400">Automatically generate and deliver this report</p>
                        </div>
                      </div>
                      <div className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${reportSchedule.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        onClick={() => {
                          if (!reportSchedule.enabled) handleScheduleReport();
                          else setReportSchedule(prev => ({ ...prev, enabled: false }));
                        }}>
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${reportSchedule.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                      </div>
                    </div>
                    {reportSchedule.enabled && (
                      <div className="mt-3 flex items-center space-x-3 animate-in fade-in duration-200">
                        <select
                          value={reportSchedule.frequency}
                          onChange={e => setReportSchedule(prev => ({ ...prev, frequency: e.target.value as any }))}
                          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                        <span className="text-[10px] text-emerald-600 font-bold">Scheduled!</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Navigation */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
              {reportStep > 1 ? (
                <button
                  onClick={() => setReportStep((reportStep - 1) as ReportBuilderStep)}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:text-slate-700 transition-all"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  <span>Back</span>
                </button>
              ) : (
                <div />
              )}

              {reportStep === 1 && (
                <button
                  onClick={() => setReportStep(2)}
                  className="flex items-center space-x-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-100/50"
                >
                  <span>{reportMode === 'quick' ? 'Next: Review Config' : 'Next: Configure'}</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              )}

              {reportStep === 2 && (
                <button
                  onClick={generateReportFindings}
                  disabled={reportGenerating || selectedMetrics.length === 0}
                  className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg ${
                    reportGenerating || selectedMetrics.length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-indigo-100/50'
                  }`}
                >
                  {reportGenerating ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Generating...</span></>
                  ) : (
                    <><FilterIcon className="w-4 h-4" /><span>Generate Report</span></>
                  )}
                </button>
              )}

              {reportStep === 3 && (
                <button
                  onClick={() => setReportBuilderOpen(false)}
                  className="flex items-center space-x-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>Done</span>
                </button>
              )}
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

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* COHORT ANALYSIS SIDEBAR                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showCohortAnalysis && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowCohortAnalysis(false)}>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 font-heading">Cohort Analysis</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Retention &amp; conversion by signup week</p>
                </div>
              </div>
              <button onClick={() => setShowCohortAnalysis(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Retention Score */}
              <div className="text-center">
                <svg viewBox="0 0 96 96" className="w-28 h-28 mx-auto">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="48" cy="48" r="40" fill="none"
                    stroke={cohortHealthScore >= 70 ? '#8b5cf6' : cohortHealthScore >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(cohortHealthScore / 100) * 251.2} 251.2`}
                    transform="rotate(-90 48 48)" />
                  <text x="48" y="44" textAnchor="middle" className="fill-slate-900" style={{ fontSize: '20px', fontWeight: 'bold' }}>{cohortHealthScore}</text>
                  <text x="48" y="58" textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>RETENTION</text>
                </svg>
                <p className="text-sm font-semibold text-slate-600 mt-2">Avg Retention: {cohortHealthScore}%</p>
              </div>

              {/* Cohort Table */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weekly Cohorts</h4>
                {cohortData.length === 0 && (
                  <div className="p-6 text-center">
                    <UsersIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-500">No cohort data yet</p>
                    <p className="text-xs text-slate-400 mt-1">Add leads to see weekly cohort analysis</p>
                  </div>
                )}
                {cohortData.map((c, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-700">{c.week}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${c.retentionRate >= 75 ? 'bg-emerald-100 text-emerald-600' : c.retentionRate >= 55 ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
                        {c.retentionRate}% retained
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-lg font-black text-slate-700">{c.cohortSize}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Entered</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-violet-600">{c.retained}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Retained</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-emerald-600">{c.converted}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Converted</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-indigo-600">{c.avgScore}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Avg Score</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${c.retentionRate}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Cohort Insight */}
              <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-100">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-violet-600" />
                  <h4 className="text-sm font-bold text-violet-800">Cohort Insight</h4>
                </div>
                <p className="text-xs text-violet-700 leading-relaxed">
                  {cohortData[0]?.retentionRate > cohortData[cohortData.length - 1]?.retentionRate
                    ? 'Newer cohorts show improving retention. Recent onboarding changes are working well.'
                    : 'Earlier cohorts retained better. Review recent onboarding flow for drop-off points.'}
                  {' '}Leads with scores above 70 retain at 2.1x the rate of those below 50.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* PREDICTIVE FORECAST SIDEBAR                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showPredictiveForecast && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowPredictiveForecast(false)}>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <SparklesIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 font-heading">Predictive Forecast</h3>
                  <p className="text-xs text-slate-400 mt-0.5">AI-powered pipeline projections</p>
                </div>
              </div>
              <button onClick={() => setShowPredictiveForecast(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Forecast Cards */}
              {forecastData.map((f, i) => (
                <div key={i} className={`p-5 rounded-2xl border ${i === 0 ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-slate-800">{f.label}</h4>
                    <div className="flex items-center space-x-1.5">
                      <div className={`w-2 h-2 rounded-full ${f.confidence >= 80 ? 'bg-emerald-500' : f.confidence >= 65 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                      <span className="text-[10px] font-bold text-slate-400">{f.confidence}% conf.</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 bg-white rounded-xl">
                      <p className="text-xl font-black text-indigo-600">{f.projectedLeads}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">Leads</p>
                    </div>
                    <div className="text-center p-2 bg-white rounded-xl">
                      <p className="text-xl font-black text-amber-600">{f.projectedHot}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">Hot</p>
                    </div>
                    <div className="text-center p-2 bg-white rounded-xl">
                      <p className="text-xl font-black text-emerald-600">{f.projectedConversions}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">Conv.</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${f.confidence}%` }} />
                  </div>
                </div>
              ))}

              {/* Trend Chart */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Actual vs Predicted (14 days)</h4>
                <div className="space-y-1.5">
                  {forecastTrend.map((d, i) => {
                    const maxVal = Math.max(...forecastTrend.map(v => Math.max(v.actual, v.predicted)), 1);
                    return (
                      <div key={i} className="flex items-center space-x-2">
                        <span className="text-[8px] font-bold text-slate-400 w-10 text-right">{d.day}</span>
                        <div className="flex-1 flex items-center space-x-1">
                          {d.actual > 0 && (
                            <div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${(d.actual / maxVal) * 50}%` }} />
                          )}
                          <div className="h-2 bg-emerald-300 rounded-full border border-emerald-400 border-dashed" style={{ width: `${(d.predicted / maxVal) * 50}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center space-x-4 text-[10px] font-bold text-slate-400">
                  <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /><span>Actual</span></div>
                  <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-300 border border-emerald-400" /><span>Predicted</span></div>
                </div>
              </div>

              {/* AI Commentary */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold text-indigo-800">Forecast Analysis</h4>
                </div>
                <p className="text-xs text-indigo-700 leading-relaxed">
                  Based on current pipeline of {metrics.total} leads,
                  your pipeline is projected to reach {forecastData[2]?.projectedLeads || 0} leads in 90 days.
                  {metrics.convRate > 3
                    ? ` Strong ${metrics.convRate}% conversion rate suggests ${forecastData[2]?.projectedConversions || 0} potential conversions.`
                    : ' Focus on improving conversion rate to maximize pipeline value.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CHANNEL ATTRIBUTION SIDEBAR                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showChannelAttribution && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowChannelAttribution(false)}>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 font-heading">Channel Attribution</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Multi-touch attribution &amp; ROI by channel</p>
                </div>
              </div>
              <button onClick={() => setShowChannelAttribution(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Channel Cards */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Channel Performance (Ranked by Attribution)</h4>
                {channelAttribution.map((ch, i) => (
                  <div key={i} className={`p-4 rounded-xl border ${i === 0 ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          #{i + 1}
                        </span>
                        <span className="text-sm font-bold text-slate-700">{ch.name}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black">{ch.attribution} attr. score</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="p-1.5 bg-white rounded-lg">
                        <p className="text-sm font-black text-slate-700">{ch.leads}</p>
                        <p className="text-[7px] font-bold text-slate-400 uppercase">Leads</p>
                      </div>
                      <div className="p-1.5 bg-white rounded-lg">
                        <p className="text-sm font-black text-emerald-600">{ch.conversions}</p>
                        <p className="text-[7px] font-bold text-slate-400 uppercase">Conv</p>
                      </div>
                      <div className="p-1.5 bg-white rounded-lg">
                        <p className="text-sm font-black text-indigo-600">{ch.avgScore}</p>
                        <p className="text-[7px] font-bold text-slate-400 uppercase">Avg Score</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 mb-1">
                        <span>Volume Share</span>
                        <span>{ch.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${i === 0 ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${ch.pct}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Attribution Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-lg font-black text-slate-700">{channelAttribution.reduce((s, c) => s + c.leads, 0)}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">Total Leads</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-lg font-black text-emerald-600">{channelAttribution.reduce((s, c) => s + c.conversions, 0)}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">Total Conv</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-lg font-black text-indigo-600">{channelAttribution.length}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">Channels</p>
                </div>
              </div>

              {/* AI Recommendation */}
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border border-emerald-100">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-emerald-800">Attribution Insight</h4>
                </div>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  {channelAttribution[0]?.name || 'Top channel'} has the highest attribution score ({channelAttribution[0]?.attribution || 0})
                  with {channelAttribution[0]?.leads || 0} leads and avg score of {channelAttribution[0]?.avgScore || 0}.
                  {channelAttribution[0]?.conversions > 0
                    ? ` ${channelAttribution[0]?.conversions} conversions from this channel — consider increasing focus.`
                    : ' Focus on improving conversion quality through better targeting.'}
                  {channelAttribution.find(c => c.avgScore > 75)
                    ? ` ${channelAttribution.find(c => c.avgScore > 75)?.name} leads have highest quality scores.`
                    : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEYBOARD SHORTCUTS MODAL                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 font-heading">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-3">
              {[
                { category: 'Data', shortcuts: [
                  { keys: 'R', desc: 'Refresh Data' },
                  { keys: 'E', desc: 'Export Insights' },
                  { keys: 'C', desc: 'Toggle Comparison' },
                  { keys: 'B', desc: 'Toggle Benchmarks' },
                ]},
                { category: 'Panels', shortcuts: [
                  { keys: 'H', desc: 'Cohort Analysis' },
                  { keys: 'F', desc: 'Predictive Forecast' },
                  { keys: 'D', desc: 'Channel Attribution' },
                ]},
                { category: 'Actions', shortcuts: [
                  { keys: 'G', desc: 'Generate Report' },
                  { keys: 'A', desc: 'Alert Configuration' },
                  { keys: '?', desc: 'Toggle Shortcuts' },
                  { keys: 'Esc', desc: 'Close Panels' },
                ]},
              ].map(group => (
                <div key={group.category}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{group.category}</p>
                  <div className="space-y-2">
                    {group.shortcuts.map(s => (
                      <div key={s.keys} className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">{s.desc}</span>
                        <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 min-w-[28px] text-center">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-[10px] text-slate-400 text-center">Press <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd> to close</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
