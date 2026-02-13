import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Lead, User, ContentType } from '../../types';
import { TargetIcon, FlameIcon, SparklesIcon, MailIcon, PhoneIcon, EyeIcon, FilterIcon, DownloadIcon, PlusIcon, TagIcon, XIcon, CheckIcon, ClockIcon, CalendarIcon, BoltIcon, UsersIcon, EditIcon, AlertTriangleIcon, TrendUpIcon, TrendDownIcon, GridIcon, ListIcon, BrainIcon } from '../../components/Icons';
import { supabase } from '../../lib/supabase';
import { useOutletContext, useNavigate } from 'react-router-dom';
import LeadActionsModal from '../../components/dashboard/LeadActionsModal';
import CSVImportModal from '../../components/dashboard/CSVImportModal';

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
type BulkAction = 'campaign' | 'assign' | 'status' | 'tag' | 'export' | 'email';

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
const STATUS_OPTIONS: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Lost'];
const ACTIVITY_OPTIONS = ['Today', 'This Week', 'This Month', 'All Time'] as const;
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
const CAMPAIGNS = ['Q4 Tech Nurture', 'Enterprise Outreach', 'Product Launch', 'Re-engagement', 'Cold Outreach'] as const;
const TEAM_MEMBERS = ['Sarah Johnson', 'Mike Chen', 'Emma Davis', 'Alex Kim', 'Chris Park'] as const;
const PER_PAGE = 50;

const LeadManagement: React.FC = () => {
  const { user } = useOutletContext<{ user: User }>();
  const navigate = useNavigate();

  // ── Data State ──
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filter State ──
  const [statusFilter, setStatusFilter] = useState<Lead['status'] | 'All'>('All');
  const [scoreFilter, setScoreFilter] = useState<'all' | '50-100' | 'below-50'>('all');
  const [activityFilter, setActivityFilter] = useState<typeof ACTIVITY_OPTIONS[number]>('All Time');
  const [companySizeFilter, setCompanySizeFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<LeadTag>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // ── Selection State ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(1);

  // ── Modals ──
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isCSVOpen, setIsCSVOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', insights: '' });

  // ── Bulk Actions ──
  const [bulkActionOpen, setBulkActionOpen] = useState<BulkAction | null>(null);
  const [bulkCampaign, setBulkCampaign] = useState(CAMPAIGNS[0]);
  const [bulkAssignee, setBulkAssignee] = useState(TEAM_MEMBERS[0]);
  const [bulkTag, setBulkTag] = useState<LeadTag>('Hot Lead');
  const [bulkAIPersonalize, setBulkAIPersonalize] = useState(true);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Inline Status Edit ──
  const [inlineStatusId, setInlineStatusId] = useState<string | null>(null);

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

  // ── Fetch ──
  useEffect(() => {
    fetchLeads();
  }, [user]);

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('client_id', user.id)
      .order('score', { ascending: false });
    if (data) setAllLeads(data);
    setLoading(false);
  };

  // ── Filtering ──
  const filteredLeads = useMemo(() => {
    let result = [...allLeads];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q)
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
  }, [allLeads, searchQuery, statusFilter, scoreFilter, activityFilter, companySizeFilter, tagFilter, sortBy, sortDir]);

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

  // ── Kanban Grouped Leads ──
  const kanbanColumns = useMemo(() => {
    const columns: Record<Lead['status'], Lead[]> = { New: [], Contacted: [], Qualified: [], Lost: [] };
    filteredLeads.forEach(l => { if (columns[l.status]) columns[l.status].push(l); });
    return columns;
  }, [filteredLeads]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PER_PAGE));
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return filteredLeads.slice(start, start + PER_PAGE);
  }, [filteredLeads, currentPage]);

  useEffect(() => { setCurrentPage(1); setFocusedIndex(-1); }, [statusFilter, scoreFilter, activityFilter, companySizeFilter, tagFilter, searchQuery]);

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
    setSearchQuery('');
  };

  const handleStatusUpdate = async (leadId: string, newStatus: Lead['status']) => {
    setAllLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    ));
    if (selectedLead?.id === leadId) {
      setSelectedLead({ ...selectedLead, status: newStatus, lastActivity: `Status changed to ${newStatus}` });
    }
    await supabase.from('leads').update({ status: newStatus }).eq('id', leadId);
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

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const mockScore = Math.floor(Math.random() * 40) + 60;
    const { data } = await supabase
      .from('leads')
      .insert([{ ...newLead, client_id: user.id, score: mockScore, status: 'New', lastActivity: 'Just now' }])
      .select()
      .single();
    if (data) {
      setAllLeads(prev => [data, ...prev]);
      setIsAddLeadOpen(false);
      setNewLead({ name: '', email: '', company: '', insights: '' });
      setQuickInsightLead(data);
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
    await supabase.from('leads').update({ status }).in('id', ids);
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
      if (isInput || isActionsOpen || isCSVOpen || isAddLeadOpen || activityLogOpen) return;

      if (e.key === 'j') { setFocusedIndex(prev => Math.min(prev + 1, paginatedLeads.length - 1)); return; }
      if (e.key === 'k') { setFocusedIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < paginatedLeads.length) {
        e.preventDefault(); navigate(`/portal/leads/${paginatedLeads[focusedIndex].id}`); return;
      }
      if (e.key === 'v') { setViewMode(prev => prev === 'table' ? 'kanban' : 'table'); return; }
      if (e.key === 'n') { e.preventDefault(); setIsAddLeadOpen(true); return; }
      if (e.key === 'i') { e.preventDefault(); setIsCSVOpen(true); return; }
      if (e.key === 'x' && focusedIndex >= 0 && focusedIndex < paginatedLeads.length) {
        toggleSelect(paginatedLeads[focusedIndex].id); return;
      }
      if (e.key === 'Escape') { setQuickInsightLead(null); setBulkActionOpen(null); setInlineStatusId(null); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, paginatedLeads.length, focusedIndex, isActionsOpen, isCSVOpen, isAddLeadOpen, activityLogOpen]);

  const activeFilterCount = [
    statusFilter !== 'All', scoreFilter !== 'all', activityFilter !== 'All Time',
    companySizeFilter.size > 0, tagFilter.size > 0,
  ].filter(Boolean).length;

  const rangeStart = (currentPage - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * PER_PAGE, filteredLeads.length);

  const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
    call: <PhoneIcon className="w-4 h-4" />,
    email: <MailIcon className="w-4 h-4" />,
    meeting: <CalendarIcon className="w-4 h-4" />,
    note: <EditIcon className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2 text-sm text-slate-400">
          <span className="font-bold text-slate-800 text-2xl font-heading">Leads</span>
          <span className="text-slate-300">/</span>
          <span>All Leads</span>
          <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-bold uppercase tracking-widest">
            {filteredLeads.length.toLocaleString()} total
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsCSVOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
          >
            <DownloadIcon className="w-4 h-4" />
            <span>Import</span>
          </button>
          <button
            onClick={handleExportSelected}
            disabled={selectedIds.size === 0}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DownloadIcon className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button
            onClick={() => setIsAddLeadOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* ── KPI Stats Banner ── */}
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

      {/* ── AI Lead Health Summary ── */}
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

      {/* ── Two Panel Layout: Filters (25%) + Lead List (75%) ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── FILTER PANEL (25%) ── */}
        <div className="w-full lg:w-[25%] space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2">
                <FilterIcon className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-800 font-heading text-sm">Filters</h3>
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 bg-indigo-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </div>
            </div>

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
          </div>

          {/* Keyboard Shortcuts */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Keyboard Shortcuts</p>
            <div className="space-y-1.5">
              {[
                ['j / k', 'Navigate leads'],
                ['Enter', 'Open lead'],
                ['x', 'Toggle select'],
                ['v', 'Toggle view'],
                ['n', 'New lead'],
                ['i', 'Import CSV'],
                ['Esc', 'Close panels'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold text-slate-500">{key}</kbd>
                  <span className="text-[10px] text-slate-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── LEAD LIST (75%) ── */}
        <div className="w-full lg:w-[75%] space-y-4">

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
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 animate-in fade-in duration-300">
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
              </div>
            </div>
          )}

          {/* Kanban / Pipeline View */}
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(STATUS_OPTIONS as readonly Lead['status'][]).map(status => {
                const statusColors: Record<string, { bg: string; border: string; badge: string; dot: string }> = {
                  New: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
                  Contacted: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
                  Qualified: { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
                  Lost: { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
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
                        return (
                          <button
                            key={lead.id}
                            onClick={() => navigate(`/portal/leads/${lead.id}`)}
                            className="w-full text-left bg-white rounded-xl border border-slate-100 p-3.5 hover:shadow-md hover:border-indigo-200 transition-all group"
                          >
                            <div className="flex items-center space-x-2.5 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors flex-shrink-0">
                                {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{lead.company}</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <StarRating score={lead.score} />
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${TAG_COLORS[tag]}`}>{tag}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[10px] text-slate-400">{formatRelativeTime(lead.created_at || lead.lastActivity)}</span>
                              <span className="text-[10px] font-black text-slate-600">{lead.score}</span>
                            </div>
                          </button>
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                    <th className="px-4 py-4">Tags</th>
                    <th className="px-4 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={7} className="px-4 py-4">
                          <div className="h-10 bg-slate-50 animate-pulse rounded-xl"></div>
                        </td>
                      </tr>
                    ))
                  ) : paginatedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
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
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => navigate(`/portal/leads/${lead.id}`)}
                            className="flex items-center space-x-3 text-left"
                          >
                            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-[11px] text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors flex-shrink-0">
                              {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">{lead.email}</p>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 font-medium">{lead.company}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col items-center space-y-1.5">
                            <StarRating score={lead.score} />
                            <div className="flex items-center space-x-1.5">
                              <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    lead.score >= 76 ? 'bg-rose-500' : lead.score >= 51 ? 'bg-amber-500' : lead.score >= 26 ? 'bg-emerald-500' : 'bg-blue-400'
                                  }`}
                                  style={{ width: `${lead.score}%` }}
                                ></div>
                              </div>
                              <span className="text-[10px] font-black text-slate-700">{lead.score}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-500 font-medium">{formatRelativeTime(lead.created_at || lead.lastActivity)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center space-x-1.5">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${TAG_COLORS[tag]}`}>
                              {tag}
                            </span>
                            {/* Inline Status */}
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setInlineStatusId(inlineStatusId === lead.id ? null : lead.id); }}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                                  lead.status === 'New' ? 'bg-emerald-50 text-emerald-600' :
                                  lead.status === 'Contacted' ? 'bg-blue-50 text-blue-600' :
                                  lead.status === 'Qualified' ? 'bg-violet-50 text-violet-600' :
                                  'bg-slate-50 text-slate-500'
                                } hover:ring-1 hover:ring-indigo-200`}
                              >
                                {lead.status}
                              </button>
                              {inlineStatusId === lead.id && (
                                <div className="absolute top-full mt-1 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden min-w-[120px]">
                                  {STATUS_OPTIONS.map(s => (
                                    <button
                                      key={s}
                                      onClick={(e) => { e.stopPropagation(); handleStatusUpdate(lead.id, s); setInlineStatusId(null); }}
                                      className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${
                                        lead.status === s ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => navigate(`/portal/leads/${lead.id}`)}
                              title="View"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                            <button
                              title="Email"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            >
                              <MailIcon className="w-4 h-4" />
                            </button>
                            <button
                              title="Call"
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            >
                              <PhoneIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setActivityLogLead(lead); setActivityLogOpen(true); }}
                              title="Log Activity"
                              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all"
                            >
                              <EditIcon className="w-4 h-4" />
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
                <p className="text-xs text-slate-500 font-medium">
                  {rangeStart}-{rangeEnd} of {filteredLeads.length.toLocaleString()} leads
                </p>
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
          onSendEmail={() => {}}
          manualLists={[]}
          onAddToManualList={() => {}}
        />
      )}

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={isCSVOpen}
        onClose={() => setIsCSVOpen(false)}
        userId={user.id}
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
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 p-10 flex flex-col">
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Insights</label>
                <textarea rows={4} value={newLead.insights} onChange={e => setNewLead({...newLead, insights: e.target.value})} placeholder="What do we know?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none focus:border-indigo-300 transition-colors"></textarea>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-4 flex items-start space-x-3">
                <SparklesIcon className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-indigo-700">AI Auto-Research</p>
                  <p className="text-[11px] text-indigo-600 mt-0.5">After saving, AI will automatically research the company and enrich the lead profile with scoring insights.</p>
                </div>
              </div>
              <div className="pt-6">
                <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-colors">Create Lead Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadManagement;
