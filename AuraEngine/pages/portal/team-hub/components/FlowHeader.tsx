import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, Pencil, Trash2, Users, Filter, ArrowUpDown,
  Activity, Share2, LayoutGrid, List, Calendar,
} from 'lucide-react';
import type { Flow, FlowMember } from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';

export type BoardFilter = { priority: '' | 'high' | 'medium' | 'low'; due: '' | 'overdue' | 'this_week' };
export type BoardSort = 'default' | 'priority' | 'due_date' | 'recent';

interface FlowHeaderProps {
  flow: Flow;
  onBack: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  permissions: FlowPermissions;
  onManageTeam?: () => void;
  members: FlowMember[];
  activeFilter: BoardFilter;
  activeSort: BoardSort;
  onFilterChange: (f: BoardFilter) => void;
  onSortChange: (s: BoardSort) => void;
  showActivity: boolean;
  onToggleActivity: () => void;
}

// Avatar colors
const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-600', 'bg-pink-500', 'bg-teal-600',
];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const SORT_LABELS: Record<BoardSort, string> = {
  default: 'Sort',
  priority: 'Priority',
  due_date: 'Due Date',
  recent: 'Recent',
};

const FlowHeader: React.FC<FlowHeaderProps> = ({
  flow, onBack, onRename, onDelete, permissions, onManageTeam,
  members, activeFilter, activeSort, onFilterChange, onSortChange,
  showActivity, onToggleActivity,
}) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(flow.name);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setName(flow.name); }, [flow.name]);
  useEffect(() => {
    if (editing) setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
  }, [editing]);

  useEffect(() => {
    if (!filterOpen && !sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterOpen && filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (sortOpen && sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen, sortOpen]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== flow.name) onRename(trimmed);
    setEditing(false);
  };

  const hasActiveFilter = activeFilter.priority !== '' || activeFilter.due !== '';

  return (
    <div className="bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Back */}
        <button
          onClick={onBack}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Flow name */}
        {editing && permissions.canEditFlow ? (
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') { setEditing(false); setName(flow.name); }
            }}
            className="text-lg font-bold text-gray-900 bg-gray-50 border border-blue-300 outline-none rounded-lg px-2.5 py-0.5 focus:ring-2 focus:ring-blue-200"
          />
        ) : (
          <h1
            onClick={() => { if (permissions.canEditFlow) setEditing(true); }}
            className={`text-lg font-bold text-gray-900 ${permissions.canEditFlow ? 'cursor-pointer hover:text-blue-600' : ''}`}
          >
            {flow.name}
          </h1>
        )}

        {permissions.canEditFlow && !editing && (
          <button onClick={() => setEditing(true)} className="p-1 text-gray-300 hover:text-gray-500">
            <Pencil size={13} />
          </button>
        )}

        {/* Member avatar stack */}
        {members.length > 0 && (
          <button onClick={onManageTeam} className="flex items-center ml-1 group">
            <div className="flex -space-x-2">
              {members.slice(0, 3).map(m => (
                <div
                  key={m.id}
                  className={`w-8 h-8 rounded-full ${avatarColor(m.user_id)} border-2 border-white flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-sm`}
                  title={m.user_name || m.user_email}
                >
                  {(m.user_name || m.user_email || '?').charAt(0)}
                </div>
              ))}
            </div>
            {members.length > 3 && (
              <span className="ml-1 text-[12px] font-semibold text-gray-500">+{members.length - 3}</span>
            )}
          </button>
        )}

        {/* Share button */}
        <button
          onClick={onManageTeam}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
        >
          <Share2 size={13} />
          Share
        </button>

        {/* View tabs (Board is always active since this is the board view) */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 ml-1">
          <span className="px-3 py-1.5 text-[12px] font-semibold bg-white text-gray-800 rounded-md shadow-sm">
            Board
          </span>
          <span className="px-3 py-1.5 text-[12px] font-medium text-gray-400 cursor-default">
            List
          </span>
          <span className="px-3 py-1.5 text-[12px] font-medium text-gray-400 cursor-default">
            Calendar
          </span>
        </div>

        <div className="flex-1" />

        {/* Filter */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => { setFilterOpen(!filterOpen); setSortOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
              hasActiveFilter
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Filter size={14} />
            Filter
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-10 w-56 bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-2">
              <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Priority</p>
              {([['', 'All'], ['high', 'High Priority'], ['medium', 'Medium'], ['low', 'Low']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => onFilterChange({ ...activeFilter, priority: val })}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeFilter.priority === val ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
              <hr className="my-1.5 border-gray-100" />
              <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Due Date</p>
              {([['', 'All'], ['overdue', 'Overdue'], ['this_week', 'This Week']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => onFilterChange({ ...activeFilter, due: val })}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeFilter.due === val ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
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
              activeSort !== 'default'
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ArrowUpDown size={14} />
            {SORT_LABELS[activeSort]}
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-10 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-1">
              {(['default', 'priority', 'due_date', 'recent'] as const).map(val => (
                <button
                  key={val}
                  onClick={() => { onSortChange(val); setSortOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                    activeSort === val ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {SORT_LABELS[val]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Activity toggle */}
        <button
          onClick={onToggleActivity}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
            showActivity ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Activity size={14} />
          Activity
        </button>

        {/* Team button (when no members yet) */}
        {members.length === 0 && (
          <button
            onClick={onManageTeam}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <Users size={14} />
            Team
          </button>
        )}

        {/* Delete */}
        {permissions.canDeleteFlow && (
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default FlowHeader;
