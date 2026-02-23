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
  assigned_members?: CardMember[];
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

// ─── RBAC Types ───

export type FlowRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface CardMember {
  user_id: string;
  user_name: string;
  user_email: string;
}

export interface FlowMember {
  id: string;
  flow_id: string;
  user_id: string;
  role: FlowRole;
  created_at: string;
  updated_at: string;
  user_name: string;
  user_email: string;
}

export interface FlowInvite {
  id: string;
  flow_id: string;
  email: string;
  role: FlowRole;
  invited_by: string;
  status: 'pending' | 'accepted';
  created_at: string;
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
  // Get flow IDs the user is a member of
  const { data: memberships } = await supabase
    .from('teamhub_flow_members')
    .select('flow_id')
    .eq('user_id', userId);
  const flowIds = (memberships || []).map(m => m.flow_id);

  if (flowIds.length === 0) {
    return {
      flows: [],
      stats: { totalFlows: 0, totalLanes: 0, totalItems: 0, overdueItems: 0, highPriorityItems: 0, completedToday: 0 },
    };
  }

  const [flowsRes, lanesRes, itemsRes, activityRes] = await Promise.all([
    supabase.from('teamhub_boards').select('*').in('id', flowIds).order('updated_at', { ascending: false }),
    supabase.from('teamhub_lists').select('id, board_id').in('board_id', flowIds),
    supabase.from('teamhub_cards').select('id, board_id, list_id, priority, due_date, is_archived, created_at').in('board_id', flowIds).eq('is_archived', false),
    supabase.from('teamhub_activity').select('id, board_id, action_type, meta_json, actor_id, created_at, card_id')
      .in('board_id', flowIds)
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
  const { data: memberships } = await supabase
    .from('teamhub_flow_members')
    .select('flow_id')
    .eq('user_id', userId);
  const flowIds = (memberships || []).map(m => m.flow_id);
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
  const { data: memberships } = await supabase
    .from('teamhub_flow_members')
    .select('flow_id')
    .eq('user_id', userId);
  const flowIds = (memberships || []).map(m => m.flow_id);
  if (flowIds.length === 0) return [];

  const { data, error } = await supabase
    .from('teamhub_boards')
    .select('*')
    .in('id', flowIds)
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

  // Auto-create owner membership
  await supabase.from('teamhub_flow_members').insert({
    flow_id: data.id,
    user_id: userId,
    role: 'owner',
  });

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

  // Get card member assignments
  const allCardMembers = itemIds.length > 0 ? await fetchAllCardMembers(itemIds) : {};

  const itemsWithCounts = (itemsRes.data || []).map(c => ({
    ...c,
    labels: c.labels || [],
    comment_count: commentCounts[c.id] || 0,
    assigned_members: allCardMembers[c.id] || [],
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

// ─── Card Members ───

export async function fetchCardMembers(cardId: string): Promise<CardMember[]> {
  const { data, error } = await supabase
    .from('teamhub_card_members')
    .select('user_id')
    .eq('card_id', cardId);
  if (error) throw error;

  const userIds = (data || []).map(r => r.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', userIds);

  const profileMap: Record<string, { name: string; email: string }> = {};
  (profiles || []).forEach((p: any) => {
    profileMap[p.id] = { name: p.name || '', email: p.email || '' };
  });

  return userIds.map(uid => ({
    user_id: uid,
    user_name: profileMap[uid]?.name || '',
    user_email: profileMap[uid]?.email || '',
  }));
}

export async function addCardMember(cardId: string, userId: string, flowId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_card_members')
    .insert({ card_id: cardId, user_id: userId });
  if (error) throw error;
  await logActivity(flowId, cardId, 'member_assigned', { user_id: userId });
}

export async function removeCardMember(cardId: string, userId: string, flowId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_card_members')
    .delete()
    .eq('card_id', cardId)
    .eq('user_id', userId);
  if (error) throw error;
  await logActivity(flowId, cardId, 'member_unassigned', { user_id: userId });
}

export async function fetchAllCardMembers(cardIds: string[]): Promise<Record<string, CardMember[]>> {
  if (cardIds.length === 0) return {};

  const { data, error } = await supabase
    .from('teamhub_card_members')
    .select('card_id, user_id')
    .in('card_id', cardIds);
  if (error) throw error;

  const rows = data || [];
  if (rows.length === 0) return {};

  const uniqueUserIds = [...new Set(rows.map(r => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', uniqueUserIds);

  const profileMap: Record<string, { name: string; email: string }> = {};
  (profiles || []).forEach((p: any) => {
    profileMap[p.id] = { name: p.name || '', email: p.email || '' };
  });

  const result: Record<string, CardMember[]> = {};
  for (const row of rows) {
    if (!result[row.card_id]) result[row.card_id] = [];
    result[row.card_id].push({
      user_id: row.user_id,
      user_name: profileMap[row.user_id]?.name || '',
      user_email: profileMap[row.user_id]?.email || '',
    });
  }
  return result;
}

// ─── Item detail (with comments + activity) ───

export async function fetchItemDetail(itemId: string): Promise<{
  card: Item;
  comments: Comment[];
  activity: Activity[];
  cardMembers: CardMember[];
}> {
  const [itemRes, commentsRes, activityRes, cardMembers] = await Promise.all([
    supabase.from('teamhub_cards').select('*').eq('id', itemId).single(),
    supabase.from('teamhub_comments').select('*').eq('card_id', itemId).order('created_at', { ascending: true }),
    supabase.from('teamhub_activity').select('*').eq('card_id', itemId).order('created_at', { ascending: false }).limit(50),
    fetchCardMembers(itemId),
  ]);

  if (itemRes.error) throw itemRes.error;

  return {
    card: { ...itemRes.data, assigned_members: cardMembers },
    comments: commentsRes.data || [],
    activity: activityRes.data || [],
    cardMembers,
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

// ─── RBAC: Flow Members & Invites ───

export async function fetchFlowMembers(flowId: string): Promise<FlowMember[]> {
  const { data, error } = await supabase
    .from('teamhub_flow_members')
    .select('*')
    .eq('flow_id', flowId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const members = data || [];
  const userIds = members.map((m: any) => m.user_id);

  // Fetch profiles separately (no FK from flow_members to profiles)
  let profileMap: Record<string, { name: string; email: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds);
    (profiles || []).forEach((p: any) => {
      profileMap[p.id] = { name: p.name || '', email: p.email || '' };
    });
  }

  return members.map((m: any) => ({
    id: m.id,
    flow_id: m.flow_id,
    user_id: m.user_id,
    role: m.role,
    created_at: m.created_at,
    updated_at: m.updated_at,
    user_name: profileMap[m.user_id]?.name || '',
    user_email: profileMap[m.user_id]?.email || '',
  }));
}

export async function fetchUserFlowRole(flowId: string, userId: string): Promise<FlowRole | null> {
  const { data, error } = await supabase
    .from('teamhub_flow_members')
    .select('role')
    .eq('flow_id', flowId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

export async function addFlowMember(flowId: string, userId: string, role: FlowRole): Promise<void> {
  const { error } = await supabase
    .from('teamhub_flow_members')
    .insert({ flow_id: flowId, user_id: userId, role });
  if (error) throw error;
  await logActivity(flowId, null, 'member_added', { user_id: userId, role });
}

export async function updateFlowMemberRole(flowId: string, memberId: string, role: FlowRole): Promise<void> {
  const { error } = await supabase
    .from('teamhub_flow_members')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) throw error;
  await logActivity(flowId, null, 'member_role_changed', { member_id: memberId, role });
}

export async function removeFlowMember(flowId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_flow_members')
    .delete()
    .eq('id', memberId);
  if (error) throw error;
  await logActivity(flowId, null, 'member_removed', { member_id: memberId });
}

export async function inviteToFlow(flowId: string, email: string, role: FlowRole, invitedBy: string): Promise<FlowInvite> {
  const { data, error } = await supabase
    .from('teamhub_invites')
    .insert({ flow_id: flowId, email, role, invited_by: invitedBy })
    .select()
    .single();
  if (error) throw error;
  await logActivity(flowId, null, 'invite_sent', { email, role });
  return data;
}

export async function fetchFlowInvites(flowId: string): Promise<FlowInvite[]> {
  const { data, error } = await supabase
    .from('teamhub_invites')
    .select('*')
    .eq('flow_id', flowId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('teamhub_invites')
    .delete()
    .eq('id', inviteId);
  if (error) throw error;
}

export async function acceptInvite(inviteId: string, userId: string): Promise<void> {
  const { data: invite, error } = await supabase
    .from('teamhub_invites')
    .select('*')
    .eq('id', inviteId)
    .single();
  if (error) throw error;

  await addFlowMember(invite.flow_id, userId, invite.role);

  await supabase
    .from('teamhub_invites')
    .update({ status: 'accepted' })
    .eq('id', inviteId);
}
