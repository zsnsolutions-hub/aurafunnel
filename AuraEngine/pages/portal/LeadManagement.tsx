import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Lead, User, ContentType } from '../../types';
import { TargetIcon, FlameIcon, SparklesIcon, MailIcon, PhoneIcon, EyeIcon, FilterIcon, DownloadIcon, PlusIcon, TagIcon, XIcon, CheckIcon } from '../../components/Icons';
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

const ALL_TAGS: LeadTag[] = ['Hot Lead', 'Cold', 'Nurturing', 'Enterprise', 'Critical', 'Warm'];
const STATUS_OPTIONS: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Lost'];
const ACTIVITY_OPTIONS = ['Today', 'This Week', 'This Month', 'All Time'] as const;
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
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
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);

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

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q)
      );
    }

    // Status
    if (statusFilter !== 'All') {
      result = result.filter(l => l.status === statusFilter);
    }

    // Score
    if (scoreFilter === '50-100') result = result.filter(l => l.score >= 50);
    if (scoreFilter === 'below-50') result = result.filter(l => l.score < 50);

    // Activity
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

    // Tags
    if (tagFilter.size > 0) {
      result = result.filter(l => tagFilter.has(getLeadTag(l)));
    }

    return result;
  }, [allLeads, searchQuery, statusFilter, scoreFilter, activityFilter, companySizeFilter, tagFilter]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PER_PAGE));
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return filteredLeads.slice(start, start + PER_PAGE);
  }, [filteredLeads, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, scoreFilter, activityFilter, companySizeFilter, tagFilter, searchQuery]);

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

  // ── Actions ──
  const clearFilters = () => {
    setStatusFilter('All');
    setScoreFilter('all');
    setActivityFilter('All Time');
    setCompanySizeFilter(new Set());
    setTagFilter(new Set());
    setSearchQuery('');
  };

  const handleStatusUpdate = (leadId: string, newStatus: Lead['status']) => {
    setAllLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    ));
    if (selectedLead?.id === leadId) {
      setSelectedLead({ ...selectedLead, status: newStatus, lastActivity: `Status changed to ${newStatus}` });
    }
  };

  const handleBulkStatusChange = async (status: Lead['status']) => {
    const ids = Array.from(selectedIds);
    await supabase.from('leads').update({ status }).in('id', ids);
    setAllLeads(prev => prev.map(l => ids.includes(l.id) ? { ...l, status } : l));
    setSelectedIds(new Set());
    setBulkStatusOpen(false);
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

  const activeFilterCount = [
    statusFilter !== 'All',
    scoreFilter !== 'all',
    activityFilter !== 'All Time',
    companySizeFilter.size > 0,
    tagFilter.size > 0,
  ].filter(Boolean).length;

  const rangeStart = (currentPage - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * PER_PAGE, filteredLeads.length);

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
            <div className="mb-6">
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

            {/* Action Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={clearFilters}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* ── LEAD LIST (75%) ── */}
        <div className="w-full lg:w-[75%] space-y-4">
          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between animate-in fade-in duration-300">
              <span className="text-sm font-bold text-indigo-700">
                {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                <div className="relative">
                  <button
                    onClick={() => setBulkStatusOpen(!bulkStatusOpen)}
                    className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                  >
                    Change Status
                  </button>
                  {bulkStatusOpen && (
                    <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden min-w-[140px]">
                      {STATUS_OPTIONS.map(s => (
                        <button key={s} onClick={() => handleBulkStatusChange(s)} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleExportSelected}
                  className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                >
                  Export Selected
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {/* Lead Table */}
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
                    <th className="px-4 py-4">Name</th>
                    <th className="px-4 py-4">Company</th>
                    <th className="px-4 py-4 text-center">Score</th>
                    <th className="px-4 py-4">Last Activity</th>
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
                  ) : paginatedLeads.map(lead => {
                    const tag = getLeadTag(lead);
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors group">
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
                          <div className="flex flex-col items-center space-y-1">
                            <StarRating score={lead.score} />
                            <span className="text-[10px] font-black text-slate-700">{lead.score}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-500 font-medium">{formatRelativeTime(lead.created_at || lead.lastActivity)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${TAG_COLORS[tag]}`}>
                            {tag}
                          </span>
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
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
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
        </div>
      </div>

      {/* ── MODALS ── */}

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
