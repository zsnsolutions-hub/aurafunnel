import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { LayoutGrid } from 'lucide-react';
import type { FlowWithData, Item, Lane, FlowMember } from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';
import type { BoardFilter, BoardSort } from './FlowHeader';
import * as api from '../teamHubApi';
import LaneColumn from './LaneColumn';
import AddLaneInline from './AddLaneInline';
import ItemInspector from './ItemInspector';
import FlowHeader from './FlowHeader';
import BoardActivitySidebar from './BoardActivitySidebar';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface FlowViewProps {
  flow: FlowWithData;
  userId: string;
  userName: string;
  onRefresh: () => void;
  onBack: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onManageTeam?: () => void;
  permissions: FlowPermissions;
}

const FlowView: React.FC<FlowViewProps> = ({
  flow, userId, userName, onRefresh, onBack, onRename, onDelete, onManageTeam, permissions,
}) => {
  const [lanes, setLanes] = useState(flow.lists);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [inspectorItem, setInspectorItem] = useState<Item | null>(null);

  const [boardFilter, setBoardFilter] = useState<BoardFilter>({ priority: '', due: '' });
  const [boardSort, setBoardSort] = useState<BoardSort>('default');
  const [showActivity, setShowActivity] = useState(false);
  const [members, setMembers] = useState<FlowMember[]>([]);

  React.useEffect(() => { setLanes(flow.lists); }, [flow.lists]);

  useEffect(() => {
    let cancelled = false;
    api.fetchFlowMembers(flow.id)
      .then(data => { if (!cancelled) setMembers(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [flow.id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // ─── Filter & sort ───
  const filteredLanes = useMemo(() => {
    return lanes.map(lane => ({
      ...lane,
      cards: lane.cards
        .filter(c => !boardFilter.priority || c.priority === boardFilter.priority)
        .filter(c => {
          if (!boardFilter.due) return true;
          if (!c.due_date) return false;
          const dueDate = new Date(c.due_date);
          if (boardFilter.due === 'overdue') return dueDate < new Date();
          if (boardFilter.due === 'this_week') {
            const now = new Date();
            const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            return dueDate >= now && dueDate <= weekFromNow;
          }
          return true;
        })
        .sort((a, b) => {
          if (boardSort === 'priority') {
            return (PRIORITY_ORDER[a.priority ?? ''] ?? 3) - (PRIORITY_ORDER[b.priority ?? ''] ?? 3);
          }
          if (boardSort === 'due_date') {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          }
          if (boardSort === 'recent') {
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          }
          return 0;
        }),
    }));
  }, [lanes, boardFilter, boardSort]);

  const laneIds = useMemo(() => lanes.map(l => `list-${l.id}`), [lanes]);

  const findLaneByItemId = useCallback((itemId: string): (Lane & { cards: Item[] }) | undefined => {
    return lanes.find(l => l.cards.some(c => c.id === itemId));
  }, [lanes]);

  // ─── Drag handlers ───
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'card') setActiveItem(data.card);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current;
    const overData = over.data.current;
    if (activeData?.type !== 'card') return;

    const activeItemId = active.id as string;
    let overLaneId: string | null = null;
    if (overData?.type === 'list') overLaneId = overData.listId;
    else if (overData?.type === 'card') overLaneId = findLaneByItemId(over.id as string)?.id || null;
    if (!overLaneId) return;

    const fromLane = findLaneByItemId(activeItemId);
    if (!fromLane || fromLane.id === overLaneId) return;

    setLanes(prev => {
      const newLanes = prev.map(l => ({ ...l, cards: [...l.cards] }));
      const srcLane = newLanes.find(l => l.id === fromLane.id);
      const dstLane = newLanes.find(l => l.id === overLaneId);
      if (!srcLane || !dstLane) return prev;

      const itemIdx = srcLane.cards.findIndex(c => c.id === activeItemId);
      if (itemIdx === -1) return prev;
      const [movedItem] = srcLane.cards.splice(itemIdx, 1);
      movedItem.list_id = overLaneId!;

      if (overData?.type === 'card') {
        const overIdx = dstLane.cards.findIndex(c => c.id === (over.id as string));
        dstLane.cards.splice(overIdx >= 0 ? overIdx : dstLane.cards.length, 0, movedItem);
      } else {
        dstLane.cards.push(movedItem);
      }
      return newLanes;
    });
  }, [findLaneByItemId]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    if (!over || !permissions.canEditItems) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'list' && overData?.type === 'list') {
      const oldIndex = lanes.findIndex(l => `list-${l.id}` === active.id);
      const newIndex = lanes.findIndex(l => `list-${l.id}` === over.id);
      if (oldIndex !== newIndex) {
        const reordered = arrayMove(lanes, oldIndex, newIndex);
        setLanes(reordered);
        try { await api.reorderLanes(flow.id, reordered.map(l => l.id)); } catch { onRefresh(); }
      }
      return;
    }

    if (activeData?.type === 'card') {
      const itemId = active.id as string;
      const currentLane = lanes.find(l => l.cards.some(c => c.id === itemId));
      if (!currentLane) return;

      if (overData?.type === 'card') {
        const overLane = lanes.find(l => l.cards.some(c => c.id === (over.id as string)));
        if (overLane && overLane.id === currentLane.id) {
          const oldIndex = currentLane.cards.findIndex(c => c.id === itemId);
          const newIndex = currentLane.cards.findIndex(c => c.id === (over.id as string));
          if (oldIndex !== newIndex) {
            const reordered = arrayMove(currentLane.cards, oldIndex, newIndex);
            setLanes(prev => prev.map(l => l.id === currentLane.id ? { ...l, cards: reordered } : l));
            try { await api.reorderItems(currentLane.id, reordered.map(c => c.id)); } catch { onRefresh(); }
            return;
          }
        }
      }

      const fromLaneName = flow.lists.find(l => l.cards.some(c => c.id === itemId))?.name || '';
      try {
        await api.moveItem(itemId, currentLane.id, currentLane.cards.map(c => c.id), flow.id, fromLaneName, currentLane.name);
      } catch { onRefresh(); }
    }
  }, [lanes, flow, onRefresh, permissions.canEditItems]);

  // ─── CRUD ───
  const handleAddLane = async (name: string) => {
    try {
      const newLane = await api.createLane(flow.id, name, lanes.length);
      setLanes(prev => [...prev, { ...newLane, cards: [] }]);
    } catch (err) { console.error('Failed to create lane:', err); }
  };

  const handleRenameLane = async (laneId: string, name: string) => {
    setLanes(prev => prev.map(l => l.id === laneId ? { ...l, name } : l));
    try { await api.updateLane(laneId, name); } catch { onRefresh(); }
  };

  const handleDeleteLane = async (laneId: string) => {
    setLanes(prev => prev.filter(l => l.id !== laneId));
    try { await api.deleteLane(laneId); } catch { onRefresh(); }
  };

  const handleAddItem = async (laneId: string, title: string) => {
    const targetLane = lanes.find(l => l.id === laneId);
    try {
      const newItem = await api.createItem(flow.id, laneId, title, userId, targetLane ? targetLane.cards.length : 0);
      setLanes(prev => prev.map(l => l.id === laneId ? { ...l, cards: [...l.cards, newItem] } : l));
    } catch (err) { console.error('Failed to create item:', err); }
  };

  const handleItemClosed = (itemId: string) => {
    setLanes(prev => prev.map(l => ({ ...l, cards: l.cards.filter(c => c.id !== itemId) })));
  };

  // ─── Render ───
  const headerProps = {
    flow,
    onBack,
    onRename,
    onDelete,
    permissions,
    onManageTeam,
    members,
    activeFilter: boardFilter,
    activeSort: boardSort,
    onFilterChange: setBoardFilter,
    onSortChange: setBoardSort,
    showActivity,
    onToggleActivity: () => setShowActivity(s => !s),
  };

  if (lanes.length === 0) {
    return (
      <>
        <FlowHeader {...headerProps} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 bg-gray-50">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 border border-gray-200">
            <LayoutGrid size={28} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-700 mb-1">No lanes yet</h3>
          <p className="text-sm text-gray-500 mb-6">
            {permissions.canManageLanes ? 'Add a lane to get started with your flow' : 'No lanes have been created yet'}
          </p>
          {permissions.canManageLanes && <AddLaneInline onAdd={handleAddLane} />}
        </div>
      </>
    );
  }

  return (
    <>
      <FlowHeader {...headerProps} />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* Board area — clean light gray like TaskHub */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gray-50 px-6 py-5">
            <div className="flex items-start gap-6 h-full">
              <SortableContext items={laneIds} strategy={horizontalListSortingStrategy}>
                {filteredLanes.map((lane, idx) => (
                  <LaneColumn
                    key={lane.id}
                    lane={lane}
                    laneIndex={idx}
                    onAddItem={handleAddItem}
                    onItemClick={setInspectorItem}
                    onRenameLane={handleRenameLane}
                    onDeleteLane={handleDeleteLane}
                    permissions={permissions}
                  />
                ))}
              </SortableContext>
              {permissions.canManageLanes && <AddLaneInline onAdd={handleAddLane} />}
            </div>
          </div>

          {/* Drag overlay ghost */}
          <DragOverlay>
            {activeItem && (
              <div className="bg-white rounded-xl shadow-2xl w-[320px] rotate-2 opacity-90 border border-blue-200 ring-2 ring-blue-100">
                <div className="p-4">
                  {activeItem.priority && (
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase mb-2 ${
                      activeItem.priority === 'high' ? 'bg-red-500 text-white' :
                      activeItem.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {activeItem.priority === 'high' ? 'HIGH PRIORITY' : activeItem.priority === 'medium' ? 'MEDIUM' : 'LOW'}
                    </span>
                  )}
                  <h4 className="text-[14px] font-semibold text-gray-900 leading-snug">
                    {activeItem.title}
                  </h4>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <BoardActivitySidebar
          flowId={flow.id}
          lanes={lanes}
          open={showActivity}
          onClose={() => setShowActivity(false)}
        />
      </div>

      <ItemInspector
        item={inspectorItem}
        flowId={flow.id}
        userId={userId}
        userName={userName}
        onClose={() => setInspectorItem(null)}
        onItemUpdated={onRefresh}
        onItemClosed={handleItemClosed}
        permissions={permissions}
      />
    </>
  );
};

export default FlowView;
