import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import TaskCard, { TaskCardData, TaskStatus } from './TaskCard';
import ColumnActionsMenu from './ColumnActionsMenu';
import { getColorClasses, ColorToken } from '../../lib/leadColors';

interface KanbanColumn {
  id: TaskStatus;
  label: string;
  headerText: string;
  countBg: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'todo',        label: 'TO DO',        headerText: 'text-gray-800',    countBg: 'bg-gray-200 text-gray-700' },
  { id: 'in_progress', label: 'IN PROGRESS',  headerText: 'text-blue-700',    countBg: 'bg-blue-100 text-blue-700' },
  { id: 'done',        label: 'DONE',         headerText: 'text-emerald-700', countBg: 'bg-emerald-100 text-emerald-700' },
];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

const STORAGE_KEY = 'teamhub-column-colors';

function loadColumnColors(): Record<TaskStatus, ColorToken | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { todo: null, in_progress: null, done: null };
}

function saveColumnColors(colors: Record<TaskStatus, ColorToken | null>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch { /* ignore */ }
}

interface KanbanBoardProps {
  tasks: TaskCardData[];
  currentUserId: string;
  isAdmin: boolean;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onNewTask: () => void;
  onTaskContextMenu?: (e: React.MouseEvent, task: TaskCardData) => void;
  onSortChange?: (mode: 'priority' | 'deadline') => void;
  onMoveAllTo?: (fromStatus: TaskStatus, toStatus: TaskStatus) => void;
  onClearDone?: () => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks, currentUserId, isAdmin, onStatusChange, onNewTask,
  onTaskContextMenu, onSortChange, onMoveAllTo, onClearDone,
}) => {
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [columnColors, setColumnColors] = useState<Record<TaskStatus, ColorToken | null>>(loadColumnColors);
  const [openMenu, setOpenMenu] = useState<TaskStatus | null>(null);
  const menuBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  const handleChangeColumnColor = useCallback((colId: TaskStatus, color: ColorToken | null) => {
    setColumnColors(prev => {
      const next = { ...prev, [colId]: color };
      saveColumnColors(next);
      return next;
    });
  }, []);

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
    <div className="flex items-start gap-7 overflow-x-auto pb-4">
      {COLUMNS.map(col => {
        const colTasks = columnTasks[col.id];
        const isOver = dragOverColumn === col.id;
        const colColor = columnColors[col.id];
        const colorClasses = colColor ? getColorClasses(colColor) : null;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`shrink-0 w-[320px] flex flex-col transition-all ${
              isOver ? 'ring-2 ring-blue-200 ring-offset-2 rounded-lg' : ''
            }`}
          >
            {/* Header — tinted when column has a color */}
            <div
              className={`flex items-center gap-2.5 px-3 pb-3 pt-2 rounded-t-lg transition-colors ${
                colorClasses ? `${colorClasses.bg} -mx-1 px-4` : ''
              }`}
            >
              {/* Color dot indicator */}
              {colColor && (
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getColorClasses(colColor).dot}`} />
              )}
              <h3 className={`text-[12px] font-extrabold uppercase tracking-widest ${
                colorClasses ? colorClasses.text : col.headerText
              }`}>
                {col.label}
              </h3>
              <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-bold ${
                colorClasses ? `${colorClasses.bg} ${colorClasses.text} ring-1 ring-inset ring-current/10` : col.countBg
              }`}>
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
              {/* "..." menu button */}
              <button
                ref={(el) => { menuBtnRefs.current[col.id] = el; }}
                onClick={() => setOpenMenu(prev => prev === col.id ? null : col.id)}
                className={`p-1 rounded-md transition-colors ${
                  openMenu === col.id
                    ? 'bg-gray-200 text-gray-700'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title="List actions"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-[120px] pb-2 px-1 max-h-[calc(100vh-340px)]">
              {colTasks.length === 0 ? (
                <div className={`py-10 text-center border-2 border-dashed rounded-xl transition-colors ${
                  isOver ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200/60'
                }`}>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {isOver ? 'Drop here' : 'No items yet'}
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
                      onContextMenu={onTaskContextMenu ? (e) => onTaskContextMenu(e, task) : undefined}
                    />
                  </div>
                ))
              )}
            </div>

            {/* Column Actions Menu (Trello-style) */}
            {openMenu === col.id && menuBtnRefs.current[col.id] && (
              <ColumnActionsMenu
                anchorRect={menuBtnRefs.current[col.id]!.getBoundingClientRect()}
                columnId={col.id}
                columnLabel={col.label}
                currentColor={colColor}
                taskCount={colTasks.length}
                doneCount={col.id === 'done' ? colTasks.length : undefined}
                onClose={() => setOpenMenu(null)}
                onAddCard={onNewTask}
                onSortByPriority={() => onSortChange?.('priority')}
                onSortByDeadline={() => onSortChange?.('deadline')}
                onChangeColor={(color) => handleChangeColumnColor(col.id, color)}
                onMoveAllTo={onMoveAllTo ? (toStatus) => onMoveAllTo(col.id, toStatus) : undefined}
                onClearDone={col.id === 'done' ? onClearDone : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(KanbanBoard);
