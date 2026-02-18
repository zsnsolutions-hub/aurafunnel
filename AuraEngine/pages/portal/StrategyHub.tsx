import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Lead } from '../../types';
import { supabase } from '../../lib/supabase';
import { generatePipelineStrategy, parsePipelineStrategyResponse, PipelineStrategyResponse } from '../../lib/gemini';
import {
  BoltIcon, SparklesIcon, CheckIcon, ShieldIcon, UsersIcon, MailIcon,
  ClockIcon, PlusIcon, XIcon, EditIcon, TagIcon, TargetIcon, FlameIcon,
  BellIcon, CalendarIcon, MessageIcon, ArrowRightIcon, RefreshIcon,
  CogIcon, EyeIcon, TrendUpIcon, TrendDownIcon, ActivityIcon, AlertTriangleIcon, BrainIcon,
  KeyboardIcon, StarIcon, FilterIcon, LayersIcon, PieChartIcon, RocketIcon, DocumentIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ─── Types ───
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
type TabView = 'dashboard' | 'tasks' | 'notes' | 'risks';

interface StrategyTask {
  id: string;
  user_id: string;
  title: string;
  priority: TaskPriority;
  deadline: string | null;
  completed: boolean;
  lead_id: string | null;
  created_at: string;
  lead_name?: string;
}

interface StrategyNote {
  id: string;
  user_id: string;
  content: string;
  lead_name: string | null;
  created_at: string;
}

interface PipelineRisk {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action: string;
}

interface AISprintGoal {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  deadline: string;
}

interface ActivityLogItem {
  id: string;
  action: string;
  details: string | null;
  created_at: string;
}

// ─── Constants ───
const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'bg-rose-100 text-rose-700' },
  high: { label: 'High', color: 'bg-amber-100 text-amber-700' },
  normal: { label: 'Normal', color: 'bg-indigo-100 text-indigo-700' },
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' },
};

const DAILY_ROUTINE = [
  {
    time: '9:00 AM',
    label: 'Morning',
    color: 'amber',
    tasks: [
      'Check pipeline dashboard',
      'Review hot leads (score > 80)',
      'Check new activity in timeline',
      'Plan today\'s outreach',
    ],
  },
  {
    time: '1:00 PM',
    label: 'Mid-day',
    color: 'indigo',
    tasks: [
      'Follow up on pending tasks',
      'Review email responses',
      'Update lead statuses',
      'Log activities and notes',
    ],
  },
  {
    time: '5:00 PM',
    label: 'End of Day',
    color: 'violet',
    tasks: [
      'Review pipeline changes',
      'Update strategy notes',
      'Set priorities for tomorrow',
      'Review sprint goal progress',
    ],
  },
];

type ActivityType = 'task' | 'lead' | 'note' | 'conflict' | 'status';
const ACTIVITY_ICONS: Record<ActivityType, { icon: React.ReactNode; color: string }> = {
  task: { icon: <CheckIcon className="w-3 h-3" />, color: 'bg-emerald-100 text-emerald-600' },
  lead: { icon: <TargetIcon className="w-3 h-3" />, color: 'bg-indigo-100 text-indigo-600' },
  note: { icon: <MessageIcon className="w-3 h-3" />, color: 'bg-violet-100 text-violet-600' },
  conflict: { icon: <AlertTriangleIcon className="w-3 h-3" />, color: 'bg-amber-100 text-amber-600' },
  status: { icon: <ActivityIcon className="w-3 h-3" />, color: 'bg-cyan-100 text-cyan-600' },
};

// ─── Computation helpers ───
function computePipelineRisks(leads: Lead[]): PipelineRisk[] {
  const risks: PipelineRisk[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  // Stale "New" leads
  const staleNew = leads.filter(l => l.status === 'New' && l.created_at && new Date(l.created_at) < sevenDaysAgo);
  if (staleNew.length > 3) {
    risks.push({ id: 'pr-1', severity: 'critical', category: 'Pipeline', title: `${staleNew.length} Stale New Leads`, description: `${staleNew.length} leads created over 7 days ago still have "New" status. They may be going cold.`, action: 'Contact or qualify these leads immediately' });
  } else if (staleNew.length > 0) {
    risks.push({ id: 'pr-1', severity: 'high', category: 'Pipeline', title: `${staleNew.length} Stale New Lead${staleNew.length > 1 ? 's' : ''}`, description: `Lead${staleNew.length > 1 ? 's' : ''} created over 7 days ago still at "New" status.`, action: 'Review and move forward or archive' });
  }

  // Hot leads not Qualified/Converted
  const hotUnqualified = leads.filter(l => l.score > 80 && l.status !== 'Qualified' && l.status !== 'Converted');
  if (hotUnqualified.length > 0) {
    risks.push({ id: 'pr-2', severity: 'critical', category: 'Pipeline', title: `${hotUnqualified.length} Hot Lead${hotUnqualified.length > 1 ? 's' : ''} Not Qualified`, description: `High-score leads (>80) that haven't been qualified yet: ${hotUnqualified.slice(0, 3).map(l => l.name).join(', ')}${hotUnqualified.length > 3 ? '...' : ''}`, action: 'Prioritize qualifying these hot leads' });
  }

  // Pipeline heavy on low-score leads
  const lowScore = leads.filter(l => l.score < 40);
  if (leads.length > 0 && (lowScore.length / leads.length) > 0.6) {
    risks.push({ id: 'pr-3', severity: 'medium', category: 'Quality', title: 'Pipeline Quality Concern', description: `${Math.round((lowScore.length / leads.length) * 100)}% of leads have scores below 40. Pipeline may need better lead sourcing.`, action: 'Review lead generation strategy and sources' });
  }

  // High lost rate
  const lost = leads.filter(l => l.status === 'Lost');
  if (leads.length > 0 && (lost.length / leads.length) > 0.3) {
    risks.push({ id: 'pr-4', severity: 'high', category: 'Conversion', title: 'High Loss Rate', description: `${Math.round((lost.length / leads.length) * 100)}% of leads are marked as Lost. Review your conversion process.`, action: 'Analyze lost leads for common patterns' });
  }

  if (risks.length === 0) {
    risks.push({ id: 'pr-0', severity: 'low', category: 'Status', title: 'All Clear', description: 'No significant pipeline risks detected. Keep up the good work!', action: 'Maintain current pace' });
  }

  return risks;
}

function computeSprintGoals(leads: Lead[], tasks: StrategyTask[], emailsSent: number): AISprintGoal[] {
  const newOrContacted = leads.filter(l => l.status === 'New' || l.status === 'Contacted').length;
  const qualified = leads.filter(l => l.status === 'Qualified').length;
  const converted = leads.filter(l => l.status === 'Converted').length;
  const hotLeads = leads.filter(l => l.score > 80).length;
  const completedTasks = tasks.filter(t => t.completed).length;

  return [
    { id: 'sg-1', title: 'Qualify Pipeline Leads', target: Math.max(Math.round(newOrContacted * 0.3), 3), current: qualified, unit: 'leads', deadline: '2026-03-01' },
    { id: 'sg-2', title: 'Outreach Emails Sent', target: 30, current: emailsSent, unit: 'emails', deadline: '2026-03-01' },
    { id: 'sg-3', title: 'Strategy Tasks Completed', target: Math.max(5, tasks.length), current: completedTasks, unit: 'tasks', deadline: '2026-03-01' },
    { id: 'sg-4', title: 'Convert Hot Leads', target: Math.max(3, hotLeads), current: converted, unit: 'conversions', deadline: '2026-03-01' },
  ];
}

function formatAction(action: string): { label: string; type: ActivityType } {
  const a = action.toLowerCase();
  if (a.includes('task') || a.includes('completed') || a.includes('created task')) return { label: action, type: 'task' };
  if (a.includes('lead') || a.includes('qualified') || a.includes('converted') || a.includes('contacted') || a.includes('score') || a.includes('status')) return { label: action, type: 'lead' };
  if (a.includes('note') || a.includes('message') || a.includes('comment')) return { label: action, type: 'note' };
  if (a.includes('conflict') || a.includes('risk') || a.includes('alert')) return { label: action, type: 'conflict' };
  if (a.includes('login') || a.includes('logout') || a.includes('settings') || a.includes('profile')) return { label: action, type: 'status' };
  return { label: action, type: 'task' };
}

// ─── Component ───
const StrategyHub: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [activeTab, setActiveTab] = useState<TabView>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<StrategyTask[]>([]);
  const [notes, setNotes] = useState<StrategyNote[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [emailsSent, setEmailsSent] = useState(0);
  const [pipelineRisks, setPipelineRisks] = useState<PipelineRisk[]>([]);
  const [sprintGoals, setSprintGoals] = useState<AISprintGoal[]>([]);
  const [aiStrategy, setAiStrategy] = useState<PipelineStrategyResponse | null>(null);
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [dismissedRisks, setDismissedRisks] = useState<Set<string>>(() => {
    try { const s = sessionStorage.getItem('aura_dismissed_risks'); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [loading, setLoading] = useState(true);

  // Task modal
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('normal');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  // Note
  const [newNoteContent, setNewNoteContent] = useState('');

  // Sidebar panels
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showWorkload, setShowWorkload] = useState(false);
  const [showTeamVelocity, setShowTeamVelocity] = useState(false);
  const [showCommunicationHub, setShowCommunicationHub] = useState(false);
  const [showRiskAssessment, setShowRiskAssessment] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'urgent' | 'overdue'>('all');

  // Routine checklist
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('aura_routine_checks');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    sessionStorage.setItem('aura_routine_checks', JSON.stringify([...checkedItems]));
  }, [checkedItems]);

  const toggleCheck = useCallback((key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ─── Data Loading ───
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [leadsRes, tasksRes, notesRes, activityRes] = await Promise.all([
          supabase.from('leads').select('*').eq('client_id', user.id).order('score', { ascending: false }),
          supabase.from('strategy_tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('strategy_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('audit_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        ]);

        let emailCount = 0;
        try {
          const { count } = await supabase.from('email_messages').select('id', { count: 'exact', head: true });
          emailCount = count || 0;
        } catch {
          emailCount = 0;
        }

        const loadedLeads: Lead[] = leadsRes.data || [];
        const loadedTasks: StrategyTask[] = (tasksRes.data || []).map((t: any) => ({
          id: t.id,
          user_id: t.user_id,
          title: t.title,
          priority: t.priority || 'normal',
          deadline: t.deadline,
          completed: t.completed || false,
          lead_id: t.lead_id,
          created_at: t.created_at,
          lead_name: undefined,
        }));
        const loadedNotes: StrategyNote[] = (notesRes.data || []).map((n: any) => ({
          id: n.id,
          user_id: n.user_id,
          content: n.content,
          lead_name: n.lead_name || null,
          created_at: n.created_at,
        }));
        const loadedActivity: ActivityLogItem[] = (activityRes.data || []).map((a: any) => ({
          id: a.id,
          action: a.action || '',
          details: a.details || null,
          created_at: a.created_at,
        }));

        setLeads(loadedLeads);
        setTasks(loadedTasks);
        setNotes(loadedNotes);
        setActivityLog(loadedActivity);
        setEmailsSent(emailCount);

        const risks = computePipelineRisks(loadedLeads);
        setPipelineRisks(risks);

        const goals = computeSprintGoals(loadedLeads, loadedTasks, emailCount);
        setSprintGoals(goals);
      } catch (err) {
        console.error('StrategyHub data load error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user.id]);

  // ─── useMemo blocks ───
  const pendingTasks = tasks.filter(t => !t.completed).length;

  const kpiStats = useMemo(() => {
    const avgScore = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0;
    const completionRate = tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0;
    const urgentCount = tasks.filter(t => !t.completed && t.priority === 'urgent').length;
    const activeRiskCount = pipelineRisks.filter(r => !dismissedRisks.has(r.id) && r.severity !== 'low').length;
    const sprintPct = sprintGoals.length > 0
      ? Math.round((sprintGoals.reduce((s, g) => s + Math.min(g.current, g.target), 0) / sprintGoals.reduce((s, g) => s + g.target, 0)) * 100)
      : 0;

    return [
      { label: 'Total Leads', value: leads.length, icon: <UsersIcon className="w-4 h-4" />, color: 'indigo', trend: `${leads.filter(l => l.score > 80).length} hot`, up: true },
      { label: 'Avg Score', value: avgScore, icon: <TargetIcon className="w-4 h-4" />, color: 'emerald', trend: avgScore >= 50 ? 'Healthy pipeline' : 'Needs attention', up: avgScore >= 50 },
      { label: 'Tasks Pending', value: pendingTasks, icon: <ClockIcon className="w-4 h-4" />, color: 'amber', trend: `${urgentCount} urgent`, up: urgentCount === 0 },
      { label: 'Completion Rate', value: `${completionRate}%`, icon: <CheckIcon className="w-4 h-4" />, color: 'violet', trend: `${tasks.filter(t => t.completed).length} done`, up: completionRate >= 50 },
      { label: 'Pipeline Risks', value: activeRiskCount, icon: <AlertTriangleIcon className="w-4 h-4" />, color: activeRiskCount > 0 ? 'rose' : 'emerald', trend: activeRiskCount > 0 ? 'Needs attention' : 'All clear', up: activeRiskCount === 0 },
      { label: 'Sprint Progress', value: `${sprintPct}%`, icon: <BoltIcon className="w-4 h-4" />, color: 'cyan', trend: `${sprintGoals.reduce((s, g) => s + (g.target - Math.min(g.current, g.target)), 0)} remaining`, up: sprintPct >= 40 },
    ];
  }, [leads, tasks, pendingTasks, pipelineRisks, dismissedRisks, sprintGoals]);

  const pipelineDistribution = useMemo(() => {
    const statuses: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
    return statuses.map(status => {
      const matching = leads.filter(l => l.status === status);
      const count = matching.length;
      const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
      const avgScore = count > 0 ? Math.round(matching.reduce((s, l) => s + l.score, 0) / count) : 0;
      return { status, count, pct, avgScore };
    });
  }, [leads]);

  const topLeadsByScore = useMemo(() => {
    return [...leads].sort((a, b) => b.score - a.score).slice(0, 8).map((lead, i) => ({
      ...lead,
      rank: i + 1,
    }));
  }, [leads]);

  const pipelineVelocity = useMemo(() => {
    const completedTasks = tasks.filter(t => t.completed).length;
    const totalTasks = tasks.length;
    const velocityScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Group activity by weekday
    const dayCounts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    activityLog.forEach(a => {
      const d = new Date(a.created_at);
      const name = dayNames[d.getDay()];
      if (name in dayCounts) dayCounts[name]++;
    });
    const dailyData = Object.entries(dayCounts).map(([day, count]) => ({ day, activity: count }));
    const totalActivity = dailyData.reduce((s, d) => s + d.activity, 0);
    const avgActivity = dailyData.length > 0 ? Math.round(totalActivity / dailyData.length) : 0;

    const sprintBurndown = sprintGoals.map(g => ({
      name: g.title.substring(0, 15) + (g.title.length > 15 ? '...' : ''),
      remaining: Math.max(g.target - g.current, 0),
      total: g.target,
      pct: g.target > 0 ? Math.round((Math.min(g.current, g.target) / g.target) * 100) : 0,
    }));
    const daysLeft = Math.max(0, Math.ceil((new Date('2026-03-01').getTime() - Date.now()) / 86400000));
    const remainingWork = sprintGoals.reduce((s, g) => s + Math.max(g.target - g.current, 0), 0);
    const requiredDailyRate = daysLeft > 0 ? Math.ceil(remainingWork / daysLeft) : 0;

    return { velocityScore, dailyData, avgActivity, totalActivity, sprintBurndown, requiredDailyRate, remainingWork, daysLeft };
  }, [tasks, activityLog, sprintGoals]);

  const journalMetrics = useMemo(() => {
    const totalNotes = notes.length;
    const notesWithLeads = notes.filter(n => n.lead_name).length;
    const totalActivity = activityLog.length;

    // Activity by hour
    const hourCounts: Record<string, number> = {};
    ['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm'].forEach(h => { hourCounts[h] = 0; });
    activityLog.forEach(a => {
      const h = new Date(a.created_at).getHours();
      const labels: Record<number, string> = { 9: '9am', 10: '10am', 11: '11am', 12: '12pm', 13: '1pm', 14: '2pm', 15: '3pm', 16: '4pm', 17: '5pm' };
      if (labels[h]) hourCounts[labels[h]]++;
    });
    const hourlyActivity = Object.entries(hourCounts).map(([hour, count]) => ({ hour, count }));

    const activityScore = Math.min(Math.round(((totalNotes * 3 + totalActivity) / Math.max(1, 1)) * 5), 100);

    return { totalNotes, notesWithLeads, totalActivity, hourlyActivity, activityScore };
  }, [notes, activityLog]);

  const riskAssessmentData = useMemo(() => {
    const risks = pipelineRisks.filter(r => !dismissedRisks.has(r.id));
    const riskScore = Math.max(0, 100 - (risks.filter(r => r.severity === 'critical').length * 25) - (risks.filter(r => r.severity === 'high').length * 15) - (risks.filter(r => r.severity === 'medium').length * 8));
    return { risks, riskScore };
  }, [pipelineRisks, dismissedRisks]);

  const activeRiskCount = riskAssessmentData.risks.length;

  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];
    switch (taskFilter) {
      case 'urgent':
        filtered = filtered.filter(t => !t.completed && (t.priority === 'urgent' || t.priority === 'high'));
        break;
      case 'overdue':
        filtered = filtered.filter(t => !t.completed && t.deadline && new Date(t.deadline) < new Date());
        break;
      case 'pending':
        filtered = filtered.filter(t => !t.completed);
        break;
    }
    return filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });
  }, [tasks, taskFilter]);

  // ─── Handlers ───
  const handleAddTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    const tempId = `tt-${Date.now()}`;
    const optimisticTask: StrategyTask = {
      id: tempId,
      user_id: user.id,
      title: newTaskTitle,
      priority: newTaskPriority,
      deadline: newTaskDeadline || null,
      completed: false,
      lead_id: null,
      created_at: new Date().toISOString(),
    };
    setTasks(prev => [optimisticTask, ...prev]);
    setNewTaskTitle('');
    setNewTaskDeadline('');
    setShowNewTask(false);

    try {
      const { data, error } = await supabase.from('strategy_tasks').insert({
        user_id: user.id,
        title: optimisticTask.title,
        priority: optimisticTask.priority,
        deadline: optimisticTask.deadline,
        completed: false,
      }).select().single();

      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: data.id } : t));
    } catch (err) {
      console.error('Failed to create task:', err);
      setTasks(prev => prev.filter(t => t.id !== tempId));
    }
  }, [newTaskTitle, newTaskPriority, newTaskDeadline, user.id]);

  const toggleTaskComplete = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newCompleted = !task.completed;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t));

    try {
      const { error } = await supabase.from('strategy_tasks').update({ completed: newCompleted }).eq('id', taskId);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to toggle task:', err);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !newCompleted } : t));
    }
  }, [tasks]);

  const handleAddNote = useCallback(async () => {
    if (!newNoteContent.trim()) return;
    const tempId = `tn-${Date.now()}`;
    const optimisticNote: StrategyNote = {
      id: tempId,
      user_id: user.id,
      content: newNoteContent,
      lead_name: null,
      created_at: new Date().toISOString(),
    };
    setNotes(prev => [optimisticNote, ...prev]);
    setNewNoteContent('');

    try {
      const { data, error } = await supabase.from('strategy_notes').insert({
        user_id: user.id,
        content: optimisticNote.content,
      }).select().single();

      if (error) throw error;
      setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: data.id } : n));
    } catch (err) {
      console.error('Failed to create note:', err);
      setNotes(prev => prev.filter(n => n.id !== tempId));
    }
  }, [newNoteContent, user.id]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));

    try {
      const { error } = await supabase.from('strategy_notes').delete().eq('id', noteId);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to delete note:', err);
      if (note) setNotes(prev => [note, ...prev]);
    }
  }, [notes]);

  const dismissRisk = useCallback((riskId: string) => {
    setDismissedRisks(prev => {
      const next = new Set(prev);
      next.add(riskId);
      sessionStorage.setItem('aura_dismissed_risks', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleGenerateStrategy = useCallback(async () => {
    if (isGeneratingStrategy) return;
    setIsGeneratingStrategy(true);

    try {
      const statusBreakdown: Record<string, number> = {};
      leads.forEach(l => { statusBreakdown[l.status] = (statusBreakdown[l.status] || 0) + 1; });
      const avgScore = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0;
      const hotLeads = leads.filter(l => l.score > 80).length;
      const converted = leads.filter(l => l.status === 'Converted').length;
      const conversionRate = leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0;
      const recentActions = activityLog.slice(0, 5).map(a => `${a.action}${a.details ? ': ' + a.details : ''}`).join('; ') || 'No recent activity';

      const response = await generatePipelineStrategy({
        totalLeads: leads.length,
        avgScore,
        statusBreakdown,
        hotLeads,
        recentActivity: recentActions,
        emailsSent,
        emailsOpened: 0,
        conversionRate,
        businessProfile: user.businessProfile,
      });

      if (response.text) {
        const parsed = parsePipelineStrategyResponse(response.text);
        setAiStrategy(parsed);

        // Update sprint goals if AI provided them
        if (parsed.sprintGoals.length > 0) {
          setSprintGoals(parsed.sprintGoals.map((g, i) => ({
            id: `sg-ai-${i + 1}`,
            title: g.title,
            target: g.target,
            current: g.current,
            unit: g.unit,
            deadline: g.deadline,
          })));
        }

        // Log to ai_usage_logs
        try {
          await supabase.from('ai_usage_logs').insert({
            user_id: user.id,
            prompt_name: response.prompt_name,
            prompt_version: response.prompt_version,
            tokens_used: response.tokens_used,
            model_name: response.model_name,
          });
        } catch { /* ignore logging failures */ }

        // Log to audit_logs
        try {
          await supabase.from('audit_logs').insert({
            user_id: user.id,
            action: 'Generated pipeline strategy',
            details: `AI strategy with ${parsed.recommendations.length} recommendations`,
          });
        } catch { /* ignore logging failures */ }
      }
    } catch (err) {
      console.error('Strategy generation failed:', err);
    } finally {
      setIsGeneratingStrategy(false);
    }
  }, [isGeneratingStrategy, leads, activityLog, emailsSent, user.id, user.businessProfile]);

  // ─── Routine helpers ───
  const currentHour = new Date().getHours();
  const currentRoutine = currentHour < 12 ? 0 : currentHour < 16 ? 1 : 2;

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput || showNewTask) return;

      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showPerformance) { setShowPerformance(false); return; }
        if (showWorkload) { setShowWorkload(false); return; }
        if (showTeamVelocity) { setShowTeamVelocity(false); return; }
        if (showCommunicationHub) { setShowCommunicationHub(false); return; }
        if (showRiskAssessment) { setShowRiskAssessment(false); return; }
        return;
      }

      const shortcuts: Record<string, () => void> = {
        '1': () => setActiveTab('dashboard'),
        '2': () => setActiveTab('tasks'),
        '3': () => setActiveTab('notes'),
        '4': () => setActiveTab('risks'),
        'n': () => setShowNewTask(true),
        'p': () => setShowPerformance(prev => !prev),
        'w': () => setShowWorkload(prev => !prev),
        't': () => setShowTeamVelocity(prev => !prev),
        'm': () => setShowCommunicationHub(prev => !prev),
        'r': () => setShowRiskAssessment(prev => !prev),
        'g': () => handleGenerateStrategy(),
        '?': () => setShowShortcuts(prev => !prev),
      };

      if (shortcuts[e.key]) {
        e.preventDefault();
        shortcuts[e.key]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNewTask, showShortcuts, showPerformance, showWorkload, showTeamVelocity, showCommunicationHub, showRiskAssessment, handleGenerateStrategy]);

  const tabs: { id: TabView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <TargetIcon className="w-4 h-4" /> },
    { id: 'tasks', label: 'Strategy Tasks', icon: <CheckIcon className="w-4 h-4" />, badge: pendingTasks },
    { id: 'notes', label: 'Strategy Notes', icon: <MessageIcon className="w-4 h-4" />, badge: notes.length },
    { id: 'risks', label: 'Pipeline Risks', icon: <AlertTriangleIcon className="w-4 h-4" />, badge: activeRiskCount },
  ];

  // ─── STATUS COLORS for pipeline ───
  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    New: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    Contacted: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    Qualified: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
    Converted: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Lost: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  };

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* LOADING SKELETON                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {loading && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-40 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-4 w-72 bg-slate-100 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-9 w-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg animate-pulse" />
                  <div className="w-4 h-4 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="h-6 w-12 bg-slate-200 rounded animate-pulse mb-1" />
                <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm h-64 animate-pulse" />
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm h-64 animate-pulse" />
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* ══════════════════════════════════════════════════════════════ */}
          {/* HEADER                                                        */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">Strategy Hub</h1>
              <p className="text-sm text-slate-400 mt-0.5">AI-powered pipeline strategy and personal action management</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowPerformance(prev => !prev)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showPerformance ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                <StarIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Top Leads</span>
              </button>
              <button
                onClick={() => setShowWorkload(prev => !prev)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showWorkload ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                <LayersIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pipeline</span>
              </button>
              <button
                onClick={() => setShowTeamVelocity(prev => !prev)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showTeamVelocity ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                <RocketIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Velocity</span>
              </button>
              <button
                onClick={() => setShowCommunicationHub(prev => !prev)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showCommunicationHub ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                <MailIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Activity</span>
              </button>
              <button
                onClick={() => setShowRiskAssessment(prev => !prev)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showRiskAssessment ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                <ShieldIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Risk</span>
              </button>
              <button
                onClick={() => setShowShortcuts(true)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-white text-slate-500 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <KeyboardIcon className="w-3.5 h-3.5" />
                <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px]">?</kbd>
              </button>
              <button
                onClick={() => setShowNewTask(true)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                <PlusIcon className="w-4 h-4" />
                <span>New Task</span>
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* KPI STATS                                                     */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiStats.map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-lg bg-${s.color}-100 flex items-center justify-center text-${s.color}-600`}>
                    {s.icon}
                  </div>
                  {s.up ? (
                    <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <TrendDownIcon className="w-3.5 h-3.5 text-rose-500" />
                  )}
                </div>
                <p className="text-xl font-black text-slate-800">{s.value}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
                <p className={`text-[10px] mt-1 font-semibold ${s.up ? 'text-emerald-500' : 'text-rose-500'}`}>{s.trend}</p>
              </div>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB NAVIGATION                                                */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="flex items-center space-x-1 bg-white rounded-xl border border-slate-100 shadow-sm p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: DASHBOARD                                               */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* ─── Pipeline Health ─── */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Pipeline Health</h3>
                  <span className="text-xs text-slate-400 font-medium">{leads.length} total leads</span>
                </div>
                <div className="p-4">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="text-left pb-3">Status</th>
                        <th className="text-center pb-3">Leads</th>
                        <th className="text-center pb-3">Avg Score</th>
                        <th className="text-left pb-3 pl-4">Distribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pipelineDistribution.map(entry => {
                        const sc = statusColors[entry.status] || { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400' };
                        return (
                          <tr key={entry.status} className="hover:bg-slate-50 transition-all">
                            <td className="py-2.5">
                              <span className={`inline-flex items-center space-x-2 px-2.5 py-1 rounded-lg text-xs font-bold ${sc.bg} ${sc.text}`}>
                                <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                                <span>{entry.status}</span>
                              </span>
                            </td>
                            <td className="text-center">
                              <span className="text-sm font-black text-slate-700">{entry.count}</span>
                            </td>
                            <td className="text-center">
                              <span className="text-sm font-semibold text-slate-500">{entry.avgScore}</span>
                            </td>
                            <td className="pl-4">
                              <div className="flex items-center space-x-2">
                                <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${sc.dot}`} style={{ width: `${entry.pct}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{entry.pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─── Daily Routine ─── */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Daily Routine</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Best practices for pipeline management</p>
                </div>
                <div className="p-4 space-y-4">
                  {DAILY_ROUTINE.map((block, bi) => (
                    <div key={bi} className={`rounded-xl border p-4 ${bi === currentRoutine ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100'}`}>
                      <div className="flex items-center space-x-2 mb-2.5">
                        <div className={`w-7 h-7 rounded-lg bg-${block.color}-100 flex items-center justify-center text-${block.color}-600`}>
                          <ClockIcon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-700">{block.label}</p>
                          <p className="text-[10px] text-slate-400">{block.time}</p>
                        </div>
                        {bi === currentRoutine && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-[9px] font-black ml-auto">NOW</span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {block.tasks.map((task, ti) => {
                          const key = `${bi}-${ti}`;
                          return (
                            <label key={ti} className="flex items-center space-x-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={checkedItems.has(key)}
                                onChange={() => toggleCheck(key)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className={`text-xs transition-all ${checkedItems.has(key) ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
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

              {/* ─── Sprint Goals ─── */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Sprint Goals</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mar 2026</span>
                    <button
                      onClick={handleGenerateStrategy}
                      disabled={isGeneratingStrategy}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition-all border border-indigo-200 disabled:opacity-40"
                    >
                      <SparklesIcon className={`w-3.5 h-3.5 ${isGeneratingStrategy ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingStrategy ? 'Generating...' : 'Generate Strategy'}</span>
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {sprintGoals.map(goal => {
                    const pct = goal.target > 0 ? Math.round((Math.min(goal.current, goal.target) / goal.target) * 100) : 0;
                    const isOnTrack = pct >= 60;
                    return (
                      <div key={goal.id} className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-bold text-slate-800">{goal.title}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isOnTrack ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {isOnTrack ? 'On Track' : 'At Risk'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${isOnTrack ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-black text-slate-600 w-12 text-right">{Math.min(goal.current, goal.target)}/{goal.target}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-slate-400">Deadline: <span className="font-bold text-slate-500">{goal.deadline}</span></span>
                          <span className="text-[10px] text-slate-400">{goal.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─── Activity Timeline ─── */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Activity Timeline</h3>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-600">Live</span>
                  </div>
                </div>
                <div className="p-4">
                  {activityLog.length === 0 ? (
                    <div className="text-center py-8">
                      <ActivityIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-500">No recent activity</p>
                      <p className="text-xs text-slate-400">Actions will appear here as you work</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-100" />
                      <div className="space-y-3">
                        {activityLog.slice(0, 10).map(activity => {
                          const fmt = formatAction(activity.action);
                          const meta = ACTIVITY_ICONS[fmt.type];
                          return (
                            <div key={activity.id} className="flex items-start space-x-3 relative">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10 ${meta.color}`}>
                                {meta.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-700">
                                  <span className="font-bold">{activity.action}</span>
                                  {activity.details && (
                                    <span className="text-slate-400"> &mdash; {activity.details}</span>
                                  )}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(activity.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── AI Strategy Card ─── */}
              <div className="lg:col-span-3">
                {aiStrategy ? (
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <SparklesIcon className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-bold text-indigo-900 font-heading text-sm">AI Pipeline Strategy</h3>
                      </div>
                      <button
                        onClick={handleGenerateStrategy}
                        disabled={isGeneratingStrategy}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-white text-indigo-700 rounded-lg text-[11px] font-bold hover:bg-indigo-50 transition-all border border-indigo-200 disabled:opacity-40"
                      >
                        <RefreshIcon className={`w-3 h-3 ${isGeneratingStrategy ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Recommendations */}
                      <div className="bg-white/70 rounded-xl p-4 border border-indigo-100/50">
                        <h4 className="text-xs font-black text-indigo-800 uppercase tracking-wider mb-3">Recommendations</h4>
                        <ol className="space-y-2">
                          {aiStrategy.recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start space-x-2">
                              <span className="w-5 h-5 rounded-md bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 shrink-0 mt-0.5">{i + 1}</span>
                              <p className="text-xs text-slate-700 leading-relaxed">{rec}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {/* Priority Actions */}
                      <div className="bg-white/70 rounded-xl p-4 border border-indigo-100/50">
                        <h4 className="text-xs font-black text-indigo-800 uppercase tracking-wider mb-3">Priority Actions</h4>
                        <div className="space-y-2">
                          {aiStrategy.priorityActions.map((action, i) => (
                            <div key={i} className="flex items-start space-x-2">
                              <ArrowRightIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-slate-700 leading-relaxed">{action}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Watch Points */}
                      <div className="bg-white/70 rounded-xl p-4 border border-indigo-100/50">
                        <h4 className="text-xs font-black text-indigo-800 uppercase tracking-wider mb-3">Watch Points</h4>
                        <div className="space-y-2">
                          {aiStrategy.risks.map((risk, i) => (
                            <div key={i} className="flex items-start space-x-2">
                              <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-slate-700 leading-relaxed">{risk}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-slate-900 to-indigo-900 rounded-2xl p-6 shadow-xl text-center">
                    <SparklesIcon className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-white mb-2">AI Pipeline Strategy</h3>
                    <p className="text-sm text-slate-300 mb-4 max-w-md mx-auto">
                      Generate personalized recommendations, priority actions, and risk analysis based on your pipeline data.
                    </p>
                    <button
                      onClick={handleGenerateStrategy}
                      disabled={isGeneratingStrategy}
                      className="inline-flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-40"
                    >
                      <SparklesIcon className={`w-4 h-4 ${isGeneratingStrategy ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingStrategy ? 'Generating Strategy...' : 'Generate Strategy'}</span>
                    </button>
                    <p className="text-[10px] text-slate-400 mt-3">Press <kbd className="px-1 py-0.5 bg-white/10 border border-white/20 rounded text-[9px]">G</kbd> for quick access</p>
                  </div>
                )}
              </div>

              {/* ─── Feature Overview Cards ─── */}
              <div className="lg:col-span-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: <SparklesIcon className="w-5 h-5" />, label: 'AI Strategy', desc: 'Get AI-powered recommendations based on your pipeline data, lead scores, and activity patterns.', color: 'indigo' },
                    { icon: <PieChartIcon className="w-5 h-5" />, label: 'Pipeline Health', desc: 'Monitor lead distribution, conversion rates, and pipeline quality at a glance.', color: 'emerald' },
                    { icon: <CheckIcon className="w-5 h-5" />, label: 'Action Items', desc: 'Track strategy tasks with priorities and deadlines. Stay organized and focused.', color: 'violet' },
                    { icon: <DocumentIcon className="w-5 h-5" />, label: 'Strategy Journal', desc: 'Document insights, strategies, and learnings. Build your sales knowledge base.', color: 'amber' },
                  ].map(f => (
                    <div key={f.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                      <div className={`w-10 h-10 rounded-xl bg-${f.color}-100 flex items-center justify-center text-${f.color}-600 mb-3`}>
                        {f.icon}
                      </div>
                      <p className="text-sm font-bold text-slate-800 mb-1">{f.label}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: STRATEGY TASKS                                          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              {/* Task Filter Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1 bg-white rounded-xl border border-slate-100 shadow-sm p-1">
                  {([
                    { id: 'all' as const, label: 'All Tasks', count: tasks.length },
                    { id: 'urgent' as const, label: 'Urgent/High', count: tasks.filter(t => !t.completed && (t.priority === 'urgent' || t.priority === 'high')).length },
                    { id: 'overdue' as const, label: 'Overdue', count: tasks.filter(t => !t.completed && t.deadline && new Date(t.deadline) < new Date()).length },
                    { id: 'pending' as const, label: 'Pending', count: tasks.filter(t => !t.completed).length },
                  ]).map(f => (
                    <button
                      key={f.id}
                      onClick={() => setTaskFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        taskFilter === f.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                      {f.count > 0 && (
                        <span className={`ml-1.5 px-1 py-0.5 rounded-full text-[9px] font-black ${
                          taskFilter === f.id ? 'bg-white/20' : 'bg-slate-100'
                        }`}>{f.count}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold text-slate-400">{filteredTasks.length} results</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-bold text-slate-800 font-heading text-sm">Strategy Tasks</h3>
                    <span className="text-xs text-slate-400">{pendingTasks} pending &middot; {tasks.filter(t => t.completed).length} completed</span>
                  </div>
                  <button
                    onClick={() => setShowNewTask(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition-all border border-indigo-200"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>Add Task</span>
                  </button>
                </div>
                {filteredTasks.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <CheckIcon className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700">No tasks found</p>
                    <p className="text-xs text-slate-400">Create a new task to get started</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredTasks.map(task => (
                      <div key={task.id} className={`px-6 py-3.5 flex items-center space-x-4 group hover:bg-slate-50 transition-all ${task.completed ? 'opacity-50' : ''}`}>
                        <button onClick={() => toggleTaskComplete(task.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-indigo-500'}`}>
                          {task.completed && <CheckIcon className="w-3 h-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</p>
                          <div className="flex items-center space-x-2 mt-0.5">
                            {task.lead_name && <span className="text-[10px] text-indigo-500 font-bold">{task.lead_name}</span>}
                            {task.deadline && (
                              <span className="text-[10px] text-slate-400">Due: {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            )}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${PRIORITY_META[task.priority].color}`}>
                          {PRIORITY_META[task.priority].label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: STRATEGY NOTES                                          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'notes' && (
            <div className="space-y-5">
              {/* Compose Note */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={newNoteContent}
                      onChange={e => setNewNoteContent(e.target.value)}
                      placeholder="Write a strategy note or insight..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none placeholder-slate-300"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-slate-400">Document your strategy insights and learnings</p>
                      <button
                        onClick={handleAddNote}
                        disabled={!newNoteContent.trim()}
                        className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-40"
                      >
                        <MessageIcon className="w-3.5 h-3.5" />
                        <span>Post</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes Feed */}
              {notes.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
                  <DocumentIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No strategy notes yet</p>
                  <p className="text-xs text-slate-400">Start documenting your insights and strategies</p>
                </div>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="p-5">
                      <div className="flex items-start space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                          {user.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <p className="text-sm font-bold text-slate-800">{user.name || 'You'}</p>
                              <span className="text-[10px] text-slate-400">
                                {new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                {' '}
                                {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              {note.lead_name && (
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold">
                                  {note.lead_name}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete note"
                            >
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: PIPELINE RISKS                                          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'risks' && (
            <div className="space-y-5">
              {/* Active Risks */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Pipeline Risks</h3>
                  <p className="text-xs text-slate-400 mt-0.5">AI-detected risks in your pipeline that need attention.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {riskAssessmentData.risks.length === 0 || (riskAssessmentData.risks.length === 1 && riskAssessmentData.risks[0].severity === 'low') ? (
                    <div className="px-6 py-10 text-center">
                      <CheckIcon className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700">No active risks</p>
                      <p className="text-xs text-slate-400">Your pipeline is healthy - keep up the great work!</p>
                    </div>
                  ) : (
                    riskAssessmentData.risks.filter(r => r.severity !== 'low').map(risk => (
                      <div key={risk.id} className="px-6 py-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              risk.severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                              risk.severity === 'high' ? 'bg-amber-100 text-amber-600' :
                              'bg-yellow-100 text-yellow-600'
                            }`}>
                              <AlertTriangleIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2 mb-0.5">
                                <p className="text-sm font-bold text-slate-800">{risk.title}</p>
                                <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                  risk.severity === 'critical' ? 'bg-rose-200 text-rose-700' :
                                  risk.severity === 'high' ? 'bg-amber-200 text-amber-700' :
                                  'bg-yellow-200 text-yellow-700'
                                }`}>{risk.severity}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{risk.description}</p>
                              <div className="flex items-center space-x-1.5 mt-2">
                                <ArrowRightIcon className="w-3 h-3 text-indigo-500" />
                                <p className="text-[10px] font-bold text-indigo-600">{risk.action}</p>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => dismissRisk(risk.id)}
                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition-all border border-slate-200 shrink-0"
                          >
                            <XIcon className="w-3 h-3" />
                            <span>Dismiss</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Dismissed Risks */}
              {pipelineRisks.filter(r => dismissedRisks.has(r.id)).length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 font-heading text-sm">Dismissed Risks</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {pipelineRisks.filter(r => dismissedRisks.has(r.id)).map(risk => (
                      <div key={risk.id} className="px-6 py-3.5 flex items-center space-x-3 opacity-60">
                        <CheckIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                        <p className="text-sm text-slate-600"><span className="font-semibold">{risk.title}</span> &mdash; {risk.description}</p>
                        <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase shrink-0 ${
                          risk.severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                          risk.severity === 'high' ? 'bg-amber-100 text-amber-600' :
                          'bg-yellow-100 text-yellow-600'
                        }`}>{risk.severity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Best Practices */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">Pipeline Strategy Best Practices</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { title: 'Review Pipeline Regularly', items: ['Check pipeline health daily', 'Monitor lead score changes', 'Identify stale leads early'] },
                    { title: 'Act on Hot Leads Fast', items: ['Prioritize leads scoring > 80', 'Respond to engaged leads within 24hrs', 'Qualify before competitors do'] },
                    { title: 'Track Progress Daily', items: ['Update lead statuses after contact', 'Log activities and outcomes', 'Review sprint goal progress'] },
                  ].map((block, i) => (
                    <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-sm font-bold text-white mb-2">{block.title}</p>
                      <ul className="space-y-1.5">
                        {block.items.map((item, j) => (
                          <li key={j} className="flex items-start space-x-2 text-xs text-slate-400">
                            <CheckIcon className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* NEW TASK MODAL                                               */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {showNewTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowNewTask(false)}>
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-black text-slate-900 font-heading">New Strategy Task</h3>
                  <button onClick={() => setShowNewTask(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Task Title</label>
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      placeholder="What needs to be done?"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Priority</label>
                      <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as TaskPriority)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                        {Object.entries(PRIORITY_META).map(([key, meta]) => (<option key={key} value={key}>{meta.label}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Deadline</label>
                      <input type="date" value={newTaskDeadline} onChange={e => setNewTaskDeadline(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end space-x-2">
                  <button onClick={() => setShowNewTask(false)} className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                  <button
                    onClick={handleAddTask}
                    disabled={!newTaskTitle.trim()}
                    className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>Create Task</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TOP LEADS BY SCORE SIDEBAR                                   */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {showPerformance && (
            <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowPerformance(false)}>
              <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                  <div>
                    <h3 className="font-black text-slate-900 font-heading">Top Leads by Score</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Your highest-scoring pipeline leads</p>
                  </div>
                  <button onClick={() => setShowPerformance(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-3">
                  {topLeadsByScore.length === 0 ? (
                    <div className="text-center py-8">
                      <TargetIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-500">No leads yet</p>
                      <p className="text-xs text-slate-400">Add leads to see your top performers</p>
                    </div>
                  ) : (
                    topLeadsByScore.map(lead => {
                      const sc = statusColors[lead.status] || { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400' };
                      return (
                        <div key={lead.id} className={`p-4 rounded-xl border transition-all ${lead.rank === 1 ? 'border-amber-200 bg-amber-50/30' : lead.rank === 2 ? 'border-slate-200 bg-slate-50/30' : lead.rank === 3 ? 'border-orange-200 bg-orange-50/30' : 'border-slate-100'}`}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${
                              lead.rank === 1 ? 'bg-amber-100 text-amber-600' : lead.rank === 2 ? 'bg-slate-200 text-slate-600' : lead.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'
                            }`}>
                              #{lead.rank}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">{lead.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{lead.company}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-black text-indigo-600">{lead.score}</p>
                              <span className={`inline-block px-1.5 py-0.5 rounded-full text-[8px] font-black ${sc.bg} ${sc.text}`}>{lead.status}</span>
                            </div>
                            {lead.rank === 1 && <StarIcon className="w-5 h-5 text-amber-500 shrink-0" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PIPELINE DISTRIBUTION SIDEBAR                                */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {showWorkload && (
            <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowWorkload(false)}>
              <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                  <div>
                    <h3 className="font-black text-slate-900 font-heading">Pipeline Distribution</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Lead distribution across pipeline stages</p>
                  </div>
                  <button onClick={() => setShowWorkload(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
                </div>

                {/* Summary Bar */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="grid grid-cols-5 gap-2">
                    {pipelineDistribution.map(entry => {
                      const sc = statusColors[entry.status] || { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400' };
                      return (
                        <div key={entry.status} className="text-center">
                          <p className={`text-xl font-black ${sc.text}`}>{entry.count}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">{entry.status}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {pipelineDistribution.map(entry => {
                    const sc = statusColors[entry.status] || { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400' };
                    return (
                      <div key={entry.status} className="p-4 rounded-xl border border-slate-100">
                        <div className="flex items-center space-x-3 mb-3">
                          <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${sc.bg} ${sc.text}`}>
                            <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                            <span>{entry.status}</span>
                          </span>
                          <div className="flex-1" />
                          <span className="text-sm font-black text-slate-700">{entry.count} leads</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Distribution</span>
                              <span className="text-[10px] font-bold text-slate-500">{entry.pct}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${sc.dot} transition-all duration-500`} style={{ width: `${entry.pct}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Avg Score</span>
                            <span className="text-[10px] font-bold text-slate-500">{entry.avgScore}/100</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PIPELINE VELOCITY SIDEBAR                                    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {showTeamVelocity && (
            <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowTeamVelocity(false)}>
              <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <RocketIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 font-heading">Pipeline Velocity</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Task throughput &amp; sprint burndown</p>
                    </div>
                  </div>
                  <button onClick={() => setShowTeamVelocity(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <XIcon className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Velocity Gauge */}
                  <div className="text-center">
                    <svg viewBox="0 0 96 96" className="w-28 h-28 mx-auto">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                      <circle cx="48" cy="48" r="40" fill="none"
                        stroke={pipelineVelocity.velocityScore >= 70 ? '#10b981' : pipelineVelocity.velocityScore >= 40 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(pipelineVelocity.velocityScore / 100) * 251.2} 251.2`}
                        transform="rotate(-90 48 48)" />
                      <text x="48" y="44" textAnchor="middle" className="fill-slate-900" style={{ fontSize: '20px', fontWeight: 'bold' }}>{pipelineVelocity.velocityScore}</text>
                      <text x="48" y="58" textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>VELOCITY</text>
                    </svg>
                    <div className="flex items-center justify-center space-x-4 mt-2">
                      <div className="text-center">
                        <p className="text-lg font-black text-emerald-600">{pipelineVelocity.avgActivity}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Avg Activity/Day</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-black text-indigo-600">{pipelineVelocity.totalActivity}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Total Activity</p>
                      </div>
                    </div>
                  </div>

                  {/* Weekly Throughput */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weekly Throughput</h4>
                    <div className="space-y-2">
                      {pipelineVelocity.dailyData.map((d, i) => {
                        const maxVal = Math.max(...pipelineVelocity.dailyData.map(v => v.activity), 1);
                        return (
                          <div key={i} className="flex items-center space-x-3">
                            <span className="text-[10px] font-bold text-slate-400 w-8">{d.day}</span>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(d.activity / maxVal) * 100}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-indigo-600 w-4">{d.activity}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center space-x-4 text-[10px] font-bold text-slate-400">
                      <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /><span>Activity Count</span></div>
                    </div>
                  </div>

                  {/* Sprint Burndown */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sprint Burndown</h4>
                    {pipelineVelocity.sprintBurndown.map((g, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-700">{g.name}</span>
                          <span className="text-[10px] font-bold text-slate-500">{g.remaining} remaining</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${g.pct >= 60 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${g.pct}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{g.pct}% complete</p>
                      </div>
                    ))}
                  </div>

                  {/* Sprint Forecast */}
                  <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
                    <div className="flex items-center space-x-2 mb-2">
                      <BrainIcon className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-sm font-bold text-indigo-800">Sprint Forecast</h4>
                    </div>
                    <p className="text-xs text-indigo-700 leading-relaxed">
                      {pipelineVelocity.remainingWork} items remain across all goals with {pipelineVelocity.daysLeft} days left.
                      You need to complete ~{pipelineVelocity.requiredDailyRate} items/day (current avg: {pipelineVelocity.avgActivity}/day).
                      {pipelineVelocity.avgActivity >= pipelineVelocity.requiredDailyRate
                        ? ' On track to meet sprint goals.'
                        : ' Consider reprioritizing or increasing daily output.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ACTIVITY & NOTES ANALYTICS SIDEBAR                           */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {showCommunicationHub && (
            <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowCommunicationHub(false)}>
              <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
                      <MailIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 font-heading">Activity &amp; Notes Analytics</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Your pipeline engagement patterns</p>
                    </div>
                  </div>
                  <button onClick={() => setShowCommunicationHub(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <XIcon className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Activity Score */}
                  <div className="text-center">
                    <svg viewBox="0 0 96 96" className="w-28 h-28 mx-auto">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                      <circle cx="48" cy="48" r="40" fill="none"
                        stroke={journalMetrics.activityScore >= 70 ? '#8b5cf6' : journalMetrics.activityScore >= 40 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(journalMetrics.activityScore / 100) * 251.2} 251.2`}
                        transform="rotate(-90 48 48)" />
                      <text x="48" y="44" textAnchor="middle" className="fill-slate-900" style={{ fontSize: '20px', fontWeight: 'bold' }}>{journalMetrics.activityScore}</text>
                      <text x="48" y="58" textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>ACTIVITY</text>
                    </svg>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-violet-50 rounded-xl text-center border border-violet-100">
                      <p className="text-xl font-black text-violet-700">{journalMetrics.totalNotes}</p>
                      <p className="text-[9px] font-bold text-violet-500 uppercase">Notes</p>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-xl text-center border border-indigo-100">
                      <p className="text-xl font-black text-indigo-700">{journalMetrics.totalActivity}</p>
                      <p className="text-[9px] font-bold text-indigo-500 uppercase">Activities</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl text-center border border-blue-100">
                      <p className="text-xl font-black text-blue-700">{journalMetrics.notesWithLeads}</p>
                      <p className="text-[9px] font-bold text-blue-500 uppercase">Lead Notes</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                      <p className="text-xl font-black text-emerald-700">{journalMetrics.activityScore}</p>
                      <p className="text-[9px] font-bold text-emerald-500 uppercase">Score</p>
                    </div>
                  </div>

                  {/* Activity Heatmap */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity by Hour</h4>
                    <div className="flex items-end space-x-1.5 h-20 p-3 bg-slate-50 rounded-xl">
                      {journalMetrics.hourlyActivity.map((h, i) => {
                        const maxVal = Math.max(...journalMetrics.hourlyActivity.map(v => v.count), 1);
                        const pct = (h.count / maxVal) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end space-y-1">
                            <span className="text-[8px] font-bold text-violet-600">{h.count}</span>
                            <div className="w-full bg-violet-400 rounded-t-sm hover:bg-violet-500 transition-colors" style={{ height: `${Math.max(pct, 10)}%` }} />
                            <span className="text-[7px] font-bold text-slate-400">{h.hour}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes Context */}
                  <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-100">
                    <div className="flex items-center space-x-2 mb-2">
                      <TargetIcon className="w-4 h-4 text-violet-600" />
                      <h4 className="text-sm font-bold text-violet-800">Notes Context</h4>
                    </div>
                    <p className="text-xs text-violet-700 leading-relaxed">
                      {journalMetrics.notesWithLeads} of {journalMetrics.totalNotes} notes reference specific leads.
                      {journalMetrics.totalNotes > 0 && journalMetrics.notesWithLeads / journalMetrics.totalNotes > 0.5
                        ? ' Great lead-centric documentation! Your notes provide valuable context.'
                        : ' Consider referencing specific leads in your notes for better pipeline context.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* RISK ASSESSMENT SIDEBAR                                      */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {showRiskAssessment && (
            <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowRiskAssessment(false)}>
              <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                      <ShieldIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 font-heading">Risk Assessment</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Pipeline risk &amp; mitigation</p>
                    </div>
                  </div>
                  <button onClick={() => setShowRiskAssessment(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <XIcon className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Risk Score Gauge */}
                  <div className="text-center">
                    <svg viewBox="0 0 96 96" className="w-28 h-28 mx-auto">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                      <circle cx="48" cy="48" r="40" fill="none"
                        stroke={riskAssessmentData.riskScore >= 80 ? '#10b981' : riskAssessmentData.riskScore >= 50 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(riskAssessmentData.riskScore / 100) * 251.2} 251.2`}
                        transform="rotate(-90 48 48)" />
                      <text x="48" y="44" textAnchor="middle" className="fill-slate-900" style={{ fontSize: '20px', fontWeight: 'bold' }}>{riskAssessmentData.riskScore}</text>
                      <text x="48" y="58" textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>SAFETY</text>
                    </svg>
                    <p className="text-sm font-semibold text-slate-600 mt-2">
                      {riskAssessmentData.riskScore >= 80 ? 'Low Risk' : riskAssessmentData.riskScore >= 50 ? 'Moderate Risk' : 'High Risk'}
                    </p>
                  </div>

                  {/* Risk Summary Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Critical', count: riskAssessmentData.risks.filter(r => r.severity === 'critical').length, color: 'bg-rose-100 text-rose-700' },
                      { label: 'High', count: riskAssessmentData.risks.filter(r => r.severity === 'high').length, color: 'bg-amber-100 text-amber-700' },
                      { label: 'Medium', count: riskAssessmentData.risks.filter(r => r.severity === 'medium').length, color: 'bg-yellow-100 text-yellow-700' },
                      { label: 'Low', count: riskAssessmentData.risks.filter(r => r.severity === 'low').length, color: 'bg-emerald-100 text-emerald-700' },
                    ].map((s, i) => (
                      <div key={i} className={`p-2 rounded-xl text-center ${s.color}`}>
                        <p className="text-lg font-black">{s.count}</p>
                        <p className="text-[8px] font-bold uppercase">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Risk Items */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identified Risks</h4>
                    {riskAssessmentData.risks.map(risk => (
                      <div key={risk.id} className={`p-4 rounded-xl border ${
                        risk.severity === 'critical' ? 'border-rose-200 bg-rose-50/50' :
                        risk.severity === 'high' ? 'border-amber-200 bg-amber-50/50' :
                        risk.severity === 'medium' ? 'border-yellow-200 bg-yellow-50/50' :
                        'border-emerald-200 bg-emerald-50/50'
                      }`}>
                        <div className="flex items-start space-x-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            risk.severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                            risk.severity === 'high' ? 'bg-amber-100 text-amber-600' :
                            risk.severity === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-emerald-100 text-emerald-600'
                          }`}>
                            {risk.severity === 'critical' || risk.severity === 'high' ? <AlertTriangleIcon className="w-4 h-4" /> :
                             risk.severity === 'medium' ? <EyeIcon className="w-4 h-4" /> :
                             <CheckIcon className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <p className="text-sm font-bold text-slate-800">{risk.title}</p>
                              <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                risk.severity === 'critical' ? 'bg-rose-200 text-rose-700' :
                                risk.severity === 'high' ? 'bg-amber-200 text-amber-700' :
                                risk.severity === 'medium' ? 'bg-yellow-200 text-yellow-700' :
                                'bg-emerald-200 text-emerald-700'
                              }`}>{risk.severity}</span>
                            </div>
                            <p className="text-xs text-slate-500">{risk.description}</p>
                            <div className="mt-2 flex items-center space-x-1.5">
                              <ArrowRightIcon className="w-3 h-3 text-indigo-500" />
                              <p className="text-[10px] font-bold text-indigo-600">{risk.action}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* AI Mitigation Plan */}
                  <div className="p-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl text-white">
                    <div className="flex items-center space-x-2 mb-3">
                      <BrainIcon className="w-4 h-4 text-indigo-300" />
                      <h4 className="text-sm font-bold">AI Mitigation Plan</h4>
                    </div>
                    <ol className="space-y-2">
                      {aiStrategy?.priorityActions && aiStrategy.priorityActions.length > 0 ? (
                        aiStrategy.priorityActions.slice(0, 3).map((action, i) => (
                          <li key={i} className="flex items-start space-x-2">
                            <span className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-black text-indigo-300 shrink-0">{i + 1}</span>
                            <p className="text-xs text-slate-300 leading-relaxed">{action}</p>
                          </li>
                        ))
                      ) : (
                        riskAssessmentData.risks.filter(r => r.severity === 'critical' || r.severity === 'high').length > 0 ? (
                          riskAssessmentData.risks.filter(r => r.severity === 'critical' || r.severity === 'high').slice(0, 3).map((r, i) => (
                            <li key={i} className="flex items-start space-x-2">
                              <span className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-black text-indigo-300 shrink-0">{i + 1}</span>
                              <p className="text-xs text-slate-300 leading-relaxed">{r.action}</p>
                            </li>
                          ))
                        ) : (
                          <li className="text-xs text-emerald-300">No high-priority mitigations needed. Continue monitoring.</li>
                        )
                      )}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* KEYBOARD SHORTCUTS MODAL                                     */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {showShortcuts && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
              <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-slate-900 font-heading">Keyboard Shortcuts</h3>
                  </div>
                  <button onClick={() => setShowShortcuts(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    { category: 'Navigation', shortcuts: [
                      { keys: '1', desc: 'Dashboard' },
                      { keys: '2', desc: 'Strategy Tasks' },
                      { keys: '3', desc: 'Strategy Notes' },
                      { keys: '4', desc: 'Pipeline Risks' },
                    ]},
                    { category: 'Panels', shortcuts: [
                      { keys: 'P', desc: 'Top Leads' },
                      { keys: 'W', desc: 'Pipeline' },
                      { keys: 'T', desc: 'Velocity' },
                      { keys: 'M', desc: 'Activity Analytics' },
                      { keys: 'R', desc: 'Risk Assessment' },
                    ]},
                    { category: 'Actions', shortcuts: [
                      { keys: 'N', desc: 'New Task' },
                      { keys: 'G', desc: 'Generate Strategy' },
                      { keys: '?', desc: 'Toggle Shortcuts' },
                      { keys: 'Esc', desc: 'Close Panels' },
                    ]},
                  ].map(group => (
                    <div key={group.category}>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{group.category}</p>
                      <div className="space-y-2">
                        {group.shortcuts.map(s => (
                          <div key={s.keys} className="flex items-center justify-between">
                            <span className="text-xs text-slate-600">{s.desc}</span>
                            <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 min-w-[28px] text-center">{s.keys}</kbd>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                  <p className="text-[10px] text-slate-400 text-center">Press <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd> to close</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StrategyHub;
