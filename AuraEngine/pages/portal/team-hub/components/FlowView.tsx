import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { LayoutGrid, Eye, Flag, ArrowRight, Pencil, Plus, Trash2, Archive, Users, Link2, Unlink, CircleDot, AlertTriangle } from 'lucide-react';
import type { FlowWithData, Item, Lane, FlowMember, ItemLeadLink } from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';
import type { BoardFilter, BoardSort, ViewMode } from './FlowHeader';
import * as api from '../teamHubApi';
import LaneColumn, { type LaneColumnHandle } from './LaneColumn';
import ContextMenu, { type ContextMenuItem } from '../../../../components/teamhub/ContextMenu';
import AddLaneInline from './AddLaneInline';
import ItemDialog from './ItemDialog';
import FlowHeader from './FlowHeader';
import FlowListView from './FlowListView';
import FlowCalendarView from './FlowCalendarView';
import LeadLinkDialog from './LeadLinkDialog';
import BoardActivitySidebar from './BoardActivitySidebar';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

type FlowContextTarget =
  | { type: 'item'; item: Item; laneId: string }
  | { type: 'lane'; lane: Lane & { cards: Item[] } };

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

  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [boardFilter, setBoardFilter] = useState<BoardFilter>({ priority: '', due: '' });
  const [boardSort, setBoardSort] = useState<BoardSort>('default');
  const [showActivity, setShowActivity] = useState(false);
  const [members, setMembers] = useState<FlowMember[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: FlowContextTarget } | null>(null);
  const [leadLinkItem, setLeadLinkItem] = useState<Item | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const laneRefs = useRef<Map<string, React.RefObject<LaneColumnHandle | null>>>(new Map());

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
        // After move completes, refresh to pick up any lead status changes from sync
        if (fromLaneName !== currentLane.name) {
          onRefresh();
        }
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

  const handleDeleteLaneWithConfirm = useCallback((laneId: string) => {
    const lane = lanes.find(l => l.id === laneId);
    setConfirmAction({
      title: 'Delete Lane',
      message: `Are you sure you want to delete "${lane?.name || 'this lane'}"? All items in this lane will be removed.`,
      onConfirm: () => handleDeleteLane(laneId),
    });
  }, [lanes, handleDeleteLane]);

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

  // ─── Context menu handlers ───
  const handleItemContextMenu = useCallback((e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    const lane = lanes.find(l => l.cards.some(c => c.id === item.id));
    if (!lane) return;
    setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'item', item, laneId: lane.id } });
  }, [lanes]);

  const handleLaneContextMenu = useCallback((e: React.MouseEvent, lane: Lane & { cards: Item[] }) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'lane', lane } });
  }, []);

  const handleChangeItemPriority = useCallback(async (itemId: string, priority: string | null) => {
    setLanes(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === itemId ? { ...c, priority: priority as Item['priority'] } : c),
    })));
    try { await api.updateItem(itemId, { priority: priority as Item['priority'] }); } catch { onRefresh(); }
  }, [onRefresh]);

  const handleMoveItemToLane = useCallback(async (itemId: string, fromLaneId: string, toLaneId: string) => {
    const fromLane = lanes.find(l => l.id === fromLaneId);
    const toLane = lanes.find(l => l.id === toLaneId);
    if (!fromLane || !toLane) return;

    const item = fromLane.cards.find(c => c.id === itemId);
    if (!item) return;

    setLanes(prev => prev.map(l => {
      if (l.id === fromLaneId) return { ...l, cards: l.cards.filter(c => c.id !== itemId) };
      if (l.id === toLaneId) return { ...l, cards: [...l.cards, { ...item, list_id: toLaneId }] };
      return l;
    }));

    try {
      const newOrder = [...toLane.cards.map(c => c.id), itemId];
      await api.moveItem(itemId, toLaneId, newOrder, flow.id, fromLane.name, toLane.name);
    } catch { onRefresh(); }
  }, [lanes, flow.id, onRefresh]);

  const handleArchiveItem = useCallback(async (itemId: string) => {
    setLanes(prev => prev.map(l => ({ ...l, cards: l.cards.filter(c => c.id !== itemId) })));
    try { await api.archiveItem(itemId, flow.id); } catch { onRefresh(); }
  }, [flow.id, onRefresh]);

  const handleAssignMember = useCallback(async (itemId: string, userId: string) => {
    try {
      await api.addCardMember(itemId, userId, flow.id);
      onRefresh();
    } catch (err) { console.error('Failed to assign member:', err); }
  }, [flow.id, onRefresh]);

  const handleUnassignMember = useCallback(async (itemId: string, userId: string) => {
    try {
      await api.removeCardMember(itemId, userId, flow.id);
      onRefresh();
    } catch (err) { console.error('Failed to unassign member:', err); }
  }, [flow.id, onRefresh]);

  const handleUnlinkLead = useCallback(async (itemId: string) => {
    try {
      await api.unlinkItemFromLead(itemId, flow.id);
      setLanes(prev => prev.map(l => ({
        ...l,
        cards: l.cards.map(c => c.id === itemId ? { ...c, lead_link: null } : c),
      })));
    } catch (err) { console.error('Failed to unlink lead:', err); }
  }, [flow.id]);

  const handleAddNote = useCallback(async (itemId: string, body: string) => {
    // Optimistically update latest_comment and comment_count
    setLanes(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === itemId
        ? { ...c, latest_comment: body, comment_count: (c.comment_count ?? 0) + 1 }
        : c),
    })));
    try {
      await api.addComment(itemId, userId, body, flow.id, userName);
    } catch (err) {
      console.error('Failed to add note:', err);
      onRefresh();
    }
  }, [userId, userName, flow.id, onRefresh]);

  const handleChangeLeadStatus = useCallback(async (itemId: string, leadId: string, status: string) => {
    // Optimistically update lead_link status on the card
    setLanes(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === itemId && c.lead_link
        ? { ...c, lead_link: { ...c.lead_link, lead_status: status } }
        : c),
    })));
    try {
      await api.updateLeadStatus(itemId, flow.id, leadId, status);
    } catch (err) {
      console.error('Failed to update lead status:', err);
      onRefresh();
    }
  }, [flow.id, onRefresh]);

  const handleLeadLinked = useCallback((link: ItemLeadLink) => {
    setLanes(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === link.item_id ? { ...c, lead_link: link } : c),
    })));
    setLeadLinkItem(null);
    onRefresh();
  }, [onRefresh]);

  const getLaneRef = useCallback((laneId: string) => {
    if (!laneRefs.current.has(laneId)) {
      laneRefs.current.set(laneId, React.createRef<LaneColumnHandle>());
    }
    return laneRefs.current.get(laneId)!;
  }, []);

  const buildFlowContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const { target } = contextMenu;

    if (target.type === 'item') {
      const { item, laneId } = target;
      const items: ContextMenuItem[] = [];

      // Open inspector
      items.push({
        label: 'Open',
        icon: <Eye size={14} />,
        dividerAfter: true,
        onClick: () => setInspectorItem(item),
      });

      // Priority submenu items
      if (permissions.canEditItems) {
        const priorities: { value: string | null; label: string }[] = [
          { value: 'high', label: 'High Priority' },
          { value: 'medium', label: 'Medium Priority' },
          { value: 'low', label: 'Low Priority' },
          { value: null, label: 'No Priority' },
        ];
        for (const p of priorities) {
          items.push({
            label: `${item.priority === p.value ? '● ' : ''}${p.label}`,
            icon: <Flag size={14} />,
            onClick: () => handleChangeItemPriority(item.id, p.value),
          });
        }
        items[items.length - 1].dividerAfter = true;

        // Assign members
        if (members.length > 0) {
          for (const m of members) {
            const isAssigned = (item.assigned_members || []).some(cm => cm.user_id === m.user_id);
            items.push({
              label: `${isAssigned ? '● ' : ''}${m.user_name || m.user_email}`,
              icon: <Users size={14} />,
              onClick: () => isAssigned
                ? handleUnassignMember(item.id, m.user_id)
                : handleAssignMember(item.id, m.user_id),
            });
          }
          items[items.length - 1].dividerAfter = true;
        }

        // Move to other lanes
        const otherLanes = lanes.filter(l => l.id !== laneId);
        if (otherLanes.length > 0) {
          for (const lane of otherLanes) {
            items.push({
              label: `Move to ${lane.name}`,
              icon: <ArrowRight size={14} />,
              onClick: () => handleMoveItemToLane(item.id, laneId, lane.id),
            });
          }
          items[items.length - 1].dividerAfter = true;
        }

        // Lead linking (admin/owner only)
        if (permissions.isAdmin || permissions.isOwner) {
          if (item.lead_link) {
            items.push({
              label: 'Unlink Lead',
              icon: <Unlink size={14} />,
              dividerAfter: true,
              onClick: () => handleUnlinkLead(item.id),
            });
          } else {
            items.push({
              label: 'Link to Lead',
              icon: <Link2 size={14} />,
              dividerAfter: true,
              onClick: () => setLeadLinkItem(item),
            });
          }
        }

        // Pipeline status submenu (when lead is linked)
        if (item.lead_link && permissions.canEditItems) {
          for (const status of api.LEAD_PIPELINE_STATUSES) {
            items.push({
              label: `${item.lead_link.lead_status === status ? '● ' : ''}${status}`,
              icon: <CircleDot size={14} />,
              onClick: () => handleChangeLeadStatus(item.id, item.lead_link!.lead_id, status),
            });
          }
          items[items.length - 1].dividerAfter = true;
        }

        // Archive / close
        items.push({
          label: 'Close Item',
          icon: <Archive size={14} />,
          danger: true,
          onClick: () => setConfirmAction({
            title: 'Close Item',
            message: `Are you sure you want to close "${item.title}"? This will archive the item.`,
            onConfirm: () => handleArchiveItem(item.id),
          }),
        });
      }

      return items;
    }

    // Lane context menu
    if (target.type === 'lane') {
      const { lane } = target;
      const items: ContextMenuItem[] = [];

      if (permissions.canEditItems) {
        items.push({
          label: 'Add Item',
          icon: <Plus size={14} />,
          onClick: () => laneRefs.current.get(lane.id)?.current?.triggerAddItem(),
        });
      }

      if (permissions.canManageLanes) {
        items.push({
          label: 'Rename Lane',
          icon: <Pencil size={14} />,
          dividerAfter: true,
          onClick: () => laneRefs.current.get(lane.id)?.current?.triggerRename(),
        });
        items.push({
          label: 'Delete Lane',
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => setConfirmAction({
            title: 'Delete Lane',
            message: `Are you sure you want to delete "${lane.name}"? All items in this lane will be removed.`,
            onConfirm: () => handleDeleteLane(lane.id),
          }),
        });
      }

      return items;
    }

    return [];
  }, [contextMenu, permissions, lanes, members, handleChangeItemPriority, handleMoveItemToLane, handleArchiveItem, handleDeleteLane, handleAssignMember, handleUnassignMember, handleUnlinkLead, handleChangeLeadStatus]);

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
    viewMode,
    onViewModeChange: setViewMode,
    onSaveAsTemplate: () => { setTemplateName(flow.name + ' Template'); setShowSaveTemplate(true); },
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
        {viewMode === 'board' && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* Board area — clean light gray like TaskHub */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gradient-to-b from-gray-50 to-gray-100/50 px-6 py-6">
              <div className="flex items-start gap-7 h-full mx-auto max-w-[1600px]">
                <SortableContext items={laneIds} strategy={horizontalListSortingStrategy}>
                  {filteredLanes.map((lane, idx) => (
                    <LaneColumn
                      key={lane.id}
                      ref={getLaneRef(lane.id)}
                      lane={lane}
                      laneIndex={idx}
                      onAddItem={handleAddItem}
                      onItemClick={setInspectorItem}
                      onRenameLane={handleRenameLane}
                      onDeleteLane={handleDeleteLaneWithConfirm}
                      permissions={permissions}
                      onItemContextMenu={handleItemContextMenu}
                      onLaneContextMenu={handleLaneContextMenu}
                      onAddNote={permissions.canComment ? handleAddNote : undefined}
                    />
                  ))}
                </SortableContext>
                {permissions.canManageLanes && <AddLaneInline onAdd={handleAddLane} />}
              </div>
            </div>

            {/* Drag overlay ghost */}
            <DragOverlay>
              {activeItem && (
                <div className="bg-white rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.12)] w-[340px] rotate-2 opacity-90 border border-blue-200 ring-2 ring-blue-100">
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
        )}

        {viewMode === 'list' && (
          <FlowListView
            filteredLanes={filteredLanes}
            onItemClick={setInspectorItem}
            onItemContextMenu={handleItemContextMenu}
            permissions={permissions}
          />
        )}

        {viewMode === 'calendar' && (
          <FlowCalendarView
            filteredLanes={filteredLanes}
            onItemClick={setInspectorItem}
            onItemContextMenu={handleItemContextMenu}
            permissions={permissions}
          />
        )}

        <BoardActivitySidebar
          flowId={flow.id}
          lanes={lanes}
          open={showActivity}
          onClose={() => setShowActivity(false)}
        />
      </div>

      <ItemDialog
        item={inspectorItem}
        flowId={flow.id}
        userId={userId}
        userName={userName}
        onClose={() => setInspectorItem(null)}
        onItemUpdated={onRefresh}
        onItemClosed={handleItemClosed}
        permissions={permissions}
        members={members}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildFlowContextMenuItems()}
          header={contextMenu.target.type === 'item' ? 'Item Actions' : 'Lane Actions'}
          onClose={() => setContextMenu(null)}
        />
      )}

      {leadLinkItem && (
        <LeadLinkDialog
          itemId={leadLinkItem.id}
          flowId={flow.id}
          onLinked={handleLeadLinked}
          onClose={() => setLeadLinkItem(null)}
        />
      )}

      {showSaveTemplate && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowSaveTemplate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Save as Template</h3>
              <input
                autoFocus
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && templateName.trim()) {
                    api.saveFlowAsTemplate(flow.id, userId, templateName.trim())
                      .then(() => setShowSaveTemplate(false))
                      .catch(console.error);
                  }
                }}
                placeholder="Template name..."
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 mb-3 placeholder-slate-400"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!templateName.trim()) return;
                    api.saveFlowAsTemplate(flow.id, userId, templateName.trim())
                      .then(() => setShowSaveTemplate(false))
                      .catch(console.error);
                  }}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSaveTemplate(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmAction && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">{confirmAction.title}</h3>
              </div>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">{confirmAction.message}</p>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmAction.onConfirm();
                    setConfirmAction(null);
                  }}
                  className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default FlowView;
