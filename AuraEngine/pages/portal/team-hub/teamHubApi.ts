import { supabase } from '../../../lib/supabase';

// ─── Types ───

export interface Board {
  id: string;
  workspace_id: string | null;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface List {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export type CardPriority = 'low' | 'medium' | 'high';

export interface Card {
  id: string;
  board_id: string;
  list_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  priority: CardPriority | null;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  comment_count?: number;
}

export interface Comment {
  id: string;
  card_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user_name?: string;
}

export interface Activity {
  id: string;
  board_id: string;
  card_id: string | null;
  actor_id: string;
  action_type: string;
  meta_json: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
}

export interface BoardWithData extends Board {
  lists: (List & { cards: Card[] })[];
}

// ─── Dashboard stats ───

export interface BoardSummary extends Board {
  list_count: number;
  card_count: number;
  high_priority_count: number;
  overdue_count: number;
}

export interface DashboardStats {
  totalBoards: number;
  totalCards: number;
  totalLists: number;
  overdueCards: number;
  highPriorityCards: number;
  completedToday: number;
}

export async function fetchBoardsWithStats(userId: string): Promise<{ boards: BoardSummary[]; stats: DashboardStats }> {
  const [boardsRes, listsRes, cardsRes, activityRes] = await Promise.all([
    supabase.from('teamhub_boards').select('*').eq('created_by', userId).order('updated_at', { ascending: false }),
    supabase.from('teamhub_lists').select('id, board_id'),
    supabase.from('teamhub_cards').select('id, board_id, list_id, priority, due_date, is_archived, created_at').eq('is_archived', false),
    supabase.from('teamhub_activity').select('id, board_id, action_type, meta_json, actor_id, created_at, card_id')
      .eq('actor_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const boardsData = boardsRes.data || [];
  const listsData = listsRes.data || [];
  const cardsData = cardsRes.data || [];

  const today = new Date().toISOString().split('T')[0];

  // Build per-board stats
  const boards: BoardSummary[] = boardsData.map(b => {
    const boardLists = listsData.filter(l => l.board_id === b.id);
    const boardCards = cardsData.filter(c => c.board_id === b.id);
    return {
      ...b,
      list_count: boardLists.length,
      card_count: boardCards.length,
      high_priority_count: boardCards.filter(c => c.priority === 'high').length,
      overdue_count: boardCards.filter(c => c.due_date && c.due_date < today).length,
    };
  });

  // Global stats
  const stats: DashboardStats = {
    totalBoards: boardsData.length,
    totalLists: listsData.length,
    totalCards: cardsData.length,
    overdueCards: cardsData.filter(c => c.due_date && c.due_date < today).length,
    highPriorityCards: cardsData.filter(c => c.priority === 'high').length,
    completedToday: (activityRes.data || []).filter(a =>
      a.action_type === 'card_archived' && a.created_at?.startsWith(today)
    ).length,
  };

  return { boards, stats };
}

export async function fetchRecentActivity(userId: string, limit = 15): Promise<Activity[]> {
  // Get all boards for this user first
  const { data: userBoards } = await supabase
    .from('teamhub_boards')
    .select('id')
    .eq('created_by', userId);
  const boardIds = (userBoards || []).map(b => b.id);
  if (boardIds.length === 0) return [];

  const { data, error } = await supabase
    .from('teamhub_activity')
    .select('*')
    .in('board_id', boardIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ─── Boards ───

export async function fetchBoards(userId: string): Promise<Board[]> {
  const { data, error } = await supabase
    .from('teamhub_boards')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createBoard(userId: string, name: string): Promise<Board> {
  const { data, error } = await supabase
    .from('teamhub_boards')
    .insert({ name, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBoard(boardId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_boards')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', boardId);
  if (error) throw error;
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_boards')
    .delete()
    .eq('id', boardId);
  if (error) throw error;
}

// ─── Board with lists + cards ───

export async function fetchBoardWithData(boardId: string): Promise<BoardWithData> {
  const [boardRes, listsRes, cardsRes] = await Promise.all([
    supabase.from('teamhub_boards').select('*').eq('id', boardId).single(),
    supabase.from('teamhub_lists').select('*').eq('board_id', boardId).order('position'),
    supabase.from('teamhub_cards').select('*').eq('board_id', boardId).eq('is_archived', false).order('position'),
  ]);

  if (boardRes.error) throw boardRes.error;
  if (listsRes.error) throw listsRes.error;
  if (cardsRes.error) throw cardsRes.error;

  // Get comment counts
  const cardIds = (cardsRes.data || []).map(c => c.id);
  let commentCounts: Record<string, number> = {};
  if (cardIds.length > 0) {
    const { data: comments } = await supabase
      .from('teamhub_comments')
      .select('card_id')
      .in('card_id', cardIds);
    if (comments) {
      for (const c of comments) {
        commentCounts[c.card_id] = (commentCounts[c.card_id] || 0) + 1;
      }
    }
  }

  const cardsWithCounts = (cardsRes.data || []).map(c => ({
    ...c,
    comment_count: commentCounts[c.id] || 0,
  }));

  const lists = (listsRes.data || []).map(list => ({
    ...list,
    cards: cardsWithCounts
      .filter(c => c.list_id === list.id)
      .sort((a, b) => a.position - b.position),
  }));

  return { ...boardRes.data, lists };
}

// ─── Lists ───

export async function createList(boardId: string, name: string, position: number): Promise<List> {
  const { data, error } = await supabase
    .from('teamhub_lists')
    .insert({ board_id: boardId, name, position })
    .select()
    .single();
  if (error) throw error;
  await logActivity(boardId, null, 'list_created', { list_name: name });
  return data;
}

export async function updateList(listId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_lists')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', listId);
  if (error) throw error;
}

export async function deleteList(listId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_lists')
    .delete()
    .eq('id', listId);
  if (error) throw error;
}

export async function reorderLists(boardId: string, orderedListIds: string[]): Promise<void> {
  const updates = orderedListIds.map((id, index) => ({
    id,
    board_id: boardId,
    position: index,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('teamhub_lists').upsert(updates);
  if (error) throw error;
}

// ─── Cards ───

export async function createCard(
  boardId: string,
  listId: string,
  title: string,
  userId: string,
  position: number
): Promise<Card> {
  const { data, error } = await supabase
    .from('teamhub_cards')
    .insert({ board_id: boardId, list_id: listId, title, created_by: userId, position })
    .select()
    .single();
  if (error) throw error;
  await logActivity(boardId, data.id, 'card_created', { title });
  return { ...data, comment_count: 0 };
}

export async function updateCard(
  cardId: string,
  updates: Partial<Pick<Card, 'title' | 'description' | 'due_date' | 'priority'>>
): Promise<void> {
  const { error } = await supabase
    .from('teamhub_cards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', cardId);
  if (error) throw error;
}

export async function archiveCard(cardId: string, boardId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_cards')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', cardId);
  if (error) throw error;
  await logActivity(boardId, cardId, 'card_archived', {});
}

export async function moveCard(
  cardId: string,
  toListId: string,
  orderedCardIds: string[],
  boardId: string,
  fromListName: string,
  toListName: string
): Promise<void> {
  // Update card's list_id
  const { error: moveError } = await supabase
    .from('teamhub_cards')
    .update({ list_id: toListId, updated_at: new Date().toISOString() })
    .eq('id', cardId);
  if (moveError) throw moveError;

  // Rewrite positions for the target list
  const updates = orderedCardIds.map((id, index) => ({
    id,
    position: index,
    updated_at: new Date().toISOString(),
  }));
  if (updates.length > 0) {
    const { error } = await supabase.from('teamhub_cards').upsert(updates);
    if (error) throw error;
  }

  if (fromListName !== toListName) {
    await logActivity(boardId, cardId, 'card_moved', { from: fromListName, to: toListName });
  }
}

export async function reorderCards(listId: string, orderedCardIds: string[]): Promise<void> {
  const updates = orderedCardIds.map((id, index) => ({
    id,
    position: index,
    updated_at: new Date().toISOString(),
  }));
  if (updates.length > 0) {
    const { error } = await supabase.from('teamhub_cards').upsert(updates);
    if (error) throw error;
  }
}

// ─── Card detail (with comments + activity) ───

export async function fetchCardDetail(cardId: string): Promise<{
  card: Card;
  comments: Comment[];
  activity: Activity[];
}> {
  const [cardRes, commentsRes, activityRes] = await Promise.all([
    supabase.from('teamhub_cards').select('*').eq('id', cardId).single(),
    supabase.from('teamhub_comments').select('*').eq('card_id', cardId).order('created_at', { ascending: true }),
    supabase.from('teamhub_activity').select('*').eq('card_id', cardId).order('created_at', { ascending: false }).limit(50),
  ]);

  if (cardRes.error) throw cardRes.error;

  return {
    card: cardRes.data,
    comments: commentsRes.data || [],
    activity: activityRes.data || [],
  };
}

// ─── Comments ───

export async function addComment(cardId: string, userId: string, body: string, boardId: string): Promise<Comment> {
  const { data, error } = await supabase
    .from('teamhub_comments')
    .insert({ card_id: cardId, user_id: userId, body })
    .select()
    .single();
  if (error) throw error;
  await logActivity(boardId, cardId, 'comment_added', { body: body.slice(0, 100) });
  return data;
}

// ─── Activity ───

async function logActivity(
  boardId: string,
  cardId: string | null,
  actionType: string,
  meta: Record<string, unknown>
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('teamhub_activity').insert({
    board_id: boardId,
    card_id: cardId,
    actor_id: user.id,
    action_type: actionType,
    meta_json: meta,
  });
}

export async function fetchBoardActivity(boardId: string, limit = 30): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('teamhub_activity')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
