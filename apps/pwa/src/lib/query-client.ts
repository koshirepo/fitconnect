/**
 * Documentation: TanStack Query client and cache persistence.
 *
 * - Owns the single QueryClient used by the app, its caching defaults, and the localStorage persister that keeps server state warm across reloads and offline launches.
 * - Axios remains the transport (it carries the bearer token, tenant header, and the IndexedDB offline fallbacks); react-query owns dedupe, staleness, background refetch, and invalidation on top of it.
 * - Primary exports: queryClient, queryPersister, PERSIST_MAX_AGE_MS, invalidateTenantQueries.
 */
import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { isAxiosError } from "axios";

/** Persisted cache lifetime; matches the offline axios cache window. */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const STALE_TIME_MS = 60 * 1000;
const GC_TIME_MS = 30 * 60 * 1000;

/**
 * A 401/403 means the session or the caller's permissions changed — retrying
 * cannot fix it, and the axios interceptor already handles token refresh.
 */
function shouldRetry(failureCount: number, error: unknown) {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403 || status === 404) return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      gcTime: GC_TIME_MS,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      // The app is offline-capable, so a reconnect should refresh stale views.
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

export const queryPersister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: "fitconnect.query-cache",
  throttleTime: 1000,
});

/**
 * Drop every cached query for a gym.
 * Call this after switching tenants or after a role/permission change, because
 * the same URL returns different data once the caller's capabilities differ.
 */
export function invalidateTenantQueries(tenantId?: string | null) {
  if (!tenantId) {
    void queryClient.invalidateQueries();
    return;
  }
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey.includes(tenantId),
  });
}
