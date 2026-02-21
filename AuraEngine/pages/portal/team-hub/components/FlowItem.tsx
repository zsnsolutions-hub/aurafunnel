import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, AlignLeft, MessageSquare } from 'lucide-react';
import type { Item, ItemTag } from '../teamHubApi';

// ─── Tag color palette ───

const TAG_STYLES: Record<string, { bg: string; text: string }> = {
  green:  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  yellow: { bg: 'bg-amber-100',   text: 'text-amber-700' },
  orange: { bg: 'bg-orange-100',  text: 'text-orange-700' },
  red:    { bg: 'bg-rose-100',    text: 'text-rose-700' },
  purple: { bg: 'bg-violet-100',  text: 'text-violet-700' },
  blue:   { bg: 'bg-blue-100',    text: 'text-blue-700' },
  sky:    { bg: 'bg-sky-100',     text: 'text-sky-700' },
  pink:   { bg: 'bg-pink-100',    text: 'text-pink-700' },
  teal:   { bg: 'bg-teal-100',    text: 'text-teal-700' },
  lime:   { bg: 'bg-lime-100',    text: 'text-lime-700' },
};

const DEFAULT_TAG_STYLE = { bg: 'bg-slate-100', text: 'text-slate-600' };

// ─── Priority left-border color ───

const PRIORITY_BORDER: Record<string, string> = {
  high:   'border-l-rose-500',
  medium: 'border-l-amber-400',
  low:    'border-l-blue-400',
};

interface FlowItemProps {
  item: Item;
  onClick: () => void;
}

const FlowItem: React.FC<FlowItemProps> = ({ item, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: 'card', card: item },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isOverdue = item.due_date && new Date(item.due_date) < new Date();
  const hasDescription = !!item.description;
  const commentCount = item.comment_count ?? 0;
  const tags = item.labels || [];

  const borderColor = item.priority ? (PRIORITY_BORDER[item.priority] || 'border-l-slate-200') : 'border-l-slate-200';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-shadow duration-150 group border-l-[3px] ${borderColor}`}
    >
      {/* ─── Title + Tags row ─── */}
      <div className="flex items-start justify-between gap-2 px-2.5 pt-2 pb-1">
        <p className="text-[13px] font-medium text-slate-800 leading-snug flex-1">
          {item.title}
        </p>
        {/* Tags as compact pills aligned right */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-end shrink-0 max-w-[50%]">
            {tags.map((tag: ItemTag, i: number) => {
              const s = TAG_STYLES[tag.color] || DEFAULT_TAG_STYLE;
              return (
                <span
                  key={i}
                  className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-tight ${s.bg} ${s.text}`}
                >
                  {tag.text}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Bottom badges row ─── */}
      {(item.due_date || hasDescription || commentCount > 0) && (
        <div className="flex items-center gap-2.5 px-2.5 pb-2 flex-wrap">
          {item.due_date && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isOverdue
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Clock size={10} />
              {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}

          {hasDescription && (
            <span className="text-slate-400">
              <AlignLeft size={13} />
            </span>
          )}

          {commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400">
              <MessageSquare size={11} />
              {commentCount}
            </span>
          )}
        </div>
      )}

      {!item.due_date && !hasDescription && commentCount === 0 && tags.length === 0 && (
        <div className="pb-1.5" />
      )}
    </div>
  );
};

export default React.memo(FlowItem);
