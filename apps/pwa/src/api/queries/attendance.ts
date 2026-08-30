/**
 * Documentation: Attendance query hooks.
 *
 * - Wraps `attendanceApi` for the day list, per-member history, and the month calendars.
 * - Marking attendance invalidates the whole attendance prefix for the gym rather than one date, because a check-in affects the day list, the member's history, and both calendars at once.
 * - Primary exports: useAttendanceByDate, useMemberAttendance, useAttendanceCalendar, useMemberAttendanceCalendar, and the marking mutations.
 */
import { keepPreviousData } from "@tanstack/react-query";
import { attendanceApi } from "@/api/attendance";
import { queryKeys } from "@/lib/query-keys";
import type { MarkAllAttendancePayload, MarkAttendancePayload } from "@/types/api";
import {
  unwrap,
  unwrapPaginated,
  useCurrentTenantId,
  useTenantInfiniteQuery,
  useTenantMutation,
  useTenantQuery,
} from "./shared";

function attendanceScope(tenantId: string | null) {
  return ["attendance", tenantId ?? "none"];
}

export function useAttendanceByDate(
  date: string,
  options: { page?: number; limit?: number; enabled?: boolean } = {},
) {
  const { page = 1, limit = 50, enabled } = options;
  return useTenantQuery(
    (tenantId) => [...queryKeys.attendance.byDate(tenantId, date), page, limit],
    async (tenantId) => unwrapPaginated(await attendanceApi.listByDate(tenantId, date, page, limit)),
    { enabled, placeholderData: keepPreviousData },
  );
}

/** A day's check-ins, paged for infinite scroll. */
export function useAttendanceByDateInfinite(
  date: string,
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 50 } = options;
  return useTenantInfiniteQuery(
    (tenantId) => [...queryKeys.attendance.byDate(tenantId, date), "infinite", limit],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(
        await attendanceApi.listByDate(tenantId, date, page, limit),
      );
      return { data: data.attendance, meta };
    },
    options,
  );
}

/** One member's history, paged for infinite scroll. */
export function useMemberAttendanceInfinite(
  membershipId: string | undefined,
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 20, enabled = true } = options;
  return useTenantInfiniteQuery(
    (tenantId) => [
      ...queryKeys.attendance.member(tenantId, membershipId ?? "none"),
      "infinite",
      limit,
    ],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(
        await attendanceApi.listByMember(tenantId, membershipId!, page, limit),
      );
      return { data: data.attendance, meta };
    },
    { enabled: enabled && Boolean(membershipId) },
  );
}

export function useMemberAttendance(
  membershipId: string | undefined,
  options: { page?: number; limit?: number; enabled?: boolean } = {},
) {
  const { page = 1, limit = 20, enabled = true } = options;
  return useTenantQuery(
    (tenantId) => [...queryKeys.attendance.member(tenantId, membershipId ?? "none"), page, limit],
    async (tenantId) =>
      unwrapPaginated(await attendanceApi.listByMember(tenantId, membershipId!, page, limit)),
    { enabled: enabled && Boolean(membershipId), placeholderData: keepPreviousData },
  );
}

export function useAttendanceCalendar(month: string, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.attendance.calendar(tenantId, month),
    async (tenantId) => unwrap(await attendanceApi.calendarMonth(tenantId, month)),
    options,
  );
}

export function useMemberAttendanceCalendar(
  membershipId: string | undefined,
  month: string,
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => [
      ...queryKeys.attendance.member(tenantId, membershipId ?? "none"),
      "calendar",
      month,
    ],
    async (tenantId) => unwrap(await attendanceApi.memberCalendar(tenantId, membershipId!, month)),
    { enabled: (options.enabled ?? true) && Boolean(membershipId) },
  );
}

export function useAttendanceSummary(
  membershipId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => [...queryKeys.attendance.member(tenantId, membershipId ?? "none"), "summary"],
    async (tenantId) => unwrap(await attendanceApi.summary(tenantId, membershipId!)),
    { enabled: (options.enabled ?? true) && Boolean(membershipId) },
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useSelfCheckIn() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: MarkAttendancePayload = {}) => unwrap(await attendanceApi.checkIn(id, payload)),
    { invalidates: [attendanceScope(tenantId)] },
  );
}

/** Checking somebody in from a scanned card. */
export function useScanCheckIn() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, code: string) => unwrap(await attendanceApi.scan(id, code)),
    { invalidates: [["attendance", tenantId ?? "none"]] },
  );
}

export function useMarkAttendance() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: MarkAttendancePayload) => unwrap(await attendanceApi.markForMember(id, payload)),
    { invalidates: [attendanceScope(tenantId)] },
  );
}

export function useMarkAllAttendance() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: MarkAllAttendancePayload) => unwrap(await attendanceApi.markAll(id, payload)),
    { invalidates: [attendanceScope(tenantId)] },
  );
}

export function useRemoveAttendance() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { membershipId: string; date: string }) => {
      await attendanceApi.remove(id, vars.membershipId, vars.date);
    },
    { invalidates: [attendanceScope(tenantId)] },
  );
}
