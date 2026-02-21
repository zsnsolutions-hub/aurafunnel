import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, MessageSquare, Paperclip, GripVertical } from 'lucide-react';
import type { Item, ItemTag } from '../teamHubApi';

// ─── Priority badge config (matches TaskHub screenshot) ───
const PRIORITY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-red-500',    text: 'text-white',      label: 'HIGH PRIORITY' },
  medium: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'MEDIUM' },
  low:    { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'LOW' },
};

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
  const priority = item.priority ? PRIORITY_BADGE[item.priority] : null;

  // Simulated completeness for progress bar (based on filled fields)
  const fields = [!!item.title, !!item.description, !!item.priority, !!item.due_date, tags.length > 0, commentCount > 0];
  const filledCount = fields.filter(Boolean).length;
  const progressPct = Math.round((filledCount / fields.length) * 100);
  const showProgress = hasDescription && item.priority;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 group"
    >
      <div className="p-4">
        {/* Row 1: Priority badge + drag handle */}
        <div className="flex items-start justify-between mb-2.5">
          {priority ? (
            <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${priority.bg} ${priority.text}`}>
              {priority.label}
            </span>
          ) : (
            <span />
          )}
          <button
            className="p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
            onPointerDown={e => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </button>
        </div>

        {/* Row 2: Title */}
        <h4 className="text-[14px] font-semibold text-gray-900 leading-snug mb-2.5">
          {item.title}
        </h4>

        {/* Row 3: Tag pills (time + category) */}
        {(tags.length > 0 || item.due_date) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {item.due_date && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                isOverdue
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}>
                <Clock size={11} />
                {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {tags.map((tag: ItemTag, i: number) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 text-gray-600 border border-gray-200"
              >
                <span className="text-gray-400">#</span>
                {tag.text}
              </span>
            ))}
          </div>
        )}

        {/* Row 4: Progress bar (shown when card has description + priority) */}
        {showProgress && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-gray-500">Progress</span>
              <span className="text-[11px] font-semibold text-gray-700">{progressPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Row 5: Bottom metadata — comments, attachments, assignee */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3">
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[12px] text-gray-400">
                <MessageSquare size={13} />
                {commentCount}
              </span>
            )}
            {hasDescription && (
              <span className="inline-flex items-center gap-1 text-[12px] text-gray-400">
                <Paperclip size={13} />
              </span>
            )}
          </div>

          {/* Assignee avatar */}
          <div
            className={`w-7 h-7 rounded-full ${avatarColor(item.created_by)} flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white shadow-sm`}
          >
            {(item.created_by || '?').charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(FlowItem);
