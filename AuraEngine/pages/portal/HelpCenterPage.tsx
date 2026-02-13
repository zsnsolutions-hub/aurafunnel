import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import {
  HelpCircleIcon, BookOpenIcon, KeyboardIcon, LightBulbIcon, AcademicCapIcon,
  ShieldIcon, SparklesIcon, CheckIcon, ClockIcon, MailIcon, PhoneIcon,
  MessageIcon, AlertTriangleIcon, TrendUpIcon, RefreshIcon, TargetIcon,
  DocumentIcon, BoltIcon, ChartIcon, CogIcon, XIcon
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
      <div>
        <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">Help Center</h1>
        <p className="text-slate-500 mt-1 text-sm">Troubleshooting, guides, shortcuts, and expert tips to maximize your AuraFunnel experience</p>
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
    </div>
  );
};

export default HelpCenterPage;
