import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { User, Lead } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  TargetIcon, SparklesIcon, FlameIcon, CheckIcon, ClockIcon,
  MailIcon, PhoneIcon, EditIcon, CalendarIcon, PlusIcon,
  UsersIcon, PieChartIcon, GitBranchIcon, ChartIcon, RefreshIcon,
  BoltIcon, XIcon, CogIcon, TrendUpIcon, BellIcon, ArrowRightIcon,
  WifiOffIcon, MicIcon, CameraIcon, MapPinIcon, SyncIcon, RocketIcon,
  ShieldIcon, StarIcon, BrainIcon, MessageIcon
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

interface Notification {
  id: string;
  type: 'hot_lead' | 'team_mention' | 'campaign' | 'system';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

type MobileTab = 'dashboard' | 'notifications' | 'checklists' | 'onboarding';
type ChecklistPeriod = 'morning' | 'midday' | 'evening';
type WeeklyDay = 'monday' | 'wednesday' | 'friday';
type OnboardingWeek = 1 | 2 | 3 | 4;

// ─── Notification Data ───
const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'hot_lead', title: 'Hot Lead Alert', body: 'Sarah Chen at TechCorp just hit score 94 - schedule a call now!', time: '2m ago', read: false },
  { id: 'n2', type: 'team_mention', title: '@you in Strategy Notes', body: 'Alex mentioned you: "Can you review the Q4 pipeline forecast?"', time: '15m ago', read: false },
  { id: 'n3', type: 'campaign', title: 'Campaign Performance', body: 'Email sequence "Re-engagement" hit 34% open rate (+8% vs last week)', time: '1h ago', read: false },
  { id: 'n4', type: 'hot_lead', title: 'Lead Score Spike', body: 'Marcus Johnson visited pricing page 3 times today - score jumped to 87', time: '2h ago', read: true },
  { id: 'n5', type: 'system', title: 'Weekly Report Ready', body: 'Your weekly analytics report has been generated and is ready for review', time: '5h ago', read: true },
  { id: 'n6', type: 'campaign', title: 'Content Published', body: 'Blog post "5 SaaS Growth Hacks" auto-published with 12 social shares', time: '8h ago', read: true },
];

const NOTIFICATION_META: Record<string, { icon: React.ReactNode; color: string }> = {
  hot_lead: { icon: <FlameIcon className="w-4 h-4" />, color: 'rose' },
  team_mention: { icon: <MessageIcon className="w-4 h-4" />, color: 'indigo' },
  campaign: { icon: <ChartIcon className="w-4 h-4" />, color: 'emerald' },
  system: { icon: <BellIcon className="w-4 h-4" />, color: 'slate' },
};

// ─── Daily Checklist Items ───
const DAILY_CHECKLISTS: Record<ChecklistPeriod, { label: string; time: string; items: { id: string; text: string; tip?: string }[] }> = {
  morning: {
    label: 'Morning Routine',
    time: '8:00 - 9:00 AM',
    items: [
      { id: 'dm1', text: 'Review overnight lead notifications', tip: 'Check hot lead alerts first' },
      { id: 'dm2', text: 'Scan daily briefing dashboard', tip: 'Note any score changes above 10 pts' },
      { id: 'dm3', text: 'Prioritize top 3 follow-ups for the day' },
      { id: 'dm4', text: 'Check campaign performance metrics', tip: 'Flag anything with <15% open rate' },
      { id: 'dm5', text: 'Review AI recommendations' },
    ],
  },
  midday: {
    label: 'Mid-Day Check',
    time: '12:00 - 1:00 PM',
    items: [
      { id: 'dd1', text: 'Follow up on morning outreach', tip: 'Reply within 2h for best conversion' },
      { id: 'dd2', text: 'Review new incoming leads' },
      { id: 'dd3', text: 'Approve AI-generated content drafts' },
      { id: 'dd4', text: 'Check automation workflow status' },
      { id: 'dd5', text: 'Update lead notes from meetings' },
    ],
  },
  evening: {
    label: 'End of Day Wrap',
    time: '5:00 - 6:00 PM',
    items: [
      { id: 'de1', text: 'Log all conversations and touchpoints' },
      { id: 'de2', text: 'Update lead stages for progressed leads' },
      { id: 'de3', text: 'Set tomorrow\'s priority tasks' },
      { id: 'de4', text: 'Schedule any needed follow-up emails', tip: 'Use AI to draft sequences' },
      { id: 'de5', text: 'Review daily analytics summary' },
    ],
  },
};

// ─── Weekly Checklist Items ───
const WEEKLY_CHECKLISTS: Record<WeeklyDay, { label: string; items: { id: string; text: string }[] }> = {
  monday: {
    label: 'Monday - Pipeline Review',
    items: [
      { id: 'wm1', text: 'Review full pipeline health metrics' },
      { id: 'wm2', text: 'Identify stale leads (no activity 7+ days)' },
      { id: 'wm3', text: 'Plan content calendar for the week' },
      { id: 'wm4', text: 'Set weekly conversion targets' },
    ],
  },
  wednesday: {
    label: 'Wednesday - Optimization',
    items: [
      { id: 'ww1', text: 'A/B test email subject lines' },
      { id: 'ww2', text: 'Review and adjust automation workflows' },
      { id: 'ww3', text: 'Analyze top-performing content' },
      { id: 'ww4', text: 'Train AI model on new lead data' },
    ],
  },
  friday: {
    label: 'Friday - Review & Plan',
    items: [
      { id: 'wf1', text: 'Generate weekly performance report' },
      { id: 'wf2', text: 'Review conversion funnel metrics' },
      { id: 'wf3', text: 'Clean up lead database (duplicates, outdated)' },
      { id: 'wf4', text: 'Plan next week\'s strategy adjustments' },
    ],
  },
};

// ─── 30-Day Onboarding Plan ───
const ONBOARDING_WEEKS: { week: OnboardingWeek; title: string; subtitle: string; color: string; tasks: { id: string; text: string; detail: string }[] }[] = [
  {
    week: 1, title: 'Foundation', subtitle: 'Set up your workspace', color: 'indigo',
    tasks: [
      { id: 'o1a', text: 'Complete profile setup', detail: 'Add your name, company, and avatar in Account Settings' },
      { id: 'o1b', text: 'Import your first leads', detail: 'Use CSV import or add leads manually from the Lead Management page' },
      { id: 'o1c', text: 'Connect integrations', detail: 'Link your email, CRM, or social accounts in Integration Hub' },
      { id: 'o1d', text: 'Explore the dashboard', detail: 'Familiarize with Quick Stats, AI Insights, and Activity Feed sections' },
      { id: 'o1e', text: 'Set up notifications', detail: 'Configure hot lead alerts and campaign notifications in Settings' },
    ],
  },
  {
    week: 2, title: 'Core Operations', subtitle: 'Master daily workflows', color: 'violet',
    tasks: [
      { id: 'o2a', text: 'Score your first 10 leads', detail: 'Review lead scores and adjust criteria in Lead Intelligence page' },
      { id: 'o2b', text: 'Generate AI content', detail: 'Create your first email sequence in the Neural Studio' },
      { id: 'o2c', text: 'Build an automation workflow', detail: 'Use the 4-step wizard in Automation Engine to create a nurture flow' },
      { id: 'o2d', text: 'Set daily check-in routine', detail: 'Follow the Daily Checklist (morning, midday, evening) from Mobile Dashboard' },
      { id: 'o2e', text: 'Review your first analytics', detail: 'Generate a report in Analytics Hub covering lead acquisition and scoring' },
    ],
  },
  {
    week: 3, title: 'Advanced Features', subtitle: 'Level up your strategy', color: 'emerald',
    tasks: [
      { id: 'o3a', text: 'Create lead segments', detail: 'Segment leads by industry, score, or engagement in Lead Management' },
      { id: 'o3b', text: 'A/B test email sequences', detail: 'Run split tests on subject lines and CTAs in Content Studio' },
      { id: 'o3c', text: 'Train custom AI model', detail: 'Feed your lead data to the Model Training page for personalized scoring' },
      { id: 'o3d', text: 'Set up team collaboration', detail: 'Add team members and assign leads in Strategy Hub' },
      { id: 'o3e', text: 'Publish a guest blog post', detail: 'Draft and publish content on the Guest Posts page to attract leads' },
    ],
  },
  {
    week: 4, title: 'Mastery', subtitle: 'Optimize and scale', color: 'amber',
    tasks: [
      { id: 'o4a', text: 'Review 30-day metrics', detail: 'Compare Week 1 vs Week 4 in Analytics Hub for growth insights' },
      { id: 'o4b', text: 'Optimize underperforming workflows', detail: 'Use AI suggestions to improve low-converting automation sequences' },
      { id: 'o4c', text: 'Set up advanced integrations', detail: 'Connect webhook endpoints and API tools for custom data flows' },
      { id: 'o4d', text: 'Document your playbook', detail: 'Save your best templates, sequences, and strategies as reusable assets' },
      { id: 'o4e', text: 'Plan your scaling strategy', detail: 'Use AI Command Center for predictive pipeline analysis and growth planning' },
    ],
  },
];

// ─── Mobile-Only Features ───
const MOBILE_FEATURES = [
  { id: 'mf1', label: 'Scan Business Card', icon: <CameraIcon className="w-5 h-5" />, color: 'indigo', desc: 'Capture leads from events' },
  { id: 'mf2', label: 'Voice Commands', icon: <MicIcon className="w-5 h-5" />, color: 'violet', desc: 'Hands-free lead notes' },
  { id: 'mf3', label: 'Location Reminders', icon: <MapPinIcon className="w-5 h-5" />, color: 'emerald', desc: 'Alerts near client offices' },
  { id: 'mf4', label: 'Offline Mode', icon: <WifiOffIcon className="w-5 h-5" />, color: 'amber', desc: 'Work without connection' },
];

const MobileDashboard: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [swipedLeadId, setSwipedLeadId] = useState<string | null>(null);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Tab & Section State ───
  const [activeTab, setActiveTab] = useState<MobileTab>('dashboard');
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSyncPending, setOfflineSyncPending] = useState(0);

  // ─── Checklist State (session-persisted) ───
  const [dailyChecked, setDailyChecked] = useState<Set<string>>(() => {
    try {
      const key = `mobile_daily_${new Date().toISOString().split('T')[0]}`;
      const saved = sessionStorage.getItem(key);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [weeklyChecked, setWeeklyChecked] = useState<Set<string>>(() => {
    try {
      const key = `mobile_weekly_${new Date().toISOString().split('T')[0]}`;
      const saved = sessionStorage.getItem(key);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [activeDailyPeriod, setActiveDailyPeriod] = useState<ChecklistPeriod>(() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'midday';
    return 'evening';
  });
  const [activeWeeklyDay, setActiveWeeklyDay] = useState<WeeklyDay>(() => {
    const d = new Date().getDay();
    if (d <= 2) return 'monday';
    if (d <= 4) return 'wednesday';
    return 'friday';
  });

  // ─── Onboarding State ───
  const [onboardingChecked, setOnboardingChecked] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('mobile_onboarding');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [expandedWeek, setExpandedWeek] = useState<OnboardingWeek>(1);

  // ─── Persist checklists ───
  useEffect(() => {
    const key = `mobile_daily_${new Date().toISOString().split('T')[0]}`;
    sessionStorage.setItem(key, JSON.stringify([...dailyChecked]));
  }, [dailyChecked]);

  useEffect(() => {
    const key = `mobile_weekly_${new Date().toISOString().split('T')[0]}`;
    sessionStorage.setItem(key, JSON.stringify([...weeklyChecked]));
  }, [weeklyChecked]);

  useEffect(() => {
    localStorage.setItem('mobile_onboarding', JSON.stringify([...onboardingChecked]));
  }, [onboardingChecked]);

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
    if (hotLeads.length > 0) {
      const top = hotLeads[0];
      items.push({ id: top.id, text: `Follow up with ${top.company}`, score: top.score, type: 'lead' });
    }
    if (hotLeads.length > 1) {
      items.push({ id: 'hot-review', text: `Review new hot leads (${hotLeads.length})`, type: 'task' });
    }
    if (newLeads.length > 0) {
      items.push({ id: 'new-outreach', text: `Reach out to ${newLeads.length} new lead${newLeads.length > 1 ? 's' : ''}`, type: 'task' });
    }
    items.push({ id: 'content', text: 'Approve campaign content', type: 'task' });
    return items.slice(0, 4);
  }, [hotLeads, newLeads]);

  const recentActivity = useMemo((): ActivityItem[] => {
    const items: ActivityItem[] = [];
    if (hotLeads.length > 0) {
      items.push({ id: 'act-1', icon: <FlameIcon className="w-4 h-4" />, text: `New hot lead: ${hotLeads[0].company} (${hotLeads[0].score})`, time: '2m ago', color: 'rose' });
    }
    items.push({ id: 'act-2', icon: <SparklesIcon className="w-4 h-4" />, text: 'AI generated content for campaign', time: '15m ago', color: 'indigo' });
    if (leads.length > 0) {
      const contacted = leads.find(l => l.status === 'Contacted');
      if (contacted) {
        items.push({ id: 'act-3', icon: <MailIcon className="w-4 h-4" />, text: `${contacted.name} responded to email`, time: '1h ago', color: 'emerald' });
      }
    }
    items.push({ id: 'act-4', icon: <TrendUpIcon className="w-4 h-4" />, text: 'Pipeline score improved by 4 points', time: '3h ago', color: 'violet' });
    items.push({ id: 'act-5', icon: <BoltIcon className="w-4 h-4" />, text: 'Automation workflow processed 12 leads', time: '5h ago', color: 'amber' });
    return items.slice(0, 5);
  }, [hotLeads, leads]);

  const pendingTasks = useMemo(() => {
    return newLeads.length + (hotLeads.length > 0 ? 1 : 0) + 2;
  }, [newLeads, hotLeads]);

  const unreadNotifications = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  // ─── Checklist progress ───
  const dailyProgress = useMemo(() => {
    const period = DAILY_CHECKLISTS[activeDailyPeriod];
    const total = period.items.length;
    const done = period.items.filter(i => dailyChecked.has(i.id)).length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [activeDailyPeriod, dailyChecked]);

  const onboardingProgress = useMemo(() => {
    const total = ONBOARDING_WEEKS.reduce((a, w) => a + w.tasks.length, 0);
    const done = onboardingChecked.size;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [onboardingChecked]);

  // ─── Handlers ───
  const handleSwipeToggle = (leadId: string) => {
    setSwipedLeadId(swipedLeadId === leadId ? null : leadId);
  };

  const handleSaveNote = () => {
    if (!quickNote.trim()) return;
    if (offlineMode) setOfflineSyncPending(p => p + 1);
    setNoteSaved(true);
    setTimeout(() => {
      setQuickNote('');
      setQuickNoteOpen(false);
      setNoteSaved(false);
    }, 1200);
  };

  const handleToggleDaily = useCallback((id: string) => {
    setDailyChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleWeekly = useCallback((id: string) => {
    setWeeklyChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleOnboarding = useCallback((id: string) => {
    setOnboardingChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleMarkNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const handleToggleOffline = useCallback(() => {
    setOfflineMode(prev => !prev);
    if (offlineMode && offlineSyncPending > 0) {
      setTimeout(() => setOfflineSyncPending(0), 1500);
    }
  }, [offlineMode, offlineSyncPending]);

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const tabs: { id: MobileTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Home', icon: <TargetIcon className="w-4.5 h-4.5" /> },
    { id: 'notifications', label: 'Alerts', icon: <BellIcon className="w-4.5 h-4.5" />, badge: unreadNotifications },
    { id: 'checklists', label: 'Tasks', icon: <CheckIcon className="w-4.5 h-4.5" /> },
    { id: 'onboarding', label: 'Setup', icon: <RocketIcon className="w-4.5 h-4.5" /> },
  ];

  return (
    <div ref={containerRef} className="max-w-md mx-auto space-y-5 pb-20">

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

        <div className="flex items-center space-x-1.5">
          {/* Offline Mode Toggle */}
          <button
            onClick={handleToggleOffline}
            className={`p-2 rounded-lg transition-all ${offlineMode ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
            title={offlineMode ? 'Go Online' : 'Go Offline'}
          >
            {offlineMode ? <WifiOffIcon className="w-5 h-5" /> : <SyncIcon className="w-5 h-5" />}
          </button>

          {/* Refresh */}
          <button onClick={handleRefresh} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <RefreshIcon className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Menu */}
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 text-slate-500 hover:text-slate-700 transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Offline Mode Banner */}
      {offlineMode && (
        <div className="flex items-center space-x-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <WifiOffIcon className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-800">Offline Mode Active</p>
            <p className="text-[10px] text-amber-600">
              {offlineSyncPending > 0 ? `${offlineSyncPending} change${offlineSyncPending > 1 ? 's' : ''} pending sync` : 'Data cached locally. Changes will sync when online.'}
            </p>
          </div>
          <button onClick={handleToggleOffline} className="px-2.5 py-1 bg-amber-600 text-white rounded-lg text-[10px] font-bold active:scale-95">
            Sync Now
          </button>
        </div>
      )}

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
                { label: 'AI Command', path: '/portal/ai', icon: <BrainIcon className="w-4 h-4" /> },
                { label: 'Strategy', path: '/portal/strategy', icon: <BoltIcon className="w-4 h-4" /> },
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
      {/* TAB CONTENT                                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}

      {activeTab === 'dashboard' && (
        <>
          {/* ─── TODAY'S PRIORITIES ─── */}
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
                  }`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.text}</p>
                  </div>
                  {item.score && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-black shrink-0">{item.score}</span>
                  )}
                  <ArrowRightIcon className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* ─── QUICK STATS ─── */}
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

          {/* ─── MOBILE-ONLY FEATURES ─── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                <BoltIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Mobile Features</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {MOBILE_FEATURES.map(feat => (
                <button
                  key={feat.id}
                  className={`flex items-center space-x-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-${feat.color}-50 hover:border-${feat.color}-200 transition-all active:scale-95`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-${feat.color}-100 flex items-center justify-center text-${feat.color}-600 shrink-0`}>
                    {feat.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-700 truncate">{feat.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">{feat.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ─── RECENT ACTIVITY ─── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <BellIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Recent Activity</h2>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-bold text-emerald-600">Live</span>
              </div>
            </div>
            <div className="space-y-1">
              {recentActivity.map(item => (
                <div key={item.id} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
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

          {/* ─── HOT LEADS (Swipeable) ─── */}
          {hotLeads.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                  <FlameIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Hot Leads</h2>
                <span className="text-[10px] font-bold text-slate-400 ml-auto">Tap for actions</span>
              </div>
              <div className="space-y-2">
                {hotLeads.slice(0, 4).map(lead => (
                  <div key={lead.id} className="relative overflow-hidden rounded-xl">
                    {swipedLeadId === lead.id && (
                      <div className="absolute right-0 top-0 bottom-0 flex items-center space-x-1.5 pr-2 bg-gradient-to-l from-slate-100 to-transparent pl-8 z-10">
                        <button onClick={() => navigate(`/portal/leads/${lead.id}`)} className="p-2 bg-indigo-600 text-white rounded-lg shadow-lg active:scale-95 transition-transform" title="View">
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
                        }`}>{lead.score}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{lead.status}</p>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── QUICK ACTIONS ─── */}
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
                { label: 'Voice Note', icon: <MicIcon className="w-5 h-5" />, color: 'emerald', action: () => setQuickNoteOpen(true) },
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

          {/* ─── DAILY WORKFLOW PREVIEW ─── */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <ClockIcon className="w-4 h-4 text-indigo-400" />
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider">Daily Mobile Workflow</p>
              </div>
              <button onClick={() => setActiveTab('checklists')} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300">
                View All &rarr;
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { period: 'Morning', icon: '🌅', time: '8-9 AM', tasks: '5 tasks', active: activeDailyPeriod === 'morning' },
                { period: 'Mid-Day', icon: '☀️', time: '12-1 PM', tasks: '5 tasks', active: activeDailyPeriod === 'midday' },
                { period: 'Evening', icon: '🌙', time: '5-6 PM', tasks: '5 tasks', active: activeDailyPeriod === 'evening' },
              ].map((block, i) => (
                <div key={i} className={`p-3 rounded-xl text-center ${block.active ? 'bg-indigo-600/30 border border-indigo-500/30' : 'bg-slate-800/50'}`}>
                  <p className="text-lg mb-1">{block.icon}</p>
                  <p className="text-xs font-bold text-white">{block.period}</p>
                  <p className="text-[9px] text-slate-400">{block.time}</p>
                  <p className="text-[9px] font-bold text-indigo-400 mt-1">{block.tasks}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ─── NAVIGATION GRID ─── */}
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

          {/* ─── MOBILE GESTURES HINT ─── */}
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
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* NOTIFICATIONS TAB                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'notifications' && (
        <>
          {/* Notifications Header */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                  <BellIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Push Notifications</h2>
                {unreadNotifications > 0 && (
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded-full">{unreadNotifications}</span>
                )}
              </div>
              {unreadNotifications > 0 && (
                <button onClick={handleMarkAllRead} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 active:scale-95">
                  Mark All Read
                </button>
              )}
            </div>

            {/* Notification Categories */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'All', count: notifications.length, color: 'slate' },
                { label: 'Leads', count: notifications.filter(n => n.type === 'hot_lead').length, color: 'rose' },
                { label: 'Team', count: notifications.filter(n => n.type === 'team_mention').length, color: 'indigo' },
                { label: 'Campaigns', count: notifications.filter(n => n.type === 'campaign').length, color: 'emerald' },
              ].map((cat, i) => (
                <div key={i} className={`p-2.5 rounded-xl text-center bg-${cat.color}-50`}>
                  <p className={`text-lg font-black text-${cat.color}-700`}>{cat.count}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">{cat.label}</p>
                </div>
              ))}
            </div>

            {/* Notification List */}
            <div className="space-y-2">
              {notifications.map(notif => {
                const meta = NOTIFICATION_META[notif.type];
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleMarkNotificationRead(notif.id)}
                    className={`w-full flex items-start space-x-3 p-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                      notif.read ? 'bg-slate-50/50' : 'bg-white border border-slate-200 shadow-sm'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl bg-${meta.color}-100 flex items-center justify-center text-${meta.color}-600 shrink-0 mt-0.5`}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className={`text-sm font-bold truncate ${notif.read ? 'text-slate-500' : 'text-slate-900'}`}>{notif.title}</p>
                        {!notif.read && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></span>}
                      </div>
                      <p className={`text-xs mt-0.5 ${notif.read ? 'text-slate-400' : 'text-slate-600'}`}>{notif.body}</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold">{notif.time}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Notification Preferences</p>
            <div className="space-y-2.5">
              {[
                { label: 'Hot Lead Alerts', desc: 'Score spikes above 80', enabled: true },
                { label: 'Team Mentions', desc: '@mentions in notes & tasks', enabled: true },
                { label: 'Campaign Reports', desc: 'Open rates & click reports', enabled: true },
                { label: 'System Updates', desc: 'Weekly reports & maintenance', enabled: false },
              ].map((pref, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{pref.label}</p>
                    <p className="text-[10px] text-slate-400">{pref.desc}</p>
                  </div>
                  <div className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${pref.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${pref.enabled ? 'translate-x-4' : ''}`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CHECKLISTS TAB                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'checklists' && (
        <>
          {/* Daily Checklist */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Daily Operations</h2>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-indigo-600">{dailyProgress.done}/{dailyProgress.total}</span>
                <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${dailyProgress.pct}%` }}></div>
                </div>
              </div>
            </div>

            {/* Period Tabs */}
            <div className="flex space-x-1.5 mb-4">
              {(Object.entries(DAILY_CHECKLISTS) as [ChecklistPeriod, typeof DAILY_CHECKLISTS['morning']][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setActiveDailyPeriod(key)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold text-center transition-all ${
                    activeDailyPeriod === key
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {val.label.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Period Info */}
            <div className="flex items-center space-x-2 mb-3 px-1">
              <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400">{DAILY_CHECKLISTS[activeDailyPeriod].time}</span>
            </div>

            {/* Checklist Items */}
            <div className="space-y-1.5">
              {DAILY_CHECKLISTS[activeDailyPeriod].items.map(item => {
                const checked = dailyChecked.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleToggleDaily(item.id)}
                    className={`w-full flex items-start space-x-3 p-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                      checked ? 'bg-emerald-50/50' : 'bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                    }`}>
                      {checked && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold transition-colors ${checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {item.text}
                      </p>
                      {item.tip && !checked && (
                        <p className="text-[10px] text-indigo-500 mt-0.5">{item.tip}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weekly Checklist */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Weekly Operations</h2>
            </div>

            {/* Day Tabs */}
            <div className="flex space-x-1.5 mb-4">
              {(Object.entries(WEEKLY_CHECKLISTS) as [WeeklyDay, typeof WEEKLY_CHECKLISTS['monday']][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setActiveWeeklyDay(key)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold text-center transition-all ${
                    activeWeeklyDay === key
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {val.label.split(' - ')[0]}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-bold text-violet-500 mb-3 px-1">{WEEKLY_CHECKLISTS[activeWeeklyDay].label}</p>

            <div className="space-y-1.5">
              {WEEKLY_CHECKLISTS[activeWeeklyDay].items.map(item => {
                const checked = weeklyChecked.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleToggleWeekly(item.id)}
                    className={`w-full flex items-center space-x-3 p-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                      checked ? 'bg-emerald-50/50' : 'bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                    }`}>
                      {checked && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                    <p className={`text-sm font-semibold flex-1 transition-colors ${checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {item.text}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center space-x-2 mb-3">
              <SparklesIcon className="w-4 h-4 text-indigo-400" />
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider">Productivity Tips</p>
            </div>
            <div className="space-y-2">
              {[
                'Complete morning checklist before 9 AM for 2.3x better response rates',
                'Use voice notes during commute to capture ideas hands-free',
                'Review hot leads within 30 minutes of score spike for best conversion',
              ].map((tip, i) => (
                <div key={i} className="flex items-start space-x-2">
                  <StarIcon className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-300 leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ONBOARDING TAB                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'onboarding' && (
        <>
          {/* Onboarding Progress Overview */}
          <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-2xl p-5 text-white shadow-xl">
            <div className="flex items-center space-x-2 mb-3">
              <RocketIcon className="w-5 h-5 text-indigo-200" />
              <h2 className="text-sm font-black uppercase tracking-wider">30-Day Onboarding</h2>
            </div>
            <p className="text-indigo-200 text-xs mb-4">Master AuraFunnel in 4 weeks with guided tasks</p>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-indigo-200">Overall Progress</span>
                <span className="text-sm font-black">{onboardingProgress.pct}%</span>
              </div>
              <div className="w-full h-2 bg-indigo-800 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${onboardingProgress.pct}%` }}></div>
              </div>
              <p className="text-[10px] text-indigo-300 mt-1">{onboardingProgress.done} of {onboardingProgress.total} tasks completed</p>
            </div>

            {/* Week Progress Dots */}
            <div className="grid grid-cols-4 gap-2">
              {ONBOARDING_WEEKS.map(w => {
                const weekDone = w.tasks.filter(t => onboardingChecked.has(t.id)).length;
                const weekPct = Math.round((weekDone / w.tasks.length) * 100);
                return (
                  <button
                    key={w.week}
                    onClick={() => setExpandedWeek(w.week)}
                    className={`p-2 rounded-xl text-center transition-all ${
                      expandedWeek === w.week ? 'bg-white/20 border border-white/30' : 'bg-indigo-800/50 hover:bg-indigo-800'
                    }`}
                  >
                    <p className="text-[10px] font-black">W{w.week}</p>
                    <p className="text-lg font-black">{weekPct}%</p>
                    <p className="text-[9px] text-indigo-200">{w.title}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Week Details */}
          {ONBOARDING_WEEKS.filter(w => w.week === expandedWeek).map(week => (
            <div key={week.week} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center space-x-2 mb-1">
                <div className={`w-7 h-7 rounded-lg bg-${week.color}-50 flex items-center justify-center text-${week.color}-600`}>
                  <span className="text-xs font-black">W{week.week}</span>
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Week {week.week}: {week.title}</h3>
                  <p className="text-[10px] text-slate-400">{week.subtitle}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {week.tasks.map((task, i) => {
                  const checked = onboardingChecked.has(task.id);
                  return (
                    <div key={task.id} className={`rounded-xl transition-all ${checked ? 'bg-emerald-50/50' : 'bg-slate-50'}`}>
                      <button
                        onClick={() => handleToggleOnboarding(task.id)}
                        className="w-full flex items-start space-x-3 p-3 text-left active:scale-[0.98]"
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                        }`}>
                          {checked && <CheckIcon className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold transition-colors ${checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            {task.text}
                          </p>
                          <p className={`text-[11px] mt-0.5 ${checked ? 'text-slate-300' : 'text-slate-500'}`}>{task.detail}</p>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                          checked ? 'bg-emerald-100 text-emerald-700' : `bg-${week.color}-100 text-${week.color}-700`
                        }`}>
                          {checked ? 'Done' : `${i + 1}/5`}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Week Completion Status */}
              {week.tasks.every(t => onboardingChecked.has(t.id)) && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2">
                  <CheckIcon className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-700">Week {week.week} Complete!</p>
                </div>
              )}
            </div>
          ))}

          {/* Content Studio Guide Preview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                <SparklesIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Content Studio Guide</h2>
            </div>
            <div className="space-y-2">
              {[
                { step: '1', title: 'Choose Content Type', desc: 'Email sequence, blog post, or social media campaign' },
                { step: '2', title: 'Select Target Audience', desc: 'Pick a lead segment for AI-personalized content' },
                { step: '3', title: 'AI Generates Draft', desc: 'Review, edit, and approve AI-written content' },
                { step: '4', title: 'Schedule & Publish', desc: 'Set delivery timing and connect to your channels' },
              ].map(s => (
                <div key={s.step} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center text-sm font-black shrink-0">
                    {s.step}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">{s.title}</p>
                    <p className="text-[10px] text-slate-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/portal/content-studio')}
              className="w-full mt-3 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-all active:scale-95"
            >
              Open Content Studio
            </button>
          </div>

          {/* Reset Onboarding */}
          <button
            onClick={() => { setOnboardingChecked(new Set()); localStorage.removeItem('mobile_onboarding'); }}
            className="w-full py-2.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all active:scale-95"
          >
            Reset Onboarding Progress
          </button>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* BOTTOM TAB BAR (Fixed)                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 px-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center space-y-0.5 px-3 py-1.5 rounded-xl transition-all active:scale-95 ${
                activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.icon}
              <span className="text-[9px] font-bold uppercase tracking-wider">{tab.label}</span>
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-0.5 right-0 w-4 h-4 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && <div className="absolute -bottom-2 w-6 h-0.5 bg-indigo-600 rounded-full"></div>}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* QUICK NOTE MODAL                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {quickNoteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setQuickNoteOpen(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl p-6 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-black text-slate-900 mb-3">Quick Note</h3>

            {noteSaved ? (
              <div className="flex items-center justify-center space-x-2 py-8">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="font-bold text-emerald-700">
                  {offlineMode ? 'Note saved locally (will sync when online)' : 'Note saved!'}
                </span>
              </div>
            ) : (
              <>
                {offlineMode && (
                  <div className="flex items-center space-x-2 p-2 bg-amber-50 rounded-lg mb-3">
                    <WifiOffIcon className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-[10px] font-bold text-amber-700">Offline - Note will sync when connected</p>
                  </div>
                )}
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
                  <button className="p-3 bg-violet-100 text-violet-600 rounded-xl hover:bg-violet-200 transition-all active:scale-95" title="Voice Note">
                    <MicIcon className="w-5 h-5" />
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
