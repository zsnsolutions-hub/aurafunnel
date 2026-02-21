import React, { useState, useCallback, useMemo } from 'react';
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
import type { FlowWithData, Item, Lane } from '../teamHubApi';
import * as api from '../teamHubApi';
import LaneColumn from './LaneColumn';
import AddLaneInline from './AddLaneInline';
import ItemInspector from './ItemInspector';

// Priority accent for drag overlay ghost
const PRIORITY_ACCENT: Record<string, string> = {
  high:   'border-l-rose-500',
  medium: 'border-l-amber-400',
  low:    'border-l-blue-400',
};

interface FlowViewProps {
  flow: FlowWithData;
  userId: string;
  userName: string;
  onRefresh: () => void;
}

const FlowView: React.FC<FlowViewProps> = ({ flow, userId, userName, onRefresh }) => {
  const [lanes, setLanes] = useState(flow.lists);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [inspectorItem, setInspectorItem] = useState<Item | null>(null);

  React.useEffect(() => {
    setLanes(flow.lists);
  }, [flow.lists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const laneIds = useMemo(() => lanes.map(l => `list-${l.id}`), [lanes]);

  const findLaneByItemId = useCallback((itemId: string): (Lane & { cards: Item[] }) | undefined => {
    return lanes.find(l => l.cards.some(c => c.id === itemId));
  }, [lanes]);

  // ─── Drag handlers ───

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.type === 'card') {
      setActiveItem(data.card);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type !== 'card') return;

    const activeItemId = active.id as string;

    let overLaneId: string | null = null;
    if (overData?.type === 'list') {
      overLaneId = overData.listId;
    } else if (overData?.type === 'card') {
      const overLane = findLaneByItemId(over.id as string);
      overLaneId = overLane?.id || null;
    }

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

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Lane reorder
    if (activeData?.type === 'list' && overData?.type === 'list') {
      const oldIndex = lanes.findIndex(l => `list-${l.id}` === active.id);
      const newIndex = lanes.findIndex(l => `list-${l.id}` === over.id);
      if (oldIndex !== newIndex) {
        const reordered = arrayMove(lanes, oldIndex, newIndex);
        setLanes(reordered);
        try {
          await api.reorderLanes(flow.id, reordered.map(l => l.id));
        } catch {
          onRefresh();
        }
      }
      return;
    }

    // Item reorder/move
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
            setLanes(prev => prev.map(l =>
              l.id === currentLane.id ? { ...l, cards: reordered } : l
            ));
            try {
              await api.reorderItems(currentLane.id, reordered.map(c => c.id));
            } catch {
              onRefresh();
            }
            return;
          }
        }
      }

      const fromLaneName = flow.lists.find(l => l.cards.some(c => c.id === itemId))?.name || '';
      const toLaneName = currentLane.name;
      try {
        await api.moveItem(
          itemId,
          currentLane.id,
          currentLane.cards.map(c => c.id),
          flow.id,
          fromLaneName,
          toLaneName
        );
      } catch {
        onRefresh();
      }
    }
  }, [lanes, flow, onRefresh]);

  // ─── Lane CRUD ───

  const handleAddLane = async (name: string) => {
    const position = lanes.length;
    try {
      const newLane = await api.createLane(flow.id, name, position);
      setLanes(prev => [...prev, { ...newLane, cards: [] }]);
    } catch (err) {
      console.error('Failed to create lane:', err);
    }
  };

  const handleRenameLane = async (laneId: string, name: string) => {
    setLanes(prev => prev.map(l => l.id === laneId ? { ...l, name } : l));
    try {
      await api.updateLane(laneId, name);
    } catch {
      onRefresh();
    }
  };

  const handleDeleteLane = async (laneId: string) => {
    setLanes(prev => prev.filter(l => l.id !== laneId));
    try {
      await api.deleteLane(laneId);
    } catch {
      onRefresh();
    }
  };

  // ─── Item CRUD ───

  const handleAddItem = async (laneId: string, title: string) => {
    const targetLane = lanes.find(l => l.id === laneId);
    const position = targetLane ? targetLane.cards.length : 0;
    try {
      const newItem = await api.createItem(flow.id, laneId, title, userId, position);
      setLanes(prev => prev.map(l =>
        l.id === laneId ? { ...l, cards: [...l.cards, newItem] } : l
      ));
    } catch (err) {
      console.error('Failed to create item:', err);
    }
  };

  const handleItemClosed = (itemId: string) => {
    setLanes(prev => prev.map(l => ({
      ...l,
      cards: l.cards.filter(c => c.id !== itemId),
    })));
  };

  // Empty state
  if (lanes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 bg-slate-100">
        <div className="w-16 h-16 bg-slate-200 rounded-2xl flex items-center justify-center mb-4">
          <LayoutGrid size={28} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">No lanes yet</h3>
        <p className="text-sm text-slate-500 mb-6">Add a lane to get started with your flow</p>
        <AddLaneInline onAdd={handleAddLane} />
      </div>
    );
  }

  const ghostAccent = activeItem?.priority
    ? (PRIORITY_ACCENT[activeItem.priority] || 'border-l-slate-200')
    : 'border-l-slate-200';

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Minimal background */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-slate-100 px-3 py-3">
          <div className="flex items-start gap-2 h-full">
            <SortableContext items={laneIds} strategy={horizontalListSortingStrategy}>
              {lanes.map((lane, idx) => (
                <LaneColumn
                  key={lane.id}
                  lane={lane}
                  laneIndex={idx}
                  onAddItem={handleAddItem}
                  onItemClick={setInspectorItem}
                  onRenameLane={handleRenameLane}
                  onDeleteLane={handleDeleteLane}
                />
              ))}
            </SortableContext>
            <AddLaneInline onAdd={handleAddLane} />
          </div>
        </div>

        {/* Drag overlay — ghost item with left accent bar */}
        <DragOverlay>
          {activeItem && (
            <div className={`bg-white rounded-lg shadow-xl w-[272px] rotate-3 opacity-95 border-l-[3px] ${ghostAccent}`}>
              <p className="text-[13px] font-medium text-slate-800 leading-snug px-2.5 py-2">
                {activeItem.title}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ItemInspector
        item={inspectorItem}
        flowId={flow.id}
        userId={userId}
        userName={userName}
        onClose={() => setInspectorItem(null)}
        onItemUpdated={onRefresh}
        onItemClosed={handleItemClosed}
      />
    </>
  );
};

export default FlowView;
