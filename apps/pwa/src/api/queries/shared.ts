/**
 * Documentation: Query-layer primitives.
 *
 * - The small set of helpers every domain hook file builds on: envelope unwrapping, tenant-scoped queries that disable themselves without a tenant, and mutations that invalidate the right cache keys.
 * - Axios stays the transport. Its interceptors already handle the bearer token, the tenant header, token refresh, the IndexedDB offline cache, and offline mutation queueing — react-query sits on top and owns dedupe, staleness, background refetch, and invalidation.
 * - Primary exports: unwrap, unwrapPaginated, useTenantQuery, useTenantMutation, useAppMutation, isOfflineResponse.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { useAuthStore } from "@/stores/auth";
import type { ApiResponse, PaginatedResponse } from "@/types/api";

/** Pull the payload out of the `{ success, data }` envelope. */
export function unwrap<T>(response: AxiosResponse<ApiResponse<T>>): T {
  return response.data.data;
}

export type Paginated<T> = {
  data: T;
  meta: PaginatedResponse<T>["meta"];
};

/** Pull payload and pagination meta out of a paginated envelope. */
export function unwrapPaginated<T>(
  response: AxiosResponse<PaginatedResponse<T>>,
): Paginated<T> {
  return { data: response.data.data, meta: response.data.meta };
}

/**
 * True when the axios offline interceptor served this response from IndexedDB
 * rather than the network, so a screen can say so instead of implying it is live.
 */
export function isOfflineResponse(response: AxiosResponse): boolean {
  return Boolean((response.headers as Record<string, unknown>)?.["x-offline-cache"]);
}

/** The gym the signed-in user is acting in, or null for platform-only sessions. */
export function useCurrentTenantId(): string | null {
  return useAuthStore((state) => state.currentTenantId);
}

type TenantQueryOptions<TData> = Omit<
  UseQueryOptions<TData, unknown, TData, QueryKey>,
  "queryKey" | "queryFn"
> & {
  /** Extra condition on top of "a tenant is selected". */
  enabled?: boolean;
};

/**
 * A query scoped to the current gym.
 *
 * The tenant id is passed to `queryFn` so callers never read it themselves, and
 * the query stays disabled until one exists — which is what keeps platform-staff
 * sessions with no membership from firing tenant requests that would 400.
 */
export function useTenantQuery<TData>(
  key: (tenantId: string) => QueryKey,
  queryFn: (tenantId: string) => Promise<TData>,
  options: TenantQueryOptions<TData> = {},
) {
  const tenantId = useCurrentTenantId();
  const { enabled = true, ...rest } = options;

  return useQuery({
    queryKey: key(tenantId ?? "none"),
    queryFn: () => queryFn(tenantId!),
    enabled: Boolean(tenantId) && enabled,
    ...rest,
  });
}

/**
 * A paged, tenant-scoped query for the infinite-scroll list screens.
 *
 * `queryFn` receives the page number and returns the API's paginated envelope;
 * this decides when to stop from `meta.totalPages`, so pages no longer track
 * `page` / `hasMore` / `loadingMore` themselves or de-duplicate appended rows.
 */
export function useTenantInfiniteQuery<TItem>(
  key: (tenantId: string) => QueryKey,
  queryFn: (tenantId: string, page: number) => Promise<Paginated<TItem[]>>,
  options: { enabled?: boolean; limit?: number } = {},
) {
  const tenantId = useCurrentTenantId();
  const { enabled = true } = options;

  return useInfiniteQuery({
    queryKey: key(tenantId ?? "none"),
    enabled: Boolean(tenantId) && enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => queryFn(tenantId!, pageParam as number),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
}

/** The infinite-scroll equivalent for queries with no gym scope. */
export function useAppInfiniteQuery<TItem>(
  key: QueryKey,
  queryFn: (page: number) => Promise<Paginated<TItem[]>>,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: key,
    enabled: options.enabled ?? true,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => queryFn(pageParam as number),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
}

/** Flatten an infinite query's pages into the single list a screen renders. */
export function flattenPages<TItem>(
  pages: Paginated<TItem[]>[] | undefined,
): TItem[] {
  return (pages ?? []).flatMap((page) => page.data);
}

type MutationConfig<TData, TVariables> = Omit<
  UseMutationOptions<TData, unknown, TVariables>,
  "mutationFn"
> & {
  /**
   * Cache keys to invalidate after a success. Prefixes match, so
   * `["members", tenantId]` clears every members query for that gym.
   */
  invalidates?: QueryKey[];
};

/**
 * A mutation scoped to the current gym, with declarative invalidation.
 *
 * Offline writes resolve rather than reject — the axios interceptor queues them
 * and returns a synthetic 202 — so `onSuccess` still runs and the invalidated
 * queries refetch from the offline cache, keeping the UI consistent until the
 * sync engine replays the write.
 */
export function useTenantMutation<TData, TVariables = void>(
  mutationFn: (tenantId: string, variables: TVariables) => Promise<TData>,
  config: MutationConfig<TData, TVariables> = {},
) {
  const tenantId = useCurrentTenantId();
  const queryClient = useQueryClient();
  const { invalidates, onSuccess, ...rest } = config;

  return useMutation<TData, unknown, TVariables>({
    mutationFn: (variables) => {
      if (!tenantId) {
        return Promise.reject(new Error("No gym selected."));
      }
      return mutationFn(tenantId, variables);
    },
    onSuccess: async (data, variables, context, mutation) => {
      await Promise.all(
        (invalidates ?? []).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      await onSuccess?.(data, variables, context, mutation);
    },
    ...rest,
  });
}

/** A mutation with no gym scope, for platform and account-level writes. */
export function useAppMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  config: MutationConfig<TData, TVariables> = {},
) {
  const queryClient = useQueryClient();
  const { invalidates, onSuccess, ...rest } = config;

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: async (data, variables, context, mutation) => {
      await Promise.all(
        (invalidates ?? []).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      await onSuccess?.(data, variables, context, mutation);
    },
    ...rest,
  });
}
