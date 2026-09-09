/**
 * Documentation: Occupation query hooks.
 *
 * - The platform-wide occupation list: one query every member form reads, and the writes behind the manage screen.
 * - Not tenant-scoped, so these use the plain app-level helpers rather than the tenant-aware ones.
 * - The list barely changes, so it is cached for a long while rather than refetched every time a form opens.
 * - Primary exports: useOccupations, useCreateOccupation, useUpdateOccupation, useDeleteOccupation.
 */
import { useQuery } from "@tanstack/react-query";
import { occupationsApi } from "@/api/occupations";
import { queryKeys } from "@/lib/query-keys";
import type { CreateOccupationPayload, UpdateOccupationPayload } from "@/types/api";
import { unwrap, useAppMutation } from "./shared";

/** An hour: this list is edited by hand, a few times a year. */
const OCCUPATION_STALE_TIME = 60 * 60 * 1000;

export function useOccupations(
  options: { includeInactive?: boolean; withCounts?: boolean; enabled?: boolean } = {},
) {
  const includeInactive = options.includeInactive ?? false;
  const withCounts = options.withCounts ?? false;

  return useQuery({
    queryKey: queryKeys.occupations.list(includeInactive, withCounts),
    enabled: options.enabled ?? true,
    staleTime: OCCUPATION_STALE_TIME,
    queryFn: async () =>
      unwrap(await occupationsApi.list({ includeInactive, withCounts })).occupations,
  });
}

export function useCreateOccupation() {
  return useAppMutation(
    async (payload: CreateOccupationPayload) => unwrap(await occupationsApi.create(payload)),
    { invalidates: [queryKeys.occupations.all()] },
  );
}

export function useUpdateOccupation() {
  return useAppMutation(
    async (variables: { occupationId: string; data: UpdateOccupationPayload }) =>
      unwrap(await occupationsApi.update(variables.occupationId, variables.data)),
    { invalidates: [queryKeys.occupations.all()] },
  );
}

export function useDeleteOccupation() {
  return useAppMutation(
    async (occupationId: string) => {
      await occupationsApi.remove(occupationId);
      return occupationId;
    },
    { invalidates: [queryKeys.occupations.all()] },
  );
}
