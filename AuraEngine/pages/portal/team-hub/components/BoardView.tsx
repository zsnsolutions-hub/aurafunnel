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
import type { BoardWithData, Card, List } from '../teamHubApi';
import * as api from '../teamHubApi';
import ListColumn from './ListColumn';
import AddListInline from './AddListInline';
import CardDetailDrawer from './CardDetailDrawer';

interface BoardViewProps {
  board: BoardWithData;
  userId: string;
  userName: string;
  onRefresh: () => void;
}

const BoardView: React.FC<BoardViewProps> = ({ board, userId, userName, onRefresh }) => {
  const [lists, setLists] = useState(board.lists);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [drawerCard, setDrawerCard] = useState<Card | null>(null);

  // Sync when board refreshes
  React.useEffect(() => {
    setLists(board.lists);
  }, [board.lists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const listIds = useMemo(() => lists.map(l => `list-${l.id}`), [lists]);

  // Find which list a card belongs to
  const findListByCardId = useCallback((cardId: string): (List & { cards: Card[] }) | undefined => {
    return lists.find(l => l.cards.some(c => c.id === cardId));
  }, [lists]);

  // ─── Drag handlers ───

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.type === 'card') {
      setActiveCard(data.card);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Only handle card drags
    if (activeData?.type !== 'card') return;

    const activeCardId = active.id as string;

    // Determine target list
    let overListId: string | null = null;
    if (overData?.type === 'list') {
      overListId = overData.listId;
    } else if (overData?.type === 'card') {
      const overList = findListByCardId(over.id as string);
      overListId = overList?.id || null;
    }

    if (!overListId) return;

    const fromList = findListByCardId(activeCardId);
    if (!fromList || fromList.id === overListId) return;

    // Move card across lists in state (optimistic)
    setLists(prev => {
      const newLists = prev.map(l => ({
        ...l,
        cards: [...l.cards],
      }));

      const srcList = newLists.find(l => l.id === fromList.id);
      const dstList = newLists.find(l => l.id === overListId);
      if (!srcList || !dstList) return prev;

      const cardIdx = srcList.cards.findIndex(c => c.id === activeCardId);
      if (cardIdx === -1) return prev;

      const [movedCard] = srcList.cards.splice(cardIdx, 1);
      movedCard.list_id = overListId!;

      // Insert at position of the over card, or at end
      if (overData?.type === 'card') {
        const overIdx = dstList.cards.findIndex(c => c.id === (over.id as string));
        dstList.cards.splice(overIdx >= 0 ? overIdx : dstList.cards.length, 0, movedCard);
      } else {
        dstList.cards.push(movedCard);
      }

      return newLists;
    });
  }, [findListByCardId]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // ─── List reorder ───
    if (activeData?.type === 'list' && overData?.type === 'list') {
      const oldIndex = lists.findIndex(l => `list-${l.id}` === active.id);
      const newIndex = lists.findIndex(l => `list-${l.id}` === over.id);
      if (oldIndex !== newIndex) {
        const reordered = arrayMove(lists, oldIndex, newIndex);
        setLists(reordered);
        try {
          await api.reorderLists(board.id, reordered.map(l => l.id));
        } catch {
          onRefresh(); // Rollback
        }
      }
      return;
    }

    // ─── Card reorder/move ───
    if (activeData?.type === 'card') {
      const cardId = active.id as string;
      const currentList = lists.find(l => l.cards.some(c => c.id === cardId));
      if (!currentList) return;

      // Same-list reorder
      if (overData?.type === 'card') {
        const overList = lists.find(l => l.cards.some(c => c.id === (over.id as string)));
        if (overList && overList.id === currentList.id) {
          const oldIndex = currentList.cards.findIndex(c => c.id === cardId);
          const newIndex = currentList.cards.findIndex(c => c.id === (over.id as string));
          if (oldIndex !== newIndex) {
            const reordered = arrayMove(currentList.cards, oldIndex, newIndex);
            setLists(prev => prev.map(l =>
              l.id === currentList.id ? { ...l, cards: reordered } : l
            ));
            try {
              await api.reorderCards(currentList.id, reordered.map(c => c.id));
            } catch {
              onRefresh();
            }
            return;
          }
        }
      }

      // Cross-list move: persist
      const fromListName = board.lists.find(l => l.cards.some(c => c.id === cardId))?.name || '';
      const toListName = currentList.name;
      try {
        await api.moveCard(
          cardId,
          currentList.id,
          currentList.cards.map(c => c.id),
          board.id,
          fromListName,
          toListName
        );
      } catch {
        onRefresh();
      }
    }
  }, [lists, board, onRefresh]);

  // ─── List CRUD ───

  const handleAddList = async (name: string) => {
    const position = lists.length;
    try {
      const newList = await api.createList(board.id, name, position);
      setLists(prev => [...prev, { ...newList, cards: [] }]);
    } catch (err) {
      console.error('Failed to create list:', err);
    }
  };

  const handleRenameList = async (listId: string, name: string) => {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, name } : l));
    try {
      await api.updateList(listId, name);
    } catch {
      onRefresh();
    }
  };

  const handleDeleteList = async (listId: string) => {
    setLists(prev => prev.filter(l => l.id !== listId));
    try {
      await api.deleteList(listId);
    } catch {
      onRefresh();
    }
  };

  // ─── Card CRUD ───

  const handleAddCard = async (listId: string, title: string) => {
    const targetList = lists.find(l => l.id === listId);
    const position = targetList ? targetList.cards.length : 0;
    try {
      const newCard = await api.createCard(board.id, listId, title, userId, position);
      setLists(prev => prev.map(l =>
        l.id === listId ? { ...l, cards: [...l.cards, newCard] } : l
      ));
    } catch (err) {
      console.error('Failed to create card:', err);
    }
  };

  const handleCardArchived = (cardId: string) => {
    setLists(prev => prev.map(l => ({
      ...l,
      cards: l.cards.filter(c => c.id !== cardId),
    })));
  };

  // Empty state
  if (lists.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
          <LayoutGrid size={28} className="text-indigo-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">No lists yet</h3>
        <p className="text-sm text-slate-500 mb-6">Add a list to get started with your board</p>
        <AddListInline onAdd={handleAddList} />
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4">
          <div className="flex items-start gap-4 h-full">
            <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
              {lists.map(list => (
                <ListColumn
                  key={list.id}
                  list={list}
                  onAddCard={handleAddCard}
                  onCardClick={setDrawerCard}
                  onRenameList={handleRenameList}
                  onDeleteList={handleDeleteList}
                />
              ))}
            </SortableContext>
            <AddListInline onAdd={handleAddList} />
          </div>
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="bg-white rounded-xl border border-indigo-200 shadow-xl p-3 w-72 rotate-2 opacity-90">
              <p className="text-sm font-semibold text-slate-800 line-clamp-2">{activeCard.title}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <CardDetailDrawer
        card={drawerCard}
        boardId={board.id}
        userId={userId}
        userName={userName}
        onClose={() => setDrawerCard(null)}
        onCardUpdated={onRefresh}
        onCardArchived={handleCardArchived}
      />
    </>
  );
};

export default BoardView;
