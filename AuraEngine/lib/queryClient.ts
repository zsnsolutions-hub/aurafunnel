import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,             // 60s default — reduces refetch storms, override per-query via staleTimes
      gcTime: 10 * 60_000,           // 10 min garbage collection
      refetchOnWindowFocus: true,     // re-fetch stale data when user returns to tab
      refetchOnReconnect: true,      // re-fetch after network reconnect
      retry: 2,                      // retry failed queries twice
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000), // 1s → 2s → 4s → cap 15s
    },
    mutations: {
      retry: 0,                      // mutations use idempotency + manual retry via Activity Panel
    },
  },
});
