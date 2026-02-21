import React, { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import TaskCard, { TaskCardData, TaskStatus } from './TaskCard';

interface KanbanColumn {
  id: TaskStatus;
  label: string;
  borderColor: string;
  headerText: string;
  countBg: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'todo',        label: 'TO DO',        borderColor: '',                                     headerText: 'text-gray-800',    countBg: 'bg-gray-200 text-gray-700' },
  { id: 'in_progress', label: 'IN PROGRESS',  borderColor: 'border-l-[3px] border-l-blue-500',    headerText: 'text-blue-700',    countBg: 'bg-blue-100 text-blue-700' },
  { id: 'done',        label: 'DONE',         borderColor: 'border-l-[3px] border-l-emerald-500', headerText: 'text-emerald-700', countBg: 'bg-emerald-100 text-emerald-700' },
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

  const columnTasks = useMemo(() => {
    const grouped: Record<TaskStatus, TaskCardData[]> = { todo: [], in_progress: [], done: [] };
    tasks.forEach(t => {
      if (grouped[t.status]) grouped[t.status].push(t);
    });
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2;
        const pb = PRIORITY_ORDER[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return 0;
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
    if (!isAdmin && task.user_id !== currentUserId && task.assigned_to !== currentUserId) return;
    onStatusChange(taskId, targetStatus);
  }, [tasks, isAdmin, currentUserId, onStatusChange]);

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDragOverColumn(null);
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }, []);

  return (
    <div className="flex items-start gap-6 overflow-x-auto pb-4">
      {COLUMNS.map(col => {
        const colTasks = columnTasks[col.id];
        const isOver = dragOverColumn === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`shrink-0 w-[320px] flex flex-col ${col.borderColor} transition-all ${
              isOver ? 'ring-2 ring-blue-200 ring-offset-2 rounded-lg' : ''
            }`}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-1 pb-3">
              <h3 className={`text-[13px] font-bold uppercase tracking-wider ${col.headerText}`}>
                {col.label}
              </h3>
              <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-[11px] font-bold ${col.countBg}`}>
                {colTasks.length}
              </span>
              <div className="flex-1" />
              <button
                onClick={onNewTask}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                title="Add task"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto space-y-2.5 min-h-[120px] pb-2 px-0.5 max-h-[calc(100vh-340px)]">
              {colTasks.length === 0 ? (
                <div className={`py-8 text-center border-2 border-dashed rounded-xl transition-colors ${
                  isOver ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'
                }`}>
                  <p className="text-xs text-gray-400 font-medium">
                    {isOver ? 'Drop here' : 'No items'}
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
