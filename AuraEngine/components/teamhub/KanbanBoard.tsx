import React, { useState, useCallback, useMemo } from 'react';
import TaskCard, { TaskCardData, TaskStatus } from './TaskCard';
import { PlusIcon } from '../Icons';

interface KanbanColumn {
  id: TaskStatus;
  label: string;
  color: string;
  headerBg: string;
  ringColor: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'todo', label: 'To Do', color: 'text-slate-700', headerBg: 'bg-slate-100', ringColor: 'ring-slate-300' },
  { id: 'in_progress', label: 'In Progress', color: 'text-amber-700', headerBg: 'bg-amber-50', ringColor: 'ring-amber-300' },
  { id: 'done', label: 'Done', color: 'text-emerald-700', headerBg: 'bg-emerald-50', ringColor: 'ring-emerald-300' },
];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

interface KanbanBoardProps {
  tasks: TaskCardData[];
  currentUserId: string;
  isAdmin: boolean;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onNewTask: () => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, currentUserId, isAdmin, onStatusChange, onNewTask }) => {
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  // Group and sort tasks per column
  const columnTasks = useMemo(() => {
    const grouped: Record<TaskStatus, TaskCardData[]> = { todo: [], in_progress: [], done: [] };
    tasks.forEach(t => {
      if (grouped[t.status]) grouped[t.status].push(t);
    });
    // Sort each column: priority first (urgent → low), then newest first
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2;
        const pb = PRIORITY_ORDER[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return 0; // keep server order (created_at desc)
      });
    }
    return grouped;
  }, [tasks]);

  const canDragTask = useCallback((task: TaskCardData): boolean => {
    if (isAdmin) return true;
    return task.user_id === currentUserId || task.assigned_to === currentUserId;
  }, [isAdmin, currentUserId]);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
    // Add dragging class after a frame for visual feedback
    requestAnimationFrame(() => {
      const el = e.target as HTMLElement;
      el.classList.add('dragging');
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    setDragOverColumn(null);
    setDraggingTaskId(null);

    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    // Verify permission
    if (!isAdmin && task.user_id !== currentUserId && task.assigned_to !== currentUserId) return;

    onStatusChange(taskId, targetStatus);
  }, [tasks, isAdmin, currentUserId, onStatusChange]);

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDragOverColumn(null);
    // Remove all dragging classes
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map(col => {
        const colTasks = columnTasks[col.id];
        const isOver = dragOverColumn === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`rounded-2xl border-2 transition-all min-h-[300px] flex flex-col ${
              isOver
                ? `border-dashed ${col.ringColor} bg-slate-50/50 ring-2 ${col.ringColor}`
                : 'border-slate-100 bg-slate-50/30'
            }`}
          >
            {/* Column Header */}
            <div className={`px-4 py-3 rounded-t-2xl ${col.headerBg} border-b border-slate-100`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h3 className={`text-sm font-black ${col.color}`}>{col.label}</h3>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${col.headerBg} ${col.color} border border-current/10`}>
                    {colTasks.length}
                  </span>
                </div>
                {col.id === 'todo' && (
                  <button
                    onClick={onNewTask}
                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Add task"
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Card List */}
            <div className="flex-1 p-3 space-y-2.5 overflow-y-auto max-h-[600px]">
              {colTasks.length === 0 ? (
                <div className={`flex items-center justify-center h-24 border-2 border-dashed rounded-xl transition-colors ${
                  isOver ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200'
                }`}>
                  <p className="text-xs font-bold text-slate-400">
                    {isOver ? 'Drop here' : 'Drag tasks here'}
                  </p>
                </div>
              ) : (
                colTasks.map(task => (
                  <div
                    key={task.id}
                    onDragEnd={handleDragEnd}
                    className={draggingTaskId === task.id ? 'opacity-40' : ''}
                  >
                    <TaskCard
                      task={task}
                      canDrag={canDragTask(task)}
                      onDragStart={handleDragStart}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(KanbanBoard);
