import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lead, User, ContentType } from '../../types';
import { TargetIcon, FlameIcon, SparklesIcon, MailIcon, PhoneIcon, EyeIcon, FilterIcon, DownloadIcon, PlusIcon, TagIcon, XIcon, CheckIcon, ClockIcon, CalendarIcon, BoltIcon, UsersIcon, EditIcon, PencilIcon, AlertTriangleIcon, TrendUpIcon, TrendDownIcon, GridIcon, ListIcon, BrainIcon, GlobeIcon, LinkedInIcon, TwitterIcon, InstagramIcon, FacebookIcon, ChevronDownIcon, KeyboardIcon, TrashIcon } from '../../components/Icons';
import { supabase } from '../../lib/supabase';
import { normalizeLeads } from '../../lib/queries';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchBatchEmailSummary } from '../../lib/emailTracking';
import type { BatchEmailSummary } from '../../lib/emailTracking';
import { loadWorkflows, executeWorkflow as executeWorkflowEngine, type Workflow as DbWorkflow, type ExecutionResult } from '../../lib/automationEngine';
import { useIntegrations, fetchIntegration } from '../../lib/integrations';
import LeadActionsModal from '../../components/dashboard/LeadActionsModal';
import ImportLeadsWizard from '../../components/portal/ImportLeadsWizard';
import { resolvePlanName } from '../../lib/credits';
import LeadColorDot from '../../components/leads/LeadColorDot';
import { fetchStageColors, fetchColorOverrides, setLeadColorOverride, resolveLeadColor, getColorClasses, DEFAULT_STAGE_COLORS } from '../../lib/leadColors';
import type { ColorToken, StageColorMap, ColorOverrideMap } from '../../lib/leadColors';
import { PageHeader } from '../../components/layout/PageHeader';
import { AdvancedOnly } from '../../components/ui-mode';

// ── Helpers ──
const formatRelativeTime = (dateStr: string): string => {
  if (!dateStr || dateStr === 'Just now') return dateStr || 'N/A';
  const now = new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

const scoreToStars = (score: number): number => {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  return 1;
};

const StarRating = ({ score }: { score: number }) => {
  const stars = scoreToStars(score);
  return (
    <div className="flex items-center space-x-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= stars ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

type LeadTag = 'Hot Lead' | 'Cold' | 'Nurturing' | 'Enterprise' | 'Critical' | 'Warm';
type ActivityType = 'call' | 'email' | 'meeting' | 'note';
type BulkAction = 'campaign' | 'assign' | 'status' | 'tag' | 'export' | 'email' | 'workflow' | 'delete';

interface ActivityLog {
  type: ActivityType;
  details: string;
  outcome: string;
  timestamp: string;
}

interface BulkProgress {
  action: string;
  total: number;
  processed: number;
  errors: number;
  running: boolean;
}

const TAG_COLORS: Record<LeadTag, string> = {
  'Critical': 'bg-red-100 text-red-700 border-red-200',
  'Hot Lead': 'bg-orange-100 text-orange-700 border-orange-200',
  'Warm': 'bg-amber-100 text-amber-700 border-amber-200',
  'Cold': 'bg-blue-100 text-blue-700 border-blue-200',
  'Nurturing': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Enterprise': 'bg-purple-100 text-purple-700 border-purple-200',
};

const getLeadTag = (lead: Lead): LeadTag => {
  if (lead.score >= 90) return 'Critical';
  if (lead.score >= 80) return 'Hot Lead';
  if (lead.score >= 65) return 'Warm';
  if (lead.status === 'Contacted') return 'Nurturing';
  if (lead.company && lead.company.length > 8) return 'Enterprise';
  return 'Cold';
};

const getScoreAction = (score: number): { tier: string; color: string; actions: string[] } => {
  if (score >= 76) return {
    tier: 'Critical / Very Hot',
    color: 'rose',
    actions: ['Notify team immediately', 'Call within 1 hour', 'Escalate to manager if needed', 'Schedule meeting this week'],
  };
  if (score >= 51) return {
    tier: 'Hot',
    color: 'amber',
    actions: ['Send immediate email', 'Make phone call attempt', 'Schedule meeting this week', 'Share relevant case study'],
  };
  if (score >= 26) return {
    tier: 'Warm',
    color: 'emerald',
    actions: ['Send personalized email', 'Share relevant case study', 'Schedule follow-up in 3-5 days'],
  };
  return {
    tier: 'Cold',
    color: 'blue',
    actions: ['Add to "Nurture" campaign', 'Set reminder for 2 weeks', 'Focus on education content'],
  };
};

const ALL_TAGS: LeadTag[] = ['Hot Lead', 'Cold', 'Nurturing', 'Enterprise', 'Critical', 'Warm'];
const STATUS_OPTIONS: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
const PIPELINE_STAGES: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Converted'];
const STAGE_COLORS: Record<Lead['status'], { dot: string; active: string }> = {
  New: { dot: 'bg-slate-400', active: 'bg-slate-500' },
  Contacted: { dot: 'bg-blue-400', active: 'bg-blue-500' },
  Qualified: { dot: 'bg-amber-400', active: 'bg-amber-500' },
  Converted: { dot: 'bg-emerald-400', active: 'bg-emerald-500' },
  Lost: { dot: 'bg-red-400', active: 'bg-red-500' },
};
const ACTIVITY_OPTIONS = ['Today', 'This Week', 'This Month', 'All Time'] as const;
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
const CAMPAIGNS = ['Q4 Tech Nurture', 'Enterprise Outreach', 'Product Launch', 'Re-engagement', 'Cold Outreach'] as const;
const TEAM_MEMBERS = ['Sarah Johnson', 'Mike Chen', 'Emma Davis', 'Alex Kim', 'Chris Park'] as const;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const LeadManagement: React.FC = () => {
  const { user } = useOutletContext<{ user: User }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { integrations: integrationStatuses } = useIntegrations();
  const crmConnected = useMemo(() => integrationStatuses.some(i => (i.provider === 'hubspot' || i.provider === 'salesforce') && i.status === 'connected'), [integrationStatuses]);
  const [syncingCrm, setSyncingCrm] = useState<string | null>(null);

  // ── Data State ──
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filter State ──
  const [statusFilter, setStatusFilter] = useState<Lead['status'] | 'All'>('All');
  const [scoreFilter, setScoreFilter] = useState<'all' | '50-100' | 'below-50'>('all');
  const [activityFilter, setActivityFilter] = useState<typeof ACTIVITY_OPTIONS[number]>('All Time');
  const [companySizeFilter, setCompanySizeFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<LeadTag>>(new Set());
  const [emailEngagementFilter, setEmailEngagementFilter] = useState<Set<'sent' | 'opened' | 'clicked'>>(new Set());
  const [followUpFilter, setFollowUpFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Selection State ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(25);

  // ── Modals ──
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isCSVOpen, setIsCSVOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', phone: '', insights: '' });
  const [newLeadKb, setNewLeadKb] = useState({ website: '', linkedin: '', instagram: '', facebook: '', twitter: '', youtube: '' });
  const [visibleKbFields, setVisibleKbFields] = useState<Set<string>>(new Set());
  const [addLeadError, setAddLeadError] = useState('');
  const [isAddingLead, setIsAddingLead] = useState(false);

  // ── Edit Lead Modal ──
  const [isEditLeadOpen, setIsEditLeadOpen] = useState(false);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const [editLead, setEditLead] = useState({ name: '', email: '', company: '', phone: '', insights: '' });
  const [editLeadKb, setEditLeadKb] = useState({ website: '', linkedin: '', instagram: '', facebook: '', twitter: '', youtube: '' });
  const [editVisibleKbFields, setEditVisibleKbFields] = useState<Set<string>>(new Set());
  const [editLeadError, setEditLeadError] = useState('');
  const [isEditingLead, setIsEditingLead] = useState(false);

  // ── Bulk Actions ──
  const [bulkActionOpen, setBulkActionOpen] = useState<BulkAction | null>(null);
  const [bulkCampaign, setBulkCampaign] = useState(CAMPAIGNS[0]);
  const [bulkAssignee, setBulkAssignee] = useState(TEAM_MEMBERS[0]);
  const [bulkTag, setBulkTag] = useState<LeadTag>('Hot Lead');
  const [bulkAIPersonalize, setBulkAIPersonalize] = useState(true);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Workflow Enrollment ──
  const [bulkWorkflows, setBulkWorkflows] = useState<DbWorkflow[]>([]);
  const [bulkSelectedWorkflowId, setBulkSelectedWorkflowId] = useState<string | null>(null);

  // ── Delete ──
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Email Summary Map ──
  const [emailSummaryMap, setEmailSummaryMap] = useState<Map<string, BatchEmailSummary>>(new Map());

  // ── Inline Status Edit ──
  const [inlineStatusId, setInlineStatusId] = useState<string | null>(null);
  const [inlineStatusPos, setInlineStatusPos] = useState<{ top: number; left: number } | null>(null);

  // ── Actions Dropdown ──
  const [actionsDropdownId, setActionsDropdownId] = useState<string | null>(null);
  const [actionsDropdownPos, setActionsDropdownPos] = useState<{ top: number; right: number } | null>(null);

  // ── Activity Log ──
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogLead, setActivityLogLead] = useState<Lead | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>('call');
  const [activityDetails, setActivityDetails] = useState('');
  const [activityOutcome, setActivityOutcome] = useState('');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // ── Quick Insight Panel ──
  const [quickInsightLead, setQuickInsightLead] = useState<Lead | null>(null);

  // ── View & Sort State ──
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'company' | 'activity'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // ── Panel State ──
  const [showPipelineAnalytics, setShowPipelineAnalytics] = useState(false);
  const [showEngagementMetrics, setShowEngagementMetrics] = useState(false);
  const [showScoreIntelligence, setShowScoreIntelligence] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  // ── Lead Color State ──
  const [stageColors, setStageColors] = useState<StageColorMap>({ ...DEFAULT_STAGE_COLORS });
  const [colorOverrides, setColorOverrides] = useState<ColorOverrideMap>({});
  const handleColorOverride = useCallback(async (leadId: string, token: ColorToken | null) => {
    await setLeadColorOverride(leadId, token);
    if (token === null) {
      setColorOverrides(prev => { const next = { ...prev }; delete next[leadId]; return next; });
    } else {
      setColorOverrides(prev => ({ ...prev, [leadId]: token }));
    }
  }, []);

  // ── Seed email filter from query params ──
  useEffect(() => {
    const ef = searchParams.get('emailFilter');
    if (ef && ['sent', 'opened', 'clicked'].includes(ef)) {
      setEmailEngagementFilter(new Set([ef as 'sent' | 'opened' | 'clicked']));
      searchParams.delete('emailFilter');
      setSearchParams(searchParams, { replace: true });
    }
    const fu = searchParams.get('followUp');
    if (fu === 'true') {
      setFollowUpFilter(true);
      searchParams.delete('followUp');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // ── Fetch (leads + colors in parallel) ──
  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('id,client_id,name,company,email,score,status,lastActivity,insights,created_at')
      .eq('client_id', user.id)
      .order('score', { ascending: false });
    if (error) {
      console.error('LeadManagement fetch error:', error.message);
    } else if (data) {
      setAllLeads(normalizeLeads(data));
    }
    setLoading(false);
  };

  useEffect(() => {
    // Fire all initial data fetches in parallel
    fetchLeads();
    fetchStageColors().then(setStageColors);
    fetchColorOverrides().then(setColorOverrides);
  }, [user]);

  // ── Batch email summary fetch ──
  useEffect(() => {
    if (allLeads.length === 0) return;
    const leadIds = allLeads.map(l => l.id);
    fetchBatchEmailSummary(leadIds).then(setEmailSummaryMap);
  }, [allLeads]);

  // ── Filtering ──
  const filteredLeads = useMemo(() => {
    let result = [...allLeads];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All') result = result.filter(l => l.status === statusFilter);
    if (scoreFilter === '50-100') result = result.filter(l => l.score >= 50);
    if (scoreFilter === 'below-50') result = result.filter(l => l.score < 50);
    if (activityFilter !== 'All Time') {
      const now = new Date();
      result = result.filter(l => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        if (isNaN(d.getTime())) return true;
        const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        if (activityFilter === 'Today') return diffDays < 1;
        if (activityFilter === 'This Week') return diffDays < 7;
        if (activityFilter === 'This Month') return diffDays < 30;
        return true;
      });
    }
    if (tagFilter.size > 0) result = result.filter(l => tagFilter.has(getLeadTag(l)));
    if (emailEngagementFilter.size > 0) {
      result = result.filter(l => {
        const summary = emailSummaryMap.get(l.id);
        if (!summary) return false;
        if (emailEngagementFilter.has('sent') && !summary.hasSent) return false;
        if (emailEngagementFilter.has('opened') && !summary.hasOpened) return false;
        if (emailEngagementFilter.has('clicked') && !summary.hasClicked) return false;
        return true;
      });
    }
    if (followUpFilter) {
      result = result.filter(l => {
        const summary = emailSummaryMap.get(l.id);
        return summary && summary.openCount >= 2;
      });
    }

    // Sort
    result.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'score': return dir * (a.score - b.score);
        case 'company': return dir * a.company.localeCompare(b.company);
        case 'activity': return dir * ((new Date(a.created_at || '0')).getTime() - (new Date(b.created_at || '0')).getTime());
        default: return 0;
      }
    });

    return result;
  }, [allLeads, searchQuery, statusFilter, scoreFilter, activityFilter, companySizeFilter, tagFilter, emailEngagementFilter, followUpFilter, emailSummaryMap, sortBy, sortDir]);

  // ── KPI Stats ──
  const kpiStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const hotLeads = allLeads.filter(l => l.score >= 75).length;
    const newThisWeek = allLeads.filter(l => l.created_at && new Date(l.created_at) >= weekAgo).length;
    const avgScore = allLeads.length > 0 ? Math.round(allLeads.reduce((s, l) => s + l.score, 0) / allLeads.length) : 0;
    const qualifiedRate = allLeads.length > 0 ? Math.round((allLeads.filter(l => l.status === 'Qualified').length / allLeads.length) * 100) : 0;
    const contactedRate = allLeads.length > 0 ? Math.round((allLeads.filter(l => l.status !== 'New').length / allLeads.length) * 100) : 0;
    return { total: allLeads.length, hotLeads, newThisWeek, avgScore, qualifiedRate, contactedRate };
  }, [allLeads]);

  // ── Score Distribution ──
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: '0-25', range: [0, 25] as [number, number], count: 0, color: 'bg-blue-400' },
      { label: '26-50', range: [26, 50] as [number, number], count: 0, color: 'bg-amber-400' },
      { label: '51-75', range: [51, 75] as [number, number], count: 0, color: 'bg-orange-400' },
      { label: '76-100', range: [76, 100] as [number, number], count: 0, color: 'bg-rose-500' },
    ];
    allLeads.forEach(l => {
      const b = buckets.find(b => l.score >= b.range[0] && l.score <= b.range[1]);
      if (b) b.count++;
    });
    const max = Math.max(...buckets.map(b => b.count), 1);
    return buckets.map(b => ({ ...b, pct: Math.round((b.count / max) * 100) }));
  }, [allLeads]);

  // ── Pipeline Analytics ──
  const pipelineAnalytics = useMemo(() => {
    const total = allLeads.length || 1;
    const stages = [
      { name: 'New', count: allLeads.filter(l => l.status === 'New').length, bg: 'bg-emerald-500' },
      { name: 'Contacted', count: allLeads.filter(l => l.status === 'Contacted').length, bg: 'bg-blue-500' },
      { name: 'Qualified', count: allLeads.filter(l => l.status === 'Qualified').length, bg: 'bg-violet-500' },
      { name: 'Lost', count: allLeads.filter(l => l.status === 'Lost').length, bg: 'bg-slate-400' },
    ].map(s => ({ ...s, pct: Math.round((s.count / total) * 100) }));
    const newCount = stages[0].count || 1;
    const contactedRate = Math.round((stages[1].count / newCount) * 100);
    const qualifiedRate = Math.round((stages[2].count / newCount) * 100);
    const lostRate = Math.round((stages[3].count / newCount) * 100);
    const healthScore = Math.min(100, Math.round(
      (qualifiedRate * 0.4) + (contactedRate * 0.3) + ((100 - lostRate) * 0.3)
    ));
    const now = new Date();
    const staleLeads = allLeads.filter(l => l.status === 'New' && l.created_at && (now.getTime() - new Date(l.created_at).getTime()) > 14 * 86400000).length;
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const processedThisWeek = allLeads.filter(l => l.status !== 'New' && l.created_at && new Date(l.created_at) >= weekAgo).length;
    return { stages, contactedRate, qualifiedRate, lostRate, healthScore, staleLeads, processedThisWeek };
  }, [allLeads]);

  // ── Engagement Metrics ──
  const engagementMetrics = useMemo(() => {
    const total = allLeads.length || 1;
    const contacted = allLeads.filter(l => l.status !== 'New').length;
    const contactRate = Math.round((contacted / total) * 100);
    const tiers = [
      { name: 'Critical (90+)', count: 0, engaged: 0, rate: 0, leads: allLeads.filter(l => l.score >= 90), cardBg: 'bg-rose-50', textColor: 'text-rose-700' },
      { name: 'Hot (75-89)', count: 0, engaged: 0, rate: 0, leads: allLeads.filter(l => l.score >= 75 && l.score < 90), cardBg: 'bg-orange-50', textColor: 'text-orange-700' },
      { name: 'Warm (50-74)', count: 0, engaged: 0, rate: 0, leads: allLeads.filter(l => l.score >= 50 && l.score < 75), cardBg: 'bg-amber-50', textColor: 'text-amber-700' },
      { name: 'Cold (<50)', count: 0, engaged: 0, rate: 0, leads: allLeads.filter(l => l.score < 50), cardBg: 'bg-blue-50', textColor: 'text-blue-700' },
    ].map(t => ({
      ...t,
      count: t.leads.length,
      engaged: t.leads.filter(l => l.status !== 'New').length,
      rate: t.leads.length > 0 ? Math.round((t.leads.filter(l => l.status !== 'New').length / t.leads.length) * 100) : 0,
    }));
    const engagementScore = Math.min(100, Math.round(
      tiers.reduce((sum, t, i) => sum + t.rate * (4 - i) * 0.1, 0) + contactRate * 0.4
    ));
    const now = new Date();
    const timeline = [
      { label: 'Today', count: allLeads.filter(l => l.created_at && (now.getTime() - new Date(l.created_at).getTime()) < 86400000).length },
      { label: 'This Week', count: allLeads.filter(l => l.created_at && (now.getTime() - new Date(l.created_at).getTime()) < 7 * 86400000).length },
      { label: 'This Month', count: allLeads.filter(l => l.created_at && (now.getTime() - new Date(l.created_at).getTime()) < 30 * 86400000).length },
      { label: 'Older', count: allLeads.filter(l => !l.created_at || (now.getTime() - new Date(l.created_at).getTime()) >= 30 * 86400000).length },
    ];
    const maxTimeline = Math.max(...timeline.map(t => t.count), 1);
    return { contactRate, tiers, engagementScore, timeline, maxTimeline, contacted, total };
  }, [allLeads]);

  // ── Score Intelligence ──
  const scoreIntelligence = useMemo(() => {
    if (allLeads.length === 0) return {
      avg: 0, median: 0, stdDev: 0, distribution: [] as { label: string; count: number; pct: number }[],
      topPerformers: [] as Lead[], atRisk: [] as Lead[],
      quartiles: { q1: 0, q2: 0, q3: 0 }, healthIndex: 0
    };
    const scores = allLeads.map(l => l.score).sort((a, b) => a - b);
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    const median = scores[Math.floor(scores.length / 2)];
    const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
    const stdDev = Math.round(Math.sqrt(variance));
    const q1 = scores[Math.floor(scores.length * 0.25)];
    const q3 = scores[Math.floor(scores.length * 0.75)];
    const distribution = Array.from({ length: 10 }, (_, i) => {
      const min = i * 10;
      const max = min + 9;
      return { label: `${min}-${max}`, count: scores.filter(s => s >= min && s <= max).length };
    });
    const maxCount = Math.max(...distribution.map(d => d.count), 1);
    const distWithPct = distribution.map(d => ({ ...d, pct: Math.round((d.count / maxCount) * 100) }));
    const topPerformers = [...allLeads].sort((a, b) => b.score - a.score).slice(0, 5);
    const atRisk = allLeads.filter(l => l.score < 30 && l.status === 'New').slice(0, 5);
    const healthIndex = Math.min(100, Math.round(
      (avg * 0.3) + ((100 - Math.min(stdDev, 100)) * 0.2) + (q3 * 0.2) +
      ((topPerformers.filter(l => l.score >= 85).length / Math.max(allLeads.length, 1)) * 100 * 0.3)
    ));
    return { avg, median, stdDev, distribution: distWithPct, topPerformers, atRisk, quartiles: { q1, q2: median, q3 }, healthIndex };
  }, [allLeads]);

  // ── Kanban Grouped Leads ──
  const kanbanColumns = useMemo(() => {
    const columns: Record<Lead['status'], Lead[]> = { New: [], Contacted: [], Qualified: [], Converted: [], Lost: [] };
    filteredLeads.forEach(l => { if (columns[l.status]) columns[l.status].push(l); });
    return columns;
  }, [filteredLeads]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / perPage));
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filteredLeads.slice(start, start + perPage);
  }, [filteredLeads, currentPage, perPage]);

  useEffect(() => { setCurrentPage(1); setFocusedIndex(-1); }, [statusFilter, scoreFilter, activityFilter, companySizeFilter, tagFilter, emailEngagementFilter, followUpFilter, searchQuery, perPage]);

  // ── Selection Helpers ──
  const allOnPageSelected = paginatedLeads.length > 0 && paginatedLeads.every(l => selectedIds.has(l.id));
  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const next = new Set(selectedIds);
      paginatedLeads.forEach(l => next.delete(l.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      paginatedLeads.forEach(l => next.add(l.id));
      setSelectedIds(next);
    }
  };
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const selectByFilter = useCallback((filterFn: (l: Lead) => boolean) => {
    const matching = allLeads.filter(filterFn);
    setSelectedIds(new Set(matching.map(l => l.id)));
  }, [allLeads]);

  // ── Actions ──
  const handleSort = (column: 'name' | 'score' | 'company' | 'activity') => {
    if (sortBy === column) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir(column === 'score' ? 'desc' : 'asc');
    }
  };

  const clearFilters = () => {
    setStatusFilter('All');
    setScoreFilter('all');
    setActivityFilter('All Time');
    setCompanySizeFilter(new Set());
    setTagFilter(new Set());
    setEmailEngagementFilter(new Set());
    setFollowUpFilter(false);
    setSearchQuery('');
  };

  const handleStatusUpdate = async (leadId: string, newStatus: Lead['status']) => {
    const lead = allLeads.find(l => l.id === leadId);
    setAllLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    ));
    if (selectedLead?.id === leadId) {
      setSelectedLead({ ...selectedLead, status: newStatus, lastActivity: `Status changed to ${newStatus}` });
    }
    const { error: updateError } = await supabase.from('leads').update({ status: newStatus, lastActivity: `Status changed to ${newStatus}` }).eq('id', leadId);
    if (updateError) console.error('Lead status update error:', updateError.message);
    const { error: logError } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'LEAD_STATUS_UPDATED',
      details: `${lead?.name || 'Lead'} moved to ${newStatus}`
    });
    if (logError) console.error('Audit log error:', logError.message);
  };

  const getNextStage = (currentStatus: Lead['status']): Lead['status'] | null => {
    const idx = PIPELINE_STAGES.indexOf(currentStatus);
    if (idx === -1 || idx >= PIPELINE_STAGES.length - 1) return null;
    return PIPELINE_STAGES[idx + 1];
  };

  const handleExportSelected = () => {
    const selected = allLeads.filter(l => selectedIds.has(l.id));
    const csv = [
      ['Name', 'Email', 'Company', 'Score', 'Status', 'Insights'].join(','),
      ...selected.map(l => [l.name, l.email, l.company, l.score, l.status, `"${(l.insights || '').replace(/"/g, '""')}"`].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSyncToCrm = useCallback(async (leadId: string) => {
    setSyncingCrm(leadId);
    try {
      const lead = allLeads.find(l => l.id === leadId);
      if (!lead) return;

      // Determine which CRM is connected
      const hubspot = integrationStatuses.find(i => i.provider === 'hubspot' && i.status === 'connected');
      const salesforce = integrationStatuses.find(i => i.provider === 'salesforce' && i.status === 'connected');
      const provider = hubspot ? 'hubspot' : salesforce ? 'salesforce' : null;
      if (!provider) return;

      const integration = await fetchIntegration(provider);
      if (!integration) return;

      if (provider === 'hubspot' && integration.credentials.apiKey) {
        await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${integration.credentials.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: {
              email: lead.email,
              firstname: (lead.name || '').split(' ')[0] || lead.name || '',
              lastname: (lead.name || '').split(' ').slice(1).join(' ') || '',
              company: lead.company,
            },
          }),
        });
      } else if (provider === 'salesforce' && integration.credentials.instanceUrl && integration.credentials.accessToken) {
        const baseUrl = integration.credentials.instanceUrl.replace(/\/$/, '');
        await fetch(`${baseUrl}/services/data/v59.0/sobjects/Lead`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${integration.credentials.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Email: lead.email,
            FirstName: (lead.name || '').split(' ')[0] || lead.name || '',
            LastName: (lead.name || '').split(' ').slice(1).join(' ') || lead.name || '',
            Company: lead.company || 'Unknown',
          }),
        });
      }
    } catch (err) {
      console.error('CRM sync failed:', err);
    } finally {
      setSyncingCrm(null);
    }
  }, [allLeads, integrationStatuses]);

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLeadError('');
    setIsAddingLead(true);
    try {
      // Verify we have a valid user session
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setAddLeadError('Session expired. Please refresh and log in again.');
        return;
      }

      const mockScore = Math.floor(Math.random() * 40) + 60;

      // Build knowledgeBase from social/website fields
      const normalizeUrl = (url: string) => {
        const trimmed = url.trim();
        if (!trimmed) return '';
        return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      };
      const kbCleaned: Record<string, string> = {};
      if (newLeadKb.website.trim()) kbCleaned.website = normalizeUrl(newLeadKb.website);
      if (newLeadKb.linkedin.trim()) kbCleaned.linkedin = normalizeUrl(newLeadKb.linkedin);
      if (newLeadKb.instagram.trim()) kbCleaned.instagram = normalizeUrl(newLeadKb.instagram);
      if (newLeadKb.facebook.trim()) kbCleaned.facebook = normalizeUrl(newLeadKb.facebook);
      if (newLeadKb.twitter.trim()) kbCleaned.twitter = normalizeUrl(newLeadKb.twitter);
      if (newLeadKb.youtube.trim()) kbCleaned.youtube = normalizeUrl(newLeadKb.youtube);
      if (newLead.phone.trim()) kbCleaned.phone = newLead.phone.trim();
      const knowledgeBase = Object.keys(kbCleaned).length > 0 ? kbCleaned : null;

      const payload: Record<string, any> = {
        name: newLead.name.trim(),
        email: newLead.email.trim(),
        company: newLead.company.trim(),
        insights: newLead.insights.trim() || '',
        client_id: user.id,
        score: mockScore,
        status: 'New',
      };
      if (knowledgeBase) payload.knowledgeBase = knowledgeBase;

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

      if (error) {
        setAddLeadError(`${error.message}${error.hint ? ` (Hint: ${error.hint})` : ''}`);
        return;
      }
      if (data) {
        setAllLeads(prev => [data, ...prev]);
        setIsAddLeadOpen(false);
        setNewLead({ name: '', email: '', company: '', phone: '', insights: '' });
        setNewLeadKb({ website: '', linkedin: '', instagram: '', facebook: '', twitter: '', youtube: '' });
        setVisibleKbFields(new Set());
        setQuickInsightLead(data);
      } else {
        setAddLeadError('Insert returned no data. The lead may not have been created.');
      }
    } catch (err: unknown) {
      console.error('Lead insert exception:', err);
      setAddLeadError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsAddingLead(false);
    }
  };

  const openEditLead = async (lead: Lead) => {
    setEditLeadId(lead.id);
    setEditLead({
      name: lead.name || '',
      email: lead.email || '',
      company: lead.company || '',
      phone: '',
      insights: lead.insights || '',
    });
    setEditLeadKb({ website: '', linkedin: '', instagram: '', facebook: '', twitter: '', youtube: '' });
    setEditVisibleKbFields(new Set());
    setEditLeadError('');
    setIsEditLeadOpen(true);

    // Lazy-load knowledgeBase for this lead
    const { data } = await supabase
      .from('leads')
      .select('knowledgeBase')
      .eq('id', lead.id)
      .single();
    const kb = data?.knowledgeBase || {};
    setEditLead(prev => ({ ...prev, phone: (kb as Record<string, string>).phone || '' }));
    setEditLeadKb({
      website: kb.website || '',
      linkedin: kb.linkedin || '',
      instagram: kb.instagram || '',
      facebook: kb.facebook || '',
      twitter: kb.twitter || '',
      youtube: kb.youtube || '',
    });
    const visible = new Set<string>();
    if (kb.website) visible.add('website');
    if (kb.linkedin) visible.add('linkedin');
    if (kb.twitter) visible.add('twitter');
    if (kb.instagram) visible.add('instagram');
    if (kb.facebook) visible.add('facebook');
    setEditVisibleKbFields(visible);
  };

  const handleEditLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLeadId) return;
    setEditLeadError('');
    setIsEditingLead(true);
    try {
      const normalizeUrl = (url: string) => {
        const trimmed = url.trim();
        if (!trimmed) return '';
        return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      };
      const kbCleaned: Record<string, string> = {};
      if (editLeadKb.website.trim()) kbCleaned.website = normalizeUrl(editLeadKb.website);
      if (editLeadKb.linkedin.trim()) kbCleaned.linkedin = normalizeUrl(editLeadKb.linkedin);
      if (editLeadKb.instagram.trim()) kbCleaned.instagram = normalizeUrl(editLeadKb.instagram);
      if (editLeadKb.facebook.trim()) kbCleaned.facebook = normalizeUrl(editLeadKb.facebook);
      if (editLeadKb.twitter.trim()) kbCleaned.twitter = normalizeUrl(editLeadKb.twitter);
      if (editLeadKb.youtube.trim()) kbCleaned.youtube = normalizeUrl(editLeadKb.youtube);
      if (editLead.phone.trim()) kbCleaned.phone = editLead.phone.trim();
      const knowledgeBase = Object.keys(kbCleaned).length > 0 ? kbCleaned : null;

      const payload: Record<string, any> = {
        name: editLead.name.trim(),
        email: editLead.email.trim(),
        company: editLead.company.trim(),
        insights: editLead.insights.trim() || '',
      };
      if (knowledgeBase !== undefined) payload.knowledgeBase = knowledgeBase;

      let { error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', editLeadId);

      // If knowledgeBase column doesn't exist, retry without it
      if (error && (error.message?.includes('knowledgeBase') || error.code === 'PGRST204')) {
        delete payload.knowledgeBase;
        const retry = await supabase.from('leads').update(payload).eq('id', editLeadId);
        error = retry.error;
      }

      if (error) {
        setEditLeadError(`${error.message}${error.hint ? ` (Hint: ${error.hint})` : ''}`);
        return;
      }

      setAllLeads(prev => prev.map(l =>
        l.id === editLeadId
          ? { ...l, ...payload, knowledgeBase: knowledgeBase || l.knowledgeBase }
          : l
      ));
      setIsEditLeadOpen(false);
      setEditLeadId(null);
    } catch (err: unknown) {
      console.error('Lead update exception:', err);
      setEditLeadError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsEditingLead(false);
    }
  };

  const toggleCompanySize = (size: string) => {
    const next = new Set(companySizeFilter);
    next.has(size) ? next.delete(size) : next.add(size);
    setCompanySizeFilter(next);
  };

  const toggleTag = (tag: LeadTag) => {
    const next = new Set(tagFilter);
    next.has(tag) ? next.delete(tag) : next.add(tag);
    setTagFilter(next);
  };

  // ── Bulk Action Execution ──
  const executeBulkAction = useCallback((actionLabel: string) => {
    const total = selectedIds.size;
    setBulkProgress({ action: actionLabel, total, processed: 0, errors: 0, running: true });
    setBulkActionOpen(null);

    let processed = 0;
    progressRef.current = setInterval(() => {
      processed++;
      const errors = Math.random() < 0.02 ? 1 : 0;
      setBulkProgress(prev => prev ? {
        ...prev,
        processed,
        errors: prev.errors + errors,
      } : null);
      if (processed >= total) {
        if (progressRef.current) clearInterval(progressRef.current);
        setBulkProgress(prev => prev ? { ...prev, running: false } : null);
      }
    }, 80);
  }, [selectedIds]);

  const handleBulkStatusChange = async (status: Lead['status']) => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('leads').update({ status }).in('id', ids);
    if (error) console.error('Bulk status update error:', error.message);
    setAllLeads(prev => prev.map(l => ids.includes(l.id) ? { ...l, status } : l));
    executeBulkAction(`Change status to ${status}`);
    setSelectedIds(new Set());
  };

  const handleBulkCampaign = () => {
    executeBulkAction(`Add to "${bulkCampaign}" campaign`);
    setSelectedIds(new Set());
  };

  const handleBulkAssign = () => {
    executeBulkAction(`Assign to ${bulkAssignee}`);
    setSelectedIds(new Set());
  };

  const handleBulkTag = () => {
    executeBulkAction(`Add "${bulkTag}" tag`);
    setSelectedIds(new Set());
  };

  const handleBulkEmail = () => {
    executeBulkAction('Send bulk email');
    setSelectedIds(new Set());
  };

  const handleBulkWorkflow = useCallback(async () => {
    if (!bulkSelectedWorkflowId) return;
    const wf = bulkWorkflows.find(w => w.id === bulkSelectedWorkflowId);
    if (!wf) return;
    const ids = Array.from(selectedIds);
    const selectedLeads = allLeads.filter(l => ids.includes(l.id));
    const total = selectedLeads.length;
    setBulkActionOpen(null);
    setBulkProgress({ action: `Enroll in "${wf.name}"`, total, processed: 0, errors: 0, running: true });

    try {
      const results = await executeWorkflowEngine(wf, selectedLeads);
      const errors = results.filter(r => r.status === 'failed').length;
      setBulkProgress({ action: `Enroll in "${wf.name}"`, total, processed: total, errors, running: false });
    } catch {
      setBulkProgress(prev => prev ? { ...prev, processed: total, errors: total, running: false } : null);
    }
    setSelectedIds(new Set());
  }, [bulkSelectedWorkflowId, bulkWorkflows, selectedIds, allLeads]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteTargetIds.length === 0) return;
    setDeleteLoading(true);
    const { error } = await supabase.from('leads').delete().in('id', deleteTargetIds);
    if (error) {
      console.error('Delete leads error:', error.message);
    } else {
      setAllLeads(prev => prev.filter(l => !deleteTargetIds.includes(l.id)));
      setSelectedIds(prev => {
        const next = new Set(prev);
        deleteTargetIds.forEach(id => next.delete(id));
        return next;
      });
    }
    setDeleteLoading(false);
    setDeleteConfirmOpen(false);
    setDeleteTargetIds([]);
  }, [deleteTargetIds]);

  // ── Activity Log ──
  const handleLogActivity = () => {
    if (!activityDetails.trim()) return;
    const log: ActivityLog = {
      type: activityType,
      details: activityDetails,
      outcome: activityOutcome,
      timestamp: new Date().toISOString(),
    };
    setActivityLogs(prev => [log, ...prev]);
    setActivityDetails('');
    setActivityOutcome('');

    if (activityLogLead) {
      setAllLeads(prev => prev.map(l =>
        l.id === activityLogLead.id ? {
          ...l,
          score: Math.min(100, l.score + (activityType === 'meeting' ? 5 : activityType === 'call' ? 3 : 1)),
          lastActivity: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} logged`,
        } : l
      ));
    }
  };

  // Cleanup
  useEffect(() => {
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, []);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput || isActionsOpen || isCSVOpen || isAddLeadOpen || isEditLeadOpen || activityLogOpen) return;

      if (e.key === 'j') { setFocusedIndex(prev => Math.min(prev + 1, paginatedLeads.length - 1)); return; }
      if (e.key === 'k') { setFocusedIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < paginatedLeads.length) {
        e.preventDefault(); navigate(`/portal/leads/${paginatedLeads[focusedIndex].id}`); return;
      }
      if (e.key === 'v') { setViewMode(prev => prev === 'table' ? 'kanban' : 'table'); return; }
      if (e.key === 'n') { e.preventDefault(); { setIsAddLeadOpen(true); setAddLeadError(''); }; return; }
      if (e.key === 'i') { e.preventDefault(); setIsCSVOpen(true); return; }
      if (e.key === 'x' && focusedIndex >= 0 && focusedIndex < paginatedLeads.length) {
        toggleSelect(paginatedLeads[focusedIndex].id); return;
      }
      if (e.key === 'p') { setShowPipelineAnalytics(prev => !prev); return; }
      if (e.key === 'e') { setShowEngagementMetrics(prev => !prev); return; }
      if (e.key === 's') { setShowScoreIntelligence(prev => !prev); return; }
      if (e.key === '?') { e.preventDefault(); setShowShortcuts(prev => !prev); return; }
      if (e.key === 'Escape') {
        setQuickInsightLead(null); setBulkActionOpen(null); setInlineStatusId(null); setActionsDropdownId(null);
        setShowPipelineAnalytics(false); setShowEngagementMetrics(false);
        setShowScoreIntelligence(false); setShowShortcuts(false);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, paginatedLeads.length, focusedIndex, isActionsOpen, isCSVOpen, isAddLeadOpen, isEditLeadOpen, activityLogOpen]);

  const activeFilterCount = [
    statusFilter !== 'All', scoreFilter !== 'all', activityFilter !== 'All Time',
    companySizeFilter.size > 0, tagFilter.size > 0, emailEngagementFilter.size > 0, followUpFilter,
  ].filter(Boolean).length;

  const rangeStart = (currentPage - 1) * perPage + 1;
  const rangeEnd = Math.min(currentPage * perPage, filteredLeads.length);

  const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
    call: <PhoneIcon className="w-4 h-4" />,
    email: <MailIcon className="w-4 h-4" />,
    meeting: <CalendarIcon className="w-4 h-4" />,
    note: <EditIcon className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* ── Header ── */}
      <PageHeader
        title="Leads"
        description={`${filteredLeads.length.toLocaleString()} total`}
        actions={
          <>
            <button
              onClick={() => navigate('/portal/leads/apollo')}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
            >
              <GlobeIcon className="w-4 h-4" />
              <span>Apollo</span>
            </button>
            <button
              onClick={() => setIsCSVOpen(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
            >
              <DownloadIcon className="w-4 h-4" />
              <span>Import</span>
            </button>
            <button
              data-guide="leads-add"
              onClick={() => { setIsAddLeadOpen(true); setAddLeadError(''); }}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add Lead</span>
            </button>
          </>
        }
        advancedActions={
          <>
            <button
              onClick={handleExportSelected}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <DownloadIcon className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={() => setShowPipelineAnalytics(prev => !prev)}
              className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                showPipelineAnalytics
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-200'
                  : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
              }`}
            >
              <TrendUpIcon className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Pipeline</span>
            </button>
            <button
              onClick={() => setShowEngagementMetrics(prev => !prev)}
              className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                showEngagementMetrics
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-200'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <BoltIcon className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Engagement</span>
            </button>
            <button
              onClick={() => setShowScoreIntelligence(prev => !prev)}
              className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                showScoreIntelligence
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-200'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <BrainIcon className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Scores</span>
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all shadow-sm"
              title="Keyboard Shortcuts (?)"
            >
              <KeyboardIcon className="w-4 h-4" />
            </button>
          </>
        }
      />

      {/* ── KPI Stats Banner ── */}
      <AdvancedOnly>
      {!loading && allLeads.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Leads', value: kpiStats.total.toLocaleString(), icon: <UsersIcon className="w-4 h-4" />, color: 'indigo', sub: `${filteredLeads.length} shown` },
            { label: 'Hot Leads', value: kpiStats.hotLeads.toString(), icon: <FlameIcon className="w-4 h-4" />, color: 'rose', sub: `${kpiStats.total > 0 ? Math.round((kpiStats.hotLeads / kpiStats.total) * 100) : 0}% of total` },
            { label: 'New This Week', value: kpiStats.newThisWeek.toString(), icon: <BoltIcon className="w-4 h-4" />, color: 'emerald', sub: 'last 7 days' },
            { label: 'Avg Score', value: kpiStats.avgScore.toString(), icon: <TargetIcon className="w-4 h-4" />, color: kpiStats.avgScore >= 60 ? 'amber' : 'slate', sub: kpiStats.avgScore >= 70 ? 'Excellent' : kpiStats.avgScore >= 50 ? 'Good' : 'Needs work' },
            { label: 'Qualified Rate', value: `${kpiStats.qualifiedRate}%`, icon: <CheckIcon className="w-4 h-4" />, color: 'violet', sub: `${allLeads.filter(l => l.status === 'Qualified').length} qualified` },
            { label: 'Contact Rate', value: `${kpiStats.contactedRate}%`, icon: <PhoneIcon className="w-4 h-4" />, color: 'sky', sub: `${allLeads.filter(l => l.status !== 'New').length} reached` },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-all group">
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
      )}

      </AdvancedOnly>

      {/* ── AI Lead Health Summary ── */}
      <AdvancedOnly>
      {!loading && allLeads.length >= 5 && (
        <div className="bg-gradient-to-r from-indigo-50 via-white to-violet-50 rounded-2xl border border-indigo-100 p-5">
          <div className="flex items-center space-x-2 mb-3">
            <BrainIcon className="w-4 h-4 text-indigo-600" />
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">AI Lead Health Summary</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start space-x-2.5">
              <div className="p-1.5 bg-emerald-100 rounded-lg mt-0.5"><TrendUpIcon className="w-3.5 h-3.5 text-emerald-600" /></div>
              <div>
                <p className="text-xs font-bold text-slate-800">Pipeline Velocity</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {kpiStats.contactedRate >= 50
                    ? `Strong engagement — ${kpiStats.contactedRate}% of leads have been contacted.`
                    : `${100 - kpiStats.contactedRate}% of leads are still untouched. Consider outreach campaigns.`
                  }
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-2.5">
              <div className="p-1.5 bg-amber-100 rounded-lg mt-0.5"><FlameIcon className="w-3.5 h-3.5 text-amber-600" /></div>
              <div>
                <p className="text-xs font-bold text-slate-800">Hot Lead Alert</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {kpiStats.hotLeads > 0
                    ? `${kpiStats.hotLeads} high-priority lead${kpiStats.hotLeads > 1 ? 's' : ''} need${kpiStats.hotLeads === 1 ? 's' : ''} immediate attention (score 75+).`
                    : 'No urgent leads right now. Focus on nurturing existing pipeline.'
                  }
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-2.5">
              <div className="p-1.5 bg-violet-100 rounded-lg mt-0.5"><TargetIcon className="w-3.5 h-3.5 text-violet-600" /></div>
              <div>
                <p className="text-xs font-bold text-slate-800">Conversion Potential</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {kpiStats.qualifiedRate >= 20
                    ? `${kpiStats.qualifiedRate}% qualification rate — above average performance.`
                    : `${kpiStats.qualifiedRate}% qualification rate — focus on lead scoring and follow-ups.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      </AdvancedOnly>

      {/* ── Quick Insight Panel (after adding lead) ── */}
      {quickInsightLead && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 animate-in fade-in duration-500">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-lg">
                {quickInsightLead.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{quickInsightLead.name} - {quickInsightLead.company}</h3>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    quickInsightLead.score >= 76 ? 'bg-rose-100 text-rose-700' :
                    quickInsightLead.score >= 51 ? 'bg-amber-100 text-amber-700' :
                    quickInsightLead.score >= 26 ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    Score: {quickInsightLead.score}
                  </span>
                  <StarRating score={quickInsightLead.score} />
                  <span className="text-xs font-bold text-slate-500">({getScoreAction(quickInsightLead.score).tier})</span>
                </div>
              </div>
            </div>
            <button onClick={() => setQuickInsightLead(null)} className="p-1.5 text-slate-300 hover:text-slate-500 transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI Insights */}
            <div className="bg-indigo-50/50 rounded-xl p-4">
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>AI Insights</span>
              </p>
              <div className="space-y-1.5">
                {(quickInsightLead.insights || 'AI is analyzing this lead...').split('.').filter(Boolean).slice(0, 4).map((insight, i) => (
                  <p key={i} className="text-xs text-slate-600 flex items-start space-x-1.5">
                    <span className="text-indigo-400 mt-0.5">&#8226;</span>
                    <span>{insight.trim()}</span>
                  </p>
                ))}
              </div>
            </div>

            {/* Recommended Actions */}
            <div className={`bg-${getScoreAction(quickInsightLead.score).color}-50/50 rounded-xl p-4`}>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                <TargetIcon className="w-3.5 h-3.5" />
                <span>Recommended Actions</span>
              </p>
              <div className="space-y-1.5">
                {getScoreAction(quickInsightLead.score).actions.map((action, i) => (
                  <p key={i} className="text-xs text-slate-600 flex items-start space-x-1.5">
                    <span className="text-emerald-500 mt-0.5">&#8226;</span>
                    <span>{action}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center space-x-2">
            <button
              onClick={() => { navigate(`/portal/leads/${quickInsightLead.id}`); }}
              className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              <span>View Full Analysis</span>
            </button>
            <button
              className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
            >
              <MailIcon className="w-3.5 h-3.5" />
              <span>Send Email</span>
            </button>
            <button
              onClick={() => { setActivityLogLead(quickInsightLead); setActivityLogOpen(true); }}
              className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Schedule Follow-up</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Search Bar ── */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search leads by name, email, or company..."
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all shadow-sm"
        />
      </div>

      {/* ── Bulk Progress Monitor ── */}
      {bulkProgress && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              {bulkProgress.running ? (
                <div className="w-5 h-5 border-2 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              ) : (
                <CheckIcon className="w-5 h-5 text-emerald-600" />
              )}
              <span className="text-sm font-bold text-slate-800">
                {bulkProgress.running ? 'Processing...' : 'Complete!'} {bulkProgress.action}
              </span>
            </div>
            {!bulkProgress.running && (
              <button onClick={() => setBulkProgress(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">
                Dismiss
              </button>
            )}
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-200 ${bulkProgress.running ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.round((bulkProgress.processed / bulkProgress.total) * 100)}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{Math.round((bulkProgress.processed / bulkProgress.total) * 100)}% complete</span>
            <div className="flex items-center space-x-4">
              <span>Processed: <span className="font-bold text-slate-700">{bulkProgress.processed}/{bulkProgress.total}</span></span>
              {bulkProgress.errors > 0 && <span className="text-rose-600 font-bold">Errors: {bulkProgress.errors}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Two Panel Layout: Filters + Lead List ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── FILTER PANEL ── */}
        <AdvancedOnly>
        <div className={`w-full shrink-0 space-y-5 transition-all duration-200 ${filtersCollapsed ? 'lg:w-auto' : 'lg:w-[25%]'}`} data-guide="leads-filters">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2">
                <FilterIcon className="w-4 h-4 text-indigo-600" />
                {!filtersCollapsed && <h3 className="font-bold text-slate-800 font-heading text-sm">Filters</h3>}
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 bg-indigo-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setFiltersCollapsed(prev => !prev)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                title={filtersCollapsed ? 'Expand filters' : 'Collapse filters'}
              >
                <svg className={`w-4 h-4 transition-transform duration-200 ${filtersCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                </svg>
              </button>
            </div>
            {filtersCollapsed ? null : (<>

            {/* Status */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors"
              >
                <option value="All">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Score Range */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Score Range</label>
              <div className="flex flex-wrap gap-2">
                {([['all', 'All'], ['50-100', '50-100'], ['below-50', '< 50']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setScoreFilter(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      scoreFilter === val
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Last Activity */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Last Activity</label>
              <div className="space-y-1.5">
                {ACTIVITY_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setActivityFilter(opt)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      activityFilter === opt
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Company Size */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Size</label>
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZES.map(size => (
                  <button
                    key={size}
                    onClick={() => toggleCompanySize(size)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                      companySizeFilter.has(size)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tags</label>
              <div className="flex flex-wrap gap-2">
                {ALL_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                      tagFilter.has(tag)
                        ? TAG_COLORS[tag] + ' border-current'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Email Engagement */}
            <div className="mb-5" data-guide="leads-email-filter">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Email Engagement</label>
              <div className="flex flex-wrap gap-2">
                {(['sent', 'opened', 'clicked'] as const).map(key => {
                  const label = key === 'sent' ? 'Sent' : key === 'opened' ? 'Opened' : 'Clicked';
                  const colors = key === 'sent' ? 'bg-blue-50 text-blue-600 border-blue-200' : key === 'opened' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200';
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const next = new Set(emailEngagementFilter);
                        next.has(key) ? next.delete(key) : next.add(key);
                        setEmailEngagementFilter(next);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                        emailEngagementFilter.has(key) ? colors + ' border-current' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Follow-up Filter */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Follow-up</label>
              <button
                onClick={() => setFollowUpFilter(f => !f)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                  followUpFilter ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-200'
                }`}
              >
                Potential Clients (2+ opens)
              </button>
            </div>

            {/* Score Distribution */}
            {allLeads.length > 0 && (
              <div className="mb-5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Score Distribution</label>
                <div className="space-y-2">
                  {scoreDistribution.map((bucket) => (
                    <div key={bucket.label} className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold text-slate-500 w-10 text-right">{bucket.label}</span>
                      <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${bucket.color} rounded-full transition-all duration-700`}
                          style={{ width: `${bucket.pct}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-black text-slate-600 w-6">{bucket.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Select by Filter */}
            <div className="mb-6">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Quick Select</label>
              <div className="space-y-1.5">
                <button onClick={() => selectByFilter(l => l.score >= 75)} className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-all">
                  Score &gt; 75 ({allLeads.filter(l => l.score >= 75).length})
                </button>
                <button onClick={() => selectByFilter(l => {
                  if (!l.created_at) return false;
                  return (new Date().getTime() - new Date(l.created_at).getTime()) < 7 * 86400000;
                })} className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-all">
                  Last 7 days activity
                </button>
                <button onClick={() => selectByFilter(l => l.status === 'New')} className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all">
                  All New leads ({allLeads.filter(l => l.status === 'New').length})
                </button>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={clearFilters}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Clear All
              </button>
            </div>
            </>)}
          </div>

        </div>
        </AdvancedOnly>

        {/* ── LEAD LIST ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* View Mode Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-500">{filteredLeads.length} leads</span>
              {selectedIds.size > 0 && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[10px] font-bold">
                  {selectedIds.size} selected
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-bold transition-all ${
                    viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-bold transition-all ${
                    viewMode === 'kanban' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <GridIcon className="w-3.5 h-3.5" />
                  <span>Pipeline</span>
                </button>
              </div>
            </div>
          </div>

          {/* Enhanced Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div data-guide="leads-bulk-actions" className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-indigo-700">
                  {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
                <button onClick={() => setSelectedIds(new Set())} className="text-xs font-bold text-indigo-400 hover:text-indigo-600 transition-colors">
                  Deselect All
                </button>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                {/* Add to Campaign */}
                <div className="relative">
                  <button
                    onClick={() => setBulkActionOpen(bulkActionOpen === 'campaign' ? null : 'campaign')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                  >
                    <BoltIcon className="w-3.5 h-3.5" />
                    <span>Add to Campaign</span>
                  </button>
                  {bulkActionOpen === 'campaign' && (
                    <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-4 min-w-[260px]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Campaign</p>
                      <select value={bulkCampaign} onChange={e => setBulkCampaign(e.target.value as any)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-2">
                        {CAMPAIGNS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <label className="flex items-center space-x-2 mb-3 cursor-pointer">
                        <input type="checkbox" checked={bulkAIPersonalize} onChange={() => setBulkAIPersonalize(!bulkAIPersonalize)} className="w-4 h-4 text-indigo-600 rounded" />
                        <span className="text-xs text-slate-600 font-semibold">AI Personalization</span>
                      </label>
                      <p className="text-[10px] text-slate-400 mb-3">{selectedIds.size} leads will be added. {bulkAIPersonalize ? 'AI will personalize for each lead.' : ''}</p>
                      <div className="flex space-x-2">
                        <button onClick={() => setBulkActionOpen(null)} className="flex-1 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">Cancel</button>
                        <button onClick={handleBulkCampaign} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Execute</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Assign to Team */}
                <div className="relative">
                  <button
                    onClick={() => setBulkActionOpen(bulkActionOpen === 'assign' ? null : 'assign')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                  >
                    <UsersIcon className="w-3.5 h-3.5" />
                    <span>Assign</span>
                  </button>
                  {bulkActionOpen === 'assign' && (
                    <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-4 min-w-[220px]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Team Member</p>
                      <select value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value as any)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-3">
                        {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <div className="flex space-x-2">
                        <button onClick={() => setBulkActionOpen(null)} className="flex-1 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">Cancel</button>
                        <button onClick={handleBulkAssign} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Assign</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Change Status */}
                <div className="relative">
                  <button
                    onClick={() => setBulkActionOpen(bulkActionOpen === 'status' ? null : 'status')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                    <span>Update Status</span>
                  </button>
                  {bulkActionOpen === 'status' && (
                    <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden min-w-[140px]">
                      {STATUS_OPTIONS.map(s => (
                        <button key={s} onClick={() => handleBulkStatusChange(s)} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Tag */}
                <div className="relative">
                  <button
                    onClick={() => setBulkActionOpen(bulkActionOpen === 'tag' ? null : 'tag')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                  >
                    <TagIcon className="w-3.5 h-3.5" />
                    <span>Add Tag</span>
                  </button>
                  {bulkActionOpen === 'tag' && (
                    <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-4 min-w-[200px]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Tag</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {ALL_TAGS.map(t => (
                          <button key={t} onClick={() => setBulkTag(t)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${bulkTag === t ? TAG_COLORS[t] + ' border-current' : 'bg-white text-slate-500 border-slate-200'}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => setBulkActionOpen(null)} className="flex-1 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">Cancel</button>
                        <button onClick={handleBulkTag} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Apply</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sync to CRM */}
                {crmConnected && (
                  <button
                    onClick={() => { selectedIds.forEach(id => handleSyncToCrm(id)); }}
                    disabled={!!syncingCrm}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all disabled:opacity-50"
                  >
                    <GlobeIcon className="w-3.5 h-3.5" />
                    <span>{syncingCrm ? 'Syncing...' : 'Sync to CRM'}</span>
                  </button>
                )}

                {/* Export */}
                <button
                  onClick={handleExportSelected}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>

                {/* Send Bulk Email */}
                <button
                  onClick={handleBulkEmail}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                >
                  <MailIcon className="w-3.5 h-3.5" />
                  <span>Send Email</span>
                </button>

                {/* Delete Selected */}
                <button
                  onClick={() => { setDeleteTargetIds(Array.from(selectedIds)); setDeleteConfirmOpen(true); }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-all"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                {/* Enroll in Workflow */}
                <div className="relative">
                  <button
                    onClick={async () => {
                      if (bulkActionOpen === 'workflow') {
                        setBulkActionOpen(null);
                      } else {
                        const wfs = await loadWorkflows(user.id);
                        setBulkWorkflows(wfs.filter(w => w.status === 'active'));
                        setBulkSelectedWorkflowId(null);
                        setBulkActionOpen('workflow');
                      }
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition-all"
                  >
                    <BoltIcon className="w-3.5 h-3.5" />
                    <span>Workflow</span>
                  </button>
                  {bulkActionOpen === 'workflow' && (
                    <div className="absolute top-full mt-1 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-4 min-w-[260px]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Workflow</p>
                      {bulkWorkflows.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">No active workflows. Create one in Automation Engine.</p>
                      ) : (
                        <>
                          <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto">
                            {bulkWorkflows.map(wf => (
                              <button
                                key={wf.id}
                                onClick={() => setBulkSelectedWorkflowId(wf.id)}
                                className={`w-full text-left p-2 rounded-lg text-xs font-semibold border transition-all ${
                                  bulkSelectedWorkflowId === wf.id
                                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                                    : 'border-slate-100 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {wf.name}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-400 mb-3">{selectedIds.size} leads will be enrolled.</p>
                          <div className="flex space-x-2">
                            <button onClick={() => setBulkActionOpen(null)} className="flex-1 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">Cancel</button>
                            <button
                              onClick={handleBulkWorkflow}
                              disabled={!bulkSelectedWorkflowId}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold ${bulkSelectedWorkflowId ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                            >
                              Run
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Kanban / Pipeline View */}
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {(STATUS_OPTIONS as readonly Lead['status'][]).map(status => {
                const statusColors: Record<string, { bg: string; border: string; badge: string; dot: string }> = {
                  New: { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
                  Contacted: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
                  Qualified: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
                  Converted: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
                  Lost: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-600', dot: 'bg-red-400' },
                };
                const sc = statusColors[status] || statusColors.New;
                const leads = kanbanColumns[status] || [];
                return (
                  <div key={status} className={`${sc.bg} rounded-2xl border ${sc.border} p-4`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${sc.dot}`}></div>
                        <h3 className="text-sm font-bold text-slate-800">{status}</h3>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${sc.badge}`}>
                        {leads.length}
                      </span>
                    </div>
                    <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                      {leads.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-8">No leads</p>
                      ) : leads.map(lead => {
                        const tag = getLeadTag(lead);
                        const nextStage = getNextStage(lead.status);
                        return (
                          <div
                            key={lead.id}
                            className={`w-full text-left bg-white rounded-xl border border-slate-100 p-2.5 hover:shadow-md hover:border-indigo-200 transition-all group border-l-2 ${getColorClasses(resolveLeadColor(lead, stageColors, colorOverrides)).border}`}
                          >
                            <button
                              onClick={() => navigate(`/portal/leads/${lead.id}`)}
                              className="w-full text-left"
                            >
                              <div className="flex items-center space-x-2 mb-1.5">
                                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-[9px] text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors flex-shrink-0">
                                  {(lead.name || '').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2) || '?'}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                                  <p className="text-[9px] text-slate-400 truncate">{lead.company}</p>
                                </div>
                                <span className={`px-1 py-px rounded text-[8px] font-bold border flex-shrink-0 ${TAG_COLORS[tag]}`}>{tag}</span>
                              </div>
                            </button>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <div className="w-8 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${lead.score >= 76 ? 'bg-rose-500' : lead.score >= 51 ? 'bg-amber-500' : lead.score >= 26 ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${lead.score}%` }}></div>
                                </div>
                                <span className="text-[9px] font-black text-slate-600">{lead.score}</span>
                                <span className="text-[9px] text-slate-400">{formatRelativeTime(lead.created_at || lead.lastActivity)}</span>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditLead(lead); }}
                                  className="p-0.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-all opacity-0 group-hover:opacity-100"
                                  title="Edit Lead"
                                >
                                  <PencilIcon className="w-3 h-3" />
                                </button>
                                {nextStage && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStatusUpdate(lead.id, nextStage); }}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold hover:bg-indigo-100 transition-colors opacity-0 group-hover:opacity-100"
                                    title={`Advance to ${nextStage}`}
                                  >
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lead Table */}
          {viewMode === 'table' && (
          <div data-guide="leads-table" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/70 text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="w-10 px-2"></th>
                    <th className="px-4 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('name')}>
                      <div className="flex items-center space-x-1">
                        <span>Name</span>
                        {sortBy === 'name' && <span className="text-indigo-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </div>
                    </th>
                    <th className="px-4 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('company')}>
                      <div className="flex items-center space-x-1">
                        <span>Company</span>
                        {sortBy === 'company' && <span className="text-indigo-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </div>
                    </th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('score')}>
                      <div className="flex items-center justify-center space-x-1">
                        <span>Score</span>
                        {sortBy === 'score' && <span className="text-indigo-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </div>
                    </th>
                    <th className="px-4 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('activity')}>
                      <div className="flex items-center space-x-1">
                        <span>Last Activity</span>
                        {sortBy === 'activity' && <span className="text-indigo-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </div>
                    </th>
                    <th className="px-3 py-4">Tags</th>
                    <th className="px-3 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={8} className="px-4 py-4">
                          <div className="h-10 bg-slate-50 animate-pulse rounded-xl"></div>
                        </td>
                      </tr>
                    ))
                  ) : paginatedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-20 text-center text-slate-400 italic">
                        {allLeads.length === 0 ? 'No leads yet. Add your first lead to get started.' : 'No leads match your current filters.'}
                      </td>
                    </tr>
                  ) : paginatedLeads.map((lead, idx) => {
                    const tag = getLeadTag(lead);
                    const isFocused = idx === focusedIndex;
                    return (
                      <tr key={lead.id} className={`hover:bg-slate-50/80 transition-colors group ${isFocused ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-200' : ''}`}>
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-3.5">
                          <LeadColorDot size="sm" lead={lead} stageColors={stageColors} overrides={colorOverrides} onOverrideChange={handleColorOverride} />
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => navigate(`/portal/leads/${lead.id}`)}
                            className="flex items-center space-x-3 text-left"
                          >
                            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-[11px] text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors flex-shrink-0">
                              {(lead.name || '').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2) || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">{lead.email}</p>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 font-medium">{lead.company}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  lead.score >= 76 ? 'bg-rose-500' : lead.score >= 51 ? 'bg-amber-500' : lead.score >= 26 ? 'bg-emerald-500' : 'bg-blue-400'
                                }`}
                                style={{ width: `${lead.score}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] font-black text-slate-700">{lead.score}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-500 font-medium">{formatRelativeTime(lead.created_at || lead.lastActivity)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold border whitespace-nowrap ${TAG_COLORS[tag]}`}>
                                {tag}
                              </span>
                              {(() => {
                                const summary = emailSummaryMap.get(lead.id);
                                if (!summary || !summary.hasSent) return null;
                                const best = summary.hasClicked ? 'Clicked' : summary.hasOpened ? 'Opened' : 'Sent';
                                const cls = summary.hasClicked ? 'bg-amber-50 text-amber-600' : summary.hasOpened ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600';
                                return <span className={`px-1.5 py-px rounded text-[9px] font-bold whitespace-nowrap ${cls}`}>{best}</span>;
                              })()}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (inlineStatusId === lead.id) { setInlineStatusId(null); return; }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setInlineStatusPos({ top: rect.bottom + 4, left: rect.left });
                                setInlineStatusId(lead.id);
                              }}
                              className={`self-start px-1.5 py-px rounded text-[9px] font-bold whitespace-nowrap transition-all ${
                                lead.status === 'New' ? 'bg-slate-50 text-slate-600' :
                                lead.status === 'Contacted' ? 'bg-blue-50 text-blue-600' :
                                lead.status === 'Qualified' ? 'bg-amber-50 text-amber-600' :
                                lead.status === 'Converted' ? 'bg-emerald-50 text-emerald-600' :
                                'bg-red-50 text-red-500'
                              } hover:ring-1 hover:ring-indigo-200`}
                            >
                              {lead.status}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/portal/leads/${lead.id}`)}
                              title="View"
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                            >
                              <EyeIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (actionsDropdownId === lead.id) { setActionsDropdownId(null); return; }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setActionsDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                setActionsDropdownId(lead.id);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-all opacity-0 group-hover:opacity-100"
                              title="Actions"
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredLeads.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-500 font-medium">
                    {rangeStart}-{rangeEnd} of {filteredLeads.length.toLocaleString()} leads
                  </p>
                  <select
                    value={perPage}
                    onChange={e => setPerPage(Number(e.target.value))}
                    className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 hover:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all cursor-pointer"
                  >
                    {PAGE_SIZE_OPTIONS.map(n => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) { page = i + 1; }
                    else if (currentPage <= 3) { page = i + 1; }
                    else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                    else { page = currentPage - 2 + i; }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          currentPage === page
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <>
                      <span className="text-slate-400 text-xs px-1">...</span>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        className="w-8 h-8 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                      >
                        {totalPages}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}

      {/* Lead Actions Modal */}
      {selectedLead && (
        <LeadActionsModal
          lead={selectedLead}
          allLeads={allLeads}
          isOpen={isActionsOpen}
          onClose={() => { setIsActionsOpen(false); setSelectedLead(null); }}
          onStatusUpdate={handleStatusUpdate}
          onSendEmail={() => navigate('/portal/content')}
          manualLists={[]}
          onAddToManualList={() => {}}
          onLeadDeleted={() => {
            setAllLeads(prev => prev.filter(l => l.id !== selectedLead.id));
            setSelectedIds(prev => { const next = new Set(prev); next.delete(selectedLead.id); return next; });
          }}
        />
      )}

      {/* Lead Import Wizard */}
      <ImportLeadsWizard
        isOpen={isCSVOpen}
        onClose={() => setIsCSVOpen(false)}
        userId={user.id}
        planName={resolvePlanName(user.plan || 'Starter')}
        onImportComplete={fetchLeads}
      />

      {/* Activity Log Modal */}
      {activityLogOpen && activityLogLead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setActivityLogOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 font-heading">Log Activity</h2>
                <p className="text-xs text-slate-400 mt-0.5">{activityLogLead.name} &middot; {activityLogLead.company}</p>
              </div>
              <button onClick={() => setActivityLogOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Activity Type */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Activity Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['call', 'email', 'meeting', 'note'] as ActivityType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setActivityType(type)}
                      className={`flex flex-col items-center space-y-1 p-3 rounded-xl border-2 transition-all ${
                        activityType === type
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      {ACTIVITY_ICONS[type]}
                      <span className="text-[10px] font-bold capitalize">{type}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Details */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Details</label>
                <textarea
                  rows={3}
                  value={activityDetails}
                  onChange={e => setActivityDetails(e.target.value)}
                  placeholder={`Describe the ${activityType}...`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none focus:border-indigo-300 transition-colors"
                ></textarea>
              </div>

              {/* Outcome */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Outcome</label>
                <select
                  value={activityOutcome}
                  onChange={e => setActivityOutcome(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors"
                >
                  <option value="">Select outcome...</option>
                  <option value="positive">Positive - Interested</option>
                  <option value="neutral">Neutral - No decision</option>
                  <option value="negative">Negative - Not interested</option>
                  <option value="follow-up">Follow-up required</option>
                  <option value="voicemail">Voicemail left</option>
                  <option value="no-answer">No answer</option>
                </select>
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 flex items-start space-x-2">
                <SparklesIcon className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-xs text-indigo-700">AI will update the lead score based on this activity. {activityType === 'meeting' ? 'Meetings add +5 to score.' : activityType === 'call' ? 'Calls add +3 to score.' : 'This activity adds +1 to score.'}</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <button onClick={() => setActivityLogOpen(false)} className="px-4 py-2 text-slate-500 text-xs font-bold hover:text-slate-700 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { handleLogActivity(); setActivityLogOpen(false); }}
                disabled={!activityDetails.trim()}
                className="flex items-center space-x-1.5 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>Log Activity</span>
              </button>
            </div>

            {/* Recent Activity Logs */}
            {activityLogs.length > 0 && (
              <div className="px-6 pb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Logs</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {activityLogs.slice(0, 5).map((log, i) => (
                    <div key={i} className="flex items-center space-x-2.5 p-2 rounded-lg bg-slate-50">
                      <span className="text-slate-400">{ACTIVITY_ICONS[log.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{log.details}</p>
                        <p className="text-[10px] text-slate-400">{formatRelativeTime(log.timestamp)}{log.outcome ? ` — ${log.outcome}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Lead Slide-over */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setIsAddLeadOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 p-10 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-heading">New Lead Profile</h2>
                <p className="text-sm text-slate-500 mt-1">Add details for manual AI enrichment.</p>
              </div>
              <button onClick={() => setIsAddLeadOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <form className="space-y-6 flex-grow" onSubmit={handleAddLead}>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required type="text" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} placeholder="e.g. Robert Fox" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
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
                  ] as const).map(s => {
                    const isActive = visibleKbFields.has(s.key) || newLeadKb[s.key].trim() !== '';
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
                  {(visibleKbFields.has('website') || newLeadKb.website.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><GlobeIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKb.website} onChange={e => setNewLeadKb({...newLeadKb, website: e.target.value})} placeholder="https://company.com" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('linkedin') || newLeadKb.linkedin.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><LinkedInIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKb.linkedin} onChange={e => setNewLeadKb({...newLeadKb, linkedin: e.target.value})} placeholder="linkedin.com/in/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('twitter') || newLeadKb.twitter.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><TwitterIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKb.twitter} onChange={e => setNewLeadKb({...newLeadKb, twitter: e.target.value})} placeholder="x.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('instagram') || newLeadKb.instagram.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><InstagramIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKb.instagram} onChange={e => setNewLeadKb({...newLeadKb, instagram: e.target.value})} placeholder="instagram.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(visibleKbFields.has('facebook') || newLeadKb.facebook.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><FacebookIcon className="w-4 h-4" /></div>
                      <input type="text" value={newLeadKb.facebook} onChange={e => setNewLeadKb({...newLeadKb, facebook: e.target.value})} placeholder="facebook.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-4 flex items-start space-x-3">
                <SparklesIcon className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-indigo-700">AI Auto-Research</p>
                  <p className="text-[11px] text-indigo-600 mt-0.5">After saving, AI will automatically research the company using the website and social links to enrich the lead profile.</p>
                </div>
              </div>
              {addLeadError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-bold text-red-600">{addLeadError}</p>
                </div>
              )}
              <div className="pt-6">
                <button type="submit" disabled={isAddingLead} className={`w-full py-4 rounded-2xl font-bold shadow-xl transition-colors ${isAddingLead ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {isAddingLead ? 'Saving...' : 'Create Lead Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Lead Drawer */}
      {isEditLeadOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setIsEditLeadOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 p-10 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-heading">Edit Lead</h2>
                <p className="text-sm text-slate-500 mt-1">Update lead details and enrichment data.</p>
              </div>
              <button onClick={() => setIsEditLeadOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <form className="space-y-6 flex-grow" onSubmit={handleEditLead}>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required type="text" value={editLead.name} onChange={e => setEditLead({...editLead, name: e.target.value})} placeholder="e.g. Robert Fox" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Email</label>
                <input required type="email" value={editLead.email} onChange={e => setEditLead({...editLead, email: e.target.value})} placeholder="robert@stripe.com" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input required type="text" value={editLead.company} onChange={e => setEditLead({...editLead, company: e.target.value})} placeholder="e.g. Stripe" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Phone Number</label>
                <input type="tel" value={editLead.phone} onChange={e => setEditLead({...editLead, phone: e.target.value})} placeholder="+1 (555) 123-4567" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Insights</label>
                <textarea rows={3} value={editLead.insights} onChange={e => setEditLead({...editLead, insights: e.target.value})} placeholder="What do we know?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none focus:border-indigo-300 transition-colors"></textarea>
              </div>
              {/* Website & Social Links */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Websites & Social Profiles</label>
                <div className="flex items-center gap-2 mb-3">
                  {([
                    { key: 'website', icon: <GlobeIcon className="w-4 h-4" />, tip: 'Website' },
                    { key: 'linkedin', icon: <LinkedInIcon className="w-4 h-4" />, tip: 'LinkedIn' },
                    { key: 'twitter', icon: <TwitterIcon className="w-4 h-4" />, tip: 'X / Twitter' },
                    { key: 'instagram', icon: <InstagramIcon className="w-4 h-4" />, tip: 'Instagram' },
                    { key: 'facebook', icon: <FacebookIcon className="w-4 h-4" />, tip: 'Facebook' },
                  ] as const).map(s => {
                    const isActive = editVisibleKbFields.has(s.key) || editLeadKb[s.key].trim() !== '';
                    return (
                      <button
                        key={s.key}
                        type="button"
                        title={s.tip}
                        onClick={() => setEditVisibleKbFields(prev => {
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
                  {(editVisibleKbFields.has('website') || editLeadKb.website.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><GlobeIcon className="w-4 h-4" /></div>
                      <input type="text" value={editLeadKb.website} onChange={e => setEditLeadKb({...editLeadKb, website: e.target.value})} placeholder="https://company.com" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editVisibleKbFields.has('linkedin') || editLeadKb.linkedin.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><LinkedInIcon className="w-4 h-4" /></div>
                      <input type="text" value={editLeadKb.linkedin} onChange={e => setEditLeadKb({...editLeadKb, linkedin: e.target.value})} placeholder="linkedin.com/in/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editVisibleKbFields.has('twitter') || editLeadKb.twitter.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><TwitterIcon className="w-4 h-4" /></div>
                      <input type="text" value={editLeadKb.twitter} onChange={e => setEditLeadKb({...editLeadKb, twitter: e.target.value})} placeholder="x.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editVisibleKbFields.has('instagram') || editLeadKb.instagram.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><InstagramIcon className="w-4 h-4" /></div>
                      <input type="text" value={editLeadKb.instagram} onChange={e => setEditLeadKb({...editLeadKb, instagram: e.target.value})} placeholder="instagram.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editVisibleKbFields.has('facebook') || editLeadKb.facebook.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><FacebookIcon className="w-4 h-4" /></div>
                      <input type="text" value={editLeadKb.facebook} onChange={e => setEditLeadKb({...editLeadKb, facebook: e.target.value})} placeholder="facebook.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                </div>
              </div>
              {editLeadError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-bold text-red-600">{editLeadError}</p>
                </div>
              )}
              <div className="pt-6">
                <button type="submit" disabled={isEditingLead} className={`w-full py-4 rounded-2xl font-bold shadow-xl transition-colors ${isEditingLead ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {isEditingLead ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ANALYTICS PANELS                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AdvancedOnly>

      {/* Pipeline Analytics Panel */}
      {showPipelineAnalytics && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowPipelineAnalytics(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Pipeline Analytics</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Conversion funnel & velocity metrics</p>
                </div>
                <button onClick={() => setShowPipelineAnalytics(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <svg viewBox="0 0 96 96" className="w-28 h-28">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#06b6d4" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(pipelineAnalytics.healthScore / 100) * 251.3} 251.3`}
                      transform="rotate(-90 48 48)" className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">{pipelineAnalytics.healthScore}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Health</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Contacted', value: `${pipelineAnalytics.contactedRate}%`, sub: 'conversion' },
                  { label: 'Qualified', value: `${pipelineAnalytics.qualifiedRate}%`, sub: 'conversion' },
                  { label: 'Lost Rate', value: `${pipelineAnalytics.lostRate}%`, sub: 'of pipeline' },
                  { label: 'Stale Leads', value: pipelineAnalytics.staleLeads.toString(), sub: '> 14 days idle' },
                ].map((card, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-slate-900">{card.value}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{card.label}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Pipeline Stages */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Pipeline Stages</p>
                <div className="space-y-2.5">
                  {pipelineAnalytics.stages.map((stage, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <span className="text-xs font-bold text-slate-600 w-20">{stage.name}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${stage.bg} rounded-full transition-all duration-700`} style={{ width: `${Math.max(stage.pct, 2)}%` }} />
                      </div>
                      <span className="text-xs font-black text-slate-700 w-12 text-right">{stage.count} ({stage.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dark Chart */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Funnel Velocity</p>
                <div className="flex items-end justify-between h-24 space-x-3">
                  {pipelineAnalytics.stages.map((stage, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center space-y-1.5">
                      <div className="w-full rounded-t-lg bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-700"
                        style={{ height: `${Math.max(stage.pct, 4)}%` }} />
                      <span className="text-[8px] font-bold text-slate-500">{stage.name}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Processed this week</span>
                  <span className="text-sm font-black text-cyan-400">{pipelineAnalytics.processedThisWeek}</span>
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-cyan-600 to-teal-600 rounded-2xl p-5 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">AI Pipeline Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  {pipelineAnalytics.healthScore >= 70
                    ? `Strong pipeline health at ${pipelineAnalytics.healthScore}%. Your conversion funnel shows ${pipelineAnalytics.qualifiedRate}% qualification rate \u2014 above industry benchmarks.`
                    : pipelineAnalytics.staleLeads > 0
                      ? `${pipelineAnalytics.staleLeads} leads stagnating in "New" for 2+ weeks. Automated outreach could recover up to ${Math.round(pipelineAnalytics.staleLeads * 0.3)} conversions.`
                      : `Pipeline health at ${pipelineAnalytics.healthScore}%. Focus on moving "Contacted" leads to "Qualified" to boost funnel throughput.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Engagement Metrics Panel */}
      {showEngagementMetrics && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowEngagementMetrics(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Engagement Metrics</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Contact rates & tier analysis</p>
                </div>
                <button onClick={() => setShowEngagementMetrics(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <svg viewBox="0 0 96 96" className="w-28 h-28">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e11d48" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(engagementMetrics.engagementScore / 100) * 251.3} 251.3`}
                      transform="rotate(-90 48 48)" className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">{engagementMetrics.engagementScore}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Score</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Contact Rate', value: `${engagementMetrics.contactRate}%` },
                  { label: 'Engaged', value: `${engagementMetrics.contacted}/${engagementMetrics.total}` },
                  { label: 'Hot Engaged', value: `${engagementMetrics.tiers[1].rate}%` },
                  { label: 'Cold Engaged', value: `${engagementMetrics.tiers[3].rate}%` },
                ].map((card, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-slate-900">{card.value}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>

              {/* Tier Breakdown */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Engagement by Tier</p>
                <div className="space-y-2">
                  {engagementMetrics.tiers.map((tier, i) => (
                    <div key={i} className={`${tier.cardBg} rounded-xl p-3`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-bold ${tier.textColor}`}>{tier.name}</span>
                        <span className="text-xs font-black text-slate-700">{tier.count} leads</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-700 rounded-full transition-all duration-700" style={{ width: `${tier.rate}%` }} />
                        </div>
                        <span className="text-[10px] font-black text-slate-600">{tier.rate}%</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">{tier.engaged} of {tier.count} engaged</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dark Chart - Timeline */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Activity Timeline</p>
                <div className="space-y-2.5">
                  {engagementMetrics.timeline.map((t, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <span className="text-[10px] font-bold text-slate-500 w-20">{t.label}</span>
                      <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full transition-all duration-700"
                          style={{ width: `${Math.round((t.count / engagementMetrics.maxTimeline) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-rose-400 w-6 text-right">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-rose-600 to-pink-600 rounded-2xl p-5 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">AI Engagement Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  {engagementMetrics.engagementScore >= 65
                    ? `Engagement score of ${engagementMetrics.engagementScore} indicates strong outreach performance. ${engagementMetrics.contactRate}% contact rate is ${engagementMetrics.contactRate >= 50 ? 'above' : 'near'} target.`
                    : engagementMetrics.tiers[0].count > 0 && engagementMetrics.tiers[0].rate < 50
                      ? `${engagementMetrics.tiers[0].count} critical leads with only ${engagementMetrics.tiers[0].rate}% engagement. Prioritize immediate outreach to prevent decay.`
                      : `Engagement at ${engagementMetrics.engagementScore}%. Increase touchpoints across all tiers \u2014 multi-channel campaigns can boost engagement by 40%.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Score Intelligence Panel */}
      {showScoreIntelligence && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowScoreIntelligence(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Score Intelligence</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Statistical analysis & top performers</p>
                </div>
                <button onClick={() => setShowScoreIntelligence(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <svg viewBox="0 0 96 96" className="w-28 h-28">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#d97706" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(scoreIntelligence.healthIndex / 100) * 251.3} 251.3`}
                      transform="rotate(-90 48 48)" className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">{scoreIntelligence.healthIndex}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Index</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Average', value: scoreIntelligence.avg.toString() },
                  { label: 'Median', value: scoreIntelligence.median.toString() },
                  { label: 'Std Dev', value: `\u00B1${scoreIntelligence.stdDev}` },
                  { label: 'Q3 (75th)', value: scoreIntelligence.quartiles.q3.toString() },
                ].map((card, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-slate-900">{card.value}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>

              {/* Quartile Visualization */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Score Quartiles</p>
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-2">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                  <div className="h-4 bg-slate-200 rounded-full overflow-hidden relative">
                    <div className="absolute h-full bg-amber-200 rounded-full" style={{ left: `${scoreIntelligence.quartiles.q1}%`, width: `${scoreIntelligence.quartiles.q3 - scoreIntelligence.quartiles.q1}%` }} />
                    <div className="absolute h-full w-0.5 bg-amber-600" style={{ left: `${scoreIntelligence.quartiles.q2}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] text-slate-400">Q1: {scoreIntelligence.quartiles.q1}</span>
                    <span className="text-[9px] font-bold text-amber-600">Median: {scoreIntelligence.quartiles.q2}</span>
                    <span className="text-[9px] text-slate-400">Q3: {scoreIntelligence.quartiles.q3}</span>
                  </div>
                </div>
              </div>

              {/* Top Performers */}
              {scoreIntelligence.topPerformers.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Top Performers</p>
                  <div className="space-y-1.5">
                    {scoreIntelligence.topPerformers.map((lead, i) => (
                      <button key={lead.id} onClick={() => navigate(`/portal/leads/${lead.id}`)}
                        className="w-full flex items-center space-x-3 p-2.5 rounded-xl hover:bg-slate-50 transition-all text-left group">
                        <span className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-[10px] font-black text-amber-700">
                          #{i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{lead.company}</p>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <StarRating score={lead.score} />
                          <span className="text-xs font-black text-slate-700">{lead.score}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* At-Risk Leads */}
              {scoreIntelligence.atRisk.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">At-Risk Leads</p>
                  <div className="space-y-1.5">
                    {scoreIntelligence.atRisk.map((lead) => (
                      <button key={lead.id} onClick={() => navigate(`/portal/leads/${lead.id}`)}
                        className="w-full flex items-center space-x-3 p-2.5 rounded-xl bg-red-50 hover:bg-red-100 transition-all text-left group">
                        <AlertTriangleIcon className="w-4 h-4 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{lead.name}</p>
                          <p className="text-[10px] text-red-500">{lead.company} &middot; Score: {lead.score}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dark Chart - Distribution */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Score Distribution (10-pt)</p>
                <div className="flex items-end justify-between h-24 space-x-1">
                  {scoreIntelligence.distribution.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center space-y-1">
                      <div className="w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-700"
                        style={{ height: `${Math.max(d.pct, 3)}%` }} />
                      <span className="text-[6px] font-bold text-slate-600">{d.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500">Low (&lt;30)</span>
                    <p className="text-xs font-black text-amber-400">{allLeads.filter(l => l.score < 30).length}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Mid (30-69)</span>
                    <p className="text-xs font-black text-amber-400">{allLeads.filter(l => l.score >= 30 && l.score < 70).length}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">High (70+)</span>
                    <p className="text-xs font-black text-amber-400">{allLeads.filter(l => l.score >= 70).length}</p>
                  </div>
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-5 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">AI Score Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  {scoreIntelligence.avg >= 65
                    ? `Average score of ${scoreIntelligence.avg} with \u00B1${scoreIntelligence.stdDev} deviation indicates a strong, consistent lead pool. Focus on nurturing mid-range leads to push them above 75.`
                    : scoreIntelligence.atRisk.length > 3
                      ? `${scoreIntelligence.atRisk.length} leads at risk with scores below 30. Consider re-engagement campaigns or cleanup to improve overall pipeline quality.`
                      : `Average score is ${scoreIntelligence.avg}. The Q3 at ${scoreIntelligence.quartiles.q3} suggests a top quartile with strong potential \u2014 prioritize those leads for conversion.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 font-heading">Keyboard Shortcuts</h2>
                <p className="text-xs text-slate-400 mt-0.5">Lead Management navigation & panels</p>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3">Navigation</p>
                <div className="space-y-2">
                  {[
                    ['j / k', 'Navigate leads'],
                    ['Enter', 'Open lead profile'],
                    ['x', 'Toggle select'],
                    ['v', 'Toggle view mode'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{key}</kbd>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-3">Panels</p>
                <div className="space-y-2">
                  {[
                    ['P', 'Pipeline Analytics'],
                    ['E', 'Engagement Metrics'],
                    ['S', 'Score Intelligence'],
                    ['?', 'This dialog'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{key}</kbd>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3">Actions</p>
                <div className="space-y-2">
                  {[
                    ['N', 'New lead'],
                    ['I', 'Import CSV'],
                    ['Esc', 'Close all panels'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{key}</kbd>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </AdvancedOnly>

      {/* Portal: Inline Status Dropdown */}
      {inlineStatusId && inlineStatusPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setInlineStatusId(null)} />
          <div className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[100px]" style={{ top: inlineStatusPos.top, left: inlineStatusPos.left }}>
            {STATUS_OPTIONS.map(s => {
              const current = paginatedLeads.find(l => l.id === inlineStatusId);
              return (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); handleStatusUpdate(inlineStatusId, s); setInlineStatusId(null); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    current?.status === s ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}

      {/* Portal: Actions Dropdown */}
      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!deleteLoading) { setDeleteConfirmOpen(false); setDeleteTargetIds([]); } }} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <AlertTriangleIcon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Delete {deleteTargetIds.length === 1 ? 'Lead' : `${deleteTargetIds.length} Leads`}?</h3>
              <p className="text-sm text-slate-500 mb-6">
                {deleteTargetIds.length === 1
                  ? 'This lead and all associated data will be permanently removed.'
                  : `${deleteTargetIds.length} leads and all associated data will be permanently removed.`}
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => { setDeleteConfirmOpen(false); setDeleteTargetIds([]); }}
                  disabled={deleteLoading}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleteLoading}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteLoading && (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" /></svg>
                  )}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {actionsDropdownId && actionsDropdownPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setActionsDropdownId(null)} />
          <div className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[130px] py-1" style={{ top: actionsDropdownPos.top, right: actionsDropdownPos.right }}>
            {(() => {
              const lead = paginatedLeads.find(l => l.id === actionsDropdownId);
              if (!lead) return null;
              return (
                <>
                  <button onClick={(ev) => { ev.stopPropagation(); openEditLead(lead); setActionsDropdownId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                    <PencilIcon className="w-3.5 h-3.5 text-amber-500" /> Edit
                  </button>
                  <button onClick={() => setActionsDropdownId(null)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                    <MailIcon className="w-3.5 h-3.5 text-blue-500" /> Email
                  </button>
                  <button onClick={() => setActionsDropdownId(null)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                    <PhoneIcon className="w-3.5 h-3.5 text-emerald-500" /> Call
                  </button>
                  {crmConnected && (
                    <button onClick={(ev) => { ev.stopPropagation(); handleSyncToCrm(lead.id); setActionsDropdownId(null); }} disabled={syncingCrm === lead.id} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      <GlobeIcon className="w-3.5 h-3.5 text-violet-500" /> Sync CRM
                    </button>
                  )}
                  <button onClick={() => { setActivityLogLead(lead); setActivityLogOpen(true); setActionsDropdownId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                    <EditIcon className="w-3.5 h-3.5 text-violet-500" /> Log Activity
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button onClick={() => { setDeleteTargetIds([lead.id]); setDeleteConfirmOpen(true); setActionsDropdownId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50">
                    <TrashIcon className="w-3.5 h-3.5" /> Delete
                  </button>
                </>
              );
            })()}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default LeadManagement;
