import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  LayoutGrid, Plus, Loader2, Trash2, Search, ListChecks,
  Layers, AlertTriangle, Clock, CheckCircle2, MoreHorizontal,
  Pencil, ArrowRight, Flag, Activity, RefreshCw,
  SortAsc, SortDesc, Filter,
} from 'lucide-react';
import type { User } from '../../../types';
import type { BoardWithData, BoardSummary, DashboardStats, Activity as ActivityType } from './teamHubApi';
import * as api from './teamHubApi';
import BoardHeader from './components/BoardHeader';
import BoardView from './components/BoardView';

interface OutletCtx {
  user: User;
  refreshProfile: () => Promise<void>;
}

const BOARD_COLORS = [
  'from-indigo-500 to-blue-500',
  'from-violet-500 to-purple-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-sky-500',
];

const ACTION_LABELS: Record<string, string> = {
  card_created: 'created a card',
  card_moved: 'moved a card',
  card_archived: 'archived a card',
  comment_added: 'commented on a card',
  list_created: 'created a list',
};

type SortMode = 'recent' | 'name' | 'cards';

const TeamHubPage: React.FC = () => {
  const { user } = useOutletContext<OutletCtx>();

  // Board list state
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showNewBoardInput, setShowNewBoardInput] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [boardMenuOpen, setBoardMenuOpen] = useState<string | null>(null);
  const [renamingBoard, setRenamingBoard] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Board detail state
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boardData, setBoardData] = useState<BoardWithData | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);

  // ─── Data loading ───

  const loadDashboard = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [{ boards: b, stats: s }, activity] = await Promise.all([
        api.fetchBoardsWithStats(user.id),
        api.fetchRecentActivity(user.id),
      ]);
      setBoards(b);
      setStats(s);
      setRecentActivity(activity);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Load board detail
  const loadBoardData = useCallback(async (boardId: string) => {
    setBoardLoading(true);
    try {
      const data = await api.fetchBoardWithData(boardId);
      setBoardData(data);
    } catch (err) {
      console.error('Failed to load board:', err);
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBoardId) {
      loadBoardData(selectedBoardId);
    } else {
      setBoardData(null);
    }
  }, [selectedBoardId, loadBoardData]);

  const handleRefresh = useCallback(() => {
    if (selectedBoardId) loadBoardData(selectedBoardId);
  }, [selectedBoardId, loadBoardData]);

  // ─── Board CRUD ───

  const handleCreateBoard = async () => {
    const name = newBoardName.trim() || 'Untitled Board';
    setCreating(true);
    try {
      const newBoard = await api.createBoard(user.id, name);
      setShowNewBoardInput(false);
      setNewBoardName('');
      setSelectedBoardId(newBoard.id);
      loadDashboard();
    } catch (err) {
      console.error('Failed to create board:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRenameBoard = async (boardId: string, name: string) => {
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name } : b));
    setBoardData(prev => prev && prev.id === boardId ? { ...prev, name } : prev);
    try {
      await api.updateBoard(boardId, name);
    } catch {
      loadDashboard();
    }
    setRenamingBoard(null);
  };

  const handleDeleteBoard = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteBoard(deleteConfirm);
      if (selectedBoardId === deleteConfirm) {
        setSelectedBoardId(null);
        setBoardData(null);
      }
      loadDashboard();
    } catch (err) {
      console.error('Failed to delete board:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // ─── Filtering & Sorting ───

  const filteredBoards = useMemo(() => {
    let result = [...boards];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => b.name.toLowerCase().includes(q));
    }
    switch (sortMode) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'cards':
        result.sort((a, b) => b.card_count - a.card_count);
        break;
      case 'recent':
      default:
        result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
    }
    return result;
  }, [boards, searchQuery, sortMode]);

  const getBoardColor = (index: number) => BOARD_COLORS[index % BOARD_COLORS.length];

  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // ─── Board Detail View ───
  if (selectedBoardId && boardData) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <BoardHeader
          board={boardData}
          onBack={() => { setSelectedBoardId(null); loadDashboard(); }}
          onRename={(name) => handleRenameBoard(selectedBoardId, name)}
          onDelete={() => setDeleteConfirm(selectedBoardId)}
        />

        {boardLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="text-indigo-400 animate-spin" />
          </div>
        ) : (
          <BoardView
            board={boardData}
            userId={user.id}
            userName={user.name || 'User'}
            onRefresh={handleRefresh}
          />
        )}

        {deleteConfirm && (
          <DeleteModal onCancel={() => setDeleteConfirm(null)} onConfirm={handleDeleteBoard} />
        )}
      </div>
    );
  }

  // ─── Dashboard View ───
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Boards</h1>
          <p className="text-sm text-slate-500 mt-0.5">Organize work across your projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowNewBoardInput(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
          >
            <Plus size={16} />
            New Board
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-indigo-400 animate-spin" />
        </div>
      ) : boards.length === 0 && !showNewBoardInput ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-4">
            <LayoutGrid size={36} className="text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Create your first board</h3>
          <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
            Organize your team's work with kanban boards. Create lists, add cards, and drag them to track progress.
          </p>
          <button
            onClick={() => setShowNewBoardInput(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
          >
            <Plus size={16} />
            Create Board
          </button>
        </div>
      ) : (
        <>
          {/* ─── Stat Cards ─── */}
          {stats && stats.totalBoards > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <StatCard icon={<LayoutGrid size={16} />} label="Boards" value={stats.totalBoards} color="indigo" />
              <StatCard icon={<Layers size={16} />} label="Lists" value={stats.totalLists} color="violet" />
              <StatCard icon={<ListChecks size={16} />} label="Cards" value={stats.totalCards} color="emerald" />
              <StatCard icon={<Flag size={16} />} label="High Priority" value={stats.highPriorityCards} color="rose" />
              <StatCard icon={<Clock size={16} />} label="Overdue" value={stats.overdueCards} color="amber" />
              <StatCard icon={<CheckCircle2 size={16} />} label="Done Today" value={stats.completedToday} color="teal" />
            </div>
          )}

          {/* New board input */}
          {showNewBoardInput && (
            <div className="mb-6 bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm">
              <p className="text-xs font-black text-indigo-500 uppercase tracking-wider mb-3">Create New Board</p>
              <input
                autoFocus
                value={newBoardName}
                onChange={e => setNewBoardName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateBoard();
                  if (e.key === 'Escape') { setShowNewBoardInput(false); setNewBoardName(''); }
                }}
                placeholder="e.g. Q1 Marketing Campaign, Product Roadmap..."
                className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 mb-3 placeholder-slate-400"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateBoard}
                  disabled={creating}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Board'}
                </button>
                <button
                  onClick={() => { setShowNewBoardInput(false); setNewBoardName(''); }}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ─── Main content: Boards + Activity ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Boards column (2/3) */}
            <div className="lg:col-span-2">
              {/* Search & Sort bar */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search boards..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all placeholder-slate-400"
                  />
                </div>
                <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <SortButton active={sortMode === 'recent'} onClick={() => setSortMode('recent')} icon={<Clock size={13} />} label="Recent" />
                  <SortButton active={sortMode === 'name'} onClick={() => setSortMode('name')} icon={<SortAsc size={13} />} label="A-Z" />
                  <SortButton active={sortMode === 'cards'} onClick={() => setSortMode('cards')} icon={<SortDesc size={13} />} label="Cards" />
                </div>
              </div>

              {/* Board cards */}
              {filteredBoards.length === 0 ? (
                <div className="text-center py-12">
                  <Filter size={20} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-400">No boards match your search</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredBoards.map((board, idx) => (
                    <div
                      key={board.id}
                      className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all group relative"
                    >
                      {/* Color banner */}
                      <div className={`h-2 bg-gradient-to-r ${getBoardColor(idx)}`} />

                      {/* Content */}
                      <button
                        onClick={() => setSelectedBoardId(board.id)}
                        className="w-full text-left p-4 pb-3"
                      >
                        <div className="flex items-start justify-between mb-2">
                          {renamingBoard === board.id ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={() => { handleRenameBoard(board.id, renameValue); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameBoard(board.id, renameValue);
                                if (e.key === 'Escape') setRenamingBoard(null);
                              }}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 text-sm font-bold text-slate-800 bg-slate-50 border border-indigo-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          ) : (
                            <h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate pr-2">
                              {board.name}
                            </h3>
                          )}
                        </div>

                        {/* Mini stats row */}
                        <div className="flex items-center gap-3 mb-3">
                          <MiniStat icon={<Layers size={10} />} value={board.list_count} label="lists" />
                          <MiniStat icon={<ListChecks size={10} />} value={board.card_count} label="cards" />
                          {board.high_priority_count > 0 && (
                            <MiniStat icon={<Flag size={10} />} value={board.high_priority_count} label="high" color="rose" />
                          )}
                          {board.overdue_count > 0 && (
                            <MiniStat icon={<AlertTriangle size={10} />} value={board.overdue_count} label="overdue" color="amber" />
                          )}
                        </div>

                        {/* Mini list preview */}
                        {board.list_count > 0 && (
                          <div className="flex gap-1 mb-3">
                            {Array.from({ length: Math.min(board.list_count, 5) }).map((_, i) => (
                              <div key={i} className="flex-1 h-1.5 rounded-full bg-slate-100 group-hover:bg-indigo-100 transition-colors" />
                            ))}
                            {board.list_count > 5 && (
                              <span className="text-[8px] font-bold text-slate-400 ml-0.5">+{board.list_count - 5}</span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold text-slate-400">
                            Updated {timeAgo(board.updated_at)}
                          </p>
                          <span className="text-[10px] font-bold text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                            Open <ArrowRight size={10} />
                          </span>
                        </div>
                      </button>

                      {/* Menu button */}
                      <div className="absolute top-4 right-3">
                        <button
                          onClick={e => { e.stopPropagation(); setBoardMenuOpen(boardMenuOpen === board.id ? null : board.id); }}
                          className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {boardMenuOpen === board.id && (
                          <BoardContextMenu
                            onRename={() => { setRenamingBoard(board.id); setRenameValue(board.name); setBoardMenuOpen(null); }}
                            onDelete={() => { setDeleteConfirm(board.id); setBoardMenuOpen(null); }}
                            onClose={() => setBoardMenuOpen(null)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity sidebar (1/3) */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Activity</span>
                  </div>
                  <Activity size={14} className="text-slate-400" />
                </div>

                <div className="max-h-[480px] overflow-y-auto">
                  {recentActivity.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Activity size={20} className="text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 font-semibold">No activity yet</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">Activity will appear here as you use your boards</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {recentActivity.map(item => {
                        const meta = item.meta_json || {};
                        const label = ACTION_LABELS[item.action_type] || item.action_type;
                        let detail = '';
                        if (item.action_type === 'card_moved' && meta.from && meta.to) {
                          detail = `${meta.from} → ${meta.to}`;
                        } else if (item.action_type === 'card_created' && meta.title) {
                          detail = String(meta.title);
                        } else if (item.action_type === 'list_created' && meta.list_name) {
                          detail = String(meta.list_name);
                        }

                        return (
                          <div key={item.id} className="px-4 py-3 hover:bg-slate-50/50 transition-colors">
                            <p className="text-xs text-slate-600 leading-relaxed">
                              <span className="font-bold text-slate-700">{item.actor_name || 'You'}</span>{' '}
                              {label}
                            </p>
                            {detail && (
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate font-medium">
                                {detail}
                              </p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {timeAgo(item.created_at)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete modal */}
      {deleteConfirm && (
        <DeleteModal onCancel={() => setDeleteConfirm(null)} onConfirm={handleDeleteBoard} />
      )}
    </div>
  );
};

// ─── Sub-components ───

const STAT_STYLES: Record<string, { bg: string; text: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-500' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-500' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-500' },
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}> = ({ icon, label, value, color }) => {
  const styles = STAT_STYLES[color] || STAT_STYLES.indigo;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl ${styles.bg} flex items-center justify-center ${styles.text} shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-slate-800 leading-none">{value}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
};

const MINI_STAT_STYLES: Record<string, { text: string; muted: string }> = {
  slate: { text: 'text-slate-500', muted: 'text-slate-400' },
  rose: { text: 'text-rose-500', muted: 'text-rose-400' },
  amber: { text: 'text-amber-500', muted: 'text-amber-400' },
};

const MiniStat: React.FC<{
  icon: React.ReactNode;
  value: number;
  label: string;
  color?: string;
}> = ({ icon, value, label, color = 'slate' }) => {
  const styles = MINI_STAT_STYLES[color] || MINI_STAT_STYLES.slate;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${styles.text}`}>
      {icon}
      <span>{value}</span>
      <span className={styles.muted}>{label}</span>
    </span>
  );
};

const SortButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1 px-3 py-2 text-[10px] font-bold transition-colors ${
      active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
    }`}
  >
    {icon}
    {label}
  </button>
);

const BoardContextMenu: React.FC<{
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ onRename, onDelete, onClose }) => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-8 w-36 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1 animate-in fade-in zoom-in-95 duration-150">
      <button
        onClick={e => { e.stopPropagation(); onRename(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <Pencil size={12} /> Rename
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
      >
        <Trash2 size={12} /> Delete
      </button>
    </div>
  );
};

const DeleteModal: React.FC<{
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center">
          <Trash2 size={24} className="text-rose-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Delete Board?</h3>
        <p className="text-sm text-slate-500">
          This will permanently delete this board and all its lists, cards, and comments.
        </p>
        <div className="flex items-center gap-3 w-full pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default TeamHubPage;
