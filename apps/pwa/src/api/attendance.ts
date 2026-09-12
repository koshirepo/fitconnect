import { api } from "./client";
import type {
  AttendanceDevice,
  CreateAttendanceDevicePayload,
  UpdateAttendanceDevicePayload,
  AtRiskMember,
  AtRiskSummary,
  AttendanceHeatmap,
  AttendanceRecord,
  AttendanceSummary,
  MarkAttendancePayload,
  MarkAllAttendancePayload,
  PaginatedResponse,
  ApiResponse,
} from "@/types/api";

export type QrAttendanceMember = {
  id: string;
  memberId: number;
  name: string;
  avatarUrl?: string | null;
};

/**
 * The member a check-in was recorded against.
 *
 * Every way of marking attendance reports this now — self check-in, the QR
 * poster, a scanned card, a manual mark — so a screen can show who was checked
 * in, and flag a membership that is not ACTIVE, without caring which path the
 * check-in came through. The visit is recorded either way; the status is
 * information for the desk, not a refusal.
 */
export type CheckedInMember = {
  id: string;
  memberId: number;
  name: string;
  avatarUrl: string | null;
  status: string;
};

export const attendanceApi = {
  /** Self check-in */
  checkIn: (tenantId: string, data: MarkAttendancePayload = {}) =>
    api.post<ApiResponse<{ attendance: AttendanceRecord; member: CheckedInMember }>>(
      `/tenants/${tenantId}/attendance`,
      data,
    ),

  qrMembers: (tenantId: string, search?: string) =>
    api.get<
      ApiResponse<{
        tenant: { id: string; name: string; slug: string; logoUrl?: string | null };
        members: QrAttendanceMember[];
      }>
    >(`/tenants/${tenantId}/attendance/qr/members`, {
      params: search ? { search } : undefined,
    }),

  qrCheckIn: (tenantId: string, membershipId?: string) =>
    api.post<
      ApiResponse<{
        tenant: { id: string; name: string; slug: string; logoUrl?: string | null };
        attendance: AttendanceRecord;
        member: CheckedInMember;
        mode: "self" | "selected";
      }>
    >(`/tenants/${tenantId}/attendance/qr`, membershipId ? { membershipId } : {}),

  /** Admin/coach marks attendance for a specific member */
  markForMember: (tenantId: string, data: MarkAttendancePayload) =>
    api.post<ApiResponse<{ attendance: AttendanceRecord; member: CheckedInMember }>>(
      `/tenants/${tenantId}/attendance/mark`,
      data,
    ),

  /** Admin/coach marks attendance for multiple members */
  markAll: (tenantId: string, data: MarkAllAttendancePayload) =>
    api.post<ApiResponse<{ marked: number; total: number; failed: string[] }>>(
      `/tenants/${tenantId}/attendance/mark-all`,
      data,
    ),

  /** Remove attendance record */
  remove: (tenantId: string, membershipId: string, date: string) =>
    api.delete<ApiResponse<{ message: string }>>(
      `/tenants/${tenantId}/attendance/${membershipId}/${date}`,
    ),

  /** List attendance for a date */
  listByDate: (tenantId: string, date: string, page = 1, limit = 50) =>
    api.get<PaginatedResponse<{ attendance: AttendanceRecord[] }>>(
      `/tenants/${tenantId}/attendance`,
      { params: { date, page, limit } },
    ),

  /** List attendance history for a member */
  listByMember: (tenantId: string, membershipId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ attendance: AttendanceRecord[] }>>(
      `/tenants/${tenantId}/attendance/member/${membershipId}`,
      { params: { page, limit } },
    ),

  /** Summary for a member */
  summary: (tenantId: string, membershipId: string) =>
    api.get<ApiResponse<AttendanceSummary>>(
      `/tenants/${tenantId}/attendance/summary/${membershipId}`,
    ),

  /** Members who have stopped coming while still on an active membership */
  atRisk: (tenantId: string, days: number) =>
    api.get<ApiResponse<{ members: AtRiskMember[]; summary: AtRiskSummary }>>(
      `/tenants/${tenantId}/attendance/at-risk`,
      { params: { days } },
    ),

  /** Busy hours across a week, from self check-ins only */
  heatmap: (tenantId: string, weeks: number) =>
    api.get<ApiResponse<AttendanceHeatmap>>(`/tenants/${tenantId}/attendance/heatmap`, {
      params: { weeks },
    }),

  /** Calendar: daily counts for a month */
  calendarMonth: (tenantId: string, month: string) =>
    api.get<
      ApiResponse<{
        month: string;
        days: Record<
          string,
          {
            count: number;
            members: {
              id: string;
              memberId: number | null;
              name: string;
              avatarUrl: string | null;
              checkInAt: string;
              checkOutAt: string | null;
            }[];
          }
        >;
      }>
    >(`/tenants/${tenantId}/attendance/calendar`, { params: { month } }),

  /** Calendar: attendance dates for a single member in a month */
  memberCalendar: (tenantId: string, membershipId: string, month: string) =>
    api.get<ApiResponse<{ month: string; dates: string[]; total: number }>>(
      `/tenants/${tenantId}/attendance/member/${membershipId}/calendar`,
      { params: { month } },
    ),

  // ─── RFID attendance machines ─────────────────────────────────────────────

  listDevices: (tenantId: string) =>
    api.get<ApiResponse<{ devices: AttendanceDevice[] }>>(
      `/tenants/${tenantId}/attendance/devices`,
    ),

  createDevice: (tenantId: string, data: CreateAttendanceDevicePayload) =>
    api.post<ApiResponse<{ device: AttendanceDevice }>>(
      `/tenants/${tenantId}/attendance/devices`,
      data,
    ),

  updateDevice: (
    tenantId: string,
    deviceId: string,
    data: UpdateAttendanceDevicePayload,
  ) =>
    api.patch<ApiResponse<{ device: AttendanceDevice }>>(
      `/tenants/${tenantId}/attendance/devices/${deviceId}`,
      data,
    ),

  deleteDevice: (tenantId: string, deviceId: string) =>
    api.delete<ApiResponse<{ deleted: boolean }>>(
      `/tenants/${tenantId}/attendance/devices/${deviceId}`,
    ),

  /** Map a member to the PIN their card is enrolled under on the machine. */
  assignCard: (
    tenantId: string,
    membershipId: string,
    data: { deviceUserPin?: number | null; rfidCardNumber?: string | null },
  ) =>
    api.put<
      ApiResponse<{
        membership: {
          id: string;
          memberId: number;
          deviceUserPin: number | null;
          rfidCardNumber: string | null;
        };
      }>
    >(`/tenants/${tenantId}/attendance/cards/${membershipId}`, data),
};
