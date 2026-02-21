import React, { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Lane, Item } from '../teamHubApi';
import FlowItem from './FlowItem';
import AddItemInline from './AddItemInline';

const LANE_PALETTE = ['#6366f1','#06b6d4','#f59e0b','#10b981','#ec4899','#8b5cf6','#f97316','#14b8a6'];

interface LaneColumnProps {
  lane: Lane & { cards: Item[] };
  laneIndex: number;
  onAddItem: (laneId: string, title: string) => void;
  onItemClick: (item: Item) => void;
  onRenameLane: (laneId: string, name: string) => void;
  onDeleteLane: (laneId: string) => void;
}

const LaneColumn: React.FC<LaneColumnProps> = ({
  lane,
  laneIndex,
  onAddItem,
  onItemClick,
  onRenameLane,
  onDeleteLane,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(lane.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleRenameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== lane.name) {
      onRenameLane(lane.id, trimmed);
    }
    setEditing(false);
  };

  const itemIds = lane.cards.map(c => c.id);
  const stripColor = LANE_PALETTE[laneIndex % LANE_PALETTE.length];

  // Count items due within 3 days
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const dueSoonCount = lane.cards.filter(c =>
    c.due_date && new Date(c.due_date) <= threeDaysFromNow && new Date(c.due_date) >= now
  ).length;

  return (
    <div
      ref={setSortableRef}
      style={style}
      className="shrink-0 w-[272px] flex flex-col bg-white border border-slate-200 shadow-sm rounded-xl max-h-full overflow-hidden"
    >
      {/* Colored top strip */}
      <div className="h-1 shrink-0" style={{ backgroundColor: stripColor }} />

      {/* Header */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between px-3 pt-2.5 pb-1 cursor-grab active:cursor-grabbing"
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
            className="flex-1 px-2 py-1 text-sm font-bold bg-white border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          />
        ) : (
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800 px-0.5 truncate">
              {lane.name}
            </h3>
            <p className="text-[10px] text-slate-400 font-medium px-0.5 mt-0.5">
              {lane.cards.length} item{lane.cards.length !== 1 ? 's' : ''}
              {dueSoonCount > 0 && ` · ${dueSoonCount} due soon`}
            </p>
          </div>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 w-44 bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-150">
              <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lane Actions</p>
              <button
                onClick={() => { setEditing(true); setEditName(lane.name); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Pencil size={12} /> Rename Lane
              </button>
              <hr className="my-1 border-slate-100" />
              <button
                onClick={() => { onDeleteLane(lane.id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 size={12} /> Delete Lane
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Items area */}
      <div
        ref={setDroppableRef}
        className="flex-1 overflow-y-auto px-1.5 pb-1 space-y-1.5 min-h-[8px]"
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {lane.cards.map(item => (
            <FlowItem key={item.id} item={item} onClick={() => onItemClick(item)} />
          ))}
        </SortableContext>
      </div>

      {/* Footer: add item */}
      <AddItemInline onAdd={(title) => onAddItem(lane.id, title)} />
    </div>
  );
};

export default React.memo(LaneColumn);
