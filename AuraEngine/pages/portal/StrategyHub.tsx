import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Lead } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  BoltIcon, SparklesIcon, CheckIcon, ShieldIcon, UsersIcon, MailIcon,
  ClockIcon, PlusIcon, XIcon, EditIcon, TagIcon, TargetIcon, FlameIcon,
  BellIcon, CalendarIcon, MessageIcon, ArrowRightIcon, RefreshIcon,
  CogIcon, EyeIcon, TrendUpIcon, TrendDownIcon, ActivityIcon, AlertTriangleIcon, BrainIcon,
  KeyboardIcon, StarIcon, FilterIcon, LayersIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ─── Types ───
type TeamStatus = 'available' | 'busy' | 'in_meeting' | 'offline';
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
type TabView = 'dashboard' | 'tasks' | 'notes' | 'conflicts';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: TeamStatus;
  avatar: string;
  leadsAssigned: number;
  tasksCompleted: number;
  lastActive: string;
}

interface TeamTask {
  id: string;
  title: string;
  assignee: string;
  assigneeId: string;
  priority: TaskPriority;
  deadline: string;
  completed: boolean;
  leadName?: string;
  createdAt: string;
}

interface TeamNote {
  id: string;
  author: string;
  authorId: string;
  content: string;
  mentions: string[];
  leadName?: string;
  createdAt: string;
  replies: { author: string; content: string; createdAt: string }[];
}

interface ConflictAlert {
  id: string;
  type: 'duplicate_contact' | 'lead_locked' | 'overlap';
  leadName: string;
  members: string[];
  status: 'active' | 'resolved';
  message: string;
  createdAt: string;
}

interface SprintGoal {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  deadline: string;
  owner: string;
}

interface TeamActivity {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  type: 'task' | 'lead' | 'note' | 'conflict' | 'status';
}

// ─── Constants ───
const STATUS_META: Record<TeamStatus, { label: string; color: string; dot: string }> = {
  available: { label: 'Available', color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
  busy: { label: 'Busy', color: 'text-amber-700 bg-amber-50', dot: 'bg-amber-500' },
  in_meeting: { label: 'In Meeting', color: 'text-violet-700 bg-violet-50', dot: 'bg-violet-500' },
  offline: { label: 'Offline', color: 'text-slate-500 bg-slate-50', dot: 'bg-slate-400' },
};

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
      'Check Team Dashboard',
      'Review priority leads (assigned to you)',
      'Respond to @mentions from team',
      'Update your status',
    ],
  },
  {
    time: '1:00 PM',
    label: 'Mid-day',
    color: 'indigo',
    tasks: [
      'Log morning activities',
      'Check team chat for updates',
      'Follow up on assigned tasks',
      'Collaborate on shared leads',
    ],
  },
  {
    time: '5:00 PM',
    label: 'End of Day',
    color: 'violet',
    tasks: [
      'Log all activities',
      'Update lead statuses',
      'Assign tomorrow\'s priorities',
      'Share wins in team chat',
    ],
  },
];

const MOCK_TEAM: TeamMember[] = [
  { id: 'tm1', name: 'Sarah Chen', email: 'sarah@company.com', role: 'Sales Lead', status: 'available', avatar: 'SC', leadsAssigned: 24, tasksCompleted: 18, lastActive: '2 min ago' },
  { id: 'tm2', name: 'John Rivera', email: 'john@company.com', role: 'Account Exec', status: 'busy', avatar: 'JR', leadsAssigned: 19, tasksCompleted: 12, lastActive: '15 min ago' },
  { id: 'tm3', name: 'Aisha Patel', email: 'aisha@company.com', role: 'BDR', status: 'in_meeting', avatar: 'AP', leadsAssigned: 31, tasksCompleted: 27, lastActive: '1 hr ago' },
  { id: 'tm4', name: 'Marcus Lee', email: 'marcus@company.com', role: 'Marketing', status: 'available', avatar: 'ML', leadsAssigned: 12, tasksCompleted: 9, lastActive: '5 min ago' },
  { id: 'tm5', name: 'Elena Kovic', email: 'elena@company.com', role: 'SDR', status: 'offline', avatar: 'EK', leadsAssigned: 16, tasksCompleted: 14, lastActive: '3 hrs ago' },
];

const MOCK_TASKS: TeamTask[] = [
  { id: 'tt1', title: 'Follow up with Acme Corp on pricing', assignee: 'Sarah Chen', assigneeId: 'tm1', priority: 'urgent', deadline: '2026-02-14', completed: false, leadName: 'Tom Wilson (Acme)', createdAt: '2026-02-13T09:00:00Z' },
  { id: 'tt2', title: 'Send case study to warm leads', assignee: 'John Rivera', assigneeId: 'tm2', priority: 'high', deadline: '2026-02-15', completed: false, leadName: 'Multiple (8 leads)', createdAt: '2026-02-13T10:30:00Z' },
  { id: 'tt3', title: 'Schedule demo with TechStart', assignee: 'Aisha Patel', assigneeId: 'tm3', priority: 'high', deadline: '2026-02-14', completed: false, leadName: 'Lisa Park (TechStart)', createdAt: '2026-02-12T14:00:00Z' },
  { id: 'tt4', title: 'Update CRM notes for Q1 pipeline', assignee: 'Marcus Lee', assigneeId: 'tm4', priority: 'normal', deadline: '2026-02-16', completed: true, createdAt: '2026-02-11T09:00:00Z' },
  { id: 'tt5', title: 'Prepare cold outreach sequences', assignee: 'Elena Kovic', assigneeId: 'tm5', priority: 'normal', deadline: '2026-02-17', completed: false, createdAt: '2026-02-13T08:00:00Z' },
  { id: 'tt6', title: 'Qualify inbound leads from webinar', assignee: 'Sarah Chen', assigneeId: 'tm1', priority: 'high', deadline: '2026-02-14', completed: false, leadName: 'Webinar batch (12 leads)', createdAt: '2026-02-13T11:00:00Z' },
];

const MOCK_NOTES: TeamNote[] = [
  {
    id: 'tn1', author: 'Sarah Chen', authorId: 'tm1',
    content: 'Hey @john, can you help with API questions from the Acme Corp lead? They want to know about our integration capabilities before the demo.',
    mentions: ['john'], leadName: 'Tom Wilson (Acme)', createdAt: '2026-02-13T10:15:00Z',
    replies: [
      { author: 'John Rivera', content: 'On it! I\'ll prepare the API docs and send them by EOD. Tagging @marcus for marketing collateral too.', createdAt: '2026-02-13T10:32:00Z' },
    ],
  },
  {
    id: 'tn2', author: 'Aisha Patel', authorId: 'tm3',
    content: 'Just had a great call with TechStart. They\'re ready to move forward with the Enterprise plan. @sarah please review the proposal draft before I send it.',
    mentions: ['sarah'], leadName: 'Lisa Park (TechStart)', createdAt: '2026-02-13T14:20:00Z',
    replies: [],
  },
  {
    id: 'tn3', author: 'Marcus Lee', authorId: 'tm4',
    content: 'New case study is live! "How DataFlow increased conversions by 340% with AuraFunnel." Great asset for warm leads. @aisha @elena please share with your pipelines.',
    mentions: ['aisha', 'elena'], createdAt: '2026-02-13T11:45:00Z',
    replies: [
      { author: 'Elena Kovic', content: 'Added to my outreach sequences. Thanks!', createdAt: '2026-02-13T12:10:00Z' },
    ],
  },
];

const MOCK_CONFLICTS: ConflictAlert[] = [
  { id: 'cf1', type: 'duplicate_contact', leadName: 'Alex Thompson (Nexus Labs)', members: ['Sarah Chen', 'John Rivera'], status: 'active', message: 'Both contacted this lead today. Coordinate to avoid confusion.', createdAt: '2026-02-13T11:30:00Z' },
  { id: 'cf2', type: 'lead_locked', leadName: 'Maria Gonzalez (BrightAI)', members: ['Aisha Patel'], status: 'active', message: 'Lead is locked - Aisha is in active negotiations.', createdAt: '2026-02-13T09:15:00Z' },
  { id: 'cf3', type: 'overlap', leadName: 'James Kim (CloudScale)', members: ['Elena Kovic', 'Marcus Lee'], status: 'resolved', message: 'Overlap resolved - Elena assigned as primary owner.', createdAt: '2026-02-12T16:00:00Z' },
];

const MOCK_SPRINT_GOALS: SprintGoal[] = [
  { id: 'sg1', title: 'Close Enterprise Deals', target: 5, current: 2, unit: 'deals', deadline: '2026-02-28', owner: 'Sarah Chen' },
  { id: 'sg2', title: 'Qualify Inbound Leads', target: 50, current: 34, unit: 'leads', deadline: '2026-02-28', owner: 'Elena Kovic' },
  { id: 'sg3', title: 'Send Case Studies', target: 30, current: 22, unit: 'emails', deadline: '2026-02-28', owner: 'John Rivera' },
  { id: 'sg4', title: 'Book Product Demos', target: 15, current: 11, unit: 'demos', deadline: '2026-02-28', owner: 'Aisha Patel' },
];

const MOCK_ACTIVITIES: TeamActivity[] = [
  { id: 'ta1', actor: 'Sarah Chen', action: 'completed task', target: 'Follow up with Acme Corp', timestamp: '2026-02-13T14:30:00Z', type: 'task' },
  { id: 'ta2', actor: 'Aisha Patel', action: 'qualified lead', target: 'Lisa Park (TechStart)', timestamp: '2026-02-13T14:15:00Z', type: 'lead' },
  { id: 'ta3', actor: 'John Rivera', action: 'posted note', target: 'API docs preparation update', timestamp: '2026-02-13T13:45:00Z', type: 'note' },
  { id: 'ta4', actor: 'Marcus Lee', action: 'resolved conflict', target: 'CloudScale overlap', timestamp: '2026-02-13T13:00:00Z', type: 'conflict' },
  { id: 'ta5', actor: 'Elena Kovic', action: 'changed status', target: 'Available → Busy', timestamp: '2026-02-13T12:30:00Z', type: 'status' },
  { id: 'ta6', actor: 'Sarah Chen', action: 'assigned lead', target: 'New webinar batch', timestamp: '2026-02-13T11:45:00Z', type: 'lead' },
  { id: 'ta7', actor: 'John Rivera', action: 'created task', target: 'Send case studies to warm leads', timestamp: '2026-02-13T10:30:00Z', type: 'task' },
  { id: 'ta8', actor: 'Aisha Patel', action: 'booked demo', target: 'TechStart Enterprise demo', timestamp: '2026-02-13T09:45:00Z', type: 'lead' },
];

const ACTIVITY_ICONS: Record<TeamActivity['type'], { icon: React.ReactNode; color: string }> = {
  task: { icon: <CheckIcon className="w-3 h-3" />, color: 'bg-emerald-100 text-emerald-600' },
  lead: { icon: <TargetIcon className="w-3 h-3" />, color: 'bg-indigo-100 text-indigo-600' },
  note: { icon: <MessageIcon className="w-3 h-3" />, color: 'bg-violet-100 text-violet-600' },
  conflict: { icon: <AlertTriangleIcon className="w-3 h-3" />, color: 'bg-amber-100 text-amber-600' },
  status: { icon: <ActivityIcon className="w-3 h-3" />, color: 'bg-cyan-100 text-cyan-600' },
};

const StrategyHub: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [activeTab, setActiveTab] = useState<TabView>('dashboard');
  const [myStatus, setMyStatus] = useState<TeamStatus>('available');
  const [team, setTeam] = useState<TeamMember[]>(MOCK_TEAM);
  const [tasks, setTasks] = useState<TeamTask[]>(MOCK_TASKS);
  const [notes, setNotes] = useState<TeamNote[]>(MOCK_NOTES);
  const [conflicts, setConflicts] = useState<ConflictAlert[]>(MOCK_CONFLICTS);

  // ─── New Task Modal ───
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('tm1');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('normal');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  // ─── New Note ───
  const [newNoteContent, setNewNoteContent] = useState('');

  // ─── Reply state ───
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  // ─── Enhanced UI state ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showWorkload, setShowWorkload] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'my' | 'urgent' | 'overdue'>('all');

  // ─── Routine checklist ───
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem('aura_routine_checks');
    return saved ? new Set(JSON.parse(saved)) : new Set();
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

  const handleAddTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    const assignee = team.find(t => t.id === newTaskAssignee);
    const task: TeamTask = {
      id: `tt-${Date.now()}`,
      title: newTaskTitle,
      assignee: assignee?.name || 'Unassigned',
      assigneeId: newTaskAssignee,
      priority: newTaskPriority,
      deadline: newTaskDeadline || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => [task, ...prev]);
    setNewTaskTitle('');
    setNewTaskDeadline('');
    setShowNewTask(false);
  }, [newTaskTitle, newTaskAssignee, newTaskPriority, newTaskDeadline, team]);

  const toggleTaskComplete = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  }, []);

  const handleAddNote = useCallback(() => {
    if (!newNoteContent.trim()) return;
    const mentionMatches = newNoteContent.match(/@(\w+)/g) || [];
    const mentions = mentionMatches.map(m => m.slice(1).toLowerCase());
    const note: TeamNote = {
      id: `tn-${Date.now()}`,
      author: user.name || 'You',
      authorId: user.id,
      content: newNoteContent,
      mentions,
      createdAt: new Date().toISOString(),
      replies: [],
    };
    setNotes(prev => [note, ...prev]);
    setNewNoteContent('');
  }, [newNoteContent, user]);

  const handleReply = useCallback((noteId: string) => {
    if (!replyContent.trim()) return;
    setNotes(prev => prev.map(n => n.id === noteId ? {
      ...n,
      replies: [...n.replies, { author: user.name || 'You', content: replyContent, createdAt: new Date().toISOString() }],
    } : n));
    setReplyContent('');
    setReplyingTo(null);
  }, [replyContent, user]);

  const resolveConflict = useCallback((conflictId: string) => {
    setConflicts(prev => prev.map(c => c.id === conflictId ? { ...c, status: 'resolved' } : c));
  }, []);

  // Computed stats
  const totalLeads = team.reduce((sum, t) => sum + t.leadsAssigned, 0);
  const totalCompleted = team.reduce((sum, t) => sum + t.tasksCompleted, 0);
  const activeConflicts = conflicts.filter(c => c.status === 'active').length;
  const pendingTasks = tasks.filter(t => !t.completed).length;
  const onlineMembers = team.filter(t => t.status !== 'offline').length;

  const currentHour = new Date().getHours();
  const currentRoutine = currentHour < 12 ? 0 : currentHour < 16 ? 1 : 2;

  // ─── Enhanced KPI Stats ───
  const kpiStats = useMemo(() => {
    const completionRate = tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0;
    const urgentCount = tasks.filter(t => !t.completed && t.priority === 'urgent').length;
    const avgLeadsPerMember = team.length > 0 ? Math.round(totalLeads / team.length) : 0;
    const sprintPct = Math.round((MOCK_SPRINT_GOALS.reduce((s, g) => s + g.current, 0) / MOCK_SPRINT_GOALS.reduce((s, g) => s + g.target, 0)) * 100);
    return [
      { label: 'Team Online', value: `${onlineMembers}/${team.length}`, icon: <UsersIcon className="w-4 h-4" />, color: 'emerald', trend: '+1 since yesterday', up: true },
      { label: 'Total Leads', value: totalLeads, icon: <TargetIcon className="w-4 h-4" />, color: 'indigo', trend: `~${avgLeadsPerMember}/member`, up: true },
      { label: 'Tasks Pending', value: pendingTasks, icon: <ClockIcon className="w-4 h-4" />, color: 'amber', trend: `${urgentCount} urgent`, up: false },
      { label: 'Completion Rate', value: `${completionRate}%`, icon: <CheckIcon className="w-4 h-4" />, color: 'violet', trend: '+8% this week', up: true },
      { label: 'Active Conflicts', value: activeConflicts, icon: <AlertTriangleIcon className="w-4 h-4" />, color: activeConflicts > 0 ? 'rose' : 'emerald', trend: activeConflicts > 0 ? 'Needs attention' : 'All clear', up: activeConflicts === 0 },
      { label: 'Sprint Progress', value: `${sprintPct}%`, icon: <BoltIcon className="w-4 h-4" />, color: 'cyan', trend: '15 days left', up: true },
    ];
  }, [onlineMembers, team, totalLeads, pendingTasks, activeConflicts, tasks]);

  // ─── Workload Distribution ───
  const workloadDistribution = useMemo(() => {
    const maxLeads = Math.max(...team.map(t => t.leadsAssigned), 1);
    return team.map(member => {
      const memberTasks = tasks.filter(t => t.assigneeId === member.id);
      const memberPending = memberTasks.filter(t => !t.completed).length;
      const loadScore = Math.round(((member.leadsAssigned / maxLeads) * 50) + ((memberPending / Math.max(tasks.length, 1)) * 50));
      return {
        ...member,
        pendingTasks: memberPending,
        loadScore: Math.min(loadScore, 100),
        loadStatus: loadScore > 75 ? 'overloaded' as const : loadScore > 40 ? 'balanced' as const : 'light' as const,
      };
    }).sort((a, b) => b.loadScore - a.loadScore);
  }, [team, tasks]);

  // ─── Performance Rankings ───
  const performanceRankings = useMemo(() => {
    return [...team].sort((a, b) => b.tasksCompleted - a.tasksCompleted).map((member, index) => ({
      ...member,
      rank: index + 1,
      completionRate: Math.round((member.tasksCompleted / Math.max(member.tasksCompleted + tasks.filter(t => t.assigneeId === member.id && !t.completed).length, 1)) * 100),
    }));
  }, [team, tasks]);

  // ─── Filtered Tasks ───
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];
    switch (taskFilter) {
      case 'urgent':
        filtered = filtered.filter(t => !t.completed && (t.priority === 'urgent' || t.priority === 'high'));
        break;
      case 'overdue':
        filtered = filtered.filter(t => !t.completed && new Date(t.deadline) < new Date());
        break;
      case 'my':
        filtered = filtered.filter(t => !t.completed);
        break;
    }
    return filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [tasks, taskFilter]);

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
        return;
      }

      const shortcuts: Record<string, () => void> = {
        '1': () => setActiveTab('dashboard'),
        '2': () => setActiveTab('tasks'),
        '3': () => setActiveTab('notes'),
        '4': () => setActiveTab('conflicts'),
        'n': () => setShowNewTask(true),
        'p': () => setShowPerformance(prev => !prev),
        'w': () => setShowWorkload(prev => !prev),
        '?': () => setShowShortcuts(prev => !prev),
      };

      if (shortcuts[e.key]) {
        e.preventDefault();
        shortcuts[e.key]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNewTask, showShortcuts, showPerformance, showWorkload]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { id: TabView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Team Dashboard', icon: <UsersIcon className="w-4 h-4" /> },
    { id: 'tasks', label: 'Team Tasks', icon: <CheckIcon className="w-4 h-4" />, badge: pendingTasks },
    { id: 'notes', label: 'Collaborative Notes', icon: <MessageIcon className="w-4 h-4" />, badge: notes.filter(n => n.mentions.length > 0).length },
    { id: 'conflicts', label: 'Conflicts', icon: <AlertTriangleIcon className="w-4 h-4" />, badge: activeConflicts },
  ];

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">Strategy Hub</h1>
          <p className="text-sm text-slate-400 mt-0.5">Team collaboration, task coordination, and conflict resolution.</p>
        </div>
        <div className="flex items-center space-x-2">
          {/* My Status */}
          <div className="flex items-center space-x-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
            <span className={`w-2 h-2 rounded-full ${STATUS_META[myStatus].dot} ${myStatus === 'available' ? 'animate-pulse' : ''}`}></span>
            <select
              value={myStatus}
              onChange={e => setMyStatus(e.target.value as TeamStatus)}
              className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowPerformance(prev => !prev)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showPerformance ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <StarIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leaderboard</span>
          </button>
          <button
            onClick={() => setShowWorkload(prev => !prev)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showWorkload ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <LayersIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Workload</span>
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
      {/* QUICK STATS                                                   */}
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
            {tab.badge && tab.badge > 0 && (
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
      {/* TAB: TEAM DASHBOARD                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ─── Team Members Panel ─── */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 font-heading text-sm">Team Members</h3>
              <span className="text-xs text-slate-400 font-medium">{onlineMembers} online</span>
            </div>
            <div className="p-4 space-y-2">
              {team.map(member => {
                const sm = STATUS_META[member.status];
                return (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all group">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm">
                          {member.avatar}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${sm.dot}`}></span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{member.name}</p>
                        <p className="text-[10px] text-slate-400">{member.role} &middot; {member.lastActive}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-700">{member.leadsAssigned}</p>
                        <p className="text-[10px] text-slate-400">Leads</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600">{member.tasksCompleted}</p>
                        <p className="text-[10px] text-slate-400">Done</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${sm.color}`}>
                        {sm.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Daily Routine Panel ─── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 font-heading text-sm">Daily Routine</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Best practices for team coordination</p>
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
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Feb 2026</span>
            </div>
            <div className="p-4 space-y-3">
              {MOCK_SPRINT_GOALS.map(goal => {
                const pct = Math.round((goal.current / goal.target) * 100);
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
                      <span className="text-xs font-black text-slate-600 w-12 text-right">{goal.current}/{goal.target}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-slate-400">Owner: <span className="font-bold text-slate-500">{goal.owner}</span></span>
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
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-100" />
                <div className="space-y-3">
                  {MOCK_ACTIVITIES.map(activity => {
                    const meta = ACTIVITY_ICONS[activity.type];
                    return (
                      <div key={activity.id} className="flex items-start space-x-3 relative">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10 ${meta.color}`}>
                          {meta.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700">
                            <span className="font-bold">{activity.actor}</span>{' '}
                            <span className="text-slate-400">{activity.action}</span>{' '}
                            <span className="font-semibold text-slate-600">{activity.target}</span>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(activity.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Collaboration Features Overview ─── */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: <MessageIcon className="w-5 h-5" />, label: '@Mentions', desc: 'Tag team members in notes. They get notified instantly and can reply in context.', color: 'indigo' },
                { icon: <UsersIcon className="w-5 h-5" />, label: 'Shared Leads', desc: 'Multiple owners can work on the same lead. All activities visible to all owners.', color: 'emerald' },
                { icon: <CheckIcon className="w-5 h-5" />, label: 'Team Tasks', desc: 'Assign tasks with deadlines and priorities. Track completion across the team.', color: 'violet' },
                { icon: <EditIcon className="w-5 h-5" />, label: 'Collaborative Notes', desc: 'Multiple people edit notes with version history. @mention within any note.', color: 'amber' },
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
      {/* TAB: TEAM TASKS                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Task Filter Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 bg-white rounded-xl border border-slate-100 shadow-sm p-1">
              {([
                { id: 'all' as const, label: 'All Tasks', count: tasks.length },
                { id: 'urgent' as const, label: 'Urgent/High', count: tasks.filter(t => !t.completed && (t.priority === 'urgent' || t.priority === 'high')).length },
                { id: 'overdue' as const, label: 'Overdue', count: tasks.filter(t => !t.completed && new Date(t.deadline) < new Date()).length },
                { id: 'my' as const, label: 'My Tasks', count: tasks.filter(t => !t.completed).length },
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
              <h3 className="font-bold text-slate-800 font-heading text-sm">Team Tasks</h3>
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
          <div className="divide-y divide-slate-100">
            {filteredTasks.map(task => (
              <div key={task.id} className={`px-6 py-3.5 flex items-center space-x-4 group hover:bg-slate-50 transition-all ${task.completed ? 'opacity-50' : ''}`}>
                <button onClick={() => toggleTaskComplete(task.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-indigo-500'}`}>
                  {task.completed && <CheckIcon className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</p>
                  <div className="flex items-center space-x-2 mt-0.5">
                    {task.leadName && <span className="text-[10px] text-indigo-500 font-bold">{task.leadName}</span>}
                    <span className="text-[10px] text-slate-400">Due: {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${PRIORITY_META[task.priority].color}`}>
                  {PRIORITY_META[task.priority].label}
                </span>
                <div className="flex items-center space-x-2 shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-black">
                    {team.find(t => t.id === task.assigneeId)?.avatar || '?'}
                  </div>
                  <span className="text-xs text-slate-500 font-medium hidden sm:block">{task.assignee}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: COLLABORATIVE NOTES                                     */}
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
                  placeholder="Share an update with your team... Use @name to mention someone"
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none placeholder-slate-300"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[10px] text-slate-400">Tip: Use <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px]">@name</kbd> to mention team members</p>
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
          {notes.map(note => (
            <div key={note.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="p-5">
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-black text-sm shrink-0">
                    {note.author.charAt(0)}{note.author.split(' ')[1]?.charAt(0) || ''}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-sm font-bold text-slate-800">{note.author}</p>
                      <span className="text-[10px] text-slate-400">
                        {new Date(note.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {note.leadName && (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold">
                          {note.leadName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {note.content.split(/(@\w+)/g).map((part, i) =>
                        part.startsWith('@') ? (
                          <span key={i} className="text-indigo-600 font-bold bg-indigo-50 px-1 rounded">{part}</span>
                        ) : (
                          <span key={i}>{part}</span>
                        )
                      )}
                    </p>
                  </div>
                </div>

                {/* Replies */}
                {note.replies.length > 0 && (
                  <div className="ml-12 mt-3 space-y-2.5 pl-4 border-l-2 border-slate-100">
                    {note.replies.map((reply, ri) => (
                      <div key={ri} className="flex items-start space-x-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-black text-[10px] shrink-0">
                          {reply.author.charAt(0)}{reply.author.split(' ')[1]?.charAt(0) || ''}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <p className="text-xs font-bold text-slate-700">{reply.author}</p>
                            <span className="text-[10px] text-slate-400">
                              {new Date(reply.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {reply.content.split(/(@\w+)/g).map((part, i) =>
                              part.startsWith('@') ? (
                                <span key={i} className="text-indigo-600 font-bold">{part}</span>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Input */}
                {replyingTo === note.id ? (
                  <div className="ml-12 mt-3 flex items-center space-x-2">
                    <input
                      type="text"
                      value={replyContent}
                      onChange={e => setReplyContent(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleReply(note.id); }}
                      placeholder="Write a reply..."
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleReply(note.id)} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all">Reply</button>
                    <button onClick={() => { setReplyingTo(null); setReplyContent(''); }} className="p-2 text-slate-400 hover:text-slate-600"><XIcon className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setReplyingTo(note.id)}
                    className="ml-12 mt-2 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    Reply
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: CONFLICTS & OVERLAPS                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'conflicts' && (
        <div className="space-y-5">
          {/* Active Conflicts */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 font-heading text-sm">Active Conflicts &amp; Overlaps</h3>
              <p className="text-xs text-slate-400 mt-0.5">System-detected conflicts that need attention.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {conflicts.filter(c => c.status === 'active').length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <CheckIcon className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No active conflicts</p>
                  <p className="text-xs text-slate-400">All clear - great team coordination!</p>
                </div>
              ) : (
                conflicts.filter(c => c.status === 'active').map(conflict => (
                  <div key={conflict.id} className="px-6 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          conflict.type === 'duplicate_contact' ? 'bg-rose-100 text-rose-600' :
                          conflict.type === 'lead_locked' ? 'bg-amber-100 text-amber-600' :
                          'bg-violet-100 text-violet-600'
                        }`}>
                          {conflict.type === 'duplicate_contact' ? <UsersIcon className="w-4 h-4" /> :
                           conflict.type === 'lead_locked' ? <ShieldIcon className="w-4 h-4" /> :
                           <AlertTriangleIcon className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{conflict.leadName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{conflict.message}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Involved:</span>
                            {conflict.members.map((m, i) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">{m}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => resolveConflict(conflict.id)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-bold hover:bg-emerald-100 transition-all border border-emerald-200 shrink-0"
                      >
                        <CheckIcon className="w-3 h-3" />
                        <span>Resolve</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Resolved Conflicts */}
          {conflicts.filter(c => c.status === 'resolved').length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 font-heading text-sm">Recently Resolved</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {conflicts.filter(c => c.status === 'resolved').map(conflict => (
                  <div key={conflict.id} className="px-6 py-3.5 flex items-center space-x-3 opacity-60">
                    <CheckIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm text-slate-600"><span className="font-semibold">{conflict.leadName}</span> &mdash; {conflict.message}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(conflict.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best Practices */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">Best Practices for Conflict Prevention</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: 'Check Before Contact', items: ['Always check "Last Contacted" before reaching out', 'Review lead activity timeline', 'Verify lead assignment'] },
                { title: 'Update Immediately', items: ['Update status right after contact', 'Log all activities in real-time', 'Set lead lock when in negotiation'] },
                { title: 'Communicate Proactively', items: ['Use team chat for hot leads', 'Tag team members on shared leads', 'Escalate to manager if unsure'] },
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
              <h3 className="font-black text-slate-900 font-heading">New Team Task</h3>
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
                  <label className="block text-xs font-bold text-slate-600 mb-1">Assign To</label>
                  <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    {team.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Priority</label>
                  <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as TaskPriority)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    {Object.entries(PRIORITY_META).map(([key, meta]) => (<option key={key} value={key}>{meta.label}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Deadline</label>
                <input type="date" value={newTaskDeadline} onChange={e => setNewTaskDeadline(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
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
      {/* PERFORMANCE LEADERBOARD SIDEBAR                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showPerformance && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowPerformance(false)}>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Performance Leaderboard</h3>
                <p className="text-xs text-slate-400 mt-0.5">Team rankings by task completion</p>
              </div>
              <button onClick={() => setShowPerformance(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              {performanceRankings.map(member => (
                <div key={member.id} className={`p-4 rounded-xl border transition-all ${member.rank === 1 ? 'border-amber-200 bg-amber-50/30' : member.rank === 2 ? 'border-slate-200 bg-slate-50/30' : member.rank === 3 ? 'border-orange-200 bg-orange-50/30' : 'border-slate-100'}`}>
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${
                      member.rank === 1 ? 'bg-amber-100 text-amber-600' : member.rank === 2 ? 'bg-slate-200 text-slate-600' : member.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      #{member.rank}
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm">
                      {member.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{member.name}</p>
                      <p className="text-[10px] text-slate-400">{member.role}</p>
                    </div>
                    {member.rank === 1 && <StarIcon className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-lg font-black text-emerald-600">{member.tasksCompleted}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Completed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black text-indigo-600">{member.leadsAssigned}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Leads</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black text-violet-600">{member.completionRate}%</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Rate</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WORKLOAD DISTRIBUTION SIDEBAR                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showWorkload && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowWorkload(false)}>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-100 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Workload Distribution</h3>
                <p className="text-xs text-slate-400 mt-0.5">Team capacity and load balance</p>
              </div>
              <button onClick={() => setShowWorkload(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>

            {/* Summary Bar */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Overloaded', count: workloadDistribution.filter(w => w.loadStatus === 'overloaded').length, color: 'rose' },
                  { label: 'Balanced', count: workloadDistribution.filter(w => w.loadStatus === 'balanced').length, color: 'emerald' },
                  { label: 'Light', count: workloadDistribution.filter(w => w.loadStatus === 'light').length, color: 'cyan' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className={`text-xl font-black text-${s.color}-600`}>{s.count}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {workloadDistribution.map(member => (
                <div key={member.id} className="p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm">
                      {member.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{member.name}</p>
                      <p className="text-[10px] text-slate-400">{member.role}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      member.loadStatus === 'overloaded' ? 'bg-rose-100 text-rose-600' :
                      member.loadStatus === 'balanced' ? 'bg-emerald-100 text-emerald-600' :
                      'bg-cyan-100 text-cyan-600'
                    }`}>
                      {member.loadStatus === 'overloaded' ? 'Overloaded' : member.loadStatus === 'balanced' ? 'Balanced' : 'Light'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Leads ({member.leadsAssigned})</span>
                        <span className="text-[10px] font-bold text-slate-500">{member.leadsAssigned} assigned</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${Math.min((member.leadsAssigned / 35) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Tasks ({member.pendingTasks} pending)</span>
                        <span className="text-[10px] font-bold text-slate-500">{member.tasksCompleted} completed</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all duration-500"
                          style={{ width: `${Math.min((member.pendingTasks / 5) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Overall Load</span>
                        <span className="text-[10px] font-bold text-slate-500">{member.loadScore}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            member.loadStatus === 'overloaded' ? 'bg-rose-500' :
                            member.loadStatus === 'balanced' ? 'bg-emerald-500' : 'bg-cyan-500'
                          }`}
                          style={{ width: `${member.loadScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
                  { keys: '1', desc: 'Team Dashboard' },
                  { keys: '2', desc: 'Team Tasks' },
                  { keys: '3', desc: 'Collaborative Notes' },
                  { keys: '4', desc: 'Conflicts' },
                ]},
                { category: 'Actions', shortcuts: [
                  { keys: 'N', desc: 'New Task' },
                  { keys: 'P', desc: 'Toggle Leaderboard' },
                  { keys: 'W', desc: 'Toggle Workload' },
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
    </div>
  );
};

export default StrategyHub;
