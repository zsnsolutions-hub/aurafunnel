import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Team, TeamInvite } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  CheckIcon, UsersIcon, MailIcon,
  ClockIcon, PlusIcon, XIcon, MessageIcon,
  KeyboardIcon, DocumentIcon
} from '../../components/Icons';
import KanbanBoard from '../../components/teamhub/KanbanBoard';
import { TaskStatus, TaskPriority } from '../../components/teamhub/TaskCard';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ─── Types ───
type TabView = 'board' | 'notes' | 'team';

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
  assigned_to: string | null;
  assigned_name?: string;
  team_id: string | null;
  status: TaskStatus;
}

interface StrategyNote {
  id: string;
  user_id: string;
  content: string;
  lead_name: string | null;
  created_at: string;
  team_id: string | null;
  author_name: string | null;
}

interface TeamMemberInfo {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  name: string;
  email: string;
}

// ─── Constants ───
const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'bg-rose-100 text-rose-700' },
  high: { label: 'High', color: 'bg-amber-100 text-amber-700' },
  normal: { label: 'Normal', color: 'bg-indigo-100 text-indigo-700' },
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' },
};

// ─── Component ───
const TeamHub: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [activeTab, setActiveTab] = useState<TabView>('board');
  const [tasks, setTasks] = useState<StrategyTask[]>([]);
  const [notes, setNotes] = useState<StrategyNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Task modal
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('normal');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  // Note
  const [newNoteContent, setNewNoteContent] = useState('');

  // Shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Team state
  const [team, setTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberInfo[]>([]);
  const [pendingInvite, setPendingInvite] = useState<TeamInvite | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamName, setTeamName] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const isTeamMode = team !== null;

  // ─── Data Loading ───
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // 1. Check for team membership
        let currentTeam: Team | null = null;
        let members: TeamMemberInfo[] = [];
        let memberUserIds: string[] = [user.id];

        const { data: myMembership } = await supabase
          .from('team_members')
          .select('team_id, role')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (myMembership?.team_id) {
          const { data: teamData } = await supabase
            .from('teams')
            .select('*')
            .eq('id', myMembership.team_id)
            .single();

          if (teamData) {
            currentTeam = teamData as Team;
            setTeam(currentTeam);

            const { data: membersData } = await supabase
              .from('team_members')
              .select('id, user_id, role, joined_at')
              .eq('team_id', currentTeam.id);

            if (membersData && membersData.length > 0) {
              const memberIds = membersData.map((m: any) => m.user_id);
              const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, name, email')
                .in('id', memberIds);

              const profileMap: Record<string, { name: string; email: string }> = {};
              (profilesData || []).forEach((p: any) => {
                profileMap[p.id] = { name: p.name || 'Unknown', email: p.email || '' };
              });

              members = membersData.map((m: any) => ({
                id: m.id,
                user_id: m.user_id,
                role: m.role,
                joined_at: m.joined_at,
                name: profileMap[m.user_id]?.name || 'Unknown',
                email: profileMap[m.user_id]?.email || '',
              }));
              setTeamMembers(members);
              memberUserIds = members.map(m => m.user_id);
            }
          }
        } else {
          setTeam(null);
          setTeamMembers([]);
        }

        // 2. Check for pending invites
        const { data: inviteData } = await supabase
          .from('team_invites')
          .select('*, teams(name)')
          .eq('email', user.email)
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();

        if (inviteData) {
          setPendingInvite({
            ...inviteData,
            team_name: (inviteData as any).teams?.name || 'Unknown Team',
          } as TeamInvite);
        } else {
          setPendingInvite(null);
        }

        // 3. Branched data queries
        const isTeam = currentTeam !== null;
        const teamId = currentTeam?.id;

        // Build a name lookup from team members
        const memberNameMap: Record<string, string> = {};
        members.forEach(m => { memberNameMap[m.user_id] = m.name; });

        const tasksQuery = isTeam
          ? supabase.from('strategy_tasks').select('*').or(`user_id.eq.${user.id},team_id.eq.${teamId}`).order('created_at', { ascending: false })
          : supabase.from('strategy_tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

        const notesQuery = isTeam
          ? supabase.from('strategy_notes').select('*').or(`user_id.eq.${user.id},team_id.eq.${teamId}`).order('created_at', { ascending: false })
          : supabase.from('strategy_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

        const [tasksRes, notesRes] = await Promise.all([tasksQuery, notesQuery]);

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
          assigned_to: t.assigned_to || null,
          assigned_name: t.assigned_to ? (memberNameMap[t.assigned_to] || 'Unknown') : undefined,
          team_id: t.team_id || null,
          status: t.status || (t.completed ? 'done' : 'todo'),
        }));
        const loadedNotes: StrategyNote[] = (notesRes.data || []).map((n: any) => ({
          id: n.id,
          user_id: n.user_id,
          content: n.content,
          lead_name: n.lead_name || null,
          created_at: n.created_at,
          team_id: n.team_id || null,
          author_name: n.author_name || (memberNameMap[n.user_id] || null),
        }));

        setTasks(loadedTasks);
        setNotes(loadedNotes);
      } catch (err) {
        console.error('TeamHub data load error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.email, dataVersion]);

  // ─── Computed ───
  const myTeamRole = useMemo(() => {
    return teamMembers.find(m => m.user_id === user.id)?.role || null;
  }, [teamMembers, user.id]);

  const isAdmin = myTeamRole === 'owner' || myTeamRole === 'admin';

  const pendingTaskCount = useMemo(() => tasks.filter(t => t.status !== 'done').length, [tasks]);

  const kanbanTasks = useMemo(() => tasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    deadline: t.deadline,
    assigned_to: t.assigned_to,
    assigned_name: t.assigned_name,
    user_id: t.user_id,
    status: t.status,
  })), [tasks]);

  // ─── Handlers ───
  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: newStatus, completed: newStatus === 'done' } : t
    ));

    try {
      const { error } = await supabase
        .from('strategy_tasks')
        .update({ status: newStatus, completed: newStatus === 'done' })
        .eq('id', taskId);
      if (error) throw error;

      // Log audit
      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: `Moved task to ${newStatus.replace('_', ' ')}`,
          details: tasks.find(t => t.id === taskId)?.title || '',
          ...(isTeamMode ? { team_id: team!.id } : {}),
        });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to update task status:', err);
      // Revert
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        const original = tasks.find(ot => ot.id === taskId);
        return original || t;
      }));
    }
  }, [user.id, isTeamMode, team, tasks]);

  const handleAddTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    const tempId = `tt-${Date.now()}`;
    const assigneeName = newTaskAssignee ? (teamMembers.find(m => m.user_id === newTaskAssignee)?.name || 'Unknown') : undefined;
    const optimisticTask: StrategyTask = {
      id: tempId,
      user_id: user.id,
      title: newTaskTitle,
      priority: newTaskPriority,
      deadline: newTaskDeadline || null,
      completed: false,
      lead_id: null,
      created_at: new Date().toISOString(),
      assigned_to: isTeamMode ? (newTaskAssignee || null) : null,
      assigned_name: assigneeName,
      team_id: isTeamMode ? team!.id : null,
      status: 'todo',
    };
    setTasks(prev => [optimisticTask, ...prev]);
    setNewTaskTitle('');
    setNewTaskDeadline('');
    setNewTaskAssignee(null);
    setShowNewTask(false);

    try {
      const insertPayload: any = {
        user_id: user.id,
        title: optimisticTask.title,
        priority: optimisticTask.priority,
        deadline: optimisticTask.deadline,
        completed: false,
        status: 'todo',
      };
      if (isTeamMode) {
        insertPayload.team_id = team!.id;
        if (newTaskAssignee) insertPayload.assigned_to = newTaskAssignee;
      }

      const { data, error } = await supabase.from('strategy_tasks').insert(insertPayload).select().single();
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: data.id } : t));

      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'Created task',
          details: optimisticTask.title,
          ...(isTeamMode ? { team_id: team!.id } : {}),
        });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to create task:', err);
      setTasks(prev => prev.filter(t => t.id !== tempId));
    }
  }, [newTaskTitle, newTaskPriority, newTaskDeadline, newTaskAssignee, user.id, isTeamMode, team, teamMembers]);

  const handleAddNote = useCallback(async () => {
    if (!newNoteContent.trim()) return;
    const tempId = `tn-${Date.now()}`;
    const optimisticNote: StrategyNote = {
      id: tempId,
      user_id: user.id,
      content: newNoteContent,
      lead_name: null,
      created_at: new Date().toISOString(),
      team_id: isTeamMode ? team!.id : null,
      author_name: user.name || null,
    };
    setNotes(prev => [optimisticNote, ...prev]);
    setNewNoteContent('');

    try {
      const insertPayload: any = {
        user_id: user.id,
        content: optimisticNote.content,
      };
      if (isTeamMode) {
        insertPayload.team_id = team!.id;
        insertPayload.author_name = user.name || 'Unknown';
      }

      const { data, error } = await supabase.from('strategy_notes').insert(insertPayload).select().single();
      if (error) throw error;
      setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: data.id } : n));

      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'Added note',
          details: optimisticNote.content.substring(0, 80),
          ...(isTeamMode ? { team_id: team!.id } : {}),
        });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to create note:', err);
      setNotes(prev => prev.filter(n => n.id !== tempId));
    }
  }, [newNoteContent, user.id, user.name, isTeamMode, team]);

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

  // ─── Team Handlers ───
  const reloadData = useCallback(() => {
    setDataVersion(v => v + 1);
  }, []);

  const handleCreateTeam = useCallback(async () => {
    if (!teamName.trim()) return;
    try {
      const { data: newTeam, error: teamErr } = await supabase
        .from('teams')
        .insert({ name: teamName.trim(), owner_id: user.id })
        .select()
        .single();
      if (teamErr) throw teamErr;

      const { error: memberErr } = await supabase
        .from('team_members')
        .insert({ team_id: newTeam.id, user_id: user.id, role: 'owner' });
      if (memberErr) throw memberErr;

      setTeamName('');
      reloadData();
    } catch (err) {
      console.error('Failed to create team:', err);
    }
  }, [teamName, user.id, reloadData]);

  const handleInviteMember = useCallback(async () => {
    if (!inviteEmail.trim() || !team) return;
    const emailLower = inviteEmail.trim().toLowerCase();

    if (teamMembers.some(m => m.email.toLowerCase() === emailLower)) {
      alert('This user is already a team member.');
      return;
    }

    try {
      const { error } = await supabase.from('team_invites').insert({
        team_id: team.id,
        email: emailLower,
        invited_by: user.id,
      });
      if (error) throw error;
      setInviteEmail('');

      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'Invited team member',
          details: emailLower,
          team_id: team.id,
        });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to invite member:', err);
    }
  }, [inviteEmail, team, user.id, teamMembers]);

  const handleAcceptInvite = useCallback(async () => {
    if (!pendingInvite) return;
    try {
      const { error: memberErr } = await supabase
        .from('team_members')
        .insert({ team_id: pendingInvite.team_id, user_id: user.id, role: 'member' });
      if (memberErr) throw memberErr;

      await supabase
        .from('team_invites')
        .update({ status: 'accepted' })
        .eq('id', pendingInvite.id);

      setPendingInvite(null);
      reloadData();
    } catch (err) {
      console.error('Failed to accept invite:', err);
    }
  }, [pendingInvite, user.id, reloadData]);

  const handleDeclineInvite = useCallback(async () => {
    if (!pendingInvite) return;
    try {
      await supabase
        .from('team_invites')
        .update({ status: 'declined' })
        .eq('id', pendingInvite.id);
      setPendingInvite(null);
    } catch (err) {
      console.error('Failed to decline invite:', err);
    }
  }, [pendingInvite]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!team) return;
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', userId);
      if (error) throw error;
      setTeamMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }, [team]);

  const handleLeaveTeam = useCallback(async () => {
    if (!team) return;
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', user.id);
      if (error) throw error;
      reloadData();
    } catch (err) {
      console.error('Failed to leave team:', err);
    }
  }, [team, user.id, reloadData]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput || showNewTask) return;

      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        return;
      }

      const shortcuts: Record<string, () => void> = {
        '1': () => setActiveTab('board'),
        '2': () => setActiveTab('notes'),
        '3': () => setActiveTab('team'),
        'n': () => setShowNewTask(true),
        '?': () => setShowShortcuts(prev => !prev),
      };

      if (shortcuts[e.key]) {
        e.preventDefault();
        shortcuts[e.key]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNewTask, showShortcuts]);

  const tabs: { id: TabView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'board', label: 'Task Board', icon: <CheckIcon className="w-4 h-4" />, badge: pendingTaskCount },
    { id: 'notes', label: 'Notes', icon: <MessageIcon className="w-4 h-4" />, badge: notes.length },
    { id: 'team', label: isTeamMode ? team!.name : 'Team', icon: <UsersIcon className="w-4 h-4" />, badge: isTeamMode ? teamMembers.length : undefined },
  ];

  const displayRole = (role: 'owner' | 'admin' | 'member') => {
    if (role === 'owner' || role === 'admin') return 'Admin';
    return 'Member';
  };

  return (
    <div className="space-y-5">

      {/* LOADING SKELETON */}
      {loading && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-40 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-4 w-72 bg-slate-100 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="flex items-center space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-9 w-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm h-64 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* HEADER */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
                Team Hub
                {isTeamMode && (
                  <span className="ml-2 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold align-middle">{team!.name}</span>
                )}
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">{isTeamMode ? 'Collaborate on tasks with your team' : 'Manage your tasks and collaborate with teammates'}</p>
            </div>
            <div className="flex items-center space-x-2">
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

          {/* INVITE BANNER */}
          {pendingInvite && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-indigo-900">You've been invited to join '{pendingInvite.team_name}'</p>
                  <p className="text-xs text-indigo-600">Collaborate on tasks and notes with your team</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDeclineInvite}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg bg-white transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={handleAcceptInvite}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-200 transition-all"
                >
                  Accept Invite
                </button>
              </div>
            </div>
          )}

          {/* TAB NAVIGATION */}
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

          {/* TAB: BOARD */}
          {activeTab === 'board' && (
            <KanbanBoard
              tasks={kanbanTasks}
              currentUserId={user.id}
              isAdmin={isAdmin || !isTeamMode}
              onStatusChange={handleStatusChange}
              onNewTask={() => setShowNewTask(true)}
            />
          )}

          {/* TAB: NOTES */}
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
                      placeholder="Write a note or insight..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none placeholder-slate-300"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-slate-400">Document insights and share with your team</p>
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
                  <p className="text-sm font-bold text-slate-700">No notes yet</p>
                  <p className="text-xs text-slate-400">Start documenting your insights</p>
                </div>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm group">
                    <div className="p-5">
                      <div className="flex items-start space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                          {(note.author_name || user.name || 'U').charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <p className="text-sm font-bold text-slate-800">{note.author_name || user.name || 'You'}</p>
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

          {/* TAB: TEAM */}
          {activeTab === 'team' && (
            <div className="space-y-5">
              {!isTeamMode ? (
                /* Solo: Create Team */
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 max-w-md mx-auto text-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-4">
                    <UsersIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 mb-2">Create a Team</h3>
                  <p className="text-sm text-slate-400 mb-6">Start collaborating on tasks and notes with your team members.</p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={teamName}
                      onChange={e => setTeamName(e.target.value)}
                      placeholder="Team name (e.g. Sales Team)"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
                    />
                    <button
                      onClick={handleCreateTeam}
                      disabled={!teamName.trim()}
                      className="w-full flex items-center justify-center space-x-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span>Create Team</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Team Mode */
                <>
                  {/* Team Info */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-lg">
                          {team!.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 font-heading text-sm">{team!.name}</h3>
                          <p className="text-[10px] text-slate-400">{teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {myTeamRole && (
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black ${
                            myTeamRole === 'owner' || myTeamRole === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {displayRole(myTeamRole)}
                          </span>
                        )}
                        {myTeamRole !== 'owner' && (
                          <button
                            onClick={handleLeaveTeam}
                            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-all"
                          >
                            <XIcon className="w-3 h-3" />
                            <span>Leave Team</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="font-bold text-slate-800 font-heading text-sm">Members</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {teamMembers.map(member => (
                        <div key={member.id} className="px-6 py-3.5 flex items-center space-x-4">
                          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                            {member.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">{member.name}{member.user_id === user.id ? ' (You)' : ''}</p>
                            <p className="text-[10px] text-slate-400">{member.email}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                            member.role === 'owner' || member.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {displayRole(member.role)}
                          </span>
                          {(myTeamRole === 'owner' || myTeamRole === 'admin') && member.user_id !== user.id && member.role !== 'owner' && (
                            <button
                              onClick={() => handleRemoveMember(member.user_id)}
                              className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                              title="Remove member"
                            >
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Invite Members */}
                  {(myTeamRole === 'owner' || myTeamRole === 'admin') && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800 font-heading text-sm">Invite Members</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Invitees will see a banner when they log in</p>
                      </div>
                      <div className="p-6">
                        <div className="flex items-center space-x-2">
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            placeholder="colleague@company.com"
                            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
                          />
                          <button
                            onClick={handleInviteMember}
                            disabled={!inviteEmail.trim()}
                            className="flex items-center space-x-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40"
                          >
                            <MailIcon className="w-4 h-4" />
                            <span>Send Invite</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* NEW TASK MODAL */}
          {showNewTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowNewTask(false)}>
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-black text-slate-900 font-heading">New Task</h3>
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
                  {isTeamMode && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Assign To</label>
                      <select
                        value={newTaskAssignee || ''}
                        onChange={e => setNewTaskAssignee(e.target.value || null)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map(m => (
                          <option key={m.user_id} value={m.user_id}>{m.name}{m.user_id === user.id ? ' (You)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
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

          {/* KEYBOARD SHORTCUTS MODAL */}
          {showShortcuts && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
              <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-slate-900 font-heading">Keyboard Shortcuts</h3>
                  </div>
                  <button onClick={() => setShowShortcuts(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  {[
                    { category: 'Navigation', shortcuts: [
                      { keys: '1', desc: 'Task Board' },
                      { keys: '2', desc: 'Notes' },
                      { keys: '3', desc: 'Team' },
                    ]},
                    { category: 'Actions', shortcuts: [
                      { keys: 'N', desc: 'New Task' },
                      { keys: '?', desc: 'Toggle Shortcuts' },
                      { keys: 'Esc', desc: 'Close Modals' },
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

export default TeamHub;
