/**
 * TanStack Query hooks for Team Hub.
 * Provides caching, background revalidation, and prefetch support.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../teamHubApi';
import type { FlowWithData, FlowSummary, DashboardStats, Activity, FlowMember, Item, ItemLeadLink } from '../teamHubApi';

// ─── Query key factory (hierarchical for targeted invalidation) ───

export const teamHubKeys = {
  all:           ['teamHub'] as const,
  dashboard:     (userId: string) => ['teamHub', 'dashboard', userId] as const,
  activity:      (userId: string) => ['teamHub', 'activity', userId] as const,
  board:         (boardId: string) => ['teamHub', 'board', boardId] as const,
  boardMembers:  (boardId: string) => ['teamHub', 'board', boardId, 'members'] as const,
  boardActivity: (boardId: string) => ['teamHub', 'board', boardId, 'activity'] as const,
  cardDetail:    (cardId: string) => ['teamHub', 'card', cardId] as const,
};

// ─── Query hooks ───

export function useFlowsWithStats(userId: string) {
  return useQuery<{ flows: FlowSummary[]; stats: DashboardStats }>({
    queryKey: teamHubKeys.dashboard(userId),
    queryFn: () => api.fetchFlowsWithStats(userId),
    staleTime: 60_000,
  });
}

export function useRecentActivity(userId: string) {
  return useQuery<Activity[]>({
    queryKey: teamHubKeys.activity(userId),
    queryFn: () => api.fetchRecentActivity(userId),
    staleTime: 30_000,
  });
}

export function useBoardData(boardId: string | null) {
  return useQuery<FlowWithData>({
    queryKey: teamHubKeys.board(boardId!),
    queryFn: () => api.fetchFlowWithData(boardId!),
    enabled: !!boardId,
    staleTime: 30_000,
  });
}

export function useBoardMembers(boardId: string | null) {
  return useQuery<FlowMember[]>({
    queryKey: teamHubKeys.boardMembers(boardId!),
    queryFn: () => api.fetchFlowMembers(boardId!),
    enabled: !!boardId,
    staleTime: 2 * 60_000,
  });
}

export function useCardDetail(cardId: string | null) {
  return useQuery({
    queryKey: teamHubKeys.cardDetail(cardId!),
    queryFn: () => api.fetchItemDetail(cardId!),
    enabled: !!cardId,
    staleTime: 15_000,
  });
}

// ─── Mutations ───

export function useCreateFlow(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createFlow(userId, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamHubKeys.dashboard(userId) }); },
  });
}

export function useCreateFlowFromTemplate(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, templateId }: { name: string; templateId: string }) =>
      api.createFlowFromTemplate(userId, name, templateId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamHubKeys.dashboard(userId) }); },
  });
}

export function useRenameFlow(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, name }: { flowId: string; name: string }) => api.updateFlow(flowId, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamHubKeys.dashboard(userId) }); },
  });
}

export function useDeleteFlow(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flowId: string) => api.deleteFlow(flowId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamHubKeys.dashboard(userId) }); },
  });
}

export function useCreateItem(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ laneId, title, userId, position }: { laneId: string; title: string; userId: string; position: number }) =>
      api.createItem(boardId, laneId, title, userId, position),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamHubKeys.board(boardId) }); },
  });
}

export function useMoveItem(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { itemId: string; toLaneId: string; orderedItemIds: string[]; fromLaneName: string; toLaneName: string }) =>
      api.moveItem(args.itemId, args.toLaneId, args.orderedItemIds, boardId, args.fromLaneName, args.toLaneName),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamHubKeys.board(boardId) }); },
  });
}

export function useArchiveItem(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.archiveItem(itemId, boardId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamHubKeys.board(boardId) }); },
  });
}

export function useAddComment(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, userId, body, userName }: { cardId: string; userId: string; body: string; userName?: string }) =>
      api.addComment(cardId, userId, body, boardId, userName),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: teamHubKeys.board(boardId) });
      qc.invalidateQueries({ queryKey: teamHubKeys.cardDetail(vars.cardId) });
    },
  });
}

// ─── Prefetch helper ───

export function usePrefetchBoard() {
  const qc = useQueryClient();
  return (flowId: string) => {
    qc.prefetchQuery({
      queryKey: teamHubKeys.board(flowId),
      queryFn: () => api.fetchFlowWithData(flowId),
      staleTime: 30_000,
    });
  };
}

// ─── Invalidation helpers ───

export function useInvalidateBoard() {
  const qc = useQueryClient();
  return (boardId: string) => {
    qc.invalidateQueries({ queryKey: teamHubKeys.board(boardId) });
  };
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return (userId: string) => {
    qc.invalidateQueries({ queryKey: teamHubKeys.dashboard(userId) });
    qc.invalidateQueries({ queryKey: teamHubKeys.activity(userId) });
  };
}
