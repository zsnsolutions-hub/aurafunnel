import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import {
  HelpCircleIcon, BookOpenIcon, KeyboardIcon, LightBulbIcon, AcademicCapIcon,
  ShieldIcon, SparklesIcon, CheckIcon, ClockIcon, MailIcon, PhoneIcon,
  MessageIcon, AlertTriangleIcon, TrendUpIcon, RefreshIcon, TargetIcon,
  DocumentIcon, BoltIcon, ChartIcon, CogIcon, XIcon, TrendDownIcon,
  BrainIcon, LayersIcon, FilterIcon, PieChartIcon, UsersIcon, StarIcon,
  ActivityIcon, EyeIcon, ArrowRightIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// === 6.1 Common Issues ===
const COMMON_ISSUES = [
  {
    id: 'csv-import',
    title: "Can't import CSV file",
    icon: <DocumentIcon className="w-5 h-5" />,
    steps: [
      'Download the CSV template from the import modal',
      'Match column headers exactly: name, email, company, score',
      'Ensure proper formatting (UTF-8 encoding, no special characters in headers)',
      'File size must be under 10MB',
      'Supported formats: .csv, .xlsx',
    ],
  },
  {
    id: 'ai-content',
    title: 'AI content not generating',
    icon: <SparklesIcon className="w-5 h-5" />,
    steps: [
      'Check your AI credits balance in Billing & Tiers',
      'Verify your internet connection is stable',
      'Clear browser cache and reload the page',
      'Try a different content type or tone setting',
      'Contact support if the issue persists after all steps',
    ],
  },
  {
    id: 'lead-scoring',
    title: 'Lead scoring seems inaccurate',
    icon: <TargetIcon className="w-5 h-5" />,
    steps: [
      'Check lead data completeness — missing fields reduce accuracy',
      'Review AI model settings in Admin > Neural Analytics',
      'Check for data formatting issues (dates, numbers, special characters)',
      'Provide score feedback via the lead detail panel to improve predictions',
    ],
  },
  {
    id: 'slow-loading',
    title: 'Dashboard loading slowly',
    icon: <ClockIcon className="w-5 h-5" />,
    steps: [
      'Use filters to reduce the number of leads displayed at once',
      'Archive old or lost leads to reduce dataset size',
      'Check browser developer tools for network errors',
      'Try a different browser or clear existing cache',
      'Disable browser extensions that may interfere',
    ],
  },
  {
    id: 'email-delivery',
    title: 'Generated emails not delivering',
    icon: <MailIcon className="w-5 h-5" />,
    steps: [
      'Verify your email integration is connected in Settings > Integrations',
      'Check email credits in your subscription plan',
      'Review the outbox for any queued or failed messages',
      'Ensure recipient email addresses are valid',
      'Check spam folder settings on the recipient side',
    ],
  },
];

// === 6.2 Performance Tips ===
const OPTIMIZATION_CATEGORIES = [
  {
    id: 'data-quality',
    title: 'Data Quality',
    icon: <ShieldIcon className="w-5 h-5" />,
    color: 'indigo',
    tips: [
      'Ensure complete lead information for all records',
      'Schedule regular data cleaning sessions monthly',
      'Remove duplicates using the CSV export > de-dup > re-import workflow',
      'Standardize company names and email formats',
    ],
  },
  {
    id: 'ai-effectiveness',
    title: 'AI Effectiveness',
    icon: <SparklesIcon className="w-5 h-5" />,
    color: 'violet',
    tips: [
      'Provide feedback on AI-generated content (thumbs up/down)',
      'Mark lead scores as accurate or inaccurate to train the model',
      'Share conversion results to improve prediction accuracy',
      'Use specific prompts — the more context, the better the output',
    ],
  },
  {
    id: 'system-speed',
    title: 'System Speed',
    icon: <BoltIcon className="w-5 h-5" />,
    color: 'amber',
    tips: [
      'Use filters instead of loading all data at once',
      'Schedule heavy report generation during off-peak hours',
      'Archive old leads quarterly to keep the pipeline lean',
      'Use Chrome or Firefox for best performance',
    ],
  },
];

// === Keyboard Shortcuts ===
const GLOBAL_SHORTCUTS = [
  { keys: 'Ctrl/Cmd + K', action: 'Command palette' },
  { keys: 'Ctrl/Cmd + N', action: 'New lead' },
  { keys: 'Ctrl/Cmd + G', action: 'Generate content' },
  { keys: 'Ctrl/Cmd + S', action: 'Save' },
  { keys: 'Ctrl/Cmd + P', action: 'Print / Export' },
  { keys: 'Ctrl/Cmd + /', action: 'Search' },
];

const NAV_SHORTCUTS = [
  { keys: 'L', action: 'Leads dashboard' },
  { keys: 'C', action: 'Content studio' },
  { keys: 'A', action: 'Analytics' },
  { keys: 'S', action: 'Settings' },
  { keys: 'H', action: 'Help' },
];

// === Checklists ===
const DAILY_CHECKLIST = {
  morning: [
    'Check new hot leads',
    'Review AI recommendations',
    'Monitor campaign performance',
    'Check system alerts',
  ],
  midday: [
    'Follow up on priority leads',
    'Generate new content if needed',
    'Review automation results',
    'Update lead statuses',
  ],
  endOfDay: [
    'Review daily report',
    'Plan next day priorities',
    'Clean up workspace',
    'Log any issues/feedback',
  ],
};

const WEEKLY_TASKS = {
  monday: ['Review weekly goals', 'Check campaign performance', 'Update lead lists'],
  wednesday: ['Analyze mid-week metrics', 'Adjust campaigns if needed', 'Team sync meeting'],
  friday: ['Weekly performance review', 'Export reports', 'Plan for next week', 'System maintenance check'],
};

const MONTHLY_TASKS = {
  'Data Management': ['Clean duplicate leads', 'Archive old data', 'Update lead information', 'Review segmentation'],
  'Performance Review': ['Analyze conversion rates', 'Review AI accuracy', 'Check ROI metrics', 'Update strategies'],
  'System Health': ['Review user permissions', 'Check integration health', 'Update settings if needed', 'Backup important data'],
};

// === Pro Tips ===
const PRO_TIPS = [
  {
    id: 'tip-1',
    title: 'Leverage AI Insights',
    text: 'The AI learns from your feedback. When you mark a lead score as accurate or inaccurate, it improves future predictions. Take 2 minutes daily to provide feedback.',
    icon: <SparklesIcon className="w-5 h-5" />,
    color: 'indigo',
  },
  {
    id: 'tip-2',
    title: 'Personalization at Scale',
    text: 'Use the {{ai_insight}} tag in emails. It automatically inserts AI-generated personalized insights about each lead, increasing engagement by up to 300%.',
    icon: <TargetIcon className="w-5 h-5" />,
    color: 'violet',
  },
  {
    id: 'tip-3',
    title: 'A/B Testing Made Easy',
    text: 'Create two versions of any content, add \'A\' and \'B\' to the titles. The system automatically tracks performance and shows you which version wins.',
    icon: <ChartIcon className="w-5 h-5" />,
    color: 'emerald',
  },
  {
    id: 'tip-4',
    title: 'Team Collaboration',
    text: 'Use the @mention feature in lead notes to alert team members. They\'ll receive notifications and can jump right into action.',
    icon: <MessageIcon className="w-5 h-5" />,
    color: 'amber',
  },
  {
    id: 'tip-5',
    title: 'Mobile Productivity',
    text: 'Access AuraFunnel on your mobile browser for push notifications on hot leads and manage campaigns on the go.',
    icon: <PhoneIcon className="w-5 h-5" />,
    color: 'rose',
  },
];

// === Knowledge Base Articles ===
interface KBArticle {
  id: string;
  title: string;
  category: string;
  views: number;
  helpful: number;
  lastUpdated: string;
  readTime: string;
  tags: string[];
}

const KB_ARTICLES: KBArticle[] = [
  { id: 'kb-1', title: 'Getting Started with Lead Scoring', category: 'Leads', views: 2841, helpful: 94, lastUpdated: '2024-01-15', readTime: '5 min', tags: ['leads', 'scoring', 'ai'] },
  { id: 'kb-2', title: 'How to Set Up Email Automations', category: 'Automation', views: 2156, helpful: 91, lastUpdated: '2024-01-12', readTime: '8 min', tags: ['email', 'automation', 'workflow'] },
  { id: 'kb-3', title: 'Understanding AI Content Generation', category: 'AI', views: 1893, helpful: 88, lastUpdated: '2024-01-10', readTime: '6 min', tags: ['ai', 'content', 'generation'] },
  { id: 'kb-4', title: 'CSV Import Best Practices', category: 'Data', views: 1654, helpful: 96, lastUpdated: '2024-01-08', readTime: '4 min', tags: ['csv', 'import', 'data'] },
  { id: 'kb-5', title: 'Integration Setup Guide', category: 'Integrations', views: 1421, helpful: 90, lastUpdated: '2024-01-05', readTime: '10 min', tags: ['integrations', 'api', 'webhooks'] },
  { id: 'kb-6', title: 'Advanced Analytics & Reporting', category: 'Analytics', views: 1287, helpful: 87, lastUpdated: '2024-01-03', readTime: '7 min', tags: ['analytics', 'reports', 'metrics'] },
  { id: 'kb-7', title: 'Team Collaboration Features', category: 'Team', views: 1104, helpful: 93, lastUpdated: '2024-01-01', readTime: '5 min', tags: ['team', 'collaboration', 'permissions'] },
  { id: 'kb-8', title: 'Billing & Subscription Management', category: 'Billing', views: 987, helpful: 85, lastUpdated: '2023-12-28', readTime: '3 min', tags: ['billing', 'subscription', 'credits'] },
];

// === System Status ===
interface SystemService {
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  uptime: number;
  lastIncident: string | null;
}

const SYSTEM_SERVICES: SystemService[] = [
  { name: 'AI Engine', status: 'operational', uptime: 99.98, lastIncident: null },
  { name: 'Lead Processing', status: 'operational', uptime: 99.95, lastIncident: null },
  { name: 'Email Delivery', status: 'operational', uptime: 99.92, lastIncident: '2024-01-02' },
  { name: 'Data Sync', status: 'operational', uptime: 99.89, lastIncident: '2024-01-05' },
  { name: 'Analytics Pipeline', status: 'operational', uptime: 99.97, lastIncident: null },
  { name: 'Webhook Engine', status: 'operational', uptime: 99.94, lastIncident: null },
  { name: 'Storage & CDN', status: 'operational', uptime: 99.99, lastIncident: null },
  { name: 'Authentication', status: 'operational', uptime: 99.99, lastIncident: null },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  operational: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Operational' },
  degraded: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Degraded' },
  outage: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Outage' },
};

// === Recent Updates / Changelog ===
const RECENT_UPDATES = [
  { version: 'v3.2.0', date: '2024-01-15', title: 'Enhanced AI Model Training', type: 'feature' as const },
  { version: 'v3.1.5', date: '2024-01-10', title: 'Bug fix: CSV import encoding', type: 'fix' as const },
  { version: 'v3.1.4', date: '2024-01-08', title: 'Performance: 40% faster analytics', type: 'improvement' as const },
  { version: 'v3.1.3', date: '2024-01-05', title: 'New: Integration health dashboard', type: 'feature' as const },
  { version: 'v3.1.2', date: '2024-01-02', title: 'Fix: Email template rendering', type: 'fix' as const },
];

const UPDATE_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  feature: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  fix: { bg: 'bg-red-50', text: 'text-red-700' },
  improvement: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

// === Onboarding Path ===
const ONBOARDING_WEEKS = [
  {
    week: 1,
    title: 'Foundation',
    color: 'indigo',
    days: [
      { range: 'Day 1-2', task: 'Account Setup & Navigation' },
      { range: 'Day 3-4', task: 'Lead Management Basics' },
      { range: 'Day 5-7', task: 'Content Creation Fundamentals' },
    ],
  },
  {
    week: 2,
    title: 'Intermediate',
    color: 'violet',
    days: [
      { range: 'Day 8-10', task: 'Analytics & Reporting' },
      { range: 'Day 11-12', task: 'Automation Rules' },
      { range: 'Day 13-14', task: 'Integrations Setup' },
    ],
  },
  {
    week: 3,
    title: 'Advanced',
    color: 'emerald',
    days: [
      { range: 'Day 15-17', task: 'AI Optimization' },
      { range: 'Day 18-20', task: 'Team Collaboration' },
      { range: 'Day 21+', task: 'Expert Certification' },
    ],
  },
];

type TabKey = 'troubleshoot' | 'optimize' | 'support' | 'training' | 'shortcuts' | 'tips';

const HelpCenterPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [activeTab, setActiveTab] = useState<TabKey>('troubleshoot');
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(`aura_checklist_${user?.id}`);
    return saved ? JSON.parse(saved) : {};
  });

  // ─── New Enhancement State ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSystemStatus, setShowSystemStatus] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // ─── KPI Stats ───
  const kpiStats = useMemo(() => {
    const totalChecked = Object.values(checkedItems).filter(Boolean).length;
    const totalChecklistItems =
      DAILY_CHECKLIST.morning.length + DAILY_CHECKLIST.midday.length + DAILY_CHECKLIST.endOfDay.length +
      Object.values(WEEKLY_TASKS).flat().length +
      Object.values(MONTHLY_TASKS).flat().length;
    const checklistProgress = totalChecklistItems > 0 ? Math.round((totalChecked / totalChecklistItems) * 100) : 0;
    const totalArticleViews = KB_ARTICLES.reduce((s, a) => s + a.views, 0);
    const avgHelpfulness = Math.round(KB_ARTICLES.reduce((s, a) => s + a.helpful, 0) / KB_ARTICLES.length);
    const allOperational = SYSTEM_SERVICES.every(s => s.status === 'operational');
    const avgUptime = (SYSTEM_SERVICES.reduce((s, sv) => s + sv.uptime, 0) / SYSTEM_SERVICES.length).toFixed(2);

    return [
      { label: 'KB Articles', value: KB_ARTICLES.length.toString(), sub: `${totalArticleViews.toLocaleString()} views`, trend: 'up' as const, color: 'indigo' },
      { label: 'Issues Resolved', value: COMMON_ISSUES.length.toString(), sub: `${COMMON_ISSUES.reduce((s, i) => s + i.steps.length, 0)} steps covered`, trend: 'up' as const, color: 'emerald' },
      { label: 'Checklist Progress', value: `${checklistProgress}%`, sub: `${totalChecked}/${totalChecklistItems} items`, trend: checklistProgress > 50 ? 'up' as const : 'down' as const, color: 'violet' },
      { label: 'System Uptime', value: `${avgUptime}%`, sub: allOperational ? 'All operational' : 'Issues detected', trend: 'up' as const, color: 'emerald' },
      { label: 'Avg Helpfulness', value: `${avgHelpfulness}%`, sub: 'Article rating', trend: avgHelpfulness > 85 ? 'up' as const : 'down' as const, color: 'amber' },
      { label: 'Pro Tips', value: PRO_TIPS.length.toString(), sub: `${OPTIMIZATION_CATEGORIES.length} categories`, trend: 'up' as const, color: 'rose' },
    ];
  }, [checkedItems]);

  // ─── Filtered KB Articles ───
  const filteredArticles = useMemo(() => {
    if (!kbSearchQuery.trim()) return KB_ARTICLES;
    const q = kbSearchQuery.toLowerCase();
    return KB_ARTICLES.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.tags.some(t => t.includes(q))
    );
  }, [kbSearchQuery]);

  // ─── Feedback Submit ───
  const handleFeedbackSubmit = useCallback(() => {
    if (feedbackRating !== null) {
      setFeedbackSubmitted(true);
      setTimeout(() => {
        setFeedbackSubmitted(false);
        setFeedbackRating(null);
        setFeedbackComment('');
      }, 3000);
    }
  }, [feedbackRating]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      const overlayOpen = showShortcuts || showSystemStatus || showKnowledgeBase || showChangelog;

      if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        if (showSystemStatus) setShowSystemStatus(false);
        if (showKnowledgeBase) setShowKnowledgeBase(false);
        if (showChangelog) setShowChangelog(false);
        return;
      }

      if (overlayOpen) return;

      switch (e.key) {
        case '1': e.preventDefault(); setActiveTab('troubleshoot'); break;
        case '2': e.preventDefault(); setActiveTab('optimize'); break;
        case '3': e.preventDefault(); setActiveTab('support'); break;
        case '4': e.preventDefault(); setActiveTab('training'); break;
        case '5': e.preventDefault(); setActiveTab('shortcuts'); break;
        case '6': e.preventDefault(); setActiveTab('tips'); break;
        case 's': case 'S': e.preventDefault(); setShowSystemStatus(true); break;
        case 'k': case 'K': e.preventDefault(); setShowKnowledgeBase(true); break;
        case 'u': case 'U': e.preventDefault(); setShowChangelog(true); break;
        case '?': e.preventDefault(); setShowShortcuts(true); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts, showSystemStatus, showKnowledgeBase, showChangelog]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCheck = (key: string) => {
    setCheckedItems(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`aura_checklist_${user?.id}`, JSON.stringify(next));
      return next;
    });
  };

  const resetChecklist = () => {
    setCheckedItems({});
    localStorage.removeItem(`aura_checklist_${user?.id}`);
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'troubleshoot', label: 'Troubleshooting', icon: <AlertTriangleIcon className="w-4 h-4" /> },
    { key: 'optimize', label: 'Optimization', icon: <TrendUpIcon className="w-4 h-4" /> },
    { key: 'support', label: 'Get Support', icon: <MessageIcon className="w-4 h-4" /> },
    { key: 'training', label: 'Training', icon: <AcademicCapIcon className="w-4 h-4" /> },
    { key: 'shortcuts', label: 'Quick Reference', icon: <KeyboardIcon className="w-4 h-4" /> },
    { key: 'tips', label: 'Pro Tips', icon: <LightBulbIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">Help Center</h1>
          <p className="text-slate-500 mt-1 text-sm">Troubleshooting, guides, shortcuts, and expert tips to maximize your AuraFunnel experience</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setShowSystemStatus(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all">
            <ActivityIcon className="w-3.5 h-3.5" />
            <span>System Status</span>
          </button>
          <button onClick={() => setShowKnowledgeBase(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all">
            <BookOpenIcon className="w-3.5 h-3.5" />
            <span>Knowledge Base</span>
          </button>
          <button onClick={() => setShowChangelog(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-100 transition-all">
            <LayersIcon className="w-3.5 h-3.5" />
            <span>Updates</span>
          </button>
          <button onClick={() => setShowShortcuts(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
            <KeyboardIcon className="w-3.5 h-3.5" />
            <span>?</span>
          </button>
        </div>
      </div>

      {/* ─── KPI Stats Banner ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiStats.map((stat, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{stat.label}</p>
              {stat.trend === 'up' ? (
                <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendDownIcon className="w-3.5 h-3.5 text-red-400" />
              )}
            </div>
            <p className="text-2xl font-black text-slate-900">{stat.value}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* === TAB: Troubleshooting === */}
      {activeTab === 'troubleshoot' && (
        <div className="space-y-4">
          <div className="flex items-center space-x-3 mb-2">
            <h2 className="text-lg font-black text-slate-900">Common Issues & Solutions</h2>
            <span className="text-xs font-bold text-slate-400">{COMMON_ISSUES.length} topics</span>
          </div>

          {COMMON_ISSUES.map(issue => (
            <div key={issue.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                    {issue.icon}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{issue.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{issue.steps.length} solution steps</p>
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${expandedIssue === issue.id ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedIssue === issue.id && (
                <div className="px-5 pb-5 border-t border-slate-50">
                  <div className="pt-4 space-y-3">
                    {issue.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start space-x-3">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 text-xs font-black mt-0.5">
                          {idx + 1}
                        </div>
                        <p className="text-sm text-slate-600">{step}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-xs text-amber-700 font-semibold">
                      Still stuck? Contact support via the "Get Support" tab or email support@aura-funnel.com
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* === TAB: Optimization === */}
      {activeTab === 'optimize' && (
        <div className="space-y-6">
          <h2 className="text-lg font-black text-slate-900">Performance Optimization Tips</h2>

          {OPTIMIZATION_CATEGORIES.map(cat => (
            <div key={cat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className={`w-10 h-10 rounded-xl bg-${cat.color}-50 text-${cat.color}-600 flex items-center justify-center`}>
                  {cat.icon}
                </div>
                <h3 className="font-bold text-slate-900">{cat.title}</h3>
              </div>
              <div className="space-y-3">
                {cat.tips.map((tip, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <CheckIcon className={`w-4 h-4 text-${cat.color}-500 shrink-0 mt-0.5`} />
                    <p className="text-sm text-slate-600">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Monthly Best Practices */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Monthly Best Practices</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(MONTHLY_TASKS).map(([category, tasks]) => (
                <div key={category} className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-black text-slate-600 uppercase tracking-wider mb-3">{category}</p>
                  <div className="space-y-2">
                    {tasks.map((task, idx) => {
                      const key = `monthly-${category}-${idx}`;
                      return (
                        <label key={idx} className="flex items-center space-x-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={checkedItems[key] || false}
                            onChange={() => toggleCheck(key)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className={`text-xs ${checkedItems[key] ? 'text-slate-400 line-through' : 'text-slate-600'} group-hover:text-slate-900 transition-colors`}>
                            {task}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === TAB: Get Support === */}
      {activeTab === 'support' && (
        <div className="space-y-6">
          <h2 className="text-lg font-black text-slate-900">Getting Help</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* In-App Help */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <HelpCircleIcon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1">In-App Help Center</h3>
              <p className="text-xs text-slate-500 mb-4">Available 24/7</p>
              <div className="space-y-2 text-left">
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Search knowledge base</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>View video tutorials</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Access documentation</span>
                </div>
              </div>
            </div>

            {/* Live Support */}
            <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm p-6 text-center relative">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="px-3 py-0.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-full tracking-wider">Recommended</span>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                <MessageIcon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1">Live Support</h3>
              <p className="text-xs text-slate-500 mb-4">9 AM - 6 PM EST</p>
              <div className="space-y-2 text-left">
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <MessageIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Chat: In-app live chat</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <MailIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Email: support@aura-funnel.com</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <ClockIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Response: &lt; 2 hours</span>
                </div>
              </div>
            </div>

            {/* Emergency */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4">
                <PhoneIcon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1">Emergency Support</h3>
              <p className="text-xs text-slate-500 mb-4">24/7 for critical issues</p>
              <div className="space-y-2 text-left">
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <PhoneIcon className="w-3.5 h-3.5 text-red-500" />
                  <span>Phone: 1-800-AURA-AI</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <ClockIcon className="w-3.5 h-3.5 text-red-500" />
                  <span>SLA: 15-minute response</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <ShieldIcon className="w-3.5 h-3.5 text-red-500" />
                  <span>Priority: Critical issues only</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Card */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-wider mb-4">Account Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-1">Technical Support</p>
                <p className="text-sm font-semibold">support@aura-funnel.com</p>
                <p className="text-xs text-slate-400 mt-0.5">1-800-AURA-AI (1-800-287-2244)</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-1">Account Manager</p>
                <p className="text-sm font-semibold">am@aura-funnel.com</p>
                <p className="text-xs text-slate-400 mt-0.5">Quarterly reviews scheduled</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-1">Training Portal</p>
                <p className="text-sm font-semibold">training.aura-funnel.com</p>
                <p className="text-xs text-slate-400 mt-0.5">certification@aura-funnel.com</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === TAB: Training === */}
      {activeTab === 'training' && (
        <div className="space-y-6">
          <h2 className="text-lg font-black text-slate-900">Training Resources</h2>

          {/* Resource Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Weekly Webinars', detail: 'Every Tuesday 2 PM EST', icon: <MessageIcon className="w-5 h-5" />, color: 'indigo' },
              { label: 'Video Library', detail: '100+ tutorials', icon: <BookOpenIcon className="w-5 h-5" />, color: 'violet' },
              { label: 'Certification', detail: '3 levels available', icon: <AcademicCapIcon className="w-5 h-5" />, color: 'emerald' },
              { label: 'Onboarding', detail: 'Personalized sessions', icon: <SparklesIcon className="w-5 h-5" />, color: 'amber' },
              { label: 'API Docs', detail: 'Developer documentation', icon: <DocumentIcon className="w-5 h-5" />, color: 'rose' },
            ].map((res, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-center hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl bg-${res.color}-50 text-${res.color}-600 flex items-center justify-center mx-auto mb-3`}>
                  {res.icon}
                </div>
                <p className="font-bold text-slate-900 text-sm">{res.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{res.detail}</p>
              </div>
            ))}
          </div>

          {/* Onboarding Progression */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-6">Onboarding Progression Path</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ONBOARDING_WEEKS.map(week => (
                <div key={week.week} className={`rounded-2xl border-2 border-${week.color}-100 overflow-hidden`}>
                  <div className={`bg-${week.color}-50 px-5 py-3 border-b border-${week.color}-100`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black text-${week.color}-600 uppercase tracking-wider`}>Week {week.week}</span>
                      <span className={`px-2 py-0.5 bg-${week.color}-100 text-${week.color}-700 rounded-full text-[10px] font-black`}>
                        {week.title}
                      </span>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    {week.days.map((day, idx) => (
                      <div key={idx} className="flex items-center space-x-3">
                        <span className={`text-[10px] font-black text-${week.color}-500 w-16 shrink-0`}>{day.range}</span>
                        <span className="text-xs text-slate-600 font-medium">{day.task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === TAB: Quick Reference === */}
      {activeTab === 'shortcuts' && (
        <div className="space-y-6">
          <h2 className="text-lg font-black text-slate-900">Quick Reference Cheat Sheet</h2>

          {/* Keyboard Shortcuts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Global Shortcuts</h3>
              <div className="space-y-3">
                {GLOBAL_SHORTCUTS.map((sc, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{sc.action}</span>
                    <kbd className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 shadow-sm">
                      {sc.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Navigation Shortcuts</h3>
              <div className="space-y-3">
                {NAV_SHORTCUTS.map((sc, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{sc.action}</span>
                    <kbd className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 shadow-sm">
                      {sc.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily Checklist */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Daily Checklist</h3>
              <button
                onClick={resetChecklist}
                className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                <span>Reset All</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: 'Morning (15 min)', items: DAILY_CHECKLIST.morning, color: 'amber', prefix: 'morning' },
                { title: 'Mid-Day (10 min)', items: DAILY_CHECKLIST.midday, color: 'indigo', prefix: 'midday' },
                { title: 'End of Day (5 min)', items: DAILY_CHECKLIST.endOfDay, color: 'violet', prefix: 'eod' },
              ].map(section => (
                <div key={section.prefix} className={`bg-${section.color}-50/50 rounded-xl p-4`}>
                  <p className={`text-xs font-black text-${section.color}-600 uppercase tracking-wider mb-3`}>{section.title}</p>
                  <div className="space-y-2.5">
                    {section.items.map((item, idx) => {
                      const key = `daily-${section.prefix}-${idx}`;
                      return (
                        <label key={idx} className="flex items-center space-x-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={checkedItems[key] || false}
                            onChange={() => toggleCheck(key)}
                            className={`w-4 h-4 rounded border-slate-300 text-${section.color}-600 focus:ring-${section.color}-500`}
                          />
                          <span className={`text-xs font-medium ${checkedItems[key] ? 'text-slate-400 line-through' : 'text-slate-700'} group-hover:text-slate-900 transition-colors`}>
                            {item}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Tasks */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Weekly Tasks</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(WEEKLY_TASKS).map(([day, tasks]) => (
                <div key={day} className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 capitalize">{day}</p>
                  <div className="space-y-2.5">
                    {tasks.map((task, idx) => {
                      const key = `weekly-${day}-${idx}`;
                      return (
                        <label key={idx} className="flex items-center space-x-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={checkedItems[key] || false}
                            onChange={() => toggleCheck(key)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className={`text-xs font-medium ${checkedItems[key] ? 'text-slate-400 line-through' : 'text-slate-600'} group-hover:text-slate-900 transition-colors`}>
                            {task}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === TAB: Pro Tips === */}
      {activeTab === 'tips' && (
        <div className="space-y-6">
          <h2 className="text-lg font-black text-slate-900">Pro Tips for Maximum Impact</h2>

          <div className="space-y-4">
            {PRO_TIPS.map((tip, idx) => (
              <div key={tip.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start space-x-4">
                  <div className={`w-12 h-12 rounded-xl bg-${tip.color}-50 text-${tip.color}-600 flex items-center justify-center shrink-0`}>
                    {tip.icon}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Tip #{idx + 1}</span>
                    </div>
                    <p className="font-bold text-slate-900">{tip.title}</p>
                    <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{tip.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Onboarding Quick View */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-xl">
            <h3 className="text-xs font-black text-indigo-200 uppercase tracking-wider mb-4">Onboarding Progression</h3>
            <div className="flex items-center space-x-4">
              {ONBOARDING_WEEKS.map((week, idx) => (
                <React.Fragment key={week.week}>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-2 mx-auto">
                      <span className="text-lg font-black">{week.week}</span>
                    </div>
                    <p className="text-xs font-bold text-indigo-200">{week.title}</p>
                  </div>
                  {idx < ONBOARDING_WEEKS.length - 1 && (
                    <div className="flex-1 h-0.5 bg-white/20 rounded-full"></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Version & Doc Info */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-center">
            <p className="text-xs text-slate-400 font-semibold">
              AuraFunnel Help Center v3.1 &bull; Last Updated January 2024 &bull; Document ID: AURA-USER-MANUAL-2024
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              This is a living document. New features and updates are added monthly. Check "What's New" for latest capabilities.
            </p>
          </div>
        </div>
      )}

      {/* ─── Feedback Widget (always visible at bottom) ─── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start space-x-6">
          <div className="flex-1">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-1">Was this helpful?</h3>
            <p className="text-xs text-slate-500 mb-4">Rate your Help Center experience to help us improve</p>
            {feedbackSubmitted ? (
              <div className="flex items-center space-x-2 p-3 bg-emerald-50 rounded-xl">
                <CheckIcon className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-bold text-emerald-700">Thank you for your feedback!</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setFeedbackRating(star)}
                      className={`p-1 rounded transition-all ${
                        feedbackRating !== null && star <= feedbackRating
                          ? 'text-amber-400 scale-110'
                          : 'text-slate-300 hover:text-amber-300'
                      }`}
                    >
                      <StarIcon className="w-6 h-6" />
                    </button>
                  ))}
                  {feedbackRating !== null && (
                    <span className="text-xs font-bold text-slate-500 ml-2">
                      {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][feedbackRating]}
                    </span>
                  )}
                </div>
                {feedbackRating !== null && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={feedbackComment}
                      onChange={e => setFeedbackComment(e.target.value)}
                      placeholder="Optional: Tell us more..."
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={handleFeedbackSubmit}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="hidden md:flex flex-col items-center space-y-2 p-4 bg-slate-50 rounded-xl">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Quick Links</p>
            <button onClick={() => setShowKnowledgeBase(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">Search Knowledge Base</button>
            <button onClick={() => setShowSystemStatus(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">Check System Status</button>
            <button onClick={() => setShowChangelog(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">View Recent Updates</button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── System Status Dashboard Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showSystemStatus && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowSystemStatus(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <ActivityIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">System Status</h2>
                  <p className="text-[10px] text-slate-400">Real-time service health</p>
                </div>
              </div>
              <button onClick={() => setShowSystemStatus(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Overall Status */}
              <div className="text-center p-6 rounded-2xl bg-emerald-50 border border-emerald-100">
                <svg className="w-16 h-16 mx-auto mb-3" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#d1fae5" strokeWidth="6" />
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#10b981" strokeWidth="6"
                    strokeDasharray={`${(SYSTEM_SERVICES.filter(s => s.status === 'operational').length / SYSTEM_SERVICES.length) * 175.9} 175.9`}
                    strokeLinecap="round" transform="rotate(-90 32 32)" />
                  <text x="32" y="30" textAnchor="middle" className="text-sm font-black fill-emerald-700">
                    {SYSTEM_SERVICES.filter(s => s.status === 'operational').length}/{SYSTEM_SERVICES.length}
                  </text>
                  <text x="32" y="42" textAnchor="middle" className="text-[8px] font-bold fill-emerald-500">ONLINE</text>
                </svg>
                <p className="text-sm font-black text-emerald-800">
                  {SYSTEM_SERVICES.every(s => s.status === 'operational') ? 'All Systems Operational' : 'Some Issues Detected'}
                </p>
                <p className="text-[11px] text-emerald-600 mt-1">Last checked: just now</p>
              </div>

              {/* Service List */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Service Health</p>
                <div className="space-y-2">
                  {SYSTEM_SERVICES.map((service, idx) => {
                    const style = STATUS_STYLES[service.status];
                    return (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`} />
                          <span className="text-xs font-bold text-slate-700">{service.name}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${service.uptime}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 w-14 text-right">{service.uptime}%</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Incidents */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Recent Incidents</p>
                {SYSTEM_SERVICES.filter(s => s.lastIncident).length === 0 ? (
                  <div className="p-4 bg-emerald-50 rounded-xl text-center">
                    <CheckIcon className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                    <p className="text-xs font-bold text-emerald-700">No recent incidents</p>
                    <p className="text-[10px] text-emerald-500 mt-0.5">All clear for the past 30 days</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {SYSTEM_SERVICES.filter(s => s.lastIncident).map((service, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                        <div>
                          <p className="text-xs font-bold text-slate-700">{service.name}</p>
                          <p className="text-[10px] text-amber-600">Resolved on {service.lastIncident}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black">Resolved</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SLA Summary */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-3">SLA Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-lg font-black">{(SYSTEM_SERVICES.reduce((s, sv) => s + sv.uptime, 0) / SYSTEM_SERVICES.length).toFixed(2)}%</p>
                    <p className="text-[10px] text-slate-400">Avg Uptime</p>
                  </div>
                  <div>
                    <p className="text-lg font-black">{SYSTEM_SERVICES.filter(s => s.lastIncident).length}</p>
                    <p className="text-[10px] text-slate-400">Incidents (30d)</p>
                  </div>
                  <div>
                    <p className="text-lg font-black">&lt;50ms</p>
                    <p className="text-[10px] text-slate-400">Avg Response</p>
                  </div>
                  <div>
                    <p className="text-lg font-black">99.9%</p>
                    <p className="text-[10px] text-slate-400">SLA Target</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Knowledge Base Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showKnowledgeBase && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowKnowledgeBase(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <BookOpenIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Knowledge Base</h2>
                  <p className="text-[10px] text-slate-400">{KB_ARTICLES.length} articles available</p>
                </div>
              </div>
              <button onClick={() => setShowKnowledgeBase(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Search */}
              <div className="relative">
                <FilterIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={kbSearchQuery}
                  onChange={e => setKbSearchQuery(e.target.value)}
                  placeholder="Search articles by title, category, or tag..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Category Badges */}
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(KB_ARTICLES.map(a => a.category))).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setKbSearchQuery(cat)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                      kbSearchQuery === cat
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                {kbSearchQuery && (
                  <button onClick={() => setKbSearchQuery('')} className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100">
                    Clear
                  </button>
                )}
              </div>

              {/* Articles */}
              <div className="space-y-2">
                {filteredArticles.map(article => (
                  <div key={article.id} className="p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex-1">{article.title}</p>
                      <ArrowRightIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black">{article.category}</span>
                      <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                        <EyeIcon className="w-3 h-3" />
                        <span>{article.views.toLocaleString()}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                        <ClockIcon className="w-3 h-3" />
                        <span>{article.readTime}</span>
                      </span>
                      <span className="text-[10px] text-emerald-600 font-bold">{article.helpful}% helpful</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {article.tags.map(tag => (
                        <span key={tag} className="text-[9px] text-slate-400 bg-white px-1.5 py-0.5 rounded">#{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {filteredArticles.length === 0 && (
                  <div className="p-6 text-center">
                    <FilterIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">No articles found</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Try a different search term</p>
                  </div>
                )}
              </div>

              {/* Popular Tags */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Popular Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(KB_ARTICLES.flatMap(a => a.tags))).slice(0, 12).map(tag => (
                    <button
                      key={tag}
                      onClick={() => setKbSearchQuery(tag)}
                      className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-medium hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Changelog / Updates Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showChangelog && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowChangelog(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                  <LayersIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Recent Updates</h2>
                  <p className="text-[10px] text-slate-400">Changelog & release notes</p>
                </div>
              </div>
              <button onClick={() => setShowChangelog(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Features', value: RECENT_UPDATES.filter(u => u.type === 'feature').length, color: 'indigo' },
                  { label: 'Fixes', value: RECENT_UPDATES.filter(u => u.type === 'fix').length, color: 'red' },
                  { label: 'Improvements', value: RECENT_UPDATES.filter(u => u.type === 'improvement').length, color: 'emerald' },
                ].map((stat, idx) => (
                  <div key={idx} className={`p-3 bg-${stat.color}-50 rounded-xl text-center`}>
                    <p className={`text-xl font-black text-${stat.color}-700`}>{stat.value}</p>
                    <p className={`text-[10px] font-bold text-${stat.color}-500`}>{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Release Timeline</p>
                <div className="relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-200" />
                  <div className="space-y-4">
                    {RECENT_UPDATES.map((update, idx) => {
                      const typeStyle = UPDATE_TYPE_STYLES[update.type];
                      return (
                        <div key={idx} className="relative pl-10">
                          <div className={`absolute left-1.5 top-1.5 w-4 h-4 rounded-full border-2 border-white ${
                            update.type === 'feature' ? 'bg-indigo-500' : update.type === 'fix' ? 'bg-red-500' : 'bg-emerald-500'
                          } shadow`} />
                          <div className="p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${typeStyle.bg} ${typeStyle.text} capitalize`}>{update.type}</span>
                              <span className="text-[10px] font-bold text-slate-400">{update.version}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-900">{update.title}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{update.date}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* What's Coming */}
              <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl text-white">
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-wider mb-3">Coming Soon</p>
                <div className="space-y-2">
                  {[
                    'Advanced A/B testing dashboard',
                    'Multi-language content generation',
                    'Custom AI model fine-tuning',
                    'Real-time collaboration features',
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <SparklesIcon className="w-3.5 h-3.5 text-indigo-300" />
                      <span className="text-xs font-medium text-indigo-100">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback CTA */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <p className="text-xs font-bold text-slate-700 mb-1">Have a feature request?</p>
                <p className="text-[10px] text-slate-400">Share your ideas at feedback@aura-funnel.com</p>
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
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <KeyboardIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900">Help Center Shortcuts</h2>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-3 max-h-80 overflow-y-auto">
              {[
                { key: '1', action: 'Troubleshooting tab' },
                { key: '2', action: 'Optimization tab' },
                { key: '3', action: 'Get Support tab' },
                { key: '4', action: 'Training tab' },
                { key: '5', action: 'Quick Reference tab' },
                { key: '6', action: 'Pro Tips tab' },
                { key: 'S', action: 'System Status' },
                { key: 'K', action: 'Knowledge Base' },
                { key: 'U', action: 'Updates / Changelog' },
                { key: '?', action: 'This shortcuts panel' },
                { key: 'Esc', action: 'Close panels' },
              ].map((sc, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">{sc.action}</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400">Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd> to close</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpCenterPage;
