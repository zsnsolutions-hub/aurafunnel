import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,         // 2min — keeps data fresh-enough across tab switches
      gcTime: 15 * 60_000,           // 15 min garbage collection — keeps cache warm longer
      refetchOnWindowFocus: true,     // re-fetch stale data when user returns to tab
      refetchOnReconnect: true,      // re-fetch after network reconnect
      refetchOnMount: false,         // don't refetch on component mount if data is still fresh
      retry: 2,                      // retry failed queries twice
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000), // 1s → 2s → 4s → cap 15s
    },
    mutations: {
      retry: 0,                      // mutations use idempotency + manual retry via Activity Panel
    },
  },
});
