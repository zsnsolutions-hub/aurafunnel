import { supabase } from '../../../lib/supabase';

// ─── Types ───

export interface Flow {
  id: string;
  workspace_id: string | null;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Lane {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export type ItemPriority = 'low' | 'medium' | 'high';

export interface ItemTag {
  text: string;
  color: string; // tailwind color key: green, yellow, orange, red, purple, blue, sky, pink, teal
}

export interface Item {
  id: string;
  board_id: string;
  list_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  priority: ItemPriority | null;
  labels: ItemTag[];
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

export interface FlowWithData extends Flow {
  lists: (Lane & { cards: Item[] })[];
}

// ─── Dashboard stats ───

export interface FlowSummary extends Flow {
  list_count: number;
  card_count: number;
  high_priority_count: number;
  overdue_count: number;
}

export interface DashboardStats {
  totalFlows: number;
  totalItems: number;
  totalLanes: number;
  overdueItems: number;
  highPriorityItems: number;
  completedToday: number;
}

export async function fetchFlowsWithStats(userId: string): Promise<{ flows: FlowSummary[]; stats: DashboardStats }> {
  const [flowsRes, lanesRes, itemsRes, activityRes] = await Promise.all([
    supabase.from('teamhub_boards').select('*').eq('created_by', userId).order('updated_at', { ascending: false }),
    supabase.from('teamhub_lists').select('id, board_id'),
    supabase.from('teamhub_cards').select('id, board_id, list_id, priority, due_date, is_archived, created_at').eq('is_archived', false),
    supabase.from('teamhub_activity').select('id, board_id, action_type, meta_json, actor_id, created_at, card_id')
      .eq('actor_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const flowsData = flowsRes.data || [];
  const lanesData = lanesRes.data || [];
  const itemsData = itemsRes.data || [];

  const today = new Date().toISOString().split('T')[0];

  // Build per-flow stats
  const flows: FlowSummary[] = flowsData.map(f => {
    const flowLanes = lanesData.filter(l => l.board_id === f.id);
    const flowItems = itemsData.filter(c => c.board_id === f.id);
    return {
      ...f,
      list_count: flowLanes.length,
      card_count: flowItems.length,
      high_priority_count: flowItems.filter(c => c.priority === 'high').length,
      overdue_count: flowItems.filter(c => c.due_date && c.due_date < today).length,
    };
  });

  // Global stats
  const stats: DashboardStats = {
    totalFlows: flowsData.length,
    totalLanes: lanesData.length,
    totalItems: itemsData.length,
    overdueItems: itemsData.filter(c => c.due_date && c.due_date < today).length,
    highPriorityItems: itemsData.filter(c => c.priority === 'high').length,
    completedToday: (activityRes.data || []).filter(a =>
      a.action_type === 'card_archived' && a.created_at?.startsWith(today)
    ).length,
  };

  return { flows, stats };
}

export async function fetchRecentActivity(userId: string, limit = 15): Promise<Activity[]> {
  const { data: userFlows } = await supabase
    .from('teamhub_boards')
    .select('id')
    .eq('created_by', userId);
  const flowIds = (userFlows || []).map(f => f.id);
  if (flowIds.length === 0) return [];

  const { data, error } = await supabase
    .from('teamhub_activity')
    .select('*')
    .in('board_id', flowIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ─── Flows ───

export async function fetchFlows(userId: string): Promise<Flow[]> {
  const { data, error } = await supabase
    .from('teamhub_boards')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createFlow(userId: string, name: string): Promise<Flow> {
  const { data, error } = await supabase
    .from('teamhub_boards')
    .insert({ name, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFlow(flowId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_boards')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', flowId);
  if (error) throw error;
}

export async function deleteFlow(flowId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_boards')
    .delete()
    .eq('id', flowId);
  if (error) throw error;
}

// ─── Flow with lanes + items ───

export async function fetchFlowWithData(flowId: string): Promise<FlowWithData> {
  const [flowRes, lanesRes, itemsRes] = await Promise.all([
    supabase.from('teamhub_boards').select('*').eq('id', flowId).single(),
    supabase.from('teamhub_lists').select('*').eq('board_id', flowId).order('position'),
    supabase.from('teamhub_cards').select('*').eq('board_id', flowId).eq('is_archived', false).order('position'),
  ]);

  if (flowRes.error) throw flowRes.error;
  if (lanesRes.error) throw lanesRes.error;
  if (itemsRes.error) throw itemsRes.error;

  // Get comment counts
  const itemIds = (itemsRes.data || []).map(c => c.id);
  let commentCounts: Record<string, number> = {};
  if (itemIds.length > 0) {
    const { data: comments } = await supabase
      .from('teamhub_comments')
      .select('card_id')
      .in('card_id', itemIds);
    if (comments) {
      for (const c of comments) {
        commentCounts[c.card_id] = (commentCounts[c.card_id] || 0) + 1;
      }
    }
  }

  const itemsWithCounts = (itemsRes.data || []).map(c => ({
    ...c,
    labels: c.labels || [],
    comment_count: commentCounts[c.id] || 0,
  }));

  const lists = (lanesRes.data || []).map(lane => ({
    ...lane,
    cards: itemsWithCounts
      .filter(c => c.list_id === lane.id)
      .sort((a, b) => a.position - b.position),
  }));

  return { ...flowRes.data, lists };
}

// ─── Lanes ───

export async function createLane(flowId: string, name: string, position: number): Promise<Lane> {
  const { data, error } = await supabase
    .from('teamhub_lists')
    .insert({ board_id: flowId, name, position })
    .select()
    .single();
  if (error) throw error;
  await logActivity(flowId, null, 'list_created', { list_name: name });
  return data;
}

export async function updateLane(laneId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_lists')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', laneId);
  if (error) throw error;
}

export async function deleteLane(laneId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_lists')
    .delete()
    .eq('id', laneId);
  if (error) throw error;
}

export async function reorderLanes(flowId: string, orderedLaneIds: string[]): Promise<void> {
  const updates = orderedLaneIds.map((id, index) => ({
    id,
    board_id: flowId,
    position: index,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('teamhub_lists').upsert(updates);
  if (error) throw error;
}

// ─── Items ───

export async function createItem(
  flowId: string,
  laneId: string,
  title: string,
  userId: string,
  position: number
): Promise<Item> {
  const { data, error } = await supabase
    .from('teamhub_cards')
    .insert({ board_id: flowId, list_id: laneId, title, created_by: userId, position })
    .select()
    .single();
  if (error) throw error;
  await logActivity(flowId, data.id, 'card_created', { title });
  return { ...data, labels: data.labels || [], comment_count: 0 };
}

export async function updateItem(
  itemId: string,
  updates: Partial<Pick<Item, 'title' | 'description' | 'due_date' | 'priority' | 'labels'>>
): Promise<void> {
  const { error } = await supabase
    .from('teamhub_cards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
}

export async function archiveItem(itemId: string, flowId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_cards')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
  await logActivity(flowId, itemId, 'card_archived', {});
}

export async function moveItem(
  itemId: string,
  toLaneId: string,
  orderedItemIds: string[],
  flowId: string,
  fromLaneName: string,
  toLaneName: string
): Promise<void> {
  const { error: moveError } = await supabase
    .from('teamhub_cards')
    .update({ list_id: toLaneId, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (moveError) throw moveError;

  const updates = orderedItemIds.map((id, index) => ({
    id,
    position: index,
    updated_at: new Date().toISOString(),
  }));
  if (updates.length > 0) {
    const { error } = await supabase.from('teamhub_cards').upsert(updates);
    if (error) throw error;
  }

  if (fromLaneName !== toLaneName) {
    await logActivity(flowId, itemId, 'card_moved', { from: fromLaneName, to: toLaneName });
  }
}

export async function reorderItems(laneId: string, orderedItemIds: string[]): Promise<void> {
  const updates = orderedItemIds.map((id, index) => ({
    id,
    position: index,
    updated_at: new Date().toISOString(),
  }));
  if (updates.length > 0) {
    const { error } = await supabase.from('teamhub_cards').upsert(updates);
    if (error) throw error;
  }
}

// ─── Item detail (with comments + activity) ───

export async function fetchItemDetail(itemId: string): Promise<{
  card: Item;
  comments: Comment[];
  activity: Activity[];
}> {
  const [itemRes, commentsRes, activityRes] = await Promise.all([
    supabase.from('teamhub_cards').select('*').eq('id', itemId).single(),
    supabase.from('teamhub_comments').select('*').eq('card_id', itemId).order('created_at', { ascending: true }),
    supabase.from('teamhub_activity').select('*').eq('card_id', itemId).order('created_at', { ascending: false }).limit(50),
  ]);

  if (itemRes.error) throw itemRes.error;

  return {
    card: itemRes.data,
    comments: commentsRes.data || [],
    activity: activityRes.data || [],
  };
}

// ─── Comments ───

export async function addComment(cardId: string, userId: string, body: string, flowId: string): Promise<Comment> {
  const { data, error } = await supabase
    .from('teamhub_comments')
    .insert({ card_id: cardId, user_id: userId, body })
    .select()
    .single();
  if (error) throw error;
  await logActivity(flowId, cardId, 'comment_added', { body: body.slice(0, 100) });
  return data;
}

// ─── Activity ───

async function logActivity(
  flowId: string,
  cardId: string | null,
  actionType: string,
  meta: Record<string, unknown>
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('teamhub_activity').insert({
    board_id: flowId,
    card_id: cardId,
    actor_id: user.id,
    action_type: actionType,
    meta_json: meta,
  });
}

export async function fetchFlowActivity(flowId: string, limit = 30): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('teamhub_activity')
    .select('*')
    .eq('board_id', flowId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
