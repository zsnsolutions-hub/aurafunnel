import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LayoutGrid, Plus, Loader2, Trash2 } from 'lucide-react';
import type { User } from '../../../types';
import type { Board, BoardWithData } from './teamHubApi';
import * as api from './teamHubApi';
import BoardHeader from './components/BoardHeader';
import BoardView from './components/BoardView';

interface OutletCtx {
  user: User;
  refreshProfile: () => Promise<void>;
}

const TeamHubPage: React.FC = () => {
  const { user } = useOutletContext<OutletCtx>();
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boardData, setBoardData] = useState<BoardWithData | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [showNewBoardInput, setShowNewBoardInput] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load boards
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.fetchBoards(user.id);
        if (!cancelled) setBoards(data);
      } catch (err) {
        console.error('Failed to load boards:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  // Load board data when selected
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

  // Create board
  const handleCreateBoard = async () => {
    const name = newBoardName.trim() || 'Untitled Board';
    setCreating(true);
    try {
      const newBoard = await api.createBoard(user.id, name);
      setBoards(prev => [newBoard, ...prev]);
      setSelectedBoardId(newBoard.id);
      setShowNewBoardInput(false);
      setNewBoardName('');
    } catch (err) {
      console.error('Failed to create board:', err);
    } finally {
      setCreating(false);
    }
  };

  // Rename board
  const handleRenameBoard = async (name: string) => {
    if (!selectedBoardId) return;
    setBoards(prev => prev.map(b => b.id === selectedBoardId ? { ...b, name } : b));
    setBoardData(prev => prev ? { ...prev, name } : prev);
    try {
      await api.updateBoard(selectedBoardId, name);
    } catch {
      handleRefresh();
    }
  };

  // Delete board
  const handleDeleteBoard = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteBoard(deleteConfirm);
      setBoards(prev => prev.filter(b => b.id !== deleteConfirm));
      if (selectedBoardId === deleteConfirm) {
        setSelectedBoardId(null);
        setBoardData(null);
      }
    } catch (err) {
      console.error('Failed to delete board:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // ─── Board Detail View ───
  if (selectedBoardId && boardData) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <BoardHeader
          board={boardData}
          onBack={() => setSelectedBoardId(null)}
          onRename={handleRenameBoard}
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

        {/* Delete confirmation modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
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
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteBoard}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Board List View ───
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Hub</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your projects with kanban boards</p>
        </div>
        <button
          onClick={() => setShowNewBoardInput(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
        >
          <Plus size={16} />
          New Board
        </button>
      </div>

      {/* New board input */}
      {showNewBoardInput && (
        <div className="mb-6 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <input
            autoFocus
            value={newBoardName}
            onChange={e => setNewBoardName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateBoard();
              if (e.key === 'Escape') { setShowNewBoardInput(false); setNewBoardName(''); }
            }}
            placeholder="Board name..."
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 mb-3 placeholder-slate-400"
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

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-indigo-400 animate-spin" />
        </div>
      ) : boards.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-4">
            <LayoutGrid size={36} className="text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Create your first board</h3>
          <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
            Organize your team's work with kanban boards. Create lists, add cards, and drag them around to track progress.
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
        /* Board grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(board => (
            <button
              key={board.id}
              onClick={() => setSelectedBoardId(board.id)}
              className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <LayoutGrid size={18} className="text-indigo-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                  {board.name}
                </h3>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Created {new Date(board.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamHubPage;
