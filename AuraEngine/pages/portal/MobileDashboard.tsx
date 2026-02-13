import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { User, Lead } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  TargetIcon, SparklesIcon, FlameIcon, CheckIcon, ClockIcon,
  MailIcon, PhoneIcon, EditIcon, CalendarIcon, PlusIcon,
  UsersIcon, PieChartIcon, GitBranchIcon, ChartIcon, RefreshIcon,
  BoltIcon, XIcon, CogIcon, TrendUpIcon, BellIcon, ArrowRightIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

interface ActivityItem {
  id: string;
  icon: React.ReactNode;
  text: string;
  time: string;
  color: string;
}

const MobileDashboard: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [swipedLeadId, setSwipedLeadId] = useState<string | null>(null);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Fetch Data ───
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', user.id)
        .order('score', { ascending: false });
      setLeads((data || []) as Lead[]);
    } catch (err) {
      console.error('Mobile fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Pull-to-Refresh simulation ───
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().then(() => {
      setTimeout(() => setRefreshing(false), 600);
    });
  }, [fetchData]);

  // ─── Computed Data ───
  const hotLeads = useMemo(() => leads.filter(l => l.score > 80), [leads]);
  const newLeads = useMemo(() => leads.filter(l => l.status === 'New'), [leads]);
  const avgScore = useMemo(() => {
    if (leads.length === 0) return 0;
    return Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length);
  }, [leads]);

  const priorities = useMemo(() => {
    const items: { id: string; text: string; score?: number; type: 'lead' | 'task' }[] = [];

    // Top hot lead to follow up
    if (hotLeads.length > 0) {
      const top = hotLeads[0];
      items.push({ id: top.id, text: `Follow up with ${top.company}`, score: top.score, type: 'lead' });
    }

    // New hot leads count
    if (hotLeads.length > 1) {
      items.push({ id: 'hot-review', text: `Review new hot leads (${hotLeads.length})`, type: 'task' });
    }

    // Uncontacted leads
    if (newLeads.length > 0) {
      items.push({ id: 'new-outreach', text: `Reach out to ${newLeads.length} new lead${newLeads.length > 1 ? 's' : ''}`, type: 'task' });
    }

    // Always suggest content
    items.push({ id: 'content', text: 'Approve campaign content', type: 'task' });

    return items.slice(0, 4);
  }, [hotLeads, newLeads]);

  const recentActivity = useMemo((): ActivityItem[] => {
    const items: ActivityItem[] = [];

    if (hotLeads.length > 0) {
      items.push({
        id: 'act-1',
        icon: <FlameIcon className="w-4 h-4" />,
        text: `New hot lead: ${hotLeads[0].company} (${hotLeads[0].score})`,
        time: '2m ago',
        color: 'rose',
      });
    }

    items.push({
      id: 'act-2',
      icon: <SparklesIcon className="w-4 h-4" />,
      text: 'AI generated content for campaign',
      time: '15m ago',
      color: 'indigo',
    });

    if (leads.length > 0) {
      const contacted = leads.find(l => l.status === 'Contacted');
      if (contacted) {
        items.push({
          id: 'act-3',
          icon: <MailIcon className="w-4 h-4" />,
          text: `${contacted.name} responded to email`,
          time: '1h ago',
          color: 'emerald',
        });
      }
    }

    items.push({
      id: 'act-4',
      icon: <TrendUpIcon className="w-4 h-4" />,
      text: 'Pipeline score improved by 4 points',
      time: '3h ago',
      color: 'violet',
    });

    items.push({
      id: 'act-5',
      icon: <BoltIcon className="w-4 h-4" />,
      text: 'Automation workflow processed 12 leads',
      time: '5h ago',
      color: 'amber',
    });

    return items.slice(0, 5);
  }, [hotLeads, leads]);

  const pendingTasks = useMemo(() => {
    return newLeads.length + (hotLeads.length > 0 ? 1 : 0) + 2; // simulated pending tasks
  }, [newLeads, hotLeads]);

  // ─── Handlers ───
  const handleSwipeToggle = (leadId: string) => {
    setSwipedLeadId(swipedLeadId === leadId ? null : leadId);
  };

  const handleSaveNote = () => {
    if (!quickNote.trim()) return;
    setNoteSaved(true);
    setTimeout(() => {
      setQuickNote('');
      setQuickNoteOpen(false);
      setNoteSaved(false);
    }, 1200);
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-w-md mx-auto space-y-5">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MOBILE HEADER                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg">A</div>
          <div>
            <h1 className="text-lg font-black text-slate-900 font-heading tracking-tight">AuraFunnel AI</h1>
            <p className="text-[10px] text-slate-400 font-semibold">Welcome back, {user.name?.split(' ')[0] || 'User'}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <RefreshIcon className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Notification badge */}
          <button className="relative p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <BellIcon className="w-5 h-5" />
            {hotLeads.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                {hotLeads.length}
              </span>
            )}
          </button>

          {/* Menu */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div className="flex items-center justify-center py-2">
          <div className="flex items-center space-x-2 text-indigo-600">
            <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <span className="text-xs font-bold">Updating...</span>
          </div>
        </div>
      )}

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setMenuOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">{user.plan} Plan</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-4 space-y-1">
              {[
                { label: 'Dashboard', path: '/portal', icon: <TargetIcon className="w-4 h-4" /> },
                { label: 'Leads', path: '/portal/leads', icon: <UsersIcon className="w-4 h-4" /> },
                { label: 'Content Studio', path: '/portal/content', icon: <SparklesIcon className="w-4 h-4" /> },
                { label: 'Analytics', path: '/portal/analytics', icon: <PieChartIcon className="w-4 h-4" /> },
                { label: 'Automation', path: '/portal/automation', icon: <GitBranchIcon className="w-4 h-4" /> },
                { label: 'Settings', path: '/portal/settings', icon: <CogIcon className="w-4 h-4" /> },
              ].map(item => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMenuOpen(false); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
                >
                  <span className="text-slate-400">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TODAY'S PRIORITIES                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <TargetIcon className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Today's Priorities</h2>
        </div>

        <div className="space-y-2">
          {priorities.map((item, i) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.type === 'lead' && item.id !== 'hot-review' && item.id !== 'new-outreach' && item.id !== 'content') {
                  navigate(`/portal/leads/${item.id}`);
                }
              }}
              className="w-full flex items-center space-x-3 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 transition-all text-left group"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                i === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{item.text}</p>
              </div>
              {item.score && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-black shrink-0">
                  {item.score}
                </span>
              )}
              <ArrowRightIcon className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* QUICK STATS                                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Leads', value: leads.length, color: 'indigo', icon: <UsersIcon className="w-4 h-4" />, path: '/portal/leads' },
          { label: 'Hot', value: hotLeads.length, color: 'rose', icon: <FlameIcon className="w-4 h-4" />, path: '/portal/leads' },
          { label: 'Tasks', value: pendingTasks, color: 'amber', icon: <CheckIcon className="w-4 h-4" />, path: '/portal/automation' },
          { label: 'AI', value: `${avgScore}%`, color: 'emerald', icon: <SparklesIcon className="w-4 h-4" />, path: '/portal/analytics' },
        ].map((stat, i) => (
          <button
            key={i}
            onClick={() => navigate(stat.path)}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 text-center hover:shadow-md hover:border-slate-200 transition-all active:scale-95"
          >
            <div className={`w-8 h-8 rounded-xl bg-${stat.color}-50 flex items-center justify-center text-${stat.color}-600 mx-auto mb-2`}>
              {stat.icon}
            </div>
            <p className="text-xl font-black text-slate-900">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* RECENT ACTIVITY                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <BellIcon className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Recent Activity</h2>
          </div>
          <span className="text-[10px] font-bold text-slate-400">Live</span>
        </div>

        <div className="space-y-1">
          {recentActivity.map(item => (
            <div
              key={item.id}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg bg-${item.color}-50 flex items-center justify-center text-${item.color}-600 shrink-0`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 truncate">{item.text}</p>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TOP LEADS (Swipeable)                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {hotLeads.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <FlameIcon className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Hot Leads</h2>
            <span className="text-[10px] font-bold text-slate-400 ml-auto">Swipe for actions</span>
          </div>

          <div className="space-y-2">
            {hotLeads.slice(0, 4).map(lead => (
              <div key={lead.id} className="relative overflow-hidden rounded-xl">
                {/* Swipe Actions (revealed on swipe) */}
                {swipedLeadId === lead.id && (
                  <div className="absolute right-0 top-0 bottom-0 flex items-center space-x-1.5 pr-2 bg-gradient-to-l from-slate-100 to-transparent pl-8 z-10">
                    <button
                      onClick={() => navigate(`/portal/leads/${lead.id}`)}
                      className="p-2 bg-indigo-600 text-white rounded-lg shadow-lg active:scale-95 transition-transform"
                      title="View"
                    >
                      <ArrowRightIcon className="w-4 h-4" />
                    </button>
                    <button className="p-2 bg-emerald-600 text-white rounded-lg shadow-lg active:scale-95 transition-transform" title="Call">
                      <PhoneIcon className="w-4 h-4" />
                    </button>
                    <button className="p-2 bg-violet-600 text-white rounded-lg shadow-lg active:scale-95 transition-transform" title="Email">
                      <MailIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => handleSwipeToggle(lead.id)}
                  className={`w-full flex items-center space-x-3 p-3 bg-slate-50 rounded-xl text-left transition-transform ${
                    swipedLeadId === lead.id ? '-translate-x-28' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-sm shrink-0">
                    {lead.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{lead.name}</p>
                    <p className="text-xs text-slate-400 truncate">{lead.company}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-black ${
                      lead.score > 90 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {lead.score}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{lead.status}</p>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* QUICK ACTIONS                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <BoltIcon className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Quick Actions</h2>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: 'Call Lead', icon: <PhoneIcon className="w-5 h-5" />, color: 'indigo', action: () => { if (hotLeads[0]) navigate(`/portal/leads/${hotLeads[0].id}`); } },
            { label: 'Send Email', icon: <MailIcon className="w-5 h-5" />, color: 'violet', action: () => navigate('/portal/content') },
            { label: 'Quick Note', icon: <EditIcon className="w-5 h-5" />, color: 'amber', action: () => setQuickNoteOpen(true) },
            { label: 'Schedule', icon: <CalendarIcon className="w-5 h-5" />, color: 'emerald', action: () => navigate('/portal/automation') },
          ].map((action, i) => (
            <button
              key={i}
              onClick={action.action}
              className={`flex items-center space-x-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-${action.color}-50 hover:border-${action.color}-200 transition-all active:scale-95`}
            >
              <div className={`w-10 h-10 rounded-xl bg-${action.color}-100 flex items-center justify-center text-${action.color}-600`}>
                {action.icon}
              </div>
              <span className="text-sm font-bold text-slate-700">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* NAVIGATION GRID                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
            <ChartIcon className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Navigation</h2>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Leads', icon: <UsersIcon className="w-5 h-5" />, path: '/portal/leads', color: 'indigo' },
            { label: 'Content', icon: <SparklesIcon className="w-5 h-5" />, path: '/portal/content', color: 'violet' },
            { label: 'Analytics', icon: <PieChartIcon className="w-5 h-5" />, path: '/portal/analytics', color: 'emerald' },
            { label: 'Automation', icon: <GitBranchIcon className="w-5 h-5" />, path: '/portal/automation', color: 'amber' },
            { label: 'Strategy', icon: <BoltIcon className="w-5 h-5" />, path: '/portal/strategy', color: 'rose' },
            { label: 'Settings', icon: <CogIcon className="w-5 h-5" />, path: '/portal/settings', color: 'slate' },
          ].map((nav, i) => (
            <button
              key={i}
              onClick={() => navigate(nav.path)}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 hover:bg-white hover:shadow-md border border-transparent hover:border-slate-200 transition-all active:scale-95"
            >
              <div className={`w-10 h-10 rounded-xl bg-${nav.color}-50 flex items-center justify-center text-${nav.color}-600 mb-2`}>
                {nav.icon}
              </div>
              <span className="text-xs font-bold text-slate-600">{nav.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* INTERACTION HINTS                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 shadow-lg">
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-2.5">Mobile Gestures</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { gesture: 'Tap lead', action: 'Toggle actions' },
            { gesture: 'Pull down', action: 'Refresh data' },
            { gesture: 'Tap stats', action: 'Drill down' },
            { gesture: 'Tap priority', action: 'Navigate' },
          ].map((hint, i) => (
            <div key={i} className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
              <p className="text-[11px] text-slate-400">
                <span className="font-bold text-slate-300">{hint.gesture}</span> &rarr; {hint.action}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* QUICK NOTE MODAL                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {quickNoteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setQuickNoteOpen(false)}>
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl p-6 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-black text-slate-900 mb-3">Quick Note</h3>

            {noteSaved ? (
              <div className="flex items-center justify-center space-x-2 py-8">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="font-bold text-emerald-700">Note saved!</span>
              </div>
            ) : (
              <>
                <textarea
                  value={quickNote}
                  onChange={e => setQuickNote(e.target.value)}
                  placeholder="Type your note here..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none mb-3"
                  autoFocus
                />
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleSaveNote}
                    disabled={!quickNote.trim()}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95"
                  >
                    Save Note
                  </button>
                  <button
                    onClick={() => setQuickNoteOpen(false)}
                    className="px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileDashboard;
