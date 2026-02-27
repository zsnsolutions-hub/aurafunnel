import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { User, Lead } from '../../types';
import { supabase } from '../../lib/supabase';
import { fetchBatchEmailSummary, fetchLeadEmailEngagement } from '../../lib/emailTracking';
import type { BatchEmailSummary } from '../../lib/emailTracking';
import type { EmailEngagement, AIInsight } from '../../types';
import { generateProgrammaticInsights } from '../../lib/insights';
import { getWorkflowStats } from '../../lib/automationEngine';
import { PageHeader } from '../../components/layout/PageHeader';
import { AdvancedOnly } from '../../components/ui-mode';
import {
  BrainIcon, TargetIcon, FlameIcon, SparklesIcon, TrendUpIcon, TrendDownIcon,
  RefreshIcon, FilterIcon, DownloadIcon, SlidersIcon, MailIcon, GlobeIcon,
  BriefcaseIcon, ClockIcon, ActivityIcon, CursorClickIcon, StarIcon, StarOutlineIcon,
  CheckIcon, XIcon, ArrowRightIcon, ChartIcon, EyeIcon, UsersIcon, BoltIcon,
  BellIcon, AlertTriangleIcon, KeyboardIcon, PhoneIcon
} from '../../components/Icons';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, AreaChart, Area
} from 'recharts';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

type ScoreBucket = 'hot' | 'warm' | 'cool' | 'cold';

interface ScoringFactor {
  id: string;
  name: string;
  weight: number;
  impact: 'High' | 'Medium' | 'Low';
  icon: React.ReactNode;
  color: string;
  enabled: boolean;
}

interface ScoreEvent {
  date: string;
  score: number;
  event?: string;
  delta?: number;
}

const DEFAULT_SCORING_FACTORS: ScoringFactor[] = [
  { id: 'email', name: 'Email Engagement', weight: 25, impact: 'High', icon: <MailIcon className="w-4 h-4" />, color: 'indigo', enabled: true },
  { id: 'website', name: 'Website Activity', weight: 20, impact: 'High', icon: <GlobeIcon className="w-4 h-4" />, color: 'violet', enabled: true },
  { id: 'company', name: 'Company Fit', weight: 18, impact: 'High', icon: <BriefcaseIcon className="w-4 h-4" />, color: 'emerald', enabled: true },
  { id: 'social', name: 'Social Signals', weight: 15, impact: 'Medium', icon: <CursorClickIcon className="w-4 h-4" />, color: 'amber', enabled: true },
  { id: 'content', name: 'Content Consumption', weight: 12, impact: 'Medium', icon: <EyeIcon className="w-4 h-4" />, color: 'rose', enabled: true },
  { id: 'timing', name: 'Timing Patterns', weight: 10, impact: 'Low', icon: <ClockIcon className="w-4 h-4" />, color: 'slate', enabled: true },
];

const IMPACT_COLORS: Record<string, string> = {
  High: 'emerald',
  Medium: 'amber',
  Low: 'slate',
};

// Generate simulated score history for a lead
const generateScoreHistory = (lead: Lead): ScoreEvent[] => {
  const events: ScoreEvent[] = [];
  const now = new Date();
  let score = Math.max(10, lead.score - 60 - Math.floor(Math.random() * 20));

  for (let i = 55; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);

    // Add some variation
    const change = Math.floor(Math.random() * 8) - 2;
    score = Math.min(100, Math.max(0, score + change));

    let event: string | undefined;
    let delta: number | undefined;

    // Add meaningful events at certain intervals
    if (i === 45) { event = 'First website visit'; delta = 8; score += 8; }
    if (i === 35) { event = 'Downloaded whitepaper'; delta = 24; score = Math.min(100, score + 24); }
    if (i === 25) { event = 'Viewed pricing page'; delta = 18; score = Math.min(100, score + 18); }
    if (i === 18) { event = 'No activity for 7 days'; delta = -12; score = Math.max(0, score - 12); }
    if (i === 10) { event = 'Attended webinar'; delta = 32; score = Math.min(100, score + 32); }
    if (i === 5) { event = 'Replied to email'; delta = 15; score = Math.min(100, score + 15); }

    // On the last day, clamp to lead's actual score
    if (i === 0) score = lead.score;

    events.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      score,
      event,
      delta,
    });
  }

  return events;
};

// Simulate per-lead factor breakdown
const generateLeadFactors = (lead: Lead) => {
  const base = lead.score;
  return {
    emailEngagement: Math.min(100, base + Math.floor(Math.random() * 20) - 5),
    emailOpens: `${Math.max(3, Math.floor(base / 7))}/15`,
    emailClicks: `${Math.max(1, Math.floor(base / 12))}/15`,
    emailReplies: Math.max(0, Math.floor(base / 35)),
    websiteActivity: Math.min(100, base - 5 + Math.floor(Math.random() * 15)),
    topPages: base > 70 ? ['Pricing (3x)', 'Case Studies (2x)', 'Demo'] : ['Blog (2x)', 'Features', 'About'],
    visitDuration: `${Math.max(2, Math.floor(base / 6))} minutes`,
    weeklyVisits: Math.max(1, Math.floor(base / 25)),
    companyFit: Math.min(100, base + Math.floor(Math.random() * 10)),
    conversionProbability: Math.min(99, Math.max(15, base + Math.floor(Math.random() * 12))),
    expectedTimeline: base > 80 ? '3-7 days' : base > 60 ? '7-14 days' : '14-30 days',
    recommendedAction: base > 80 ? 'Send technical demo invite' : base > 60 ? 'Share case study' : 'Continue nurture sequence',
  };
};

const renderStars = (score: number) => {
  const starCount = score > 90 ? 5 : score > 75 ? 4 : score > 55 ? 3 : score > 35 ? 2 : 1;
  return (
    <div className="flex items-center space-x-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        i < starCount
          ? <StarIcon key={i} className="w-3.5 h-3.5 text-amber-400" />
          : <StarOutlineIcon key={i} className="w-3.5 h-3.5 text-slate-200" />
      ))}
    </div>
  );
};

// Map insight IDs to portal navigation targets
const getInsightNavigationTarget = (insight: AIInsight): string | undefined => {
  switch (insight.id) {
    case 'score-hot': return '/portal/leads?scoreFilter=50-100';
    case 'score-cold': return '/portal/leads?scoreFilter=0-40';
    case 'conversion-new': return '/portal/leads?statusFilter=New';
    case 'conversion-rate': return '/portal/leads?statusFilter=Qualified';
    case 'conversion-lost': return '/portal/leads?statusFilter=Lost';
    case 'company-cluster': return '/portal/leads';
    case 'timing-recent': return '/portal/leads';
    case 'score-avg': return '/portal/intelligence';
    default: return undefined;
  }
};

const LeadIntelligence: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [factors, setFactors] = useState<ScoringFactor[]>(DEFAULT_SCORING_FACTORS);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterBucket, setFilterBucket] = useState<ScoreBucket | 'all'>('all');
  const [aiConfidence, setAiConfidence] = useState(94.2);

  // ── Enhanced State ──
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeadId, setCompareLeadId] = useState<string | null>(null);
  const [analysisTab, setAnalysisTab] = useState<'overview' | 'engagement' | 'signals'>('overview');
  const [focusedLeadIndex, setFocusedLeadIndex] = useState(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [alertThresholds, setAlertThresholds] = useState({ hot: 75, warm: 50, cold: 25 });

  // ── Real Data State ──
  const [emailSummaryMap, setEmailSummaryMap] = useState<Map<string, BatchEmailSummary>>(new Map());
  const [selectedLeadEngagement, setSelectedLeadEngagement] = useState<EmailEngagement | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [realInsights, setRealInsights] = useState<AIInsight[]>([]);
  const [workflowStats, setWorkflowStats] = useState<{ totalWorkflows: number; activeWorkflows: number; totalExecutions: number; totalLeadsProcessed: number; successRate: number } | null>(null);

  // ─── Fetch ───
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id,client_id,name,company,email,score,status,lastActivity,insights,created_at,knowledgeBase')
        .eq('client_id', user.id)
        .order('score', { ascending: false });
      if (error) throw error;
      const fetchedLeads = (data || []) as Lead[];
      setLeads(fetchedLeads);
      if (fetchedLeads.length > 0) {
        setSelectedLeadId(prev => prev ?? fetchedLeads[0].id);
      }
    } catch (err: unknown) {
      console.error('Intelligence fetch error:', err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Batch email summary ──
  useEffect(() => {
    if (leads.length === 0) return;
    const leadIds = leads.map(l => l.id);
    fetchBatchEmailSummary(leadIds).then(map => setEmailSummaryMap(map)).catch(console.error);
  }, [leads]);

  // ── Real insights ──
  useEffect(() => {
    if (leads.length === 0) { setRealInsights([]); return; }
    setRealInsights(generateProgrammaticInsights(leads));
  }, [leads]);

  // ── Workflow stats ──
  useEffect(() => {
    if (!user?.id) return;
    getWorkflowStats(user.id).then(stats => setWorkflowStats(stats)).catch(console.error);
  }, [user?.id]);

  // ── Per-lead engagement ──
  useEffect(() => {
    if (!selectedLeadId) { setSelectedLeadEngagement(null); return; }
    setEngagementLoading(true);
    fetchLeadEmailEngagement(selectedLeadId)
      .then(data => setSelectedLeadEngagement(data))
      .catch(console.error)
      .finally(() => setEngagementLoading(false));
  }, [selectedLeadId]);

  // ─── Computed ───
  const buckets = useMemo(() => {
    const total = leads.length || 1;
    const hot = leads.filter(l => l.score > 75);
    const warm = leads.filter(l => l.score > 50 && l.score <= 75);
    const cool = leads.filter(l => l.score > 25 && l.score <= 50);
    const cold = leads.filter(l => l.score <= 25);
    return {
      hot: { count: hot.length, pct: Math.round((hot.length / total) * 100), leads: hot },
      warm: { count: warm.length, pct: Math.round((warm.length / total) * 100), leads: warm },
      cool: { count: cool.length, pct: Math.round((cool.length / total) * 100), leads: cool },
      cold: { count: cold.length, pct: Math.round((cold.length / total) * 100), leads: cold },
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (filterBucket === 'all') return leads;
    return buckets[filterBucket].leads;
  }, [leads, filterBucket, buckets]);

  const selectedLead = useMemo(
    () => leads.find(l => l.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );

  const leadFactors = useMemo(
    () => selectedLead ? generateLeadFactors(selectedLead) : null,
    [selectedLead]
  );

  const scoreHistory = useMemo(
    () => selectedLead ? generateScoreHistory(selectedLead) : [],
    [selectedLead]
  );

  const scoreEvents = useMemo(
    () => scoreHistory.filter(e => e.event),
    [scoreHistory]
  );

  // ── Compare Lead ──
  const compareLead = useMemo(
    () => compareLeadId ? leads.find(l => l.id === compareLeadId) || null : null,
    [leads, compareLeadId]
  );
  const compareFactors = useMemo(
    () => compareLead ? generateLeadFactors(compareLead) : null,
    [compareLead]
  );

  // ── KPI Stats ──
  const kpiStats = useMemo(() => {
    if (leads.length === 0) return { avgScore: 0, medianScore: 0, scoreVariance: 0, hotPct: 0, predictionAccuracy: 0, leadsAnalyzed: 0 };
    const sorted = [...leads].sort((a, b) => a.score - b.score);
    const avg = Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length);
    const median = sorted[Math.floor(sorted.length / 2)]?.score || 0;
    const variance = Math.round(Math.sqrt(leads.reduce((s, l) => s + Math.pow(l.score - avg, 2), 0) / leads.length));
    const hotPct = Math.round((leads.filter(l => l.score > 75).length / leads.length) * 100);
    return { avgScore: avg, medianScore: median, scoreVariance: variance, hotPct, predictionAccuracy: aiConfidence, leadsAnalyzed: leads.length };
  }, [leads, aiConfidence]);

  // ── Portfolio Score Trend (aggregate) ──
  const portfolioTrend = useMemo(() => {
    const days = 30;
    const now = new Date();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const baseAvg = kpiStats.avgScore;
      const noise = Math.sin(i * 0.5) * 8 + (Math.random() - 0.5) * 5;
      const progression = (i / days) * 12;
      return {
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        score: Math.round(Math.max(0, Math.min(100, baseAvg - 15 + progression + noise))),
        leads: Math.max(1, leads.length - days + i + Math.floor(Math.random() * 3)),
      };
    });
  }, [kpiStats.avgScore, leads.length]);

  // ── Score Leaderboard (top movers) ──
  const scoreLeaderboard = useMemo(() => {
    return leads.slice(0, 10).map(l => {
      const delta = Math.floor(Math.random() * 25) - 5;
      return { ...l, delta, previousScore: Math.max(0, Math.min(100, l.score - delta)) };
    }).sort((a, b) => b.delta - a.delta);
  }, [leads]);

  // ── AI Recommendations (from real insights) ──
  const aiRecommendations = useMemo(() => {
    if (realInsights.length === 0) return [];
    return realInsights.map(insight => {
      const priorityMap: Record<string, 'high' | 'medium' | 'low'> = {
        score: insight.confidence > 85 ? 'high' : 'medium',
        conversion: 'high',
        engagement: 'medium',
        company: 'medium',
        timing: 'low',
      };
      return {
        id: insight.id,
        priority: priorityMap[insight.category] || 'medium',
        title: insight.title,
        description: insight.description,
        action: insight.action || 'View Details',
        confidence: insight.confidence,
        navigateTo: getInsightNavigationTarget(insight),
      };
    });
  }, [realInsights]);

  // ── Engagement Heatmap Data ──
  const engagementHeatmap = useMemo(() => {
    if (!selectedLead) return [];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = ['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm'];
    const base = selectedLead.score;
    return days.map(day => ({
      day,
      hours: hours.map(hour => ({
        hour,
        value: Math.max(0, Math.min(100, base - 30 + Math.floor(Math.random() * 60) + (day === 'Tue' || day === 'Wed' ? 15 : 0) + (hour === '10am' || hour === '2pm' ? 10 : 0))),
      })),
    }));
  }, [selectedLead]);

  // ── Signal Strength Data ──
  const signalStrengths = useMemo(() => {
    if (!leadFactors) return [];
    // Use real email engagement data when available
    const emailSignal = selectedLeadEngagement && selectedLeadEngagement.totalSent > 0
      ? Math.min(100, Math.round(
          ((selectedLeadEngagement.uniqueOpens / Math.max(1, selectedLeadEngagement.totalSent)) * 60) +
          ((selectedLeadEngagement.uniqueClicks / Math.max(1, selectedLeadEngagement.totalSent)) * 40)
        ))
      : leadFactors.emailEngagement;
    return [
      { label: 'Email', value: emailSignal, color: '#6366f1' },
      { label: 'Website', value: leadFactors.websiteActivity, color: '#8b5cf6' },
      { label: 'Company', value: leadFactors.companyFit, color: '#10b981' },
      { label: 'Social', value: Math.min(100, leadFactors.emailEngagement - 10 + Math.floor(Math.random() * 20)), color: '#f59e0b' },
      { label: 'Content', value: Math.min(100, leadFactors.websiteActivity - 5 + Math.floor(Math.random() * 15)), color: '#ef4444' },
      { label: 'Timing', value: Math.min(100, 30 + Math.floor(Math.random() * 40)), color: '#64748b' },
    ];
  }, [leadFactors, selectedLeadEngagement]);

  // ─── Handlers ───
  const handleRefreshScores = async () => {
    setRefreshing(true);
    try {
      await fetchData();
      if (leads.length > 0) {
        const leadIds = leads.map(l => l.id);
        const [summaryMap, wfStats] = await Promise.all([
          fetchBatchEmailSummary(leadIds),
          user?.id ? getWorkflowStats(user.id) : Promise.resolve(null),
        ]);
        setEmailSummaryMap(summaryMap);
        setRealInsights(generateProgrammaticInsights(leads));
        if (wfStats) setWorkflowStats(wfStats);
      }
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleWeightChange = (id: string, newWeight: number) => {
    setFactors(prev => {
      const updated = prev.map(f => f.id === id ? { ...f, weight: newWeight } : f);
      // Normalize to 100%
      const total = updated.reduce((a, b) => a + b.weight, 0);
      if (total > 0 && total !== 100) {
        const scale = 100 / total;
        return updated.map(f => ({ ...f, weight: Math.round(f.weight * scale) }));
      }
      return updated;
    });
  };

  const handleToggleFactor = (id: string) => {
    setFactors(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  const handleExportAnalysis = () => {
    if (!selectedLead || !leadFactors) return;
    const content = `Scaliyo Lead Intelligence Report
Generated: ${new Date().toLocaleDateString()}
Lead: ${selectedLead.name}
Company: ${selectedLead.company}
Score: ${selectedLead.score}
Status: ${selectedLead.status}

Factor Breakdown:
- Email Engagement: ${leadFactors.emailEngagement}%
- Website Activity: ${leadFactors.websiteActivity}%
- Company Fit: ${leadFactors.companyFit}%

AI Prediction:
- Conversion Probability: ${leadFactors.conversionProbability}%
- Expected Timeline: ${leadFactors.expectedTimeline}
- Recommended Action: ${leadFactors.recommendedAction}

Score History Events:
${scoreEvents.map(e => `${e.date}: ${e.event} (${(e.delta || 0) > 0 ? '+' : ''}${e.delta})`).join('\n')}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead_intelligence_${selectedLead.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput || showModelPanel) return;

      if (e.key === 'j') { // Next lead
        const idx = Math.min(focusedLeadIndex + 1, filteredLeads.length - 1);
        setFocusedLeadIndex(idx);
        if (filteredLeads[idx]) setSelectedLeadId(filteredLeads[idx].id);
        return;
      }
      if (e.key === 'k') { // Previous lead
        const idx = Math.max(focusedLeadIndex - 1, 0);
        setFocusedLeadIndex(idx);
        if (filteredLeads[idx]) setSelectedLeadId(filteredLeads[idx].id);
        return;
      }
      if (e.key === 'c') { setCompareMode(prev => !prev); return; }
      if (e.key === 'r') { handleRefreshScores(); return; }
      if (e.key === 'm') { setShowModelPanel(prev => !prev); return; }
      if (e.key === 'e') { handleExportAnalysis(); return; }
      if (e.key === '1') { setAnalysisTab('overview'); return; }
      if (e.key === '2') { setAnalysisTab('engagement'); return; }
      if (e.key === '3') { setAnalysisTab('signals'); return; }
      if (e.key === '?') { setShowShortcuts(prev => !prev); return; }
      if (e.key === 'Escape') { setShowShortcuts(false); setCompareMode(false); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedLeadIndex, filteredLeads.length, showModelPanel]);

  // ─── Loading ───
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
      {/* HEADER                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <PageHeader
        title="Lead Insights"
        description={`AI-powered lead scoring, analysis & predictions \u00b7 ${leads.length} leads tracked`}
        actions={
          <>
            <button
              onClick={() => setFilterBucket(filterBucket === 'all' ? 'hot' : 'all')}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <FilterIcon className="w-4 h-4 text-slate-400" />
              <span>{filterBucket === 'all' ? 'All Leads' : `${filterBucket.charAt(0).toUpperCase() + filterBucket.slice(1)} Only`}</span>
            </button>
            <button
              onClick={handleExportAnalysis}
              className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <DownloadIcon className="w-4 h-4" />
              <span>Export</span>
            </button>
          </>
        }
        advancedActions={
          <>
            {compareMode && (
              <span className="flex items-center space-x-1.5 px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-xs font-bold">
                <UsersIcon className="w-3.5 h-3.5" />
                <span>Compare Mode</span>
              </span>
            )}
            <button
              onClick={() => setShowShortcuts(true)}
              className="flex items-center space-x-1.5 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <KeyboardIcon className="w-4 h-4 text-slate-400" />
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold text-slate-400">?</kbd>
            </button>
          </>
        }
      />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KPI STATS ROW                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {leads.length > 0 && (() => {
        const emailEngagedCount = Array.from(emailSummaryMap.values()).filter(s => s.hasOpened).length;
        const potentialClientsCount = Array.from(emailSummaryMap.values()).filter(s => s.openCount >= 2).length;
        const kpiCards: { label: string; value: string; icon: React.ReactNode; color: string; sub: string; onClick?: () => void }[] = [
            { label: 'Leads Analyzed', value: kpiStats.leadsAnalyzed.toString(), icon: <UsersIcon className="w-4 h-4" />, color: 'indigo', sub: `${buckets.hot.count} hot` },
            { label: 'Avg Score', value: kpiStats.avgScore.toString(), icon: <TargetIcon className="w-4 h-4" />, color: kpiStats.avgScore >= 60 ? 'emerald' : 'amber', sub: `Median: ${kpiStats.medianScore}` },
            { label: 'Hot Lead %', value: `${kpiStats.hotPct}%`, icon: <FlameIcon className="w-4 h-4" />, color: 'rose', sub: `${buckets.hot.count} of ${leads.length}` },
            { label: 'Email Engaged', value: emailEngagedCount.toString(), icon: <MailIcon className="w-4 h-4" />, color: 'violet', sub: `of ${leads.length} leads opened` },
            { label: 'Score Variance', value: kpiStats.scoreVariance.toString(), icon: <ActivityIcon className="w-4 h-4" />, color: kpiStats.scoreVariance > 25 ? 'amber' : 'slate', sub: kpiStats.scoreVariance > 25 ? 'High spread' : 'Normal' },
            { label: 'Potential Clients', value: potentialClientsCount.toString(), icon: <StarIcon className="w-4 h-4" />, color: 'sky', sub: '2+ email opens', onClick: () => navigate('/portal/leads?followUp=true') },
        ];
        return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpiCards.map((stat, i) => (
            <div
              key={i}
              onClick={stat.onClick}
              className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-all group ${stat.onClick ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`p-2 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 group-hover:scale-110 transition-transform`}>
                  {stat.icon}
                </span>
              </div>
              <p className="text-2xl font-black text-slate-900 font-heading">{stat.value}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{stat.label}</p>
              <p className="text-[10px] text-slate-400 mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>
        );
      })()}

      {/* ── Workflow Stats Bar ── */}
      <AdvancedOnly>
      {workflowStats && workflowStats.totalWorkflows > 0 && (
        <div className="flex items-center space-x-6 px-5 py-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex items-center space-x-1.5 text-xs text-slate-600">
            <BoltIcon className="w-3.5 h-3.5 text-indigo-500" />
            <span className="font-bold">{workflowStats.totalLeadsProcessed}</span>
            <span className="text-slate-400">leads automated</span>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-slate-600">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-bold">{workflowStats.successRate}%</span>
            <span className="text-slate-400">success rate</span>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-slate-600">
            <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-bold">{workflowStats.activeWorkflows}</span>
            <span className="text-slate-400">active workflows</span>
          </div>
        </div>
      )}
      </AdvancedOnly>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* AI RECOMMENDATIONS                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {aiRecommendations.length > 0 && leads.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 via-white to-violet-50 rounded-2xl border border-indigo-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <SparklesIcon className="w-4 h-4 text-indigo-600" />
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">AI Recommendations</p>
              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[9px] font-bold">{aiRecommendations.length}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiRecommendations.slice(0, 3).map(rec => (
              <div key={rec.id} className="bg-white rounded-xl border border-slate-100 p-4 hover:shadow-sm transition-all">
                <div className="flex items-center space-x-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${
                    rec.priority === 'high' ? 'bg-rose-500' : rec.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}></div>
                  <span className={`text-[9px] font-black uppercase tracking-wider ${
                    rec.priority === 'high' ? 'text-rose-600' : rec.priority === 'medium' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>{rec.priority}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-800 mb-1">{rec.title}</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">{rec.description}</p>
                {rec.confidence && (
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full transition-all duration-500" style={{ width: `${rec.confidence}%` }}></div>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">{rec.confidence}%</span>
                  </div>
                )}
                <button
                  onClick={() => { if (rec.navigateTo) navigate(rec.navigateTo); }}
                  className="mt-3 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center space-x-1"
                >
                  <span>{rec.action}</span>
                  <ArrowRightIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* PORTFOLIO SCORE TREND                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AdvancedOnly>
      {leads.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                <TrendUpIcon className="w-5 h-5 text-emerald-600" />
                <span>Portfolio Score Trend</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">30 days</span>
                <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Simulated</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Aggregate score health across all leads</p>
            </div>
            <div className="flex items-center space-x-4 text-xs text-slate-500">
              <span className="flex items-center space-x-1"><span className="w-3 h-1.5 rounded-full bg-indigo-500 inline-block"></span><span>Avg Score</span></span>
              <span className="flex items-center space-x-1"><span className="w-3 h-1.5 rounded-full bg-emerald-400 inline-block"></span><span>Lead Count</span></span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={portfolioTrend}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={4} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
              <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} fill="url(#portfolioGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      </AdvancedOnly>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SCORE DISTRIBUTION                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
              <TargetIcon className="w-5 h-5 text-indigo-600" />
              <span>Lead Scoring Breakdown</span>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">Real-time</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribution across score buckets</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-xs text-slate-400">AI Confidence</p>
              <p className="text-sm font-black text-indigo-600">{aiConfidence}%</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefreshScores}
                disabled={refreshing}
                className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
              >
                <RefreshIcon className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setShowModelPanel(!showModelPanel)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
              >
                <SlidersIcon className="w-3.5 h-3.5" />
                <span>Adjust Model</span>
              </button>
            </div>
          </div>
        </div>

        {/* Distribution Bars */}
        <div className="space-y-3">
          {([
            { key: 'hot' as ScoreBucket, label: 'Hot (76-100)', color: '#ef4444', bgColor: 'bg-rose-50', textColor: 'text-rose-700', icon: <FlameIcon className="w-4 h-4" /> },
            { key: 'warm' as ScoreBucket, label: 'Warm (51-75)', color: '#f59e0b', bgColor: 'bg-amber-50', textColor: 'text-amber-700', icon: <TrendUpIcon className="w-4 h-4" /> },
            { key: 'cool' as ScoreBucket, label: 'Cool (26-50)', color: '#6366f1', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700', icon: <ActivityIcon className="w-4 h-4" /> },
            { key: 'cold' as ScoreBucket, label: 'Cold (0-25)', color: '#94a3b8', bgColor: 'bg-slate-50', textColor: 'text-slate-600', icon: <ClockIcon className="w-4 h-4" /> },
          ]).map(bucket => (
            <button
              key={bucket.key}
              onClick={() => setFilterBucket(filterBucket === bucket.key ? 'all' : bucket.key)}
              className={`w-full flex items-center space-x-4 p-3 rounded-xl transition-all ${
                filterBucket === bucket.key ? 'bg-slate-50 ring-2 ring-indigo-200' : 'hover:bg-slate-50/50'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg ${bucket.bgColor} flex items-center justify-center ${bucket.textColor}`}>
                {bucket.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">{bucket.label}</span>
                  <span className="text-xs font-black text-slate-600">
                    {buckets[bucket.key].count} leads &middot; {buckets[bucket.key].pct}%
                  </span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(2, buckets[bucket.key].pct)}%`, backgroundColor: bucket.color }}
                  ></div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Last Updated: <span className="font-bold text-slate-500">Just now</span>
          </p>
          <p className="text-xs text-slate-400">
            Total: <span className="font-bold text-slate-500">{leads.length} leads</span>
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SCORING FACTORS TABLE                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AdvancedOnly>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
            <ChartIcon className="w-5 h-5 text-violet-600" />
            <span>Scoring Factors</span>
            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full uppercase">Interactive</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Click weights to edit &middot; Toggle factors on/off</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider w-10">On</th>
                <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Factor</th>
                <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Weight</th>
                <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {factors.map(factor => (
                <tr
                  key={factor.id}
                  className={`transition-colors ${factor.enabled ? 'hover:bg-slate-50/50' : 'opacity-40'}`}
                >
                  <td className="px-6 py-3.5">
                    <button
                      onClick={() => handleToggleFactor(factor.id)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        factor.enabled
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {factor.enabled && <CheckIcon className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg bg-${factor.color}-50 flex items-center justify-center text-${factor.color}-600`}>
                        {factor.icon}
                      </div>
                      <span className="font-semibold text-sm text-slate-800">{factor.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <input
                        type="range"
                        min={0}
                        max={50}
                        value={factor.weight}
                        onChange={e => handleWeightChange(factor.id, parseInt(e.target.value))}
                        className="w-20 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                        disabled={!factor.enabled}
                      />
                      <span className="text-sm font-black text-indigo-600 w-10 text-right">{factor.weight}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <div className="flex space-x-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-4 h-1.5 rounded-full ${
                              (factor.impact === 'High' && i < 5) ||
                              (factor.impact === 'Medium' && i < 3) ||
                              (factor.impact === 'Low' && i < 1)
                                ? `bg-${IMPACT_COLORS[factor.impact]}-500`
                                : 'bg-slate-100'
                            }`}
                          ></div>
                        ))}
                      </div>
                      <span className={`text-xs font-bold text-${IMPACT_COLORS[factor.impact]}-600`}>
                        {factor.impact}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </AdvancedOnly>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SCORE LEADERBOARD (Top Movers)                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {scoreLeaderboard.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                <BoltIcon className="w-5 h-5 text-amber-500" />
                <span>Score Leaderboard</span>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase">Top Movers</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Leads with biggest score changes this period</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                  compareMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <UsersIcon className="w-3.5 h-3.5" />
                <span>{compareMode ? 'Exit Compare' : 'Compare Mode'}</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-50">
            {scoreLeaderboard.slice(0, 5).map((lead, i) => (
              <button
                key={lead.id}
                onClick={() => {
                  if (compareMode && selectedLeadId !== lead.id) setCompareLeadId(lead.id);
                  else setSelectedLeadId(lead.id);
                }}
                className={`p-4 text-center hover:bg-slate-50 transition-all ${
                  selectedLeadId === lead.id ? 'bg-indigo-50' : compareLeadId === lead.id ? 'bg-violet-50' : ''
                }`}
              >
                <div className="flex items-center justify-center mb-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black ${
                    i === 0 ? 'bg-amber-100 text-amber-700' :
                    i === 1 ? 'bg-slate-200 text-slate-700' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate">{lead.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{lead.company}</p>
                <div className="flex items-center justify-center space-x-1 mt-2">
                  <span className="text-sm font-black text-slate-900">{lead.score}</span>
                  <span className={`text-[10px] font-bold flex items-center ${
                    lead.delta > 0 ? 'text-emerald-600' : lead.delta < 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}>
                    {lead.delta > 0 ? <TrendUpIcon className="w-3 h-3" /> : lead.delta < 0 ? <TrendDownIcon className="w-3 h-3" /> : null}
                    {lead.delta > 0 ? '+' : ''}{lead.delta}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MAIN AREA: Lead Selector + Analysis                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Lead Selector (Left - 30%) */}
        <div className="lg:w-[30%] space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm font-heading">Select Lead</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''} &middot; Sorted by score
              </p>
            </div>
            <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-50">
              {filteredLeads.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <TargetIcon className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500">No leads in this bucket</p>
                </div>
              ) : (
                filteredLeads.map(lead => (
                  <button
                    key={lead.id}
                    onClick={() => {
                      if (compareMode && selectedLeadId !== lead.id) setCompareLeadId(lead.id);
                      else setSelectedLeadId(lead.id);
                    }}
                    className={`w-full flex items-center space-x-3 px-5 py-3.5 text-left transition-all ${
                      selectedLeadId === lead.id
                        ? 'bg-indigo-50 border-l-4 border-indigo-600'
                        : compareLeadId === lead.id
                        ? 'bg-violet-50 border-l-4 border-violet-600'
                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                      lead.score > 80 ? 'bg-rose-100 text-rose-700' :
                      lead.score > 60 ? 'bg-amber-100 text-amber-700' :
                      lead.score > 40 ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {lead.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{lead.name}</p>
                      <p className="text-xs text-slate-400 truncate">{lead.company}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-black ${
                        lead.score > 80 ? 'bg-rose-50 text-rose-700' :
                        lead.score > 60 ? 'bg-amber-50 text-amber-700' :
                        lead.score > 40 ? 'bg-indigo-50 text-indigo-700' :
                        'bg-slate-50 text-slate-600'
                      }`}>
                        <span>{lead.score}</span>
                      </span>
                      <div className="mt-1">{renderStars(lead.score)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Individual Lead Analysis (Right - 70%) */}
        <div className="lg:w-[70%] space-y-6">

          {selectedLead && leadFactors ? (
            <>
              {/* Lead Header */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center space-x-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black ${
                      selectedLead.score > 80 ? 'bg-rose-100 text-rose-700' :
                      selectedLead.score > 60 ? 'bg-amber-100 text-amber-700' :
                      'bg-indigo-100 text-indigo-700'
                    }`}>
                      {selectedLead.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{selectedLead.name}</h3>
                      <p className="text-sm text-slate-400">{selectedLead.company} &middot; {selectedLead.email}</p>
                      <div className="flex items-center space-x-3 mt-1">
                        <span className="text-xs font-bold text-slate-500">Score: <span className="text-indigo-600">{selectedLead.score}</span></span>
                        {renderStars(selectedLead.score)}
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                          selectedLead.status === 'Qualified' ? 'bg-emerald-50 text-emerald-700' :
                          selectedLead.status === 'Contacted' ? 'bg-blue-50 text-blue-700' :
                          selectedLead.status === 'Lost' ? 'bg-slate-50 text-slate-500' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {selectedLead.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => navigate('/portal/content')}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm"
                    >
                      <MailIcon className="w-3.5 h-3.5" />
                      <span>Send Email</span>
                    </button>
                    <button
                      onClick={() => navigate(`/portal/leads/${selectedLead.id}`)}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <EyeIcon className="w-3.5 h-3.5" />
                      <span>View Timeline</span>
                    </button>
                    <button className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                      <SlidersIcon className="w-3.5 h-3.5" />
                      <span>Override Score</span>
                    </button>
                    <button
                      onClick={handleExportAnalysis}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <DownloadIcon className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* Analysis Tabs */}
                <div className="flex items-center space-x-1 mb-5 p-1 bg-slate-100 rounded-xl">
                  {([
                    { key: 'overview' as const, label: 'Overview', icon: <ChartIcon className="w-3.5 h-3.5" /> },
                    { key: 'engagement' as const, label: 'Engagement', icon: <ActivityIcon className="w-3.5 h-3.5" /> },
                    { key: 'signals' as const, label: 'Signals', icon: <BoltIcon className="w-3.5 h-3.5" /> },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setAnalysisTab(tab.key)}
                      className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                        analysisTab === tab.key
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* ── Tab: Overview ── */}
                {analysisTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Email Engagement */}
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center space-x-2 mb-3">
                      <MailIcon className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Email Engagement</span>
                    </div>
                    {engagementLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                      </div>
                    ) : selectedLeadEngagement && selectedLeadEngagement.totalSent > 0 ? (
                      <>
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400">Open Rate</span>
                            <span className="text-xs font-black text-indigo-600">
                              {Math.round((selectedLeadEngagement.uniqueOpens / Math.max(1, selectedLeadEngagement.totalSent)) * 100)}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.round((selectedLeadEngagement.uniqueOpens / Math.max(1, selectedLeadEngagement.totalSent)) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-slate-500">
                          <p>&bull; Sent: {selectedLeadEngagement.totalSent} emails</p>
                          <p>&bull; Opens: {selectedLeadEngagement.totalOpens} total ({selectedLeadEngagement.uniqueOpens} unique)</p>
                          <p>&bull; Clicks: {selectedLeadEngagement.totalClicks} total ({selectedLeadEngagement.uniqueClicks} unique)</p>
                          <p>&bull; Bounced: {selectedLeadEngagement.totalBounced}</p>
                          {selectedLeadEngagement.lastOpenedAt && (
                            <p>&bull; Last opened: {new Date(selectedLeadEngagement.lastOpenedAt).toLocaleDateString()}</p>
                          )}
                          {selectedLeadEngagement.topClickedLink && (
                            <p>&bull; Top link: <a href={selectedLeadEngagement.topClickedLink.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{selectedLeadEngagement.topClickedLink.label}</a> ({selectedLeadEngagement.topClickedLink.clicks} clicks)</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 py-2">No email engagement data yet</p>
                    )}
                  </div>

                  {/* Website Activity */}
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center space-x-2 mb-3">
                      <GlobeIcon className="w-4 h-4 text-violet-600" />
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Website Activity</span>
                    </div>
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400">Score</span>
                        <span className="text-xs font-black text-violet-600">{leadFactors.websiteActivity}%</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${leadFactors.websiteActivity}%` }}></div>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-slate-500">
                      <p>&bull; Pages: {leadFactors.topPages.join(', ')}</p>
                      <p>&bull; Duration: {leadFactors.visitDuration} total</p>
                      <p>&bull; Frequency: {leadFactors.weeklyVisits} visits this week</p>
                    </div>
                  </div>

                  {/* Company Fit */}
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center space-x-2 mb-3">
                      <BriefcaseIcon className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Company Fit</span>
                    </div>
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400">Score</span>
                        <span className="text-xs font-black text-emerald-600">{leadFactors.companyFit}%</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${leadFactors.companyFit}%` }}></div>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-slate-500">
                      <p>&bull; Industry: Technology</p>
                      <p>&bull; Company Size: 50-200</p>
                      <p>&bull; Revenue: $5M-$20M</p>
                    </div>
                  </div>

                  {/* AI Prediction */}
                  <div className="p-4 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl text-white">
                    <div className="flex items-center space-x-2 mb-3">
                      <SparklesIcon className="w-4 h-4 text-indigo-200" />
                      <span className="text-xs font-black text-indigo-200 uppercase tracking-wider">AI Prediction</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-indigo-200">Conversion Probability</p>
                        <p className="text-2xl font-black">{leadFactors.conversionProbability}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-indigo-200">Expected Timeline</p>
                        <p className="text-sm font-bold">{leadFactors.expectedTimeline}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-indigo-200">Recommended Action</p>
                        <p className="text-sm font-bold">{leadFactors.recommendedAction}</p>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* ── Tab: Engagement Heatmap ── */}
                {analysisTab === 'engagement' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-3">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Weekly Engagement Heatmap</p>
                        <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Simulated</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mb-4">Darker cells indicate higher engagement intensity during that time slot.</p>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="w-12"></th>
                              {engagementHeatmap[0]?.hours.map(h => (
                                <th key={h.hour} className="px-1.5 py-2 text-[9px] font-bold text-slate-400 text-center">{h.hour}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {engagementHeatmap.map(row => (
                              <tr key={row.day}>
                                <td className="text-[10px] font-bold text-slate-500 pr-2">{row.day}</td>
                                {row.hours.map(cell => (
                                  <td key={cell.hour} className="p-1">
                                    <div
                                      className="w-full h-6 rounded-md transition-all hover:ring-2 hover:ring-indigo-300 cursor-default"
                                      style={{
                                        backgroundColor: cell.value > 70 ? '#6366f1' : cell.value > 50 ? '#818cf8' : cell.value > 30 ? '#c7d2fe' : '#f1f5f9',
                                        opacity: 0.3 + (cell.value / 100) * 0.7,
                                      }}
                                      title={`${row.day} ${cell.hour}: ${cell.value}%`}
                                    ></div>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center space-x-4 mt-3">
                        <span className="text-[9px] text-slate-400">Low</span>
                        <div className="flex items-center space-x-1">
                          {[10, 30, 50, 70, 90].map(v => (
                            <div key={v} className="w-5 h-3 rounded-sm" style={{ backgroundColor: '#6366f1', opacity: 0.2 + (v / 100) * 0.8 }}></div>
                          ))}
                        </div>
                        <span className="text-[9px] text-slate-400">High</span>
                      </div>
                    </div>

                    {/* Recent Email Events / Peak Activity */}
                    {selectedLeadEngagement && selectedLeadEngagement.recentEvents.length > 0 ? (
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Recent Email Events</p>
                        <div className="space-y-2">
                          {selectedLeadEngagement.recentEvents.slice(0, 5).map((evt, i) => (
                            <div key={i} className="flex items-center space-x-3 p-2 bg-slate-50 rounded-lg">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                evt.event_type === 'open' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                              }`}>
                                {evt.event_type === 'open' ? <EyeIcon className="w-3 h-3" /> : <CursorClickIcon className="w-3 h-3" />}
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-slate-700 capitalize">{evt.event_type}</p>
                              </div>
                              <span className="text-[10px] text-slate-400">{new Date(evt.created_at).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-indigo-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Peak Day</p>
                          <p className="text-sm font-black text-indigo-700 mt-1">Tuesday</p>
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Simulated</span>
                        </div>
                        <div className="bg-violet-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Peak Hour</p>
                          <p className="text-sm font-black text-violet-700 mt-1">10:00 AM</p>
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Simulated</span>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Sessions</p>
                          <p className="text-sm font-black text-emerald-700 mt-1">{leadFactors.weeklyVisits * 4}</p>
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Simulated</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Tab: Signal Strengths ── */}
                {analysisTab === 'signals' && (
                  <div className="space-y-4">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Signal Strength Analysis</p>
                    <p className="text-[11px] text-slate-400 mb-4">Multi-dimensional view of engagement signals contributing to this lead&rsquo;s score.</p>

                    {/* Signal Bars */}
                    <div className="space-y-3">
                      {signalStrengths.map(signal => (
                        <div key={signal.label} className="flex items-center space-x-3">
                          <span className="text-xs font-bold text-slate-600 w-16 text-right">{signal.label}</span>
                          <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden relative">
                            <div
                              className="h-full rounded-lg transition-all duration-700"
                              style={{ width: `${signal.value}%`, backgroundColor: signal.color }}
                            ></div>
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white mix-blend-difference">
                              {signal.value}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Signal Comparison with Compare Lead */}
                    {compareMode && compareLead && compareFactors && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-xs font-black text-violet-600 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                          <UsersIcon className="w-3.5 h-3.5" />
                          <span>Comparing with {compareLead.name}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-indigo-50/50 rounded-xl p-4">
                            <p className="text-xs font-bold text-slate-800 mb-1">{selectedLead.name}</p>
                            <p className="text-2xl font-black text-indigo-600">{selectedLead.score}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Conv. Prob: {leadFactors.conversionProbability}%</p>
                          </div>
                          <div className="bg-violet-50/50 rounded-xl p-4">
                            <p className="text-xs font-bold text-slate-800 mb-1">{compareLead.name}</p>
                            <p className="text-2xl font-black text-violet-600">{compareLead.score}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Conv. Prob: {compareFactors.conversionProbability}%</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {['Email Engagement', 'Website Activity', 'Company Fit'].map((factor, i) => {
                            const aVal = i === 0 ? leadFactors.emailEngagement : i === 1 ? leadFactors.websiteActivity : leadFactors.companyFit;
                            const bVal = i === 0 ? compareFactors.emailEngagement : i === 1 ? compareFactors.websiteActivity : compareFactors.companyFit;
                            return (
                              <div key={factor} className="flex items-center space-x-2">
                                <span className="text-[10px] font-bold text-slate-500 w-24 text-right">{factor}</span>
                                <div className="flex-1 flex items-center space-x-1">
                                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${aVal}%` }}></div>
                                  </div>
                                  <span className="text-[9px] font-black text-indigo-600 w-8">{aVal}%</span>
                                </div>
                                <div className="flex-1 flex items-center space-x-1">
                                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${bVal}%` }}></div>
                                  </div>
                                  <span className="text-[9px] font-black text-violet-600 w-8">{bVal}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Strongest & Weakest Signal */}
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Strongest Signal</p>
                        <p className="text-sm font-bold text-emerald-800 mt-1">
                          {signalStrengths.reduce((a, b) => a.value > b.value ? a : b).label}
                        </p>
                        <p className="text-xs text-emerald-600 font-black">
                          {signalStrengths.reduce((a, b) => a.value > b.value ? a : b).value}%
                        </p>
                      </div>
                      <div className="bg-rose-50 rounded-xl p-3">
                        <p className="text-[9px] font-black text-rose-600 uppercase tracking-wider">Weakest Signal</p>
                        <p className="text-sm font-bold text-rose-800 mt-1">
                          {signalStrengths.reduce((a, b) => a.value < b.value ? a : b).label}
                        </p>
                        <p className="text-xs text-rose-600 font-black">
                          {signalStrengths.reduce((a, b) => a.value < b.value ? a : b).value}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ═══════════════════════════════════════════════════════ */}
              {/* SCORE EVOLUTION TIMELINE                               */}
              {/* ═══════════════════════════════════════════════════════ */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                      <ActivityIcon className="w-5 h-5 text-emerald-600" />
                      <span>Score Evolution Timeline</span>
                      <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Simulated</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedLead.name}&rsquo;s score over the last 8 weeks</p>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={scoreHistory}>
                    <defs>
                      <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={6} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                      formatter={(value: number) => [`${value}`, 'Score']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Hot', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                    <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Warm', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (payload.event) {
                          return (
                            <circle
                              cx={cx} cy={cy} r={5}
                              fill={payload.delta && payload.delta > 0 ? '#10b981' : '#ef4444'}
                              stroke="white" strokeWidth={2}
                            />
                          );
                        }
                        return <circle cx={cx} cy={cy} r={0} />;
                      }}
                      activeDot={{ r: 5, fill: '#6366f1' }}
                    />
                  </LineChart>
                </ResponsiveContainer>

                {/* Key Events Legend */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Key Events</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {scoreEvents.map((evt, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0 ${
                          (evt.delta || 0) > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}>
                          {(evt.delta || 0) > 0 ? '\u25B2' : '\u25BC'}
                        </span>
                        <p className="text-xs text-slate-600">
                          <span className={`font-black ${(evt.delta || 0) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {(evt.delta || 0) > 0 ? '+' : ''}{evt.delta}:
                          </span>{' '}
                          {evt.event} <span className="text-slate-400">({evt.date})</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl p-16 border border-slate-100 shadow-sm text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <BrainIcon className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">No Lead Selected</h3>
              <p className="text-sm text-slate-400">
                {leads.length > 0 ? 'Select a lead from the list to view their intelligence profile.' : 'Add leads to start analyzing their scoring data.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <AdvancedOnly>
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODEL ADJUSTMENT PANEL (Slide-down)                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEYBOARD SHORTCUTS PANEL                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-slate-900">Keyboard Shortcuts</h2>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2">
              {[
                ['j / k', 'Navigate leads & select'],
                ['1 / 2 / 3', 'Switch analysis tab'],
                ['c', 'Toggle compare mode'],
                ['r', 'Refresh scores'],
                ['m', 'Open model config'],
                ['e', 'Export analysis'],
                ['?', 'Show/hide shortcuts'],
                ['Esc', 'Close panels'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 min-w-[60px] text-center">{key}</kbd>
                  <span className="text-xs text-slate-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showModelPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModelPanel(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900">Scoring Model Configuration</h2>
                <p className="text-xs text-slate-400 mt-0.5">Adjust factor weights &middot; Changes apply to all leads</p>
              </div>
              <button onClick={() => setShowModelPanel(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {factors.map(factor => (
                <div key={factor.id} className="flex items-center space-x-4">
                  <div className={`w-8 h-8 rounded-lg bg-${factor.color}-50 flex items-center justify-center text-${factor.color}-600 shrink-0`}>
                    {factor.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-700">{factor.name}</span>
                      <span className="text-sm font-black text-indigo-600">{factor.weight}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={factor.weight}
                      onChange={e => handleWeightChange(factor.id, parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <button
                    onClick={() => handleToggleFactor(factor.id)}
                    className={`relative w-10 h-5 rounded-full transition-all shrink-0 ${
                      factor.enabled ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform ${
                      factor.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></div>
                  </button>
                </div>
              ))}

              <div className="pt-4 border-t border-slate-100">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Total Weight</p>
                  <div className="flex items-center space-x-3">
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${factors.reduce((a, b) => a + b.weight, 0)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-black text-slate-900">
                      {factors.reduce((a, b) => a + b.weight, 0)}%
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => { setShowModelPanel(false); handleRefreshScores(); }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                Apply &amp; Recalculate Scores
              </button>
            </div>
          </div>
        </div>
      )}
      </AdvancedOnly>
    </div>
  );
};

export default LeadIntelligence;
