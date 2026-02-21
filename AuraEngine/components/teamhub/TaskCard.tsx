import React from 'react';
import { ClockIcon, LockIcon } from '../Icons';

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

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'bg-rose-100 text-rose-700',
  high: 'bg-amber-100 text-amber-700',
  normal: 'bg-indigo-100 text-indigo-700',
  low: 'bg-slate-100 text-slate-600',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

interface TaskCardProps {
  task: TaskCardData;
  canDrag: boolean;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, canDrag, onDragStart }) => {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? (e) => onDragStart(e, task.id) : undefined}
      className={`bg-white rounded-xl border border-slate-100 shadow-sm p-3.5 transition-all ${
        canDrag ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-200' : 'cursor-default'
      } [&.dragging]:opacity-40`}
    >
      {/* Priority badge */}
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${PRIORITY_COLORS[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        {!canDrag && (
          <LockIcon className="w-3 h-3 text-slate-300" />
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug mb-2">
        {task.title}
      </p>

      {/* Bottom row: deadline + assignee */}
      <div className="flex items-center justify-between">
        {task.deadline ? (
          <span className={`inline-flex items-center space-x-1 text-[10px] font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}>
            <ClockIcon className="w-3 h-3" />
            <span>{new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </span>
        ) : (
          <span />
        )}
        {task.assigned_name && (
          <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-violet-600">
            <span className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center text-[8px] font-black text-violet-600">
              {task.assigned_name.charAt(0)}
            </span>
            <span className="truncate max-w-[80px]">{task.assigned_name}</span>
          </span>
        )}
      </div>
    </div>
  );
};

export default React.memo(TaskCard);
