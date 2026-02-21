import React from 'react';
import { Clock, GripVertical, Lock } from 'lucide-react';

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
}

const PRIORITY_BADGE: Record<TaskPriority, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-rose-600',   text: 'text-white',      label: 'URGENT' },
  high:   { bg: 'bg-red-500',    text: 'text-white',      label: 'HIGH PRIORITY' },
  normal: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'NORMAL' },
  low:    { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'LOW' },
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
}

const TaskCard: React.FC<TaskCardProps> = ({ task, canDrag, onDragStart }) => {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
  const priority = PRIORITY_BADGE[task.priority];

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? (e) => onDragStart(e, task.id) : undefined}
      className={`bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 group ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      } [&.dragging]:opacity-40`}
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

        {/* Row 2: Title */}
        <h4 className="text-[14px] font-semibold text-gray-900 leading-snug mb-3 line-clamp-2">
          {task.title}
        </h4>

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
