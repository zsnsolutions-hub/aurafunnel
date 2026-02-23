import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Team } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  CheckIcon, UsersIcon, MailIcon,
  ClockIcon, PlusIcon, XIcon, MessageIcon,
  KeyboardIcon, DocumentIcon, EditIcon
} from '../../components/Icons';
import { Filter, ArrowUpDown, BarChart3, X as LucideX } from 'lucide-react';
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [teamName, setTeamName] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const isTeamMode = team !== null;

  // Team invite tracking
  const [sentInvites, setSentInvites] = useState<{ id: string; email: string; name?: string; role?: string; status: string; created_at: string }[]>([]);
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [teamCreating, setTeamCreating] = useState(false);
  const [teamCreateError, setTeamCreateError] = useState<string | null>(null);

  // Team rename
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [editTeamNameValue, setEditTeamNameValue] = useState('');

  // Board toolbar state
  const [boardFilter, setBoardFilter] = useState<TaskPriority | ''>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'default' | 'priority' | 'deadline'>('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [auditLogs, setAuditLogs] = useState<{ id: string; action: string; details: string; created_at: string; user_id: string; user_name?: string }[]>([]);
  const filterRef = React.useRef<HTMLDivElement>(null);
  const sortRef = React.useRef<HTMLDivElement>(null);

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

        // 2. Branched data queries
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
  }, [user.id, dataVersion]);

  // Fetch sent invites for the team
  useEffect(() => {
    if (!team) { setSentInvites([]); return; }
    let cancelled = false;
    const loadInvites = async () => {
      try {
        const { data } = await supabase
          .from('team_invites')
          .select('id, email, name, role, status, created_at')
          .eq('team_id', team.id)
          .order('created_at', { ascending: false });
        if (!cancelled && data) {
          setSentInvites(data.map((inv: any) => ({
            id: inv.id,
            email: inv.email,
            name: inv.name || '',
            role: inv.role || 'member',
            status: inv.status,
            created_at: inv.created_at,
          })));
        }
      } catch { /* ignore */ }
    };
    loadInvites();
    return () => { cancelled = true; };
  }, [team, dataVersion]);

  // ─── Computed ───
  const myTeamRole = useMemo(() => {
    return teamMembers.find(m => m.user_id === user.id)?.role || null;
  }, [teamMembers, user.id]);

  const isAdmin = myTeamRole === 'owner' || myTeamRole === 'admin';

  const pendingTaskCount = useMemo(() => tasks.filter(t => t.status !== 'done').length, [tasks]);

  const kanbanTasks = useMemo(() => {
    let filtered = tasks;
    if (boardFilter) {
      filtered = filtered.filter(t => t.priority === boardFilter);
    }
    if (sortMode === 'deadline') {
      filtered = [...filtered].sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
    }
    return filtered.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      deadline: t.deadline,
      assigned_to: t.assigned_to,
      assigned_name: t.assigned_name,
      user_id: t.user_id,
      status: t.status,
    }));
  }, [tasks, boardFilter, sortMode]);

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
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teamName.trim())) {
      setTeamCreateError('Please enter a team name, not an email address.');
      return;
    }
    setTeamCreating(true);
    setTeamCreateError(null);
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
    } catch (err: any) {
      console.error('Failed to create team:', err);
      const msg = err?.message || err?.details || 'Unknown error';
      if (msg.includes('does not exist') || msg.includes('relation')) {
        setTeamCreateError('Team tables not found. Please run the database migration first.');
      } else if (msg.includes('permission') || msg.includes('policy')) {
        setTeamCreateError('Permission denied. Check your database RLS policies.');
      } else {
        setTeamCreateError(`Failed to create team: ${msg}`);
      }
    } finally {
      setTeamCreating(false);
    }
  }, [teamName, user.id, reloadData]);

  const handleInviteMember = useCallback(async () => {
    if (!inviteEmail.trim() || !inviteName.trim() || !team) return;
    const emailLower = inviteEmail.trim().toLowerCase();
    setInviteFeedback(null);

    if (teamMembers.some(m => m.email.toLowerCase() === emailLower)) {
      setInviteFeedback({ type: 'error', message: 'This user is already a team member.' });
      return;
    }

    if (sentInvites.some(inv => inv.email === emailLower && inv.status === 'pending')) {
      setInviteFeedback({ type: 'error', message: 'An invite has already been sent to this email.' });
      return;
    }

    try {
      const { error } = await supabase.from('team_invites').insert({
        team_id: team.id,
        email: emailLower,
        name: inviteName.trim(),
        invited_by: user.id,
        role: inviteRole,
      });
      if (error) throw error;

      // Check if the invitee already has an account
      let feedbackMsg = `Invite sent to ${inviteName.trim()} (${emailLower})`;
      try {
        const { data: exists } = await supabase.rpc('check_email_exists', { check_email: emailLower });
        if (exists) {
          feedbackMsg += " — They'll see the invite immediately.";
        } else {
          feedbackMsg += " — They'll see it when they create an account.";
        }
      } catch { /* fallback to generic message */ }

      setInviteEmail('');
      setInviteName('');
      setInviteRole('member');
      setInviteFeedback({ type: 'success', message: feedbackMsg });
      setSentInvites(prev => [{ id: `temp-${Date.now()}`, email: emailLower, name: inviteName.trim(), role: inviteRole, status: 'pending', created_at: new Date().toISOString() }, ...prev]);

      // Auto-clear feedback after 4 seconds
      setTimeout(() => setInviteFeedback(null), 4000);

      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: `Invited ${inviteRole}`,
          details: `${inviteName.trim()} (${emailLower})`,
          team_id: team.id,
        });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to invite member:', err);
      setInviteFeedback({ type: 'error', message: 'Failed to send invite. Please try again.' });
    }
  }, [inviteEmail, inviteName, inviteRole, team, user.id, teamMembers, sentInvites]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!team) return;
    const member = teamMembers.find(m => m.user_id === userId);
    const confirmMsg = member
      ? `Remove ${member.name} (${member.email}) from the team?`
      : 'Remove this member from the team?';
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', userId);
      if (error) throw error;
      setTeamMembers(prev => prev.filter(m => m.user_id !== userId));

      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'Removed team member',
          details: member ? `${member.name} (${member.email})` : userId,
          team_id: team.id,
        });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }, [team, user.id, teamMembers]);

  const handleCancelInvite = useCallback(async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('team_invites')
        .delete()
        .eq('id', inviteId);
      if (error) throw error;
      setSentInvites(prev => prev.filter(inv => inv.id !== inviteId));
    } catch (err) {
      console.error('Failed to cancel invite:', err);
    }
  }, []);

  const handleChangeRole = useCallback(async (memberId: string, memberUserId: string, newRole: 'admin' | 'member') => {
    if (!team) return;
    try {
      const { error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('team_id', team.id)
        .eq('user_id', memberUserId);
      if (error) throw error;
      setTeamMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, role: newRole } : m));

      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: `Changed role to ${newRole}`,
          details: teamMembers.find(m => m.user_id === memberUserId)?.name || '',
          team_id: team.id,
        });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  }, [team, user.id, teamMembers]);

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

  const handleRenameTeam = useCallback(async () => {
    if (!team || !editTeamNameValue.trim()) return;
    const newName = editTeamNameValue.trim();
    if (newName === team.name) { setEditingTeamName(false); return; }

    try {
      const { error } = await supabase
        .from('teams')
        .update({ name: newName })
        .eq('id', team.id);
      if (error) throw error;
      setTeam({ ...team, name: newName });
      setEditingTeamName(false);
    } catch (err) {
      console.error('Failed to rename team:', err);
    }
  }, [team, editTeamNameValue]);

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

  // Click-outside for filter/sort dropdowns
  useEffect(() => {
    if (!filterOpen && !sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterOpen && filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (sortOpen && sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen, sortOpen]);

  // Activity feed: fetch recent audit logs
  useEffect(() => {
    if (!showActivity) return;
    let cancelled = false;
    const loadActivity = async () => {
      try {
        const query = isTeamMode
          ? supabase.from('audit_logs').select('*').eq('team_id', team!.id).order('created_at', { ascending: false }).limit(20)
          : supabase.from('audit_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
        const { data } = await query;
        if (!cancelled && data) {
          const memberNameMap: Record<string, string> = {};
          teamMembers.forEach(m => { memberNameMap[m.user_id] = m.name; });
          setAuditLogs(data.map((l: any) => ({
            id: l.id,
            action: l.action || '',
            details: l.details || '',
            created_at: l.created_at,
            user_id: l.user_id,
            user_name: memberNameMap[l.user_id] || user.name || 'You',
          })));
        }
      } catch { /* ignore */ }
    };
    loadActivity();
    return () => { cancelled = true; };
  }, [showActivity, isTeamMode, team, user.id, user.name, teamMembers]);

  const tabs: { id: TabView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'board', label: 'Task Board', icon: <CheckIcon className="w-4 h-4" />, badge: pendingTaskCount },
    { id: 'notes', label: 'Notes', icon: <MessageIcon className="w-4 h-4" />, badge: notes.length },
    { id: 'team', label: 'Team', icon: <UsersIcon className="w-4 h-4" />, badge: isTeamMode ? teamMembers.length : undefined },
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
            <div className="space-y-4">
              {/* Board toolbar */}
              <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-2.5 shadow-sm">
                <div className="flex items-center gap-3">
                  {/* Stats chips */}
                  <span className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[12px] font-semibold text-gray-600">
                    {tasks.length} total
                  </span>
                  <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-[12px] font-semibold text-blue-600">
                    {tasks.filter(t => t.status === 'in_progress').length} in progress
                  </span>
                  <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] font-semibold text-emerald-600">
                    {tasks.filter(t => t.status === 'done').length} done
                  </span>

                  {/* Member avatar stack */}
                  {teamMembers.length > 0 && (
                    <div className="flex items-center ml-2 pl-3 border-l border-gray-200">
                      <div className="flex -space-x-2">
                        {teamMembers.slice(0, 4).map((m, i) => {
                          const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-cyan-600'];
                          let h = 0;
                          for (let c = 0; c < m.user_id.length; c++) h = ((h << 5) - h + m.user_id.charCodeAt(c)) | 0;
                          const bgColor = colors[Math.abs(h) % colors.length];
                          return (
                            <div
                              key={m.id}
                              className={`w-8 h-8 rounded-full ${bgColor} border-2 border-white flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-sm`}
                              title={m.name}
                            >
                              {m.name.charAt(0)}
                            </div>
                          );
                        })}
                      </div>
                      {teamMembers.length > 4 && (
                        <span className="ml-1.5 text-[12px] font-semibold text-gray-500">+{teamMembers.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Filter */}
                  <div className="relative" ref={filterRef}>
                    <button
                      onClick={() => { setFilterOpen(!filterOpen); setSortOpen(false); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                        boardFilter
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Filter size={14} />
                      {boardFilter ? PRIORITY_META[boardFilter].label : 'Filter'}
                    </button>
                    {filterOpen && (
                      <div className="absolute right-0 top-10 w-48 bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-2">
                        <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Priority</p>
                        {([['', 'All Priorities'], ['urgent', 'Urgent'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => { setBoardFilter(val as TaskPriority | ''); setFilterOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                              boardFilter === val ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sort */}
                  <div className="relative" ref={sortRef}>
                    <button
                      onClick={() => { setSortOpen(!sortOpen); setFilterOpen(false); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                        sortMode !== 'default'
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <ArrowUpDown size={14} />
                      {sortMode === 'default' ? 'Sort' : sortMode === 'priority' ? 'Priority' : 'Deadline'}
                    </button>
                    {sortOpen && (
                      <div className="absolute right-0 top-10 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-1">
                        {([['default', 'Default'], ['priority', 'Priority'], ['deadline', 'Deadline']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => { setSortMode(val as typeof sortMode); setSortOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                              sortMode === val ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Activity toggle */}
                  <button
                    onClick={() => setShowActivity(s => !s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                      showActivity ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <BarChart3 size={14} />
                    Activity
                  </button>
                </div>
              </div>

              {/* Board + Activity sidebar */}
              <div className="flex gap-5">
                {/* Kanban board */}
                <div className="flex-1 min-w-0 bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <KanbanBoard
                    tasks={kanbanTasks}
                    currentUserId={user.id}
                    isAdmin={isAdmin || !isTeamMode}
                    onStatusChange={handleStatusChange}
                    onNewTask={() => setShowNewTask(true)}
                  />
                </div>

                {/* Activity sidebar */}
                {showActivity && (
                  <div className="w-[300px] shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col max-h-[calc(100vh-280px)] overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                      <div className="flex items-center gap-2">
                        <BarChart3 size={14} className="text-blue-600" />
                        <span className="text-[13px] font-bold text-gray-900">Activity Feed</span>
                      </div>
                      <button onClick={() => setShowActivity(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
                        <LucideX size={14} />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-3">
                      {auditLogs.length === 0 ? (
                        <div className="py-10 text-center">
                          <p className="text-sm text-gray-400 font-medium">No activity yet</p>
                          <p className="text-xs text-gray-300 mt-1">Activity will appear as you work</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {auditLogs.map(log => {
                            const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500'];
                            let h = 0;
                            for (let c = 0; c < log.user_id.length; c++) h = ((h << 5) - h + log.user_id.charCodeAt(c)) | 0;
                            const dotColor = colors[Math.abs(h) % colors.length];
                            const diff = Date.now() - new Date(log.created_at).getTime();
                            const mins = Math.floor(diff / 60000);
                            let timeStr = 'JUST NOW';
                            if (mins >= 1 && mins < 60) timeStr = `${mins}M AGO`;
                            else if (mins >= 60 && mins < 1440) timeStr = `${Math.floor(mins / 60)}H AGO`;
                            else if (mins >= 1440) timeStr = `${Math.floor(mins / 1440)}D AGO`;

                            return (
                              <div key={log.id} className="flex items-start gap-3">
                                <div className={`w-7 h-7 rounded-full ${dotColor} flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5`}>
                                  {(log.user_name || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] text-gray-700 leading-relaxed">
                                    <span className="font-bold text-gray-900">{log.user_name || 'You'}</span>{' '}
                                    {log.action.toLowerCase()}
                                    {log.details && (
                                      <> — <span className="font-medium text-blue-600">{log.details.length > 50 ? log.details.slice(0, 50) + '...' : log.details}</span></>
                                    )}
                                  </p>
                                  <p className="text-[9px] font-bold text-gray-400 tracking-wider mt-1">{timeStr}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* Progress footer */}
                    <div className="px-4 py-3 border-t border-gray-100 shrink-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] font-medium text-gray-600">Completion</span>
                        <span className="text-[12px] font-bold text-gray-900">
                          {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                      onKeyDown={e => { if (e.key === 'Enter' && teamName.trim()) handleCreateTeam(); }}
                    />
                    <button
                      onClick={handleCreateTeam}
                      disabled={!teamName.trim() || teamCreating}
                      className="w-full flex items-center justify-center space-x-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40"
                    >
                      {teamCreating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <PlusIcon className="w-4 h-4" />
                          <span>Create Team</span>
                        </>
                      )}
                    </button>
                    {teamCreateError && (
                      <div className="flex items-start space-x-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                        <XIcon className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-medium text-rose-700">{teamCreateError}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Team Mode */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Left column: Team Info + Members */}
                  <div className="lg:col-span-2 space-y-5">
                    {/* Team Info Header */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <div className="px-6 py-5 flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-200">
                            {team!.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            {editingTeamName ? (
                              <div className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={editTeamNameValue}
                                  onChange={e => setEditTeamNameValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleRenameTeam(); if (e.key === 'Escape') setEditingTeamName(false); }}
                                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-lg font-black text-slate-900 font-heading focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                  autoFocus
                                />
                                <button onClick={handleRenameTeam} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all">Save</button>
                                <button onClick={() => setEditingTeamName(false)} className="px-2.5 py-1.5 text-slate-500 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <h3 className="font-black text-slate-900 font-heading text-lg">{team!.name}</h3>
                                {isAdmin && (
                                  <button
                                    onClick={() => { setEditTeamNameValue(team!.name); setEditingTeamName(true); }}
                                    className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                                    title="Rename team"
                                  >
                                    <EditIcon className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-slate-400 mt-0.5">{teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} &middot; Created by {teamMembers.find(m => m.role === 'owner')?.name || 'Unknown'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {myTeamRole && (
                            <span className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                              myTeamRole === 'owner' ? 'bg-indigo-600 text-white' :
                              myTeamRole === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {myTeamRole === 'owner' ? 'Owner' : displayRole(myTeamRole)}
                            </span>
                          )}
                          {myTeamRole !== 'owner' && (
                            <button
                              onClick={handleLeaveTeam}
                              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-all"
                            >
                              <XIcon className="w-3 h-3" />
                              <span>Leave</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Members List */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-slate-800 font-heading text-sm">Team Members</h3>
                          <p className="text-[10px] text-slate-400 mt-0.5">{teamMembers.length} active member{teamMembers.length !== 1 ? 's' : ''}</p>
                        </div>
                        {/* Member stats */}
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold">
                            {teamMembers.filter(m => m.role === 'owner' || m.role === 'admin').length} Admin{teamMembers.filter(m => m.role === 'owner' || m.role === 'admin').length !== 1 ? 's' : ''}
                          </span>
                          <span className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold">
                            {teamMembers.filter(m => m.role === 'member').length} Member{teamMembers.filter(m => m.role === 'member').length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {teamMembers.map(member => {
                          const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-cyan-600'];
                          let h = 0;
                          for (let c = 0; c < member.user_id.length; c++) h = ((h << 5) - h + member.user_id.charCodeAt(c)) | 0;
                          const bgColor = colors[Math.abs(h) % colors.length];

                          return (
                            <div key={member.id} className="px-6 py-3.5 flex items-center space-x-4 hover:bg-slate-50/50 transition-colors">
                              <div className={`w-9 h-9 rounded-full ${bgColor} flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-sm`}>
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800">
                                  {member.name}
                                  {member.user_id === user.id && <span className="text-slate-400 font-normal ml-1">(You)</span>}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">{member.email}</p>
                              </div>

                              {/* Role badge + actions */}
                              <div className="flex items-center space-x-2 shrink-0">
                                {/* Role selector (only for owner/admin managing non-owners) */}
                                {(myTeamRole === 'owner') && member.user_id !== user.id && member.role !== 'owner' ? (
                                  <select
                                    value={member.role}
                                    onChange={e => handleChangeRole(member.id, member.user_id, e.target.value as 'admin' | 'member')}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                                  >
                                    <option value="admin">Admin</option>
                                    <option value="member">Member</option>
                                  </select>
                                ) : (
                                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                                    member.role === 'owner' ? 'bg-indigo-600 text-white' :
                                    member.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {member.role === 'owner' ? 'Owner' : displayRole(member.role)}
                                  </span>
                                )}

                                {/* Remove button */}
                                {(myTeamRole === 'owner' || myTeamRole === 'admin') && member.user_id !== user.id && member.role !== 'owner' && (
                                  <button
                                    onClick={() => handleRemoveMember(member.user_id)}
                                    className="flex items-center space-x-1 px-2.5 py-1.5 text-[10px] font-bold text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
                                  >
                                    <XIcon className="w-3 h-3" />
                                    <span>Remove</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right column: Invite + Pending Invites */}
                  <div className="space-y-5">
                    {/* Invite Members */}
                    {(myTeamRole === 'owner' || myTeamRole === 'admin') && (
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-100">
                          <div className="flex items-center space-x-2 mb-1">
                            <MailIcon className="w-4 h-4 text-indigo-600" />
                            <h3 className="font-bold text-slate-800 font-heading text-sm">Invite Members</h3>
                          </div>
                          <p className="text-[10px] text-slate-400">Send an invite by email. They'll see a join banner when they log in.</p>
                        </div>
                        <div className="p-5 space-y-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Name</label>
                            <input
                              type="text"
                              value={inviteName}
                              onChange={e => setInviteName(e.target.value)}
                              placeholder="John Doe"
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email</label>
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={e => setInviteEmail(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && inviteEmail.trim() && inviteName.trim()) handleInviteMember(); }}
                              placeholder="colleague@company.com"
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Role</label>
                            <div className="flex items-center space-x-2">
                              {(['admin', 'member'] as const).map(role => (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => setInviteRole(role)}
                                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                                    inviteRole === role
                                      ? role === 'admin'
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-200'
                                        : 'bg-slate-50 border-slate-300 text-slate-700 ring-2 ring-slate-200'
                                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="text-center">
                                    <span>{role === 'admin' ? 'Admin' : 'Member'}</span>
                                    <p className={`text-[9px] font-medium mt-0.5 ${inviteRole === role ? 'text-current opacity-60' : 'text-slate-300'}`}>
                                      {role === 'admin' ? 'Can manage team' : 'Can view & contribute'}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={handleInviteMember}
                            disabled={!inviteEmail.trim() || !inviteName.trim()}
                            className="w-full flex items-center justify-center space-x-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40"
                          >
                            <MailIcon className="w-4 h-4" />
                            <span>Send Invite</span>
                          </button>

                          {/* Feedback message */}
                          {inviteFeedback && (
                            <div className={`flex items-center space-x-2 px-3 py-2.5 rounded-lg text-xs font-semibold ${
                              inviteFeedback.type === 'success'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {inviteFeedback.type === 'success' ? (
                                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <XIcon className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{inviteFeedback.message}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pending Invites */}
                    {(myTeamRole === 'owner' || myTeamRole === 'admin') && sentInvites.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-100">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 font-heading text-sm">Sent Invites</h3>
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold">
                              {sentInvites.filter(i => i.status === 'pending').length} pending
                            </span>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
                          {sentInvites.map(inv => (
                            <div key={inv.id} className="px-5 py-3 flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                {inv.name && <p className="text-xs font-bold text-slate-800 truncate">{inv.name}</p>}
                                <p className="text-[10px] font-medium text-slate-500 truncate">{inv.email}</p>
                                <div className="flex items-center space-x-1.5 mt-0.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    inv.role === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500'
                                  }`}>
                                    {inv.role === 'admin' ? 'Admin' : 'Member'}
                                  </span>
                                  <span className="text-[9px] text-slate-300">
                                    {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 shrink-0 ml-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                                  inv.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                                  inv.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  {inv.status}
                                </span>
                                {inv.status === 'pending' && (
                                  <button
                                    onClick={() => handleCancelInvite(inv.id)}
                                    className="flex items-center space-x-1 px-2 py-1 text-[10px] font-bold text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
                                  >
                                    <XIcon className="w-3 h-3" />
                                    <span>Remove</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick stats */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <h3 className="font-bold text-slate-800 font-heading text-sm mb-3">Team Overview</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Total Tasks</span>
                          <span className="text-xs font-bold text-slate-800">{tasks.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Active</span>
                          <span className="text-xs font-bold text-blue-600">{tasks.filter(t => t.status !== 'done').length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Completed</span>
                          <span className="text-xs font-bold text-emerald-600">{tasks.filter(t => t.status === 'done').length}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-medium text-slate-400">Completion Rate</span>
                            <span className="text-[10px] font-bold text-slate-700">
                              {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
