import React, { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react';
import type { Lane, Item } from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';
import FlowItem from './FlowItem';
import AddItemInline from './AddItemInline';

// Lane accent colors — first lane is neutral, others get colored left borders
const LANE_ACCENTS = [
  { border: 'border-l-transparent', headerText: 'text-gray-800', countBg: 'bg-gray-200 text-gray-700' },
  { border: 'border-l-blue-500',    headerText: 'text-blue-700',  countBg: 'bg-blue-100 text-blue-700' },
  { border: 'border-l-emerald-500', headerText: 'text-emerald-700', countBg: 'bg-emerald-100 text-emerald-700' },
  { border: 'border-l-amber-500',   headerText: 'text-amber-700', countBg: 'bg-amber-100 text-amber-700' },
  { border: 'border-l-violet-500',  headerText: 'text-violet-700', countBg: 'bg-violet-100 text-violet-700' },
  { border: 'border-l-rose-500',    headerText: 'text-rose-700',  countBg: 'bg-rose-100 text-rose-700' },
  { border: 'border-l-cyan-500',    headerText: 'text-cyan-700',  countBg: 'bg-cyan-100 text-cyan-700' },
  { border: 'border-l-orange-500',  headerText: 'text-orange-700', countBg: 'bg-orange-100 text-orange-700' },
];

interface LaneColumnProps {
  lane: Lane & { cards: Item[] };
  laneIndex: number;
  onAddItem: (laneId: string, title: string) => void;
  onItemClick: (item: Item) => void;
  onRenameLane: (laneId: string, name: string) => void;
  onDeleteLane: (laneId: string) => void;
  permissions: FlowPermissions;
}

const LaneColumn: React.FC<LaneColumnProps> = ({
  lane,
  laneIndex,
  onAddItem,
  onItemClick,
  onRenameLane,
  onDeleteLane,
  permissions,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(lane.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addItemRef = useRef<HTMLButtonElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `list-${lane.id}`,
    data: { type: 'list', list: lane },
  });

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `droppable-${lane.id}`,
    data: { type: 'list', listId: lane.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (editing) {
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
    }
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleRenameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== lane.name) onRenameLane(lane.id, trimmed);
    setEditing(false);
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItemRef.current?.click();
  };

  const itemIds = lane.cards.map(c => c.id);
  const accent = LANE_ACCENTS[laneIndex % LANE_ACCENTS.length];
  const hasAccent = laneIndex > 0;

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={`shrink-0 w-[320px] flex flex-col max-h-full ${hasAccent ? `border-l-[3px] ${accent.border}` : ''}`}
    >
      {/* ─── Header ─── */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-2.5 px-1 pb-3 cursor-grab active:cursor-grabbing"
      >
        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setEditing(false); setEditName(lane.name); }
            }}
            className="flex-1 px-2 py-1 text-sm font-bold bg-white border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-200"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          />
        ) : (
          <>
            <h3 className={`text-[13px] font-bold uppercase tracking-wider ${hasAccent ? accent.headerText : 'text-gray-800'}`}>
              {lane.name}
            </h3>
            <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-[11px] font-bold ${accent.countBg}`}>
              {lane.cards.length}
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* Quick add + */}
        {permissions.canEditItems && !editing && (
          <button
            onClick={handleQuickAdd}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Plus size={16} />
          </button>
        )}

        {/* 3-dot menu */}
        {permissions.canManageLanes && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              onPointerDown={e => e.stopPropagation()}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-20 py-1">
                <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lane Actions</p>
                <button
                  onClick={() => { setEditing(true); setEditName(lane.name); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={12} /> Rename Lane
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => { onDeleteLane(lane.id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={12} /> Delete Lane
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Items area ─── */}
      <div
        ref={setDroppableRef}
        className="flex-1 overflow-y-auto space-y-2.5 min-h-[8px] pb-2 px-0.5"
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {lane.cards.map(item => (
            <FlowItem key={item.id} item={item} onClick={() => onItemClick(item)} />
          ))}
        </SortableContext>

        {lane.cards.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-xs text-gray-400">No items</p>
          </div>
        )}
      </div>

      {/* Footer: add item */}
      {permissions.canEditItems && (
        <AddItemInline ref={addItemRef} onAdd={(title) => onAddItem(lane.id, title)} />
      )}
    </div>
  );
};

export default React.memo(LaneColumn);
