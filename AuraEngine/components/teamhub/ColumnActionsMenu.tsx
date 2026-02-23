import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ArrowUpDown, Trash2, X, ArrowRight } from 'lucide-react';
import { COLOR_TOKENS, getColorClasses, ColorToken } from '../../lib/leadColors';
import { TaskStatus } from './TaskCard';

interface ColumnActionsMenuProps {
  /** Anchor position (top-right of the "..." button) */
  anchorRect: { top: number; left: number; width: number; height: number };
  columnId: TaskStatus;
  columnLabel: string;
  currentColor: ColorToken | null;
  taskCount: number;
  doneCount?: number;
  onClose: () => void;
  onAddCard: () => void;
  onSortByPriority: () => void;
  onSortByDeadline: () => void;
  onChangeColor: (color: ColorToken | null) => void;
  onMoveAllTo?: (status: TaskStatus) => void;
  onClearDone?: () => void;
}

const ColumnActionsMenu: React.FC<ColumnActionsMenuProps> = ({
  anchorRect,
  columnId,
  columnLabel,
  currentColor,
  taskCount,
  doneCount,
  onClose,
  onAddCard,
  onSortByPriority,
  onSortByDeadline,
  onChangeColor,
  onMoveAllTo,
  onClearDone,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Position: below the anchor, right-aligned
  const menuLeft = anchorRect.left + anchorRect.width / 2 - 130; // center the 260px menu
  const menuTop = anchorRect.top + anchorRect.height + 6;

  // Close on outside click or Escape
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Move-to targets (exclude current column)
  const allTargets: { id: TaskStatus; label: string }[] = [
    { id: 'todo', label: 'To Do' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'done', label: 'Done' },
  ];
  const moveTargets = allTargets.filter(s => s.id !== columnId);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(menuLeft, window.innerWidth - 268)),
        top: Math.min(menuTop, window.innerHeight - 420),
        zIndex: 9999,
      }}
      className="w-[260px] bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h4 className="text-[13px] font-bold text-gray-800">List actions</h4>
        <button
          onClick={onClose}
          className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="py-1.5">
        {/* Add card */}
        <button
          onClick={() => { onAddCard(); onClose(); }}
          className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Plus size={14} className="text-gray-400" />
          Add card
        </button>

        {/* Sort */}
        <button
          onClick={() => { onSortByPriority(); onClose(); }}
          className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowUpDown size={14} className="text-gray-400" />
          Sort by priority
        </button>
        <button
          onClick={() => { onSortByDeadline(); onClose(); }}
          className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowUpDown size={14} className="text-gray-400" />
          Sort by deadline
        </button>

        <div className="my-1.5 border-t border-gray-100" />

        {/* Change list color — inline swatches */}
        <div className="px-4 py-2">
          <p className="text-[11px] font-semibold text-gray-500 mb-2">Change list color</p>
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_TOKENS.map(({ token, label }) => {
              const classes = getColorClasses(token);
              const isActive = currentColor === token;
              return (
                <button
                  key={token}
                  title={label}
                  onClick={() => { onChangeColor(token); onClose(); }}
                  className={`w-8 h-6 rounded-md ${classes.dot} transition-all hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:${classes.ring} ${
                    isActive ? 'ring-2 ring-offset-1 ' + classes.ring : ''
                  }`}
                />
              );
            })}
          </div>
          {currentColor && (
            <button
              onClick={() => { onChangeColor(null); onClose(); }}
              className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X size={12} />
              Remove color
            </button>
          )}
        </div>

        <div className="my-1.5 border-t border-gray-100" />

        {/* Move all to */}
        {onMoveAllTo && taskCount > 0 && moveTargets.map(target => (
          <button
            key={target.id}
            onClick={() => { onMoveAllTo(target.id); onClose(); }}
            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowRight size={14} className="text-gray-400" />
            Move all to {target.label}
          </button>
        ))}

        {/* Clear done tasks */}
        {columnId === 'done' && onClearDone && (doneCount ?? 0) > 0 && (
          <>
            <div className="my-1.5 border-t border-gray-100" />
            <button
              onClick={() => { onClearDone(); onClose(); }}
              className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 size={14} />
              Archive all done tasks
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ColumnActionsMenu;
