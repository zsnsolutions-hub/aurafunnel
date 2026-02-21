import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Flag, MessageSquare } from 'lucide-react';
import type { Card } from '../teamHubApi';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-rose-500',
  medium: 'text-amber-500',
  low: 'text-sky-500',
};

const PRIORITY_BG: Record<string, string> = {
  high: 'bg-rose-50',
  medium: 'bg-amber-50',
  low: 'bg-sky-50',
};

interface CardItemProps {
  card: Card;
  onClick: () => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isOverdue = card.due_date && new Date(card.due_date) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 cursor-pointer hover:shadow-md hover:border-slate-200 transition-all duration-150 group"
    >
      <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 mb-2">
        {card.title}
      </p>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        {card.due_date && (
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              isOverdue ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'
            }`}
          >
            <Calendar size={10} />
            {new Date(card.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {card.priority && (
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${PRIORITY_BG[card.priority]} ${PRIORITY_COLORS[card.priority]}`}
          >
            <Flag size={10} />
            {card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}
          </span>
        )}
        {(card.comment_count ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <MessageSquare size={10} />
            {card.comment_count}
          </span>
        )}
      </div>
    </div>
  );
};

export default React.memo(CardItem);
