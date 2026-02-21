import React, { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { List, Card } from '../teamHubApi';
import CardItem from './CardItem';
import AddCardInline from './AddCardInline';

interface ListColumnProps {
  list: List & { cards: Card[] };
  onAddCard: (listId: string, title: string) => void;
  onCardClick: (card: Card) => void;
  onRenameList: (listId: string, name: string) => void;
  onDeleteList: (listId: string) => void;
}

const ListColumn: React.FC<ListColumnProps> = ({
  list,
  onAddCard,
  onCardClick,
  onRenameList,
  onDeleteList,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(list.name);
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
    id: `list-${list.id}`,
    data: { type: 'list', list },
  });

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `droppable-${list.id}`,
    data: { type: 'list', listId: list.id },
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

  // Close menu on outside click
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
    if (trimmed && trimmed !== list.name) {
      onRenameList(list.id, trimmed);
    }
    setEditing(false);
  };

  const cardIds = list.cards.map(c => c.id);

  return (
    <div
      ref={setSortableRef}
      style={style}
      className="shrink-0 w-72 flex flex-col bg-slate-50 rounded-2xl border border-slate-200 shadow-sm max-h-full"
    >
      {/* Header */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between px-3.5 py-3 cursor-grab active:cursor-grabbing"
      >
        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setEditing(false); setEditName(list.name); }
            }}
            className="flex-1 px-2 py-0.5 text-sm font-bold bg-white border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          />
        ) : (
          <h3 className="text-sm font-bold text-slate-700 truncate flex-1">
            {list.name}
            <span className="ml-2 text-[10px] font-bold text-slate-400">
              {list.cards.length}
            </span>
          </h3>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 w-40 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1 animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={() => { setEditing(true); setEditName(list.name); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Pencil size={12} /> Rename
              </button>
              <button
                onClick={() => { onDeleteList(list.id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 size={12} /> Delete List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cards area */}
      <div
        ref={setDroppableRef}
        className="flex-1 overflow-y-auto px-1.5 pb-1.5 space-y-1.5 min-h-[40px]"
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {list.cards.map(card => (
            <CardItem key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>

        {list.cards.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-slate-400 font-semibold">No cards yet</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <AddCardInline onAdd={(title) => onAddCard(list.id, title)} />
    </div>
  );
};

export default React.memo(ListColumn);
