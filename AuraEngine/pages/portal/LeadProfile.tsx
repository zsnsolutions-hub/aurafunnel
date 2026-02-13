import React, { useState, useEffect, useMemo } from 'react';
import { Lead, User, ContentType } from '../../types';
import {
  TargetIcon, FlameIcon, SparklesIcon, MailIcon, PhoneIcon, ChartIcon,
  TagIcon, UsersIcon, ClockIcon, TrendUpIcon, BoltIcon, CalendarIcon,
  ArrowLeftIcon, CheckIcon, EditIcon, LinkIcon, GlobeIcon
} from '../../components/Icons';
import { supabase } from '../../lib/supabase';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import { generateLeadContent } from '../../lib/gemini';

// ── Helpers ──
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
        <svg key={i} className={`w-5 h-5 ${i <= stars ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

const getLeadTag = (lead: Lead): string => {
  if (lead.score >= 90) return 'Critical';
  if (lead.score >= 80) return 'Hot Lead';
  if (lead.score >= 65) return 'Warm';
  if (lead.status === 'Contacted') return 'Nurturing';
  return 'Cold';
};

const TAG_BADGE: Record<string, string> = {
  'Critical': 'bg-red-100 text-red-700',
  'Hot Lead': 'bg-orange-100 text-orange-700',
  'Warm': 'bg-amber-100 text-amber-700',
  'Nurturing': 'bg-emerald-100 text-emerald-700',
  'Cold': 'bg-blue-100 text-blue-700',
};

// ── Derived / simulated data from lead fields ──
const deriveCompanyDetails = (lead: Lead) => ({
  industry: lead.company.length > 10 ? 'SaaS / Technology' : 'Technology',
  size: `${Math.max(50, Math.round(lead.score * 3))} employees`,
  location: lead.score > 70 ? 'San Francisco, CA' : 'New York, NY',
  website: `${lead.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
});

const deriveContactInfo = (lead: Lead) => ({
  phone: `(555) ${String(Math.abs(lead.name.charCodeAt(0) * 7 + 100)).slice(0, 3)}-${String(Math.abs(lead.name.charCodeAt(1) * 13 + 1000)).slice(0, 4)}`,
  linkedin: `linkedin.com/in/${lead.name.toLowerCase().replace(/\s+/g, '')}`,
});

const derivePredictiveAnalysis = (lead: Lead) => ({
  conversionProb: Math.min(99, lead.score + Math.floor(Math.random() * 8)),
  timeline: lead.score >= 80 ? '3-7 days' : lead.score >= 60 ? '7-14 days' : '14-30 days',
  decisionMaker: lead.score >= 70 ? 'Yes' : 'Likely',
  dealSize: lead.score >= 80 ? '$15,000 - $25,000' : lead.score >= 60 ? '$5,000 - $15,000' : '$1,000 - $5,000',
});

const deriveBehavioralPatterns = (lead: Lead) => {
  const patterns = [];
  if (lead.score >= 70) patterns.push('Engages with technical content');
  if (lead.score >= 60) patterns.push('Most active: Tuesday mornings');
  patterns.push(lead.score >= 75 ? 'Prefers email over phone' : 'Responds well to LinkedIn outreach');
  if (lead.score >= 80) patterns.push('Viewed pricing page multiple times');
  if (lead.status === 'Qualified') patterns.push('Has requested a demo');
  patterns.push('Average response time: 2-4 hours');
  return patterns;
};

const deriveRecommendedActions = (lead: Lead) => {
  const actions = [];
  if (lead.score >= 80) {
    actions.push({ text: 'Send case study on API integration', priority: 'high' });
    actions.push({ text: 'Schedule brief technical demo', priority: 'high' });
  } else {
    actions.push({ text: 'Send introductory email sequence', priority: 'medium' });
    actions.push({ text: 'Share relevant blog content', priority: 'medium' });
  }
  actions.push({ text: `Connect on LinkedIn (shared connections: ${Math.floor(lead.score / 25)})`, priority: 'low' });
  if (lead.status === 'Contacted') actions.push({ text: 'Follow up on previous conversation', priority: 'high' });
  actions.push({ text: 'Add to weekly nurture campaign', priority: 'low' });
  return actions;
};

const deriveEngagementTimeline = (lead: Lead) => {
  const now = new Date();
  const events = [
    { date: new Date(now.getTime() - 2 * 3600000), label: `Viewed pricing page (${Math.ceil(lead.score / 30)}x)`, type: 'page_view' },
    { date: new Date(now.getTime() - 26 * 3600000), label: 'Downloaded whitepaper', type: 'download' },
    { date: new Date(now.getTime() - 3 * 86400000), label: 'Attended webinar', type: 'event' },
    { date: new Date(now.getTime() - 5 * 86400000), label: 'First website visit', type: 'visit' },
  ];
  if (lead.status === 'Contacted') {
    events.splice(1, 0, { date: new Date(now.getTime() - 12 * 3600000), label: 'Replied to outreach email', type: 'email' });
  }
  if (lead.score >= 85) {
    events.splice(1, 0, { date: new Date(now.getTime() - 4 * 3600000), label: 'Requested product demo', type: 'demo' });
  }
  return events;
};

const formatEventDate = (date: Date): string => {
  const now = new Date();
  const diffH = Math.floor((now.getTime() - date.getTime()) / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const eventTypeIcon = (type: string) => {
  switch (type) {
    case 'page_view': return 'bg-blue-100 text-blue-600';
    case 'download': return 'bg-purple-100 text-purple-600';
    case 'event': return 'bg-amber-100 text-amber-600';
    case 'visit': return 'bg-emerald-100 text-emerald-600';
    case 'email': return 'bg-indigo-100 text-indigo-600';
    case 'demo': return 'bg-red-100 text-red-600';
    default: return 'bg-slate-100 text-slate-600';
  }
};

type TabKey = 'ai-insights' | 'activity' | 'notes' | 'campaigns' | 'tasks' | 'files';

// ── Notes State ──
interface NoteItem {
  id: string;
  text: string;
  createdAt: string;
}

// ── Tasks State ──
interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  dueDate: string;
}

const LeadProfile: React.FC = () => {
  const { user } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('ai-insights');

  // Notes
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [newNote, setNewNote] = useState('');

  // Tasks
  const [tasks, setTasks] = useState<TaskItem[]>([
    { id: '1', title: 'Send follow-up email', done: false, dueDate: 'Tomorrow' },
    { id: '2', title: 'Prepare demo materials', done: false, dueDate: 'This week' },
    { id: '3', title: 'Review proposal draft', done: true, dueDate: 'Completed' },
  ]);
  const [newTask, setNewTask] = useState('');

  // Quick action feedback
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Menu
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (leadId) fetchLead();
  }, [leadId]);

  const fetchLead = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    if (data) setLead(data);
    setLoading(false);
  };

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 2500);
  };

  const handleStatusChange = async (newStatus: Lead['status']) => {
    if (!lead) return;
    await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id);
    setLead({ ...lead, status: newStatus });
    showFeedback(`Status updated to ${newStatus}`);
    setMenuOpen(false);
  };

  const handleScoreUpdate = async () => {
    if (!lead) return;
    const newScore = Math.min(100, lead.score + 5);
    await supabase.from('leads').update({ score: newScore }).eq('id', lead.id);
    setLead({ ...lead, score: newScore });
    showFeedback(`Score updated to ${newScore}`);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    setNotes(prev => [{ id: Date.now().toString(), text: newNote, createdAt: new Date().toISOString() }, ...prev]);
    setNewNote('');
  };

  const handleAddTask = () => {
    if (!newTask.trim()) return;
    setTasks(prev => [...prev, { id: Date.now().toString(), title: newTask, done: false, dueDate: 'This week' }]);
    setNewTask('');
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-700">
        <div className="h-8 w-40 bg-slate-100 animate-pulse rounded-lg"></div>
        <div className="h-64 bg-slate-100 animate-pulse rounded-2xl"></div>
        <div className="h-96 bg-slate-100 animate-pulse rounded-2xl"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 text-lg">Lead not found.</p>
        <button onClick={() => navigate('/portal/leads')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">
          Back to Leads
        </button>
      </div>
    );
  }

  const tag = getLeadTag(lead);
  const company = deriveCompanyDetails(lead);
  const contact = deriveContactInfo(lead);
  const prediction = derivePredictiveAnalysis(lead);
  const patterns = deriveBehavioralPatterns(lead);
  const actions = deriveRecommendedActions(lead);
  const timeline = deriveEngagementTimeline(lead);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'ai-insights', label: 'AI Insights' },
    { key: 'activity', label: 'Activity' },
    { key: 'notes', label: 'Notes' },
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'files', label: 'Files' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/portal/leads')}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2 text-sm text-slate-400 mb-0.5">
              <button onClick={() => navigate('/portal/leads')} className="hover:text-indigo-600 transition-colors">Leads</button>
              <span>/</span>
              <span className="text-slate-600 font-medium">{lead.name}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 font-heading">
              {lead.name} <span className="text-slate-400 font-normal">—</span> <span className="text-slate-600">{lead.company}</span>
            </h1>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-slate-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-48 overflow-hidden">
              <p className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Change Status</p>
              {(['New', 'Contacted', 'Qualified', 'Lost'] as Lead['status'][]).map(s => (
                <button key={s} onClick={() => handleStatusChange(s)} className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-indigo-50 hover:text-indigo-600 transition-colors ${lead.status === s ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-700'}`}>
                  {s}
                </button>
              ))}
              <div className="border-t border-slate-100">
                <button onClick={() => { navigate('/portal/leads'); }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                  Back to Leads
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Feedback */}
      {actionFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-bold flex items-center space-x-2 animate-in fade-in duration-300">
          <CheckIcon className="w-4 h-4" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* ── Main Layout: Content (left) + Quick Actions (right) ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Lead Overview + Tabs ── */}
        <div className="flex-grow space-y-6">

          {/* Lead Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Avatar + Score */}
              <div className="flex flex-col items-center space-y-4">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-indigo-100">
                  {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="text-center">
                  <div className="flex items-center space-x-1 mb-1">
                    <TargetIcon className="w-4 h-4 text-indigo-600" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lead Score</span>
                  </div>
                  <StarRating score={lead.score} />
                  <p className="text-2xl font-black text-slate-900 mt-1">{lead.score}</p>
                </div>
                <span className={`px-3 py-1 rounded-lg text-xs font-bold ${TAG_BADGE[tag] || 'bg-slate-100 text-slate-600'}`}>
                  {tag}
                </span>
              </div>

              {/* Details Grid */}
              <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lead Info */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                    <TargetIcon className="w-3.5 h-3.5" />
                    <span>Lead Details</span>
                  </h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Status</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        lead.status === 'Qualified' ? 'bg-indigo-50 text-indigo-600' :
                        lead.status === 'New' ? 'bg-blue-50 text-blue-600' :
                        lead.status === 'Contacted' ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-600'
                      }`}>{lead.status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Owner</span>
                      <span className="text-xs font-bold text-slate-800">You</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Source</span>
                      <span className="text-xs font-medium text-slate-700">Website Form</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Added</span>
                      <span className="text-xs font-medium text-slate-700">
                        {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                    <PhoneIcon className="w-3.5 h-3.5" />
                    <span>Contact Info</span>
                  </h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center space-x-2">
                      <MailIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-indigo-600 font-medium truncate">{lead.email}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <PhoneIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-700 font-medium">{contact.phone}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-indigo-600 font-medium truncate">{contact.linkedin}</span>
                    </div>
                  </div>
                </div>

                {/* Company Details */}
                <div className="md:col-span-2">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                    <GlobeIcon className="w-3.5 h-3.5" />
                    <span>Company Details</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { label: 'Company', value: lead.company },
                      { label: 'Industry', value: company.industry },
                      { label: 'Size', value: company.size },
                      { label: 'Location', value: company.location },
                      { label: 'Website', value: company.website },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-[10px] text-slate-400 font-bold">{item.label}</p>
                        <p className="text-xs font-medium text-slate-800 mt-0.5 truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabbed Interface ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Tab Bar */}
            <div className="flex border-b border-slate-100 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-6 py-4 text-sm font-bold whitespace-nowrap transition-all relative ${
                    activeTab === tab.key
                      ? 'text-indigo-600'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6">

              {/* ── AI INSIGHTS TAB ── */}
              {activeTab === 'ai-insights' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Predictive Analysis */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <TargetIcon className="w-4 h-4 text-indigo-600" />
                      <span>Predictive Analysis</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Conversion Probability', value: `${prediction.conversionProb}%`, color: 'bg-emerald-50 text-emerald-700' },
                        { label: 'Expected Timeline', value: prediction.timeline, color: 'bg-blue-50 text-blue-700' },
                        { label: 'Key Decision Maker', value: prediction.decisionMaker, color: 'bg-purple-50 text-purple-700' },
                        { label: 'Est. Deal Size', value: prediction.dealSize, color: 'bg-amber-50 text-amber-700' },
                      ].map(item => (
                        <div key={item.label} className={`p-4 rounded-xl ${item.color}`}>
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">{item.label}</p>
                          <p className="text-sm font-bold">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Behavioral Patterns */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <ChartIcon className="w-4 h-4 text-indigo-600" />
                      <span>Behavioral Patterns</span>
                    </h3>
                    <div className="space-y-2">
                      {patterns.map((p, i) => (
                        <div key={i} className="flex items-start space-x-3 p-3 bg-slate-50 rounded-xl">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0"></div>
                          <p className="text-sm text-slate-700">{p}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Actions */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <BoltIcon className="w-4 h-4 text-indigo-600" />
                      <span>Recommended Actions</span>
                    </h3>
                    <div className="space-y-2">
                      {actions.map((a, i) => (
                        <div key={i} className="flex items-center justify-between p-3.5 bg-white border border-slate-100 rounded-xl hover:border-indigo-100 hover:bg-indigo-50/30 transition-all">
                          <div className="flex items-center space-x-3">
                            <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                            <p className="text-sm text-slate-700 font-medium">{a.text}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${
                            a.priority === 'high' ? 'bg-red-50 text-red-600' :
                            a.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>{a.priority}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Engagement Timeline */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <ClockIcon className="w-4 h-4 text-indigo-600" />
                      <span>Engagement Timeline</span>
                    </h3>
                    <div className="relative">
                      <div className="absolute top-0 bottom-0 left-[15px] w-px bg-slate-200"></div>
                      <div className="space-y-4">
                        {timeline.map((event, i) => (
                          <div key={i} className="flex items-start space-x-4 relative">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 z-10 ${eventTypeIcon(event.type)}`}>
                              <ClockIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-grow bg-white border border-slate-100 rounded-xl p-3.5">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-800">{event.label}</p>
                                <span className="text-[10px] font-bold text-slate-400 ml-2">{formatEventDate(event.date)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACTIVITY TAB ── */}
              {activeTab === 'activity' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <p className="text-xs text-slate-400 mb-4">Recent activity and interactions with this lead.</p>
                  {timeline.map((event, i) => (
                    <div key={i} className="flex items-center space-x-4 p-4 bg-slate-50 rounded-xl">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${eventTypeIcon(event.type)}`}>
                        <ClockIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-grow">
                        <p className="text-sm font-medium text-slate-800">{event.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatEventDate(event.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── NOTES TAB ── */}
              {activeTab === 'notes' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                      placeholder="Add a note..."
                      className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors"
                    />
                    <button onClick={handleAddNote} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
                      Add
                    </button>
                  </div>
                  {notes.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm italic py-8">No notes yet. Add your first note above.</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map(note => (
                        <div key={note.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-sm text-slate-800">{note.text}</p>
                          <p className="text-[10px] text-slate-400 mt-2">
                            {new Date(note.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── CAMPAIGNS TAB ── */}
              {activeTab === 'campaigns' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <SparklesIcon className="w-8 h-8 text-indigo-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-700 mb-1">No active campaigns</p>
                    <p className="text-xs text-slate-400 mb-4">Add this lead to a campaign to start automated outreach.</p>
                    <button
                      onClick={() => showFeedback('Lead added to nurture campaign')}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Add to Campaign
                    </button>
                  </div>
                </div>
              )}

              {/* ── TASKS TAB ── */}
              {activeTab === 'tasks' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={newTask}
                      onChange={e => setNewTask(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                      placeholder="Add a task..."
                      className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors"
                    />
                    <button onClick={handleAddTask} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-center space-x-3 p-3.5 bg-white border border-slate-100 rounded-xl hover:border-indigo-100 transition-colors">
                        <button onClick={() => toggleTask(task.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${task.done ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                          {task.done && <CheckIcon className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-grow">
                          <p className={`text-sm font-medium ${task.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</p>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">{task.dueDate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── FILES TAB ── */}
              {activeTab === 'files' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed text-center">
                    <svg className="w-8 h-8 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm font-bold text-slate-600 mb-1">Drop files here or click to upload</p>
                    <p className="text-xs text-slate-400">Proposals, contracts, and documents related to this lead.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Quick Actions Panel ── */}
        <div className="w-full lg:w-72 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-8">
            <h3 className="font-bold text-slate-800 font-heading text-sm mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => showFeedback('Email composer opened')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-semibold text-sm"
              >
                <MailIcon className="w-4 h-4" />
                <span>Send Email</span>
              </button>
              <button
                onClick={() => showFeedback('Call logged successfully')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors font-semibold text-sm"
              >
                <PhoneIcon className="w-4 h-4" />
                <span>Log Call</span>
              </button>
              <button
                onClick={() => showFeedback('Meeting scheduler opened')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-semibold text-sm"
              >
                <CalendarIcon className="w-4 h-4" />
                <span>Schedule Meeting</span>
              </button>
              <button
                onClick={() => showFeedback('Lead added to nurture campaign')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-semibold text-sm"
              >
                <TargetIcon className="w-4 h-4" />
                <span>Add to Campaign</span>
              </button>
              <button
                onClick={() => showFeedback('Tag "Priority" added')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-semibold text-sm"
              >
                <TagIcon className="w-4 h-4" />
                <span>Add Tag</span>
              </button>
              <button
                onClick={handleScoreUpdate}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors font-semibold text-sm"
              >
                <ChartIcon className="w-4 h-4" />
                <span>Update Score</span>
              </button>
              <button
                onClick={() => showFeedback('Assignment dialog opened')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors font-semibold text-sm"
              >
                <UsersIcon className="w-4 h-4" />
                <span>Assign to Team</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadProfile;
