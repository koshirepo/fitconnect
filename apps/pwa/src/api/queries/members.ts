/**
 * Documentation: Member query hooks.
 *
 * - Wraps `tenantsApi`'s membership endpoints so screens declare what they need rather than orchestrating fetches, loading flags, and refetch-after-write by hand.
 * - Writes invalidate `["members", tenantId]`, which covers the list, every filtered variant, and the detail view in one call.
 * - Primary exports: useMembers, useAllMembers, useMember, useReferrals, useMyProfile, and the member mutations.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tenantsApi } from "@/api/tenants";
import { loadAllTenantMembers } from "@/lib/tenant-members";
import { queryKeys } from "@/lib/query-keys";
import type {
  MemberDetail,
  TenantMember,
  UpdateMemberPayload,
  UpdateProfilePayload,
} from "@/types/api";
import {
  unwrap,
  unwrapPaginated,
  useCurrentTenantId,
  useTenantInfiniteQuery,
  useTenantMutation,
  useTenantQuery,
} from "./shared";

export type MemberListFilters = {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
  badgeId?: string;
  /** A row id from the platform-wide occupation list. */
  occupationId?: string;
};

/** Cache keys every member write should clear. */
function memberScope(tenantId: string | null) {
  return [queryKeys.members.list(tenantId ?? "none")[0], tenantId ?? "none"];
}

/** One page of members, keeping the previous page visible while the next loads. */
export function useMembers(
  filters: MemberListFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => queryKeys.members.list(tenantId, filters),
    async (tenantId) =>
      unwrapPaginated(
        await tenantsApi.listMembers(
          tenantId,
          filters.page ?? 1,
          filters.limit ?? 20,
          filters.role,
          filters.search,
          filters.status,
          filters.badgeId,
          filters.occupationId,
        ),
      ),
    { placeholderData: keepPreviousData, ...options },
  );
}

/**
 * Whose birthday falls in the next few days.
 *
 * Cached for the hour: the answer changes once a day, and every gym screen
 * that shows it opens far more often than that.
 */
export function useMemberBirthdays(days = 7, options: { enabled?: boolean } = {}) {
  // The device's own date, and part of the key: at midnight the key changes and
  // the list is asked for again rather than being served yesterday's window.
  const today = new Date();
  const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  return useTenantQuery(
    (tenantId) => [...queryKeys.members.list(tenantId, { birthdays: days, from }), "birthdays"],
    async (tenantId) => unwrap(await tenantsApi.listBirthdays(tenantId, days, from)).birthdays,
    { staleTime: 60 * 60 * 1000, ...options },
  );
}

/**
 * Every member of the gym, paged through in the background.
 * Screens that filter and sort client-side (the member list, the attendance
 * picker) need the whole set rather than a page.
 */
export function useAllMembers(
  options: { status?: string; enabled?: boolean } = {},
) {
  const tenantId = useCurrentTenantId();

  return useQuery({
    queryKey: queryKeys.members.list(tenantId ?? "none", { all: true, ...options }),
    enabled: Boolean(tenantId) && (options.enabled ?? true),
    // forceRefresh bypasses the loader's own localStorage cache, which would
    // otherwise return stale rows after an invalidation and defeat the refetch.
    // Offline reads still work: axios falls back to the IndexedDB response cache.
    queryFn: (): Promise<TenantMember[]> =>
      loadAllTenantMembers(tenantId!, {
        status: options.status,
        pageSize: 200,
        forceRefresh: true,
      }),
  });
}

export function useMember(membershipId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.members.detail(tenantId, membershipId ?? "none"),
    async (tenantId): Promise<MemberDetail> =>
      unwrap(await tenantsApi.getMemberDetail(tenantId, membershipId!)).member,
    { enabled: Boolean(membershipId) },
  );
}

/**
 * When this member was covered by a paid term, and when they were not.
 *
 * Separate from `useMember` because it reads the whole payment history rather
 * than the ten rows the detail shows, and because a member with no gaps costs
 * a page nothing to render.
 */
export function useMembershipCoverage(membershipId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.members.coverage(tenantId, membershipId ?? "none"),
    async (tenantId) =>
      unwrap(await tenantsApi.getMembershipCoverage(tenantId, membershipId!)),
    { enabled: Boolean(membershipId) },
  );
}

/** The referral leaderboard, paged for infinite scroll. */
export function useReferralsInfinite(
  filters: { search?: string; order?: "asc" | "desc" } = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 20 } = options;
  return useTenantInfiniteQuery(
    (tenantId) => [
      ...queryKeys.members.list(tenantId, { referrals: true, ...filters }),
      "infinite",
      limit,
    ],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(
        await tenantsApi.listReferrals(
          tenantId,
          page,
          limit,
          filters.search,
          filters.order ?? "desc",
        ),
      );
      return { data: data.referrals, meta };
    },
    options,
  );
}

/**
 * The gym's member report.
 * Generated server-side on each call, so it is kept fresher than the default —
 * a stale finance report is worse than a brief spinner.
 */
export function useMemberReport(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => [...queryKeys.members.list(tenantId), "report"],
    async (tenantId) => unwrap(await tenantsApi.generateReport(tenantId)),
    { staleTime: 0, ...options },
  );
}

export function useMyProfile(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => [...queryKeys.members.list(tenantId), "me"],
    async (tenantId) => unwrap(await tenantsApi.getMyProfile(tenantId)).profile,
    options,
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUpdateMember() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { membershipId: string; data: UpdateMemberPayload }) =>
      unwrap(await tenantsApi.updateMember(id, vars.membershipId, vars.data)),
    { invalidates: [memberScope(tenantId)] },
  );
}

export function useUpdateMemberRole() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { membershipId: string; role: string }) =>
      unwrap(await tenantsApi.updateMemberRole(id, vars.membershipId, vars.role)),
    { invalidates: [memberScope(tenantId)] },
  );
}

export function useUpdateMemberStatus() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { membershipId: string; status: "ACTIVE" | "SUSPENDED" }) =>
      unwrap(await tenantsApi.updateMemberStatus(id, vars.membershipId, vars.status)),
    { invalidates: [memberScope(tenantId)] },
  );
}

export function useRemoveMember() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, membershipId: string) => {
      await tenantsApi.removeMember(id, membershipId);
    },
    { invalidates: [memberScope(tenantId)] },
  );
}

export function useUpdateMyProfile() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: UpdateProfilePayload) =>
      unwrap(await tenantsApi.updateMyProfile(id, payload)),
    { invalidates: [memberScope(tenantId)] },
  );
}
