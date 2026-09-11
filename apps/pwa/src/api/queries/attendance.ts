/**
 * Documentation: Attendance query hooks.
 *
 * - Wraps `attendanceApi` for the day list, per-member history, and the month calendars.
 * - Marking attendance invalidates the whole attendance prefix for the gym rather than one date, because a check-in affects the day list, the member's history, and both calendars at once.
 * - Primary exports: useAttendanceCalendar, useMemberAttendanceCalendar, and the marking mutations.
 */
import { attendanceApi } from "@/api/attendance";
import { queryKeys } from "@/lib/query-keys";
import type {
  CreateAttendanceDevicePayload,
  MarkAllAttendancePayload,
  MarkAttendancePayload,
  UpdateAttendanceDevicePayload,
} from "@/types/api";
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

export function useAttendanceCalendar(month: string, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.attendance.calendar(tenantId, month),
    async (tenantId) => unwrap(await attendanceApi.calendarMonth(tenantId, month)),
    options,
  );
}

/**
 * Members who have stopped coming, at the chosen absence threshold.
 *
 * Kept a little stale on purpose: absence changes at most once a day, and the
 * list is worked down over a morning rather than watched, so refetching it on
 * every window focus would only cost the gym's largest table a scan.
 */
export function useAtRiskMembers(days: number, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.attendance.atRisk(tenantId, days),
    async (tenantId) => unwrap(await attendanceApi.atRisk(tenantId, days)),
    { staleTime: 5 * 60_000, ...options },
  );
}

/**
 * Busy hours across the week.
 *
 * Held stale for longer than the at-risk list: it averages weeks of visits, so
 * one more check-in cannot move it enough to be worth refetching for.
 */
export function useAttendanceHeatmap(weeks: number, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.attendance.heatmap(tenantId, weeks),
    async (tenantId) => unwrap(await attendanceApi.heatmap(tenantId, weeks)),
    { staleTime: 15 * 60_000, ...options },
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

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useSelfCheckIn() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: MarkAttendancePayload = {}) => unwrap(await attendanceApi.checkIn(id, payload)),
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


// ─── RFID attendance machines ────────────────────────────────────────────────

function deviceScope(tenantId: string | null) {
  return [...attendanceScope(tenantId), "devices"];
}

export function useAttendanceDevices(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => deviceScope(tenantId),
    async (tenantId) => unwrap(await attendanceApi.listDevices(tenantId)).devices,
    {
      // These report in on their own schedule, so a list left open should keep
      // up rather than showing a device as offline long after it came back.
      refetchInterval: 60_000,
      ...options,
    },
  );
}

export function useCreateAttendanceDevice() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateAttendanceDevicePayload) =>
      unwrap(await attendanceApi.createDevice(id, payload)),
    { invalidates: [deviceScope(tenantId)] },
  );
}

export function useUpdateAttendanceDevice() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { deviceId: string; data: UpdateAttendanceDevicePayload }) =>
      unwrap(await attendanceApi.updateDevice(id, vars.deviceId, vars.data)),
    { invalidates: [deviceScope(tenantId)] },
  );
}

export function useDeleteAttendanceDevice() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, deviceId: string) =>
      unwrap(await attendanceApi.deleteDevice(id, deviceId)),
    { invalidates: [deviceScope(tenantId)] },
  );
}


/**
 * Give a member the card the readers will recognise them by.
 *
 * Invalidates members as well as devices: the card is shown on the member
 * record, and assigning one queues an enrolment to every reader.
 */
export function useAssignMemberCard() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      id,
      vars: {
        membershipId: string;
        deviceUserPin?: number | null;
        rfidCardNumber?: string | null;
      },
    ) =>
      unwrap(
        await attendanceApi.assignCard(id, vars.membershipId, {
          deviceUserPin: vars.deviceUserPin,
          rfidCardNumber: vars.rfidCardNumber,
        }),
      ),
    { invalidates: [deviceScope(tenantId), ["members", tenantId ?? "none"]] },
  );
}
