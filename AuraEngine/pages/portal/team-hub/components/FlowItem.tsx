import React, { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, MessageSquare, MessageSquarePlus, GripVertical, UserCircle } from 'lucide-react';
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
  onAddNote?: (itemId: string, body: string) => void;
}

const FlowItem: React.FC<FlowItemProps> = ({ item, onClick, onContextMenu, onAddNote }) => {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const latestComment = item.latest_comment;

  const handleNoteOpen = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    setNoteOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleNoteSubmit = () => {
    const body = noteText.trim();
    if (body && onAddNote) {
      onAddNote(item.id, body);
    }
    setNoteText('');
    setNoteOpen(false);
  };

  const handleNoteCancel = () => {
    setNoteText('');
    setNoteOpen(false);
  };

  // Chips row visibility: tags, lead badge, due date, comment count, or note icon
  const showChipsRow = tags.length > 0 || leadLink || item.due_date || commentCount > 0 || !!onAddNote;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-card="flow-item"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-gray-300 cursor-pointer transition-all duration-200 group overflow-hidden"
    >
      {/* ═══ HEADER — Priority badge + Title + Avatars ═══ */}
      <div className="flex">
        {/* Priority accent bar */}
        {accentColor && (
          <div className={`w-[3px] shrink-0 ${accentColor} rounded-l-xl`} />
        )}
        <div className="flex-1 px-4 pt-3 pb-2 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {priority && (
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${priority.bg} ${priority.text}`}>
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
              <h4 className="text-sm font-semibold text-gray-900 leading-snug tracking-[-0.01em]">
                {item.title}
              </h4>
            </div>

            {/* Avatars (header right, compact) */}
            {item.assigned_members && item.assigned_members.length > 0 ? (
              <div className="flex items-center -space-x-1 shrink-0 mt-0.5">
                {item.assigned_members.slice(0, 2).map(m => (
                  <div
                    key={m.user_id}
                    title={m.user_name || m.user_email}
                    className={`w-6 h-6 rounded-full ${avatarColor(m.user_id)} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white shadow-sm`}
                  >
                    {(m.user_name || m.user_email || '?').charAt(0).toUpperCase()}
                  </div>
                ))}
                {item.assigned_members.length > 2 && (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600 ring-2 ring-white shadow-sm">
                    +{item.assigned_members.length - 2}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ═══ CONTENT — Description + Chips + Latest comment + Quick note ═══ */}
      <div className={`px-4 pb-3 space-y-1.5 ${accentColor ? 'ml-1' : ''}`}>
        {/* Description preview */}
        {hasDescription && (
          <p className="text-[11.5px] text-gray-500/90 leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Chips row: tags + lead badge + due date + comment count + note icon */}
        {showChipsRow && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Tags */}
            {tags.slice(0, 2).map((tag: ItemTag, i: number) => (
              <span
                key={i}
                className="inline-block px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-gray-100/80 text-gray-500 truncate max-w-[56px]"
              >
                #{tag.text}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-[9px] font-semibold text-gray-400">+{tags.length - 2}</span>
            )}

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

            {/* Comment count chip */}
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100">
                <MessageSquare size={10} />
                {commentCount}
              </span>
            )}

            {/* Quick-note icon (visible on hover) */}
            {onAddNote && (
              <button
                className="inline-flex items-center p-0.5 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-indigo-500 hover:bg-indigo-50 transition-all"
                onClick={handleNoteOpen}
                onPointerDown={e => e.stopPropagation()}
                title="Add a quick note"
              >
                <MessageSquarePlus size={12} />
              </button>
            )}
          </div>
        )}

        {/* Latest comment snippet (when available and note input is closed) */}
        {latestComment && !noteOpen && (
          <p className="text-[11px] text-gray-400 italic line-clamp-1 leading-snug">
            &ldquo;{latestComment}&rdquo;
          </p>
        )}

        {/* Quick-note textarea (expanded) */}
        {noteOpen && (
          <div
            className="mt-1"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleNoteSubmit();
                }
                if (e.key === 'Escape') {
                  handleNoteCancel();
                }
              }}
              placeholder="Add a quick note... (Enter to send)"
              rows={2}
              className="w-full px-2.5 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded-lg resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 placeholder-gray-400 transition-all"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(FlowItem);
