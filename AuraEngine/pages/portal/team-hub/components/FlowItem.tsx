import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, MessageSquare, Paperclip, GripVertical, UserCircle } from 'lucide-react';
import type { Item, ItemTag } from '../teamHubApi';

// ─── Priority accent bar colors ───
const PRIORITY_ACCENT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-300',
};

const PRIORITY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-red-500',   text: 'text-white',    label: 'HIGH' },
  medium: { bg: 'bg-blue-100',  text: 'text-blue-700', label: 'MED' },
  low:    { bg: 'bg-slate-100', text: 'text-slate-600', label: 'LOW' },
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
  onContextMenu?: (e: React.MouseEvent) => void;
}

const FlowItem: React.FC<FlowItemProps> = ({ item, onClick, onContextMenu }) => {
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
  const accentColor = item.priority ? PRIORITY_ACCENT[item.priority] : null;
  const leadLink = item.lead_link;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-card="flow-item"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 group overflow-hidden"
    >
      {/* ═══ SECTION A — Header ═══ */}
      <div className="flex">
        {/* Priority accent bar */}
        {accentColor && (
          <div className={`w-1 shrink-0 ${accentColor} rounded-l-xl`} />
        )}
        <div className="flex-1 px-4 pt-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {priority && (
                  <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${priority.bg} ${priority.text}`}>
                    {priority.label}
                  </span>
                )}
                <button
                  className="p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab ml-auto shrink-0"
                  onPointerDown={e => e.stopPropagation()}
                >
                  <GripVertical size={13} />
                </button>
              </div>
              <h4 className="text-[13px] font-semibold text-gray-900 leading-snug">
                {item.title}
              </h4>
            </div>
            {/* Tags (right aligned) */}
            {tags.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[120px]">
                {tags.slice(0, 2).map((tag: ItemTag, i: number) => (
                  <span
                    key={i}
                    className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500 truncate max-w-[56px]"
                  >
                    #{tag.text}
                  </span>
                ))}
                {tags.length > 2 && (
                  <span className="text-[9px] font-semibold text-gray-400">+{tags.length - 2}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ SECTION B — Content ═══ */}
      {(hasDescription || leadLink || item.due_date) && (
        <div className={`px-4 pb-2 space-y-1.5 ${accentColor ? 'ml-1' : ''}`}>
          {/* Description preview */}
          {hasDescription && (
            <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
              {item.description}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {/* Lead badge */}
            {leadLink && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                <UserCircle size={11} />
                {leadLink.lead_name || leadLink.lead_email}
              </span>
            )}

            {/* Due date chip */}
            {item.due_date && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                isOverdue
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}>
                <Clock size={10} />
                {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ═══ SECTION C — Footer ═══ */}
      <div className={`flex items-center justify-between px-4 py-2 border-t border-gray-100 ${accentColor ? 'ml-1' : ''}`}>
        <div className="flex items-center gap-2.5">
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 font-medium">
              <MessageSquare size={12} />
              {commentCount}
            </span>
          )}
          {hasDescription && (
            <span className="inline-flex items-center text-[11px] text-gray-400">
              <Paperclip size={12} />
            </span>
          )}
        </div>

        {/* Assignee avatars (right aligned, max 3 + overflow) */}
        {item.assigned_members && item.assigned_members.length > 0 ? (
          <div className="flex items-center -space-x-1.5">
            {item.assigned_members.slice(0, 3).map(m => (
              <div
                key={m.user_id}
                title={m.user_name || m.user_email}
                className={`w-6 h-6 rounded-full ${avatarColor(m.user_id)} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white shadow-sm`}
              >
                {(m.user_name || m.user_email || '?').charAt(0).toUpperCase()}
              </div>
            ))}
            {item.assigned_members.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600 ring-2 ring-white shadow-sm">
                +{item.assigned_members.length - 3}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`w-6 h-6 rounded-full ${avatarColor(item.created_by)} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white shadow-sm`}
          >
            {(item.created_by || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(FlowItem);
