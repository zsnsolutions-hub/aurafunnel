import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Lead, ContentType, User, DashboardQuickStats, AIInsight, ManualList, FunnelStage, KnowledgeBase } from '../../types';
import {
  FlameIcon, SparklesIcon, TargetIcon, ChartIcon, TrendUpIcon, CreditCardIcon,
  KeyboardIcon, XIcon, TrendDownIcon, ActivityIcon, ShieldIcon, CheckIcon,
  AlertTriangleIcon, ClockIcon, UsersIcon, LayersIcon, BrainIcon, PieChartIcon,
  StarIcon, ArrowRightIcon, RocketIcon, DocumentIcon, GlobeIcon, DatabaseIcon,
  PhoneIcon, LinkedInIcon, InstagramIcon, FacebookIcon, TwitterIcon, YoutubeIcon,
  BellIcon, SendIcon
} from '../../components/Icons';
import { fetchBatchEmailSummary, type BatchEmailSummary } from '../../lib/emailTracking';
import { generateLeadContent, generateDashboardInsights, generateLeadResearch, parseLeadResearchResponse } from '../../lib/gemini';

import { supabase } from '../../lib/supabase';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { generateProgrammaticInsights } from '../../lib/insights';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import QuickStatsRow from '../../components/dashboard/QuickStatsRow';
import { StatCard } from '../../components/dashboard/QuickStatsRow';
import QuickActionsBar from '../../components/dashboard/QuickActionsBar';
import AIInsightsPanel from '../../components/dashboard/AIInsightsPanel';
import LiveActivityFeed from '../../components/dashboard/LiveActivityFeed';
import CSVImportModal from '../../components/dashboard/CSVImportModal';
import LeadActionsModal from '../../components/dashboard/LeadActionsModal';
import LeadSegmentation from '../../components/dashboard/LeadSegmentation';
import EmailPerformanceCard from '../../components/dashboard/EmailPerformanceCard';
import ActivationChecklist from '../../components/dashboard/ActivationChecklist';

const LISTS_STORAGE_KEY = 'scaliyo_manual_lists';

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
    predictedConversions: 0, recommendations: 0, leadsYesterday: 0, hotLeadsYesterday: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Social Stats
  const [socialStats, setSocialStats] = useState({ scheduled: 0, published: 0 });

  // AI Insights
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [deepAnalysisResult, setDeepAnalysisResult] = useState<string | null>(null);

  // Funnel
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);

  // Form states for adding lead
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', phone: '', insights: '' });
  const [visibleKbFields, setVisibleKbFields] = useState<Set<string>>(new Set());
  const [newLeadKB, setNewLeadKB] = useState({ website: '', linkedin: '', instagram: '', facebook: '', twitter: '', youtube: '', extraNotes: '' });
  const [addLeadError, setAddLeadError] = useState('');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [researchingLeadIds, setResearchingLeadIds] = useState<Set<string>>(new Set());

  // Email summary for follow-up detection
  const [emailSummaryMap, setEmailSummaryMap] = useState<Map<string, BatchEmailSummary>>(new Map());

  // Content Generation States
  const [contentType, setContentType] = useState<ContentType>(ContentType.EMAIL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');
  const [genError, setGenError] = useState('');

  // Trend data
  const trendData = useMemo(() => generateTrendData(leads), [leads]);

  // Fetch batch email summary for follow-up detection
  useEffect(() => {
    if (leads.length === 0) return;
    fetchBatchEmailSummary(leads.map(l => l.id)).then(setEmailSummaryMap);
  }, [leads]);

  // Leads that need follow-up (opened emails 2+ times)
  const followUpLeads = useMemo(() => {
    return leads.filter(l => {
      const summary = emailSummaryMap.get(l.id);
      return summary && summary.openCount >= 2;
    });
  }, [leads, emailSummaryMap]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // ─── New Enhancement State ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPipelineHealth, setShowPipelineHealth] = useState(false);
  const [showLeadVelocity, setShowLeadVelocity] = useState(false);
  const [showGoalTracker, setShowGoalTracker] = useState(false);
  const [showEngagementAnalytics, setShowEngagementAnalytics] = useState(false);
  const [showRevenueForecast, setShowRevenueForecast] = useState(false);
  const [showContentPerformance, setShowContentPerformance] = useState(false);

  // ─── Pipeline Health ───
  const pipelineHealth = useMemo(() => {
    if (leads.length === 0) return null;
    const statusGroups: Record<string, Lead[]> = { New: [], Contacted: [], Qualified: [], Lost: [] };
    leads.forEach(l => { if (statusGroups[l.status]) statusGroups[l.status].push(l); });

    const hotLeads = leads.filter(l => l.score > 80);
    const warmLeads = leads.filter(l => l.score >= 50 && l.score <= 80);
    const coldLeads = leads.filter(l => l.score < 50);
    const avgScore = Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length);
    const qualifiedRate = leads.length > 0 ? Math.round((statusGroups.Qualified.length / leads.length) * 100) : 0;

    const healthScore = Math.min(100, Math.round(
      (hotLeads.length > 0 ? 25 : 0) +
      (qualifiedRate > 10 ? 25 : qualifiedRate > 5 ? 15 : 5) +
      (avgScore > 60 ? 25 : avgScore > 40 ? 15 : 5) +
      (leads.length > 10 ? 25 : leads.length > 5 ? 15 : 5)
    ));

    return {
      statusGroups,
      hotLeads: hotLeads.length,
      warmLeads: warmLeads.length,
      coldLeads: coldLeads.length,
      avgScore,
      qualifiedRate,
      healthScore,
      stagnantLeads: leads.filter(l => l.status === 'New' && l.score < 40).length,
    };
  }, [leads]);

  // ─── Lead Velocity (mock 7-day data) ───
  const leadVelocity = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
      const added = Math.floor(Math.random() * 5) + (i === 0 ? leads.filter(l => {
        if (!l.created_at) return false;
        const created = new Date(l.created_at);
        return created.toDateString() === d.toDateString();
      }).length : Math.floor(Math.random() * 3));
      const converted = Math.floor(added * 0.3);
      days.push({ day: dayLabel, added, converted, net: added - converted });
    }
    const totalAdded = days.reduce((s, d) => s + d.added, 0);
    const totalConverted = days.reduce((s, d) => s + d.converted, 0);
    const avgDaily = Math.round(totalAdded / 7);
    return { days, totalAdded, totalConverted, avgDaily };
  }, [leads]);

  // Derived conversion rate (needed by goals)
  const conversionRate = leads.length > 0
    ? Math.round((leads.filter(l => l.status === 'Qualified').length / leads.length) * 100)
    : 0;

  // ─── Goal Tracker ───
  const goals = useMemo(() => [
    { id: 'leads', label: 'Monthly Lead Target', current: leads.length, target: 100, unit: 'leads', color: 'indigo' },
    { id: 'hot', label: 'Hot Leads Generated', current: leads.filter(l => l.score > 80).length, target: 20, unit: 'hot leads', color: 'rose' },
    { id: 'content', label: 'Content Pieces Created', current: quickStats.contentCreated, target: 50, unit: 'pieces', color: 'violet' },
    { id: 'conversion', label: 'Conversion Rate', current: conversionRate, target: 25, unit: '%', color: 'emerald' },
    { id: 'score', label: 'Avg Lead Score', current: quickStats.avgAiScore, target: 75, unit: '%', color: 'amber' },
  ], [leads, quickStats, conversionRate]);

  // ─── Engagement Analytics ───
  const engagementAnalytics = useMemo(() => {
    if (leads.length === 0) return null;

    const channels = [
      { name: 'Email Outreach', leads: leads.filter(l => l.email?.includes('@gmail') || l.email?.includes('@yahoo')).length || Math.round(leads.length * 0.35), responseRate: 42, avgScore: 0, color: '#6366f1' },
      { name: 'Social Media', leads: Math.round(leads.length * 0.25), responseRate: 28, avgScore: 0, color: '#8b5cf6' },
      { name: 'Direct Referral', leads: Math.round(leads.length * 0.22), responseRate: 61, avgScore: 0, color: '#10b981' },
      { name: 'Content Marketing', leads: Math.round(leads.length * 0.18), responseRate: 34, avgScore: 0, color: '#f59e0b' },
    ];
    channels.forEach(ch => {
      const channelLeads = leads.slice(0, ch.leads);
      ch.avgScore = channelLeads.length > 0 ? Math.round(channelLeads.reduce((s, l) => s + l.score, 0) / channelLeads.length) : 0;
    });

    const hourlyActivity = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      activity: Math.round(Math.sin((h - 10) * 0.4) * 40 + 50 + (Math.random() - 0.5) * 15),
    }));
    const peakHour = hourlyActivity.reduce((best, h) => h.activity > best.activity ? h : best, hourlyActivity[0]);

    const topEngaged = leads.slice(0, 5).map(l => ({
      ...l,
      engagementScore: Math.round(l.score * 0.6 + Math.random() * 40),
      lastTouch: ['2h ago', '5h ago', '1d ago', '2d ago', '3d ago'][leads.indexOf(l) % 5],
      touchpoints: Math.floor(Math.random() * 8) + 2,
    }));

    const overallScore = Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length * 0.85);

    return { channels, hourlyActivity, peakHour, topEngaged, overallScore };
  }, [leads]);

  // ─── Revenue Forecast ───
  const revenueForecast = useMemo(() => {
    if (leads.length === 0) return null;

    const avgDealSize = 2800;
    const hotLeads = leads.filter(l => l.score > 80);
    const warmLeads = leads.filter(l => l.score >= 50 && l.score <= 80);
    const coldLeads = leads.filter(l => l.score < 50);

    const pipeline = [
      { stage: 'Hot Leads', count: hotLeads.length, winProb: 0.45, value: hotLeads.length * avgDealSize, color: '#ef4444' },
      { stage: 'Warm Leads', count: warmLeads.length, winProb: 0.20, value: warmLeads.length * avgDealSize, color: '#f59e0b' },
      { stage: 'Cold Leads', count: coldLeads.length, winProb: 0.05, value: coldLeads.length * avgDealSize, color: '#3b82f6' },
    ];
    const totalPipelineValue = pipeline.reduce((s, p) => s + p.value, 0);
    const weightedForecast = pipeline.reduce((s, p) => s + p.value * p.winProb, 0);

    const projections = [
      { period: '30 Days', revenue: Math.round(weightedForecast * 0.4), deals: Math.round(hotLeads.length * 0.45 * 0.4), confidence: 82 },
      { period: '60 Days', revenue: Math.round(weightedForecast * 0.7), deals: Math.round((hotLeads.length * 0.45 + warmLeads.length * 0.2) * 0.5), confidence: 68 },
      { period: '90 Days', revenue: Math.round(weightedForecast), deals: Math.round(hotLeads.length * 0.45 + warmLeads.length * 0.2 + coldLeads.length * 0.05), confidence: 55 },
    ];

    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const month = new Date();
      month.setMonth(month.getMonth() - (5 - i));
      return {
        month: month.toLocaleDateString('en-US', { month: 'short' }),
        revenue: Math.round(weightedForecast * (0.6 + i * 0.08) + (Math.random() - 0.5) * weightedForecast * 0.15),
      };
    });

    const avgScore = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0;
    const forecastHealth = avgScore > 65 ? 'Strong' : avgScore > 45 ? 'Moderate' : 'Needs Attention';

    return { pipeline, totalPipelineValue, weightedForecast, projections, monthlyTrend, forecastHealth, avgDealSize };
  }, [leads]);

  // ─── Content Performance ───
  const contentPerformance = useMemo(() => {
    const contentTypes = [
      { type: 'Email', generated: Math.max(Math.round(quickStats.contentCreated * 0.35), 1), conversionLift: 18, avgEngagement: 72, roi: 340, color: '#6366f1', icon: 'mail' },
      { type: 'LinkedIn', generated: Math.max(Math.round(quickStats.contentCreated * 0.25), 1), conversionLift: 24, avgEngagement: 68, roi: 420, color: '#8b5cf6', icon: 'social' },
      { type: 'Blog Post', generated: Math.max(Math.round(quickStats.contentCreated * 0.20), 1), conversionLift: 12, avgEngagement: 55, roi: 280, color: '#10b981', icon: 'doc' },
      { type: 'Ad Copy', generated: Math.max(Math.round(quickStats.contentCreated * 0.20), 1), conversionLift: 31, avgEngagement: 44, roi: 510, color: '#f59e0b', icon: 'target' },
    ];

    const totalGenerated = contentTypes.reduce((s, c) => s + c.generated, 0);
    const avgROI = Math.round(contentTypes.reduce((s, c) => s + c.roi, 0) / contentTypes.length);
    const bestPerformer = contentTypes.reduce((best, c) => c.roi > best.roi ? c : best, contentTypes[0]);

    const weeklyOutput = Array.from({ length: 8 }, (_, i) => {
      const week = new Date();
      week.setDate(week.getDate() - (7 - i) * 7);
      return {
        week: `W${i + 1}`,
        count: Math.floor(Math.random() * 6) + (i > 4 ? 4 : 2),
      };
    });

    const qualityScore = Math.min(95, Math.round(
      (leads.filter(l => l.score > 70).length / Math.max(leads.length, 1)) * 50 + 45 + (Math.random() - 0.5) * 10
    ));

    return { contentTypes, totalGenerated, avgROI, bestPerformer, weeklyOutput, qualityScore };
  }, [quickStats.contentCreated, leads]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      const overlayOpen = showShortcuts || showPipelineHealth || showLeadVelocity || showGoalTracker || showEngagementAnalytics || showRevenueForecast || showContentPerformance || isGenModalOpen || isAddLeadOpen || isCSVOpen || isActionsOpen;

      if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        if (showPipelineHealth) setShowPipelineHealth(false);
        if (showLeadVelocity) setShowLeadVelocity(false);
        if (showGoalTracker) setShowGoalTracker(false);
        if (showEngagementAnalytics) setShowEngagementAnalytics(false);
        if (showRevenueForecast) setShowRevenueForecast(false);
        if (showContentPerformance) setShowContentPerformance(false);
        return;
      }

      if (overlayOpen) return;

      switch (e.key) {
        case 'n': case 'N': e.preventDefault(); setIsAddLeadOpen(true); break;
        case 'i': case 'I': e.preventDefault(); setIsCSVOpen(true); break;
        case 'g': case 'G': e.preventDefault(); if (leads.length > 0) openGenModal(); break;
        case 'p': case 'P': e.preventDefault(); setShowPipelineHealth(true); break;
        case 'v': case 'V': e.preventDefault(); setShowLeadVelocity(true); break;
        case 't': case 'T': e.preventDefault(); setShowGoalTracker(true); break;
        case 'e': case 'E': e.preventDefault(); setShowEngagementAnalytics(true); break;
        case 'f': case 'F': e.preventDefault(); setShowRevenueForecast(true); break;
        case 'd': case 'D': e.preventDefault(); setShowContentPerformance(true); break;
        case 'r': case 'R': e.preventDefault(); handleRefreshInsights(); break;
        case '?': e.preventDefault(); setShowShortcuts(true); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts, showPipelineHealth, showLeadVelocity, showGoalTracker, showEngagementAnalytics, showRevenueForecast, showContentPerformance, isGenModalOpen, isAddLeadOpen, isCSVOpen, isActionsOpen, leads]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLeads();
    fetchQuickStats();
    fetchSocialStats();
  }, [user]);

  const fetchLeads = async () => {
    setLoadingLeads(true);
    const { data } = await supabase
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
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

      const [
        { data: allLeads },
        { count: leadsToday },
        { count: leadsYesterday },
        { count: contentCreated }
      ] = await Promise.all([
        supabase.from('leads').select('*').eq('client_id', user.id),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', user.id).gte('created_at', todayStart),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', user.id).gte('created_at', yesterdayStart).lt('created_at', todayStart),
        supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      ]);

      const lds = allLeads || [];
      const hotLeads = lds.filter(l => l.score > 80).length;
      const hotLeadsYesterdayCount = lds.filter(l => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return d < new Date(todayStart) && l.score > 80;
      }).length;
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
        recommendations: programmaticInsights.length,
        leadsYesterday: leadsYesterday || 0,
        hotLeadsYesterday: hotLeadsYesterdayCount
      });

    } catch (err) {
      console.error("Stats fetch error:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchSocialStats = async () => {
    try {
      const { data } = await supabase
        .from('social_posts')
        .select('status')
        .eq('user_id', user.id)
        .in('status', ['scheduled', 'completed', 'published']);
      const posts = data || [];
      setSocialStats({
        scheduled: posts.filter(p => p.status === 'scheduled').length,
        published: posts.filter(p => p.status === 'completed' || p.status === 'published').length,
      });
    } catch { /* ignore */ }
  };

  const openGenModal = (lead?: Lead) => {
    setSelectedLeadForGen(lead || leads[0] || null);
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
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS['content_generation']);
      if (!creditResult.success) {
        setGenError(creditResult.message || 'Insufficient credits.');
        setIsGenerating(false);
        return;
      }

      const aiResponse = await generateLeadContent(selectedLeadForGen, contentType, user.businessProfile);
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

    } catch (err: unknown) {
      console.error("Quick Gen Error:", err);
      setGenError(err instanceof Error ? err.message : "An error occurred during generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const normalizeUrl = (url: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const buildKnowledgeBase = (kb: typeof newLeadKB, phone?: string) => {
    const result: Record<string, string> = {};
    if (phone?.trim()) result.phone = phone.trim();
    if (kb.website.trim()) result.website = normalizeUrl(kb.website);
    if (kb.linkedin.trim()) result.linkedin = normalizeUrl(kb.linkedin);
    if (kb.instagram.trim()) result.instagram = normalizeUrl(kb.instagram);
    if (kb.facebook.trim()) result.facebook = normalizeUrl(kb.facebook);
    if (kb.twitter.trim()) result.twitter = normalizeUrl(kb.twitter);
    if (kb.youtube.trim()) result.youtube = normalizeUrl(kb.youtube);
    if (kb.extraNotes.trim()) result.extraNotes = kb.extraNotes.trim();
    return Object.keys(result).length > 0 ? result : undefined;
  };

  const AI_RESEARCH_HEADER = '--- AI Research Brief ---';

  const onLeadCreated = async (createdLead: Lead, kb: Record<string, string> | undefined) => {
    const updated = [createdLead, ...leads];
    setLeads(updated);
    setFilteredLeads(updated);
    setActiveSegmentId(null);
    setIsAddLeadOpen(false);
    setNewLead({ name: '', email: '', company: '', phone: '', insights: '' });
    setNewLeadKB({ website: '', linkedin: '', instagram: '', facebook: '', twitter: '', youtube: '', extraNotes: '' });
    setVisibleKbFields(new Set());
    fetchQuickStats();

    // Fire background AI research if social URLs are present
    if (!kb) return;
    const socialUrls: Record<string, string> = {};
    if (kb.website) socialUrls.website = kb.website;
    if (kb.linkedin) socialUrls.linkedin = kb.linkedin;
    if (kb.instagram) socialUrls.instagram = kb.instagram;
    if (kb.facebook) socialUrls.facebook = kb.facebook;
    if (kb.twitter) socialUrls.twitter = kb.twitter;
    if (kb.youtube) socialUrls.youtube = kb.youtube;

    if (Object.keys(socialUrls).length === 0) return;

    const researchCredit = await consumeCredits(supabase, CREDIT_COSTS['lead_research']);
    if (!researchCredit.success) return;

    setResearchingLeadIds(prev => new Set(prev).add(createdLead.id));

    generateLeadResearch(createdLead, socialUrls, user.businessProfile).then(async (res) => {
      if (!res.text) return;

      // Parse structured fields from AI response
      const structured = parseLeadResearchResponse(res.text);

      const userNotes = kb.extraNotes || '';
      const briefText = structured.aiResearchBrief || res.text;
      const merged = userNotes
        ? `${userNotes}\n\n${AI_RESEARCH_HEADER}\n${briefText}`
        : `${AI_RESEARCH_HEADER}\n${briefText}`;

      const updatedKb: KnowledgeBase = {
        ...kb,
        extraNotes: merged,
        title: structured.title || kb.title,
        industry: structured.industry || kb.industry,
        employeeCount: structured.employeeCount || kb.employeeCount,
        location: structured.location || kb.location,
        companyOverview: structured.companyOverview || kb.companyOverview,
        talkingPoints: structured.talkingPoints || (Array.isArray(kb.talkingPoints) ? kb.talkingPoints : undefined),
        outreachAngle: structured.outreachAngle || kb.outreachAngle,
        riskFactors: structured.riskFactors || (Array.isArray(kb.riskFactors) ? kb.riskFactors : undefined),
        aiResearchBrief: briefText,
        aiResearchedAt: structured.aiResearchedAt,
        mentionedOnWebsite: structured.mentionedOnWebsite || kb.mentionedOnWebsite,
      };
      const newInsights = briefText.substring(0, 200);

      await supabase.from('leads').update({
        knowledgeBase: updatedKb,
        insights: newInsights,
      }).eq('id', createdLead.id);

      setLeads(prev => prev.map(l =>
        l.id === createdLead.id ? { ...l, knowledgeBase: updatedKb, insights: newInsights } : l
      ));
      setFilteredLeads(prev => prev.map(l =>
        l.id === createdLead.id ? { ...l, knowledgeBase: updatedKb, insights: newInsights } : l
      ));
    }).finally(() => {
      setResearchingLeadIds(prev => { const next = new Set(prev); next.delete(createdLead.id); return next; });
    });
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLeadError('');
    setIsAddingLead(true);

    try {
      // Verify session is still valid
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setAddLeadError('Session expired. Please refresh and log in again.');
        return;
      }

      const mockScore = Math.floor(Math.random() * 40) + 60;
      const kb = buildKnowledgeBase(newLeadKB, newLead.phone);

      const payload: Record<string, any> = {
        name: newLead.name.trim(),
        email: newLead.email.trim(),
        company: newLead.company.trim(),
        insights: newLead.insights.trim() || '',
        client_id: user.id,
        score: mockScore,
        status: 'New',
        lastActivity: 'Just now',
      };
      if (kb) payload.knowledgeBase = kb;

      let { data, error } = await supabase
        .from('leads')
        .insert([payload])
        .select()
        .single();

      // If knowledgeBase column doesn't exist, retry without it
      if (error && (error.message?.includes('knowledgeBase') || error.code === 'PGRST204')) {
        delete payload.knowledgeBase;
        const retry = await supabase.from('leads').insert([payload]).select().single();
        data = retry.data;
        error = retry.error;
      }

      // If lastActivity column doesn't exist, retry without it
      if (error && error.message?.includes('lastActivity')) {
        delete payload.lastActivity;
        const retry = await supabase.from('leads').insert([payload]).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        setAddLeadError(`${error.message}${error.hint ? ` (Hint: ${error.hint})` : ''}`);
        return;
      }

      if (data) {
        onLeadCreated(data, kb ? kb : undefined);
      } else {
        setAddLeadError('Insert returned no data. The lead may not have been created.');
      }
    } catch (err: unknown) {
      setAddLeadError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsAddingLead(false);
    }
  };

  const handleStatusUpdate = async (leadId: string, newStatus: Lead['status']) => {
    // Optimistically update local state
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

    // Persist to Supabase
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus, lastActivity: `Status changed to ${newStatus}` })
      .eq('id', leadId);

    if (error) {
      // Revert optimistic update on failure
      setLeads(leads);
      setFilteredLeads(filteredLeads);
    }

    // Audit log
    const lead = leads.find(l => l.id === leadId);
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'LEAD_STATUS_UPDATED',
      details: `${lead?.name || 'Lead'} moved to ${newStatus}`
    });
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
    try { localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(updated)); } catch {}
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
      const result = await generateDashboardInsights(leads, user.businessProfile);
      setDeepAnalysisResult(result);
    } catch (err: unknown) {
      setDeepAnalysisResult(`Deep analysis unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
  const topPredictions = leads.slice(0, 3);
  const creditsRemaining = (user.credits_total || 500) - (user.credits_used || 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  HERO BANNER                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div data-guide="dashboard-hero" className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 md:p-10 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4"></div>

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: Greeting */}
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg font-black text-indigo-300">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading">{getGreeting()}, {user.name?.split(' ')[0] || 'there'}</h1>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="px-2 py-0.5 bg-indigo-500/20 rounded-md text-[9px] font-bold text-indigo-300 uppercase tracking-widest">
                    {user.plan || 'Free'} Plan
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Key Metrics + Actions */}
          <div className="flex items-center space-x-3 md:space-x-4">
            <div className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-center min-w-[90px]">
              <div className="flex items-center justify-center space-x-1.5 mb-1.5">
                <TargetIcon className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-[9px] font-bold text-blue-300 uppercase tracking-widest">Leads</span>
              </div>
              {statsLoading ? (
                <div className="h-7 w-10 bg-white/10 animate-pulse rounded-lg mx-auto"></div>
              ) : (
                <p className="text-2xl font-bold font-heading">{leads.length}</p>
              )}
            </div>
            <div className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-center min-w-[90px]">
              <div className="flex items-center justify-center space-x-1.5 mb-1.5">
                <ChartIcon className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">Conv.</span>
              </div>
              {statsLoading ? (
                <div className="h-7 w-10 bg-white/10 animate-pulse rounded-lg mx-auto"></div>
              ) : (
                <p className="text-2xl font-bold font-heading">{conversionRate}%</p>
              )}
            </div>
            <div className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-center min-w-[90px]">
              <div className="flex items-center justify-center space-x-1.5 mb-1.5">
                <CreditCardIcon className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[9px] font-bold text-amber-300 uppercase tracking-widest">Credits</span>
              </div>
              <p className="text-2xl font-bold font-heading">{creditsRemaining}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  DASHBOARD ACTION BAR                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div data-guide="dashboard-actions" className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button onClick={() => setShowPipelineHealth(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all">
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Pipeline Health</span>
          </button>
          <button onClick={() => setShowLeadVelocity(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all">
            <TrendUpIcon className="w-3.5 h-3.5" />
            <span>Velocity</span>
          </button>
          <button onClick={() => setShowGoalTracker(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-100 transition-all">
            <TargetIcon className="w-3.5 h-3.5" />
            <span>Goals</span>
          </button>
          <button onClick={() => setShowEngagementAnalytics(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-100 transition-all">
            <ActivityIcon className="w-3.5 h-3.5" />
            <span>Engagement</span>
          </button>
          <button onClick={() => setShowRevenueForecast(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all">
            <RocketIcon className="w-3.5 h-3.5" />
            <span>Forecast</span>
          </button>
          <button onClick={() => setShowContentPerformance(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-sky-50 text-sky-700 rounded-xl text-xs font-bold hover:bg-sky-100 transition-all">
            <DocumentIcon className="w-3.5 h-3.5" />
            <span>Content</span>
          </button>
          <button onClick={() => setShowShortcuts(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
            <KeyboardIcon className="w-3.5 h-3.5" />
            <span>?</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  QUICK ACTIONS ROW                                            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div data-guide="dashboard-quick-actions" className="flex items-center justify-between">
        <QuickActionsBar
          onImportCSV={() => setIsCSVOpen(true)}
          onGenerateContent={() => { if (leads.length > 0) openGenModal(); }}
        />
        <button
          onClick={() => setIsAddLeadOpen(true)}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
        >
          + Add Lead
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  QUICK STATS ROW + EMAIL PERFORMANCE (inline grid)             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div data-guide="dashboard-stats">
        <QuickStatsRow stats={quickStats} loading={statsLoading}>
          <StatCard
            title="Social Posts"
            value={`${socialStats.published} sent`}
            icon={<SendIcon className="w-5 h-5" />}
            trend={socialStats.scheduled > 0 ? { value: socialStats.scheduled, label: `${socialStats.scheduled} queued` } : null}
            loading={statsLoading}
          />
          <EmailPerformanceCard />
        </QuickStatsRow>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  FOLLOW-UP ALERT CARD                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {followUpLeads.length > 0 && (
        <div data-guide="dashboard-followup">
        <button
          onClick={() => navigate('/portal/leads?followUp=true')}
          className="w-full bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between hover:shadow-md hover:border-amber-300 transition-all group text-left"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-amber-100 rounded-xl group-hover:bg-amber-200 transition-colors">
              <BellIcon className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 font-heading text-sm">Follow-up Needed</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-bold text-amber-700">{followUpLeads.length}</span> {followUpLeads.length === 1 ? 'lead' : 'leads'} opened your emails multiple times — potential clients
              </p>
            </div>
          </div>
          <span className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl text-xs font-bold group-hover:bg-amber-200 transition-colors flex items-center space-x-1.5">
            <span>View Leads</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </span>
        </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  TWO-PANEL LAYOUT: Left (30%) + Right (70%)                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT PANEL (30%) ── */}
        <div className="w-full lg:w-[30%] space-y-6">
          {/* Live AI Stats (dark card) */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
            <div className="flex items-center space-x-3 mb-5">
              <div className="p-2.5 bg-indigo-500/20 rounded-xl">
                <SparklesIcon className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h2 className="font-bold font-heading text-lg">Live AI Stats</h2>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Processing</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <span className="text-xs text-slate-300">Pipeline Size</span>
                <span className="text-sm font-bold text-indigo-300">{leads.length} leads</span>
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
                onClick={() => { if (leads.length > 0) openGenModal(); }}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-semibold text-sm"
              >
                <SparklesIcon className="w-4 h-4" />
                <span>Generate Content</span>
              </button>
              <button
                onClick={() => setIsCSVOpen(true)}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors font-semibold text-sm"
              >
                <ChartIcon className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL (70%) ── */}
        <div className="w-full lg:w-[70%] space-y-6">
          {/* AI Insights Panel (shared component) */}
          <AIInsightsPanel
            insights={insights}
            loading={insightsLoading}
            onRefresh={handleRefreshInsights}
            onDeepAnalysis={handleDeepAnalysis}
            deepAnalysisLoading={deepAnalysisLoading}
            deepAnalysisResult={deepAnalysisResult}
          />

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
                  {funnelStages.map((stage) => {
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

          {/* AI Performance Trends - 30 Day Chart */}
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

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  LEADS TABLE + SEGMENTATION (full width)                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Segmentation Sidebar */}
        <div className="lg:col-span-1" data-guide="dashboard-segments">
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
                          {researchingLeadIds.has(lead.id) && (
                            <div className="flex items-center space-x-1 ml-2 px-1.5 py-0.5 bg-indigo-50/60 rounded-md shrink-0" title="Researching Knowledge Base">
                              <div className="w-2.5 h-2.5 border-[1.5px] border-indigo-300 border-t-transparent rounded-full animate-spin" />
                              <span className="text-[8px] font-medium text-indigo-400 whitespace-nowrap">KB</span>
                            </div>
                          )}
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

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  MODALS                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}

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

      {/* AI Content Generation Modal */}
      {isGenModalOpen && selectedLeadForGen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => !isGenerating && setIsGenModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-4xl max-h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex flex-col md:flex-row h-full max-h-[85vh]">
              <div className="w-full md:w-1/2 p-10 border-r border-slate-100 overflow-y-auto">
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
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Select Lead</p>
                    <select
                      value={selectedLeadForGen.id}
                      onChange={(e) => {
                        const picked = leads.find(l => l.id === e.target.value);
                        if (picked) { setSelectedLeadForGen(picked); setGenResult(''); setGenError(''); }
                      }}
                      disabled={isGenerating}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-indigo-300 transition-colors appearance-none cursor-pointer disabled:opacity-50"
                    >
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name} — {l.company} (Score: {l.score})
                        </option>
                      ))}
                    </select>
                  </div>
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

      {/* Add Lead Modal */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setIsAddLeadOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 p-10 flex flex-col">
            <div className="mb-10 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-heading">New Lead Profile</h2>
                <p className="text-sm text-slate-500 mt-1">Add details for manual AI enrichment.</p>
              </div>
              <button onClick={() => setIsAddLeadOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"><XIcon className="w-4 h-4" /></button>
            </div>
            <form className="flex flex-col flex-grow min-h-0" onSubmit={handleAddLead}>
              <div className="space-y-6 flex-grow overflow-y-auto min-h-0 pr-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required type="text" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} placeholder="e.g. Robert Fox" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Email</label>
                <input required type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} placeholder="robert@stripe.com" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input required type="text" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} placeholder="e.g. Stripe" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Phone Number</label>
                <input type="tel" value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} placeholder="+1 (555) 123-4567" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Insights</label>
                <textarea rows={3} value={newLead.insights} onChange={e => setNewLead({...newLead, insights: e.target.value})} placeholder="What do we know?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none focus:border-indigo-300 transition-colors"></textarea>
              </div>
              {/* Website & Social Links — icon toggles */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Websites & Social Profiles</label>
                <div className="flex items-center gap-2 mb-3">
                  {([
                    { key: 'website', icon: <GlobeIcon className="w-4 h-4" />, tip: 'Website' },
                    { key: 'linkedin', icon: <LinkedInIcon className="w-4 h-4" />, tip: 'LinkedIn' },
                    { key: 'twitter', icon: <TwitterIcon className="w-4 h-4" />, tip: 'X / Twitter' },
                    { key: 'instagram', icon: <InstagramIcon className="w-4 h-4" />, tip: 'Instagram' },
                    { key: 'facebook', icon: <FacebookIcon className="w-4 h-4" />, tip: 'Facebook' },
                    { key: 'youtube', icon: <YoutubeIcon className="w-4 h-4" />, tip: 'YouTube' },
                  ] as const).map(s => {
                    const isActive = visibleKbFields.has(s.key) || newLeadKB[s.key].trim() !== '';
                    return (
                      <button
                        key={s.key}
                        type="button"
                        title={s.tip}
                        onClick={() => setVisibleKbFields(prev => {
                          const next = new Set(prev);
                          if (next.has(s.key)) { next.delete(s.key); } else { next.add(s.key); }
                          return next;
                        })}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isActive
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {s.icon}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2.5">
                  {(visibleKbFields.has('website') || newLeadKB.website.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><GlobeIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKB.website} onChange={e => setNewLeadKB({...newLeadKB, website: e.target.value})} placeholder="https://company.com" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('linkedin') || newLeadKB.linkedin.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><LinkedInIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKB.linkedin} onChange={e => setNewLeadKB({...newLeadKB, linkedin: e.target.value})} placeholder="linkedin.com/in/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('twitter') || newLeadKB.twitter.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><TwitterIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKB.twitter} onChange={e => setNewLeadKB({...newLeadKB, twitter: e.target.value})} placeholder="x.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('instagram') || newLeadKB.instagram.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><InstagramIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKB.instagram} onChange={e => setNewLeadKB({...newLeadKB, instagram: e.target.value})} placeholder="instagram.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('facebook') || newLeadKB.facebook.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><FacebookIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKB.facebook} onChange={e => setNewLeadKB({...newLeadKB, facebook: e.target.value})} placeholder="facebook.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('youtube') || newLeadKB.youtube.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><YoutubeIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKB.youtube} onChange={e => setNewLeadKB({...newLeadKB, youtube: e.target.value})} placeholder="youtube.com/@channel" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                </div>
              </div>
              </div>
              {addLeadError && (
                <div className="p-3 mt-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs font-bold text-red-600">{addLeadError}</p>
                </div>
              )}
              <div className="pt-6 flex-shrink-0">
                <button type="submit" disabled={isAddingLead} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl disabled:opacity-50 disabled:cursor-not-allowed">
                  {isAddingLead ? 'Creating...' : 'Create Lead Profile'}
                </button>
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

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Pipeline Health Dashboard Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showPipelineHealth && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowPipelineHealth(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <ShieldIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Pipeline Health</h2>
                  <p className="text-[10px] text-slate-400">Overall pipeline quality & distribution</p>
                </div>
              </div>
              <button onClick={() => setShowPipelineHealth(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {pipelineHealth ? (
                <>
                  {/* Health Score Gauge */}
                  <div className="text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
                    <svg className="w-24 h-24 mx-auto mb-4" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                      <circle cx="48" cy="48" r="40" fill="none"
                        stroke={pipelineHealth.healthScore >= 75 ? '#10b981' : pipelineHealth.healthScore >= 50 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8"
                        strokeDasharray={`${(pipelineHealth.healthScore / 100) * 251.3} 251.3`}
                        strokeLinecap="round" transform="rotate(-90 48 48)" />
                      <text x="48" y="44" textAnchor="middle" className="text-xl font-black" fill="#1e293b">{pipelineHealth.healthScore}</text>
                      <text x="48" y="58" textAnchor="middle" className="text-[8px] font-bold" fill="#94a3b8">HEALTH</text>
                    </svg>
                    <p className="text-sm font-black text-slate-900">
                      {pipelineHealth.healthScore >= 75 ? 'Strong Pipeline' : pipelineHealth.healthScore >= 50 ? 'Needs Attention' : 'At Risk'}
                    </p>
                  </div>

                  {/* Temperature Distribution */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Lead Temperature</p>
                    <div className="space-y-3">
                      {[
                        { label: 'Hot', count: pipelineHealth.hotLeads, color: 'rose', pct: leads.length > 0 ? Math.round((pipelineHealth.hotLeads / leads.length) * 100) : 0 },
                        { label: 'Warm', count: pipelineHealth.warmLeads, color: 'amber', pct: leads.length > 0 ? Math.round((pipelineHealth.warmLeads / leads.length) * 100) : 0 },
                        { label: 'Cold', count: pipelineHealth.coldLeads, color: 'sky', pct: leads.length > 0 ? Math.round((pipelineHealth.coldLeads / leads.length) * 100) : 0 },
                      ].map(temp => (
                        <div key={temp.label} className="flex items-center space-x-3">
                          <span className={`text-xs font-bold text-${temp.color}-600 w-12`}>{temp.label}</span>
                          <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden">
                            <div className={`h-full bg-${temp.color}-500 rounded-full transition-all duration-700`} style={{ width: `${temp.pct}%` }} />
                          </div>
                          <span className="text-xs font-black text-slate-700 w-16 text-right">{temp.count} ({temp.pct}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status Breakdown */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Status Breakdown</p>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(pipelineHealth.statusGroups).map(([status, statusLeads]: [string, Lead[]]) => (
                        <div key={status} className="p-3 bg-slate-50 rounded-xl text-center">
                          <p className="text-xl font-black text-slate-900">{statusLeads.length}</p>
                          <p className="text-[10px] font-bold text-slate-500">{status}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Key Metrics */}
                  <div className="p-4 bg-slate-900 rounded-2xl text-white">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-3">Key Metrics</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-lg font-black">{pipelineHealth.avgScore}%</p>
                        <p className="text-[10px] text-slate-400">Avg Score</p>
                      </div>
                      <div>
                        <p className="text-lg font-black">{pipelineHealth.qualifiedRate}%</p>
                        <p className="text-[10px] text-slate-400">Qualified Rate</p>
                      </div>
                      <div>
                        <p className="text-lg font-black">{pipelineHealth.stagnantLeads}</p>
                        <p className="text-[10px] text-slate-400">Stagnant Leads</p>
                      </div>
                      <div>
                        <p className="text-lg font-black">{leads.length}</p>
                        <p className="text-[10px] text-slate-400">Total Pipeline</p>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {pipelineHealth.stagnantLeads > 0 && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="flex items-start space-x-2">
                        <AlertTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-amber-800">Action Required</p>
                          <p className="text-[10px] text-amber-600 mt-0.5">{pipelineHealth.stagnantLeads} stagnant leads need re-engagement. Consider running a nurture campaign.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center">
                  <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Add leads to see pipeline health</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Lead Velocity Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showLeadVelocity && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowLeadVelocity(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <TrendUpIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Lead Velocity</h2>
                  <p className="text-[10px] text-slate-400">7-day lead acquisition & conversion</p>
                </div>
              </div>
              <button onClick={() => setShowLeadVelocity(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-indigo-50 rounded-xl text-center">
                  <p className="text-xl font-black text-indigo-700">{leadVelocity.totalAdded}</p>
                  <p className="text-[10px] font-bold text-indigo-500">Added</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl text-center">
                  <p className="text-xl font-black text-emerald-700">{leadVelocity.totalConverted}</p>
                  <p className="text-[10px] font-bold text-emerald-500">Converted</p>
                </div>
                <div className="p-3 bg-violet-50 rounded-xl text-center">
                  <p className="text-xl font-black text-violet-700">{leadVelocity.avgDaily}</p>
                  <p className="text-[10px] font-bold text-violet-500">Daily Avg</p>
                </div>
              </div>

              {/* 7-Day Sparkline */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Daily Breakdown</p>
                <div className="bg-slate-900 rounded-xl p-5">
                  <div className="flex items-end space-x-2 h-24 mb-3">
                    {leadVelocity.days.map((d, idx) => {
                      const maxVal = Math.max(...leadVelocity.days.map(x => x.added), 1);
                      const height = Math.max((d.added / maxVal) * 100, 8);
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center">
                          <div className="w-full bg-indigo-500 rounded-t" style={{ height: `${height}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex space-x-2">
                    {leadVelocity.days.map((d, idx) => (
                      <div key={idx} className="flex-1 text-center">
                        <p className="text-[9px] text-slate-500 font-bold">{d.day}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Day-by-Day Table */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Detailed View</p>
                <div className="space-y-2">
                  {leadVelocity.days.map((d, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-xs font-bold text-slate-700 w-12">{d.day}</span>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <TrendUpIcon className="w-3 h-3 text-indigo-500" />
                          <span className="text-xs font-bold text-indigo-600">+{d.added}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <CheckIcon className="w-3 h-3 text-emerald-500" />
                          <span className="text-xs font-bold text-emerald-600">{d.converted}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-400">net {d.net}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Velocity Insight */}
              <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl text-white">
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-wider mb-2">AI Velocity Insight</p>
                <p className="text-xs text-indigo-100 leading-relaxed">
                  {leadVelocity.avgDaily > 3
                    ? 'Strong lead velocity! Your pipeline is growing at a healthy rate. Consider increasing qualification capacity.'
                    : leadVelocity.avgDaily > 1
                    ? 'Moderate velocity. Consider running targeted campaigns to boost lead acquisition.'
                    : 'Low lead velocity. Focus on inbound marketing and content creation to attract more leads.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Goal Tracker Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showGoalTracker && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowGoalTracker(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                  <TargetIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Goal Tracker</h2>
                  <p className="text-[10px] text-slate-400">Monthly objectives & progress</p>
                </div>
              </div>
              <button onClick={() => setShowGoalTracker(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Overall Progress */}
              <div className="text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
                {(() => {
                  const overallPct = Math.round(goals.reduce((s, g) => s + Math.min(g.current / g.target, 1), 0) / goals.length * 100);
                  return (
                    <>
                      <svg className="w-24 h-24 mx-auto mb-4" viewBox="0 0 96 96">
                        <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                        <circle cx="48" cy="48" r="40" fill="none"
                          stroke={overallPct >= 75 ? '#10b981' : overallPct >= 50 ? '#6366f1' : '#f59e0b'}
                          strokeWidth="8"
                          strokeDasharray={`${(overallPct / 100) * 251.3} 251.3`}
                          strokeLinecap="round" transform="rotate(-90 48 48)" />
                        <text x="48" y="44" textAnchor="middle" className="text-xl font-black" fill="#1e293b">{overallPct}%</text>
                        <text x="48" y="58" textAnchor="middle" className="text-[8px] font-bold" fill="#94a3b8">OVERALL</text>
                      </svg>
                      <p className="text-sm font-black text-slate-900">
                        {overallPct >= 75 ? 'On Track!' : overallPct >= 50 ? 'Making Progress' : 'Needs Focus'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {goals.filter(g => g.current >= g.target).length}/{goals.length} goals achieved
                      </p>
                    </>
                  );
                })()}
              </div>

              {/* Individual Goals */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Monthly Goals</p>
                <div className="space-y-3">
                  {goals.map(goal => {
                    const pct = Math.min(Math.round((goal.current / goal.target) * 100), 100);
                    const achieved = goal.current >= goal.target;
                    return (
                      <div key={goal.id} className={`p-4 rounded-xl border ${achieved ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-900">{goal.label}</span>
                          {achieved ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black">Achieved!</span>
                          ) : (
                            <span className="text-xs font-bold text-slate-500">{goal.current}/{goal.target} {goal.unit}</span>
                          )}
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${achieved ? 'bg-emerald-500' : `bg-${goal.color}-500`}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5 text-right">{pct}% complete</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Projected End of Month */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-3">Month-End Projection</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Days Remaining</span>
                    <span className="text-xs font-bold text-white">{new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Projected Leads</span>
                    <span className="text-xs font-bold text-white">{Math.round(leads.length * (30 / Math.max(new Date().getDate(), 1)))}</span>
                  </div>
                </div>
              </div>

              {/* AI Recommendation */}
              <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-violet-200" />
                  <p className="text-[10px] font-black text-violet-200 uppercase tracking-wider">AI Recommendation</p>
                </div>
                <p className="text-xs text-violet-100 leading-relaxed">
                  {goals.filter(g => g.current < g.target).length > 3
                    ? 'Focus on your top 2 goals this week. Spreading effort too thin reduces impact. Prioritize lead acquisition and conversion rate.'
                    : goals.filter(g => g.current >= g.target).length === goals.length
                    ? 'All goals achieved! Consider raising your targets for next month to maintain growth momentum.'
                    : 'Good progress! Keep pushing on content creation and lead scoring to hit your remaining targets.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Engagement Analytics Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showEngagementAnalytics && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowEngagementAnalytics(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                  <ActivityIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Engagement Analytics</h2>
                  <p className="text-[10px] text-slate-400">Lead interaction & channel effectiveness</p>
                </div>
              </div>
              <button onClick={() => setShowEngagementAnalytics(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {engagementAnalytics ? (
                <>
                  {/* Overall Engagement Gauge */}
                  <div className="text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
                    <svg className="w-24 h-24 mx-auto mb-4" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                      <circle cx="48" cy="48" r="40" fill="none"
                        stroke={engagementAnalytics.overallScore >= 70 ? '#10b981' : engagementAnalytics.overallScore >= 45 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8"
                        strokeDasharray={`${(engagementAnalytics.overallScore / 100) * 251.3} 251.3`}
                        strokeLinecap="round" transform="rotate(-90 48 48)" />
                      <text x="48" y="44" textAnchor="middle" className="text-xl font-black" fill="#1e293b">{engagementAnalytics.overallScore}</text>
                      <text x="48" y="58" textAnchor="middle" className="text-[8px] font-bold" fill="#94a3b8">ENGAGE</text>
                    </svg>
                    <p className="text-sm font-black text-slate-900">
                      {engagementAnalytics.overallScore >= 70 ? 'High Engagement' : engagementAnalytics.overallScore >= 45 ? 'Moderate Activity' : 'Low Engagement'}
                    </p>
                  </div>

                  {/* Channel Effectiveness */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Channel Performance</p>
                    <div className="space-y-3">
                      {engagementAnalytics.channels.map(ch => (
                        <div key={ch.name} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-800">{ch.name}</span>
                            <span className="text-xs font-black" style={{ color: ch.color }}>{ch.responseRate}% resp.</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-sm font-black text-slate-900">{ch.leads}</p>
                              <p className="text-[9px] text-slate-400">Leads</p>
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{ch.avgScore}%</p>
                              <p className="text-[9px] text-slate-400">Avg Score</p>
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{ch.responseRate}%</p>
                              <p className="text-[9px] text-slate-400">Response</p>
                            </div>
                          </div>
                          <div className="mt-2 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${ch.responseRate}%`, backgroundColor: ch.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hourly Activity Heatmap */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Best Contact Times</p>
                    <div className="bg-slate-900 rounded-xl p-4">
                      <div className="grid grid-cols-12 gap-1 mb-2">
                        {engagementAnalytics.hourlyActivity.filter((_, i) => i >= 6 && i < 22).map(h => {
                          const intensity = h.activity / 100;
                          return (
                            <div key={h.hour} className="flex flex-col items-center">
                              <div
                                className="w-full aspect-square rounded"
                                style={{ backgroundColor: `rgba(99, 102, 241, ${Math.max(intensity, 0.1)})` }}
                                title={`${h.label}: ${h.activity}% activity`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-12 gap-1">
                        {engagementAnalytics.hourlyActivity.filter((_, i) => i >= 6 && i < 22).map(h => (
                          <p key={h.hour} className="text-[7px] text-slate-500 text-center">{h.label}</p>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Low</span>
                        <div className="flex space-x-0.5">
                          {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                            <div key={o} className="w-3 h-2 rounded-sm" style={{ backgroundColor: `rgba(99, 102, 241, ${o})` }} />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500">High</span>
                      </div>
                    </div>
                    <div className="mt-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                      <div className="flex items-center space-x-2">
                        <ClockIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <p className="text-[11px] text-indigo-700 font-bold">
                          Peak engagement at {engagementAnalytics.peakHour.label} ({engagementAnalytics.peakHour.activity}% activity)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Top Engaged Leads */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Most Engaged Leads</p>
                    <div className="space-y-2">
                      {engagementAnalytics.topEngaged.map((lead, idx) => (
                        <div key={lead.id} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${
                            idx === 0 ? 'bg-rose-500' : idx === 1 ? 'bg-rose-400' : 'bg-rose-300'
                          }`}>{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{lead.name}</p>
                            <p className="text-[10px] text-slate-400">{lead.touchpoints} touchpoints &middot; {lead.lastTouch}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-rose-600">{lead.engagementScore}</p>
                            <p className="text-[9px] text-slate-400">score</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Engagement Insight */}
                  <div className="p-4 bg-gradient-to-r from-rose-600 to-pink-600 rounded-2xl text-white">
                    <div className="flex items-center space-x-2 mb-2">
                      <BrainIcon className="w-4 h-4 text-rose-200" />
                      <p className="text-[10px] font-black text-rose-200 uppercase tracking-wider">AI Insight</p>
                    </div>
                    <p className="text-xs text-rose-100 leading-relaxed">
                      {engagementAnalytics.overallScore >= 70
                        ? 'Excellent engagement levels. Your leads are highly responsive. Double down on top-performing channels and expand outreach during peak hours.'
                        : engagementAnalytics.overallScore >= 45
                        ? 'Moderate engagement. Focus on personalizing outreach for warm leads and experiment with new content formats to boost interaction rates.'
                        : 'Engagement needs improvement. Consider A/B testing subject lines, increasing touchpoint frequency, and leveraging referral channels which show highest response rates.'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center">
                  <ActivityIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Add leads to see engagement analytics</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Revenue Forecast Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showRevenueForecast && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowRevenueForecast(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                  <RocketIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Revenue Forecast</h2>
                  <p className="text-[10px] text-slate-400">Pipeline value & revenue projections</p>
                </div>
              </div>
              <button onClick={() => setShowRevenueForecast(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {revenueForecast ? (
                <>
                  {/* Pipeline Value Headline */}
                  <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider mb-2">Total Pipeline Value</p>
                    <p className="text-3xl font-black text-slate-900">${revenueForecast.totalPipelineValue.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 mt-1">Weighted: <span className="font-bold text-amber-700">${revenueForecast.weightedForecast.toLocaleString()}</span></p>
                    <div className="mt-3 px-3 py-1.5 bg-white/80 rounded-lg inline-block">
                      <span className={`text-[10px] font-black uppercase tracking-wider ${
                        revenueForecast.forecastHealth === 'Strong' ? 'text-emerald-600' :
                        revenueForecast.forecastHealth === 'Moderate' ? 'text-amber-600' : 'text-red-600'
                      }`}>{revenueForecast.forecastHealth} Pipeline</span>
                    </div>
                  </div>

                  {/* Pipeline by Stage */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Pipeline Breakdown</p>
                    <div className="space-y-3">
                      {revenueForecast.pipeline.map(stage => (
                        <div key={stage.stage} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                              <span className="text-xs font-bold text-slate-800">{stage.stage}</span>
                            </div>
                            <span className="text-sm font-black text-slate-900">${stage.value.toLocaleString()}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center mt-2">
                            <div className="p-1.5 bg-white rounded-lg">
                              <p className="text-sm font-black text-slate-900">{stage.count}</p>
                              <p className="text-[9px] text-slate-400">Leads</p>
                            </div>
                            <div className="p-1.5 bg-white rounded-lg">
                              <p className="text-sm font-black text-slate-900">{Math.round(stage.winProb * 100)}%</p>
                              <p className="text-[9px] text-slate-400">Win Prob</p>
                            </div>
                            <div className="p-1.5 bg-white rounded-lg">
                              <p className="text-sm font-black text-slate-900">${Math.round(stage.value * stage.winProb).toLocaleString()}</p>
                              <p className="text-[9px] text-slate-400">Expected</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Projections */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Revenue Projections</p>
                    <div className="space-y-3">
                      {revenueForecast.projections.map(proj => (
                        <div key={proj.period} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-800">{proj.period}</span>
                            <span className="text-sm font-black text-amber-700">${proj.revenue.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">{proj.deals} projected deals</span>
                            <div className="flex items-center space-x-1.5">
                              <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${proj.confidence}%` }} />
                              </div>
                              <span className="font-bold text-slate-500">{proj.confidence}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Monthly Revenue Trend */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">6-Month Trend</p>
                    <div className="bg-slate-900 rounded-xl p-5">
                      <div className="flex items-end space-x-2 h-28 mb-3">
                        {revenueForecast.monthlyTrend.map((m, idx) => {
                          const maxVal = Math.max(...revenueForecast.monthlyTrend.map(x => x.revenue), 1);
                          const height = Math.max((m.revenue / maxVal) * 100, 8);
                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center">
                              <p className="text-[8px] text-amber-400 font-bold mb-1">${(m.revenue / 1000).toFixed(0)}k</p>
                              <div className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t" style={{ height: `${height}%` }} />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex space-x-2">
                        {revenueForecast.monthlyTrend.map((m, idx) => (
                          <div key={idx} className="flex-1 text-center">
                            <p className="text-[9px] text-slate-500 font-bold">{m.month}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Key Metrics */}
                  <div className="p-4 bg-slate-900 rounded-2xl text-white">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider mb-3">Key Financials</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-lg font-black">${revenueForecast.avgDealSize.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">Avg Deal Size</p>
                      </div>
                      <div>
                        <p className="text-lg font-black">{leads.length}</p>
                        <p className="text-[10px] text-slate-400">Active Deals</p>
                      </div>
                      <div>
                        <p className="text-lg font-black">{conversionRate}%</p>
                        <p className="text-[10px] text-slate-400">Close Rate</p>
                      </div>
                      <div>
                        <p className="text-lg font-black">{Math.round(revenueForecast.weightedForecast / Math.max(leads.length, 1)).toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">Rev/Lead</p>
                      </div>
                    </div>
                  </div>

                  {/* AI Forecast Insight */}
                  <div className="p-4 bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl text-white">
                    <div className="flex items-center space-x-2 mb-2">
                      <BrainIcon className="w-4 h-4 text-amber-200" />
                      <p className="text-[10px] font-black text-amber-200 uppercase tracking-wider">AI Forecast</p>
                    </div>
                    <p className="text-xs text-amber-100 leading-relaxed">
                      {revenueForecast.forecastHealth === 'Strong'
                        ? `Strong pipeline with $${revenueForecast.weightedForecast.toLocaleString()} weighted revenue. Focus on accelerating hot leads through the funnel to maximize close rate and reduce sales cycle.`
                        : revenueForecast.forecastHealth === 'Moderate'
                        ? `Pipeline is building. Increase lead scoring threshold for qualification and focus on high-value prospects. Target ${Math.round(leads.length * 0.3)} additional hot leads this month.`
                        : `Pipeline needs attention. Invest in lead generation campaigns and content marketing. Current pipeline supports ${revenueForecast.projections[0].deals} deals in the next 30 days.`}
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center">
                  <RocketIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Add leads to see revenue forecasts</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Content Performance Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showContentPerformance && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowContentPerformance(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
                  <DocumentIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Content Performance</h2>
                  <p className="text-[10px] text-slate-400">AI content analytics & ROI tracking</p>
                </div>
              </div>
              <button onClick={() => setShowContentPerformance(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Quality Score Gauge */}
              <div className="text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
                <svg className="w-24 h-24 mx-auto mb-4" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  <circle cx="48" cy="48" r="40" fill="none"
                    stroke={contentPerformance.qualityScore >= 75 ? '#0ea5e9' : contentPerformance.qualityScore >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8"
                    strokeDasharray={`${(contentPerformance.qualityScore / 100) * 251.3} 251.3`}
                    strokeLinecap="round" transform="rotate(-90 48 48)" />
                  <text x="48" y="44" textAnchor="middle" className="text-xl font-black" fill="#1e293b">{contentPerformance.qualityScore}</text>
                  <text x="48" y="58" textAnchor="middle" className="text-[8px] font-bold" fill="#94a3b8">QUALITY</text>
                </svg>
                <p className="text-sm font-black text-slate-900">
                  {contentPerformance.qualityScore >= 75 ? 'High-Quality Output' : contentPerformance.qualityScore >= 50 ? 'Good Quality' : 'Needs Refinement'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">{contentPerformance.totalGenerated} total pieces generated</p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-sky-50 rounded-xl text-center border border-sky-100">
                  <p className="text-xl font-black text-sky-700">{contentPerformance.totalGenerated}</p>
                  <p className="text-[9px] font-bold text-sky-500">Generated</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                  <p className="text-xl font-black text-emerald-700">{contentPerformance.avgROI}%</p>
                  <p className="text-[9px] font-bold text-emerald-500">Avg ROI</p>
                </div>
                <div className="p-3 bg-violet-50 rounded-xl text-center border border-violet-100">
                  <p className="text-xl font-black text-violet-700">{contentPerformance.bestPerformer.type}</p>
                  <p className="text-[9px] font-bold text-violet-500">Top Type</p>
                </div>
              </div>

              {/* Content Type Breakdown */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Content Type Analysis</p>
                <div className="space-y-3">
                  {contentPerformance.contentTypes.map(ct => (
                    <div key={ct.type} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ct.color }} />
                          <span className="text-xs font-bold text-slate-800">{ct.type}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-white rounded-full text-[9px] font-black text-slate-600 border border-slate-200">{ct.generated} pieces</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-1.5 bg-white rounded-lg">
                          <p className="text-sm font-black" style={{ color: ct.color }}>{ct.roi}%</p>
                          <p className="text-[9px] text-slate-400">ROI</p>
                        </div>
                        <div className="p-1.5 bg-white rounded-lg">
                          <p className="text-sm font-black text-slate-900">{ct.conversionLift}%</p>
                          <p className="text-[9px] text-slate-400">Conv. Lift</p>
                        </div>
                        <div className="p-1.5 bg-white rounded-lg">
                          <p className="text-sm font-black text-slate-900">{ct.avgEngagement}%</p>
                          <p className="text-[9px] text-slate-400">Engage</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Output Trend */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Weekly Output</p>
                <div className="bg-slate-900 rounded-xl p-5">
                  <div className="flex items-end space-x-2 h-20 mb-3">
                    {contentPerformance.weeklyOutput.map((w, idx) => {
                      const maxVal = Math.max(...contentPerformance.weeklyOutput.map(x => x.count), 1);
                      const height = Math.max((w.count / maxVal) * 100, 8);
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center">
                          <p className="text-[8px] text-sky-400 font-bold mb-1">{w.count}</p>
                          <div className="w-full bg-gradient-to-t from-sky-500 to-sky-400 rounded-t" style={{ height: `${height}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex space-x-2">
                    {contentPerformance.weeklyOutput.map((w, idx) => (
                      <div key={idx} className="flex-1 text-center">
                        <p className="text-[9px] text-slate-500 font-bold">{w.week}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Best Performer Highlight */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white">
                <p className="text-[10px] font-black text-sky-400 uppercase tracking-wider mb-3">Top Performer</p>
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-xl bg-sky-500/20 flex items-center justify-center">
                    <StarIcon className="w-7 h-7 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-lg font-black">{contentPerformance.bestPerformer.type}</p>
                    <p className="text-[10px] text-slate-400">{contentPerformance.bestPerformer.roi}% ROI &middot; {contentPerformance.bestPerformer.conversionLift}% conversion lift</p>
                  </div>
                </div>
              </div>

              {/* AI Content Insight */}
              <div className="p-4 bg-gradient-to-r from-sky-600 to-cyan-600 rounded-2xl text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-sky-200" />
                  <p className="text-[10px] font-black text-sky-200 uppercase tracking-wider">AI Recommendation</p>
                </div>
                <p className="text-xs text-sky-100 leading-relaxed">
                  {contentPerformance.bestPerformer.type} content shows the highest ROI at {contentPerformance.bestPerformer.roi}%.
                  {contentPerformance.totalGenerated > 10
                    ? ' Increase production of top-performing types and A/B test variations for higher conversion rates.'
                    : ' Generate more content to build statistical significance. Aim for 20+ pieces per type for reliable ROI measurement.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Keyboard Shortcuts Modal ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <KeyboardIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900">Dashboard Shortcuts</h2>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-x-6 gap-y-3 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</p>
                {[
                  { key: 'N', action: 'Add new lead' },
                  { key: 'I', action: 'Import CSV' },
                  { key: 'G', action: 'Generate content' },
                  { key: 'R', action: 'Refresh insights' },
                ].map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{sc.action}</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Panels</p>
                {[
                  { key: 'P', action: 'Pipeline Health' },
                  { key: 'V', action: 'Lead Velocity' },
                  { key: 'T', action: 'Goal Tracker' },
                  { key: 'E', action: 'Engagement' },
                  { key: 'F', action: 'Revenue Forecast' },
                  { key: 'D', action: 'Content Perf.' },
                ].map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{sc.action}</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">System</p>
                {[
                  { key: '?', action: 'Shortcuts' },
                  { key: 'Esc', action: 'Close panels' },
                ].map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{sc.action}</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400">Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd> to close</p>
            </div>
          </div>
        </div>
      )}

      {/* Activation Checklist (post-onboarding) */}
      <ActivationChecklist user={user} />
    </div>
  );
};

export default ClientDashboard;
