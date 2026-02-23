import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarOff } from 'lucide-react';
import type { Item, Lane } from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';

// Priority color indicators
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-400',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_ITEMS_PER_CELL = 3;

interface FlowCalendarViewProps {
  filteredLanes: (Lane & { cards: Item[] })[];
  onItemClick: (item: Item) => void;
  onItemContextMenu: (e: React.MouseEvent, item: Item) => void;
  permissions: FlowPermissions;
}

/** YYYY-MM-DD string from a Date */
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build the 6×7 grid of dates for a given month */
function buildCalendarGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return cells;
}

const FlowCalendarView: React.FC<FlowCalendarViewProps> = ({
  filteredLanes, onItemClick, onItemContextMenu,
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month]);

  // Flatten all items and group by due_date key
  const { itemsByDate, unscheduledCount } = useMemo(() => {
    const map = new Map<string, { item: Item; laneName: string }[]>();
    let unscheduled = 0;

    for (const lane of filteredLanes) {
      for (const item of lane.cards) {
        if (!item.due_date) {
          unscheduled++;
          continue;
        }
        const key = item.due_date.slice(0, 10); // YYYY-MM-DD
        const list = map.get(key) || [];
        list.push({ item, laneName: lane.name });
        map.set(key, list);
      }
    }

    return { itemsByDate: map, unscheduledCount: unscheduled };
  }, [filteredLanes]);

  const todayKey = toDateKey(new Date());

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Calendar top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-sm font-bold text-gray-800 min-w-[160px] text-center">
            {monthLabel}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={goToday}
            className="ml-2 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 rounded-md transition-all border border-gray-200"
          >
            Today
          </button>
        </div>

        {unscheduledCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <CalendarOff size={13} className="text-gray-400" />
            {unscheduledCount} unscheduled
          </span>
        )}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="grid grid-cols-7 border border-gray-200 rounded-xl overflow-hidden bg-white">
          {/* Day name headers */}
          {DAY_NAMES.map(day => (
            <div
              key={day}
              className="px-2 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center bg-gray-50 border-b border-gray-200"
            >
              {day}
            </div>
          ))}

          {/* Day cells */}
          {grid.map((date, idx) => {
            const key = toDateKey(date);
            const isCurrentMonth = date.getMonth() === month;
            const isToday = key === todayKey;
            const items = itemsByDate.get(key) || [];
            const overflow = items.length - MAX_ITEMS_PER_CELL;

            return (
              <div
                key={idx}
                className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 ${
                  !isCurrentMonth ? 'bg-gray-50/50' : ''
                } ${isToday ? 'ring-2 ring-inset ring-blue-200 bg-blue-50/30' : ''}`}
              >
                {/* Day number */}
                <div className={`text-[11px] font-semibold mb-1 px-0.5 ${
                  isToday
                    ? 'text-blue-600'
                    : isCurrentMonth
                      ? 'text-gray-700'
                      : 'text-gray-300'
                }`}>
                  {date.getDate()}
                </div>

                {/* Item pills */}
                <div className="flex flex-col gap-0.5">
                  {items.slice(0, MAX_ITEMS_PER_CELL).map(({ item }) => (
                    <button
                      key={item.id}
                      onClick={() => onItemClick(item)}
                      onContextMenu={e => onItemContextMenu(e, item)}
                      className="flex items-center gap-1 w-full px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors text-left truncate border border-gray-100"
                    >
                      {item.priority && (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[item.priority] || ''}`} />
                      )}
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))}
                  {overflow > 0 && (
                    <span className="text-[10px] font-medium text-gray-400 px-1.5">
                      +{overflow} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FlowCalendarView;
