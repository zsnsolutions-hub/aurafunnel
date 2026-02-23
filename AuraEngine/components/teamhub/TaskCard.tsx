import React from 'react';
import { Clock, GripVertical, Lock, Mail, Eye, MousePointerClick, CalendarClock, ExternalLink, Sparkles } from 'lucide-react';
import { getColorClasses, ColorToken } from '../../lib/leadColors';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface TaskCardData {
  id: string;
  title: string;
  priority: TaskPriority;
  deadline: string | null;
  assigned_to: string | null;
  assigned_name?: string;
  user_id: string;
  status: TaskStatus;
  card_color?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
  lead_company?: string | null;
  lead_status?: 'New' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost' | null;
  email_hasSent?: boolean;
  email_hasOpened?: boolean;
  email_hasClicked?: boolean;
  email_openCount?: number;
  has_scheduled_email?: boolean;
  is_auto_suggested?: boolean;
}

const PRIORITY_BADGE: Record<TaskPriority, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-rose-600',   text: 'text-white',      label: 'URGENT' },
  high:   { bg: 'bg-red-500',    text: 'text-white',      label: 'HIGH PRIORITY' },
  normal: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'NORMAL' },
  low:    { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'LOW' },
};

const LEAD_STATUS_DOT: Record<string, string> = {
  New: 'bg-slate-400',
  Contacted: 'bg-blue-400',
  Qualified: 'bg-amber-400',
  Converted: 'bg-emerald-400',
  Lost: 'bg-red-400',
};

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-600', 'bg-pink-500', 'bg-teal-600',
];

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

interface TaskCardProps {
  task: TaskCardData;
  canDrag: boolean;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, canDrag, onDragStart, onContextMenu }) => {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
  const priority = PRIORITY_BADGE[task.priority];
  const cardBg = task.card_color ? getColorClasses(task.card_color as ColorToken).bg : 'bg-white';

  return (
    <div
      data-card="task"
      draggable={canDrag}
      onDragStart={canDrag ? (e) => onDragStart(e, task.id) : undefined}
      onContextMenu={onContextMenu}
      className={`${cardBg} rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 group ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      } [&.dragging]:opacity-40${task.is_auto_suggested ? ' border-l-4 border-l-violet-400' : ''}`}
    >
      <div className="p-4">
        {/* Row 1: Priority badge + drag handle */}
        <div className="flex items-start justify-between mb-2.5">
          <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${priority.bg} ${priority.text}`}>
            {priority.label}
          </span>
          {canDrag ? (
            <button className="p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
              <GripVertical size={14} />
            </button>
          ) : (
            <Lock size={12} className="text-gray-300 mt-1" />
          )}
        </div>

        {/* Auto-suggested badge */}
        {task.is_auto_suggested && (
          <div className="flex items-center gap-1 mb-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
              font-semibold bg-violet-50 text-violet-600 border border-violet-200">
              <Sparkles size={10} />
              Auto-suggested
            </span>
          </div>
        )}

        {/* Row 2: Title */}
        <h4 className="text-[14px] font-semibold text-gray-900 leading-snug mb-3 line-clamp-2">
          {task.title}
        </h4>

        {/* Row 2.5: Lead chip + email badges (only when linked to a lead) */}
        {task.lead_id && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {/* Lead chip */}
            <a
              href={`/portal/leads/${task.lead_id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors max-w-[180px] group/lead"
              title={[task.lead_name, task.lead_company].filter(Boolean).join(' — ')}
            >
              {task.lead_status && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${LEAD_STATUS_DOT[task.lead_status] || 'bg-slate-400'}`} />
              )}
              <span className="truncate">{task.lead_name}{task.lead_company ? ` · ${task.lead_company}` : ''}</span>
              <ExternalLink size={10} className="shrink-0 opacity-0 group-hover/lead:opacity-100 transition-opacity" />
            </a>

            {/* Email badges */}
            {task.email_hasSent && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                <Mail size={10} />
                Email
              </span>
            )}
            {task.email_hasOpened && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
                <Eye size={10} />
                Opened
              </span>
            )}
            {task.email_hasClicked && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                <MousePointerClick size={10} />
                Clicked
              </span>
            )}
            {(task.email_openCount ?? 0) >= 2 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">
                Follow-up
              </span>
            )}
            {task.has_scheduled_email && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-600 border border-purple-200">
                <CalendarClock size={10} />
                Scheduled
              </span>
            )}
          </div>
        )}

        {/* Row 3: Bottom metadata */}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
          <div className="flex items-center gap-3">
            {task.deadline && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                isOverdue
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}>
                <Clock size={11} />
                {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {task.status === 'done' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                Completed
              </span>
            )}
          </div>

          {/* Assignee avatar */}
          {task.assigned_name ? (
            <div
              className={`w-7 h-7 rounded-full ${avatarColor(task.assigned_to || task.user_id)} flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white shadow-sm`}
              title={task.assigned_name}
            >
              {task.assigned_name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div
              className={`w-7 h-7 rounded-full ${avatarColor(task.user_id)} flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white shadow-sm opacity-50`}
              title="Unassigned"
            >
              {task.user_id.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(TaskCard);
