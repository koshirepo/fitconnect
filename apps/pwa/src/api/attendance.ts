import { api } from "./client";
import type {
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

export const attendanceApi = {
  /** Self check-in */
  checkIn: (tenantId: string, data: MarkAttendancePayload = {}) =>
    api.post<ApiResponse<{ attendance: AttendanceRecord }>>(
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
        mode: "self" | "selected";
      }>
    >(`/tenants/${tenantId}/attendance/qr`, membershipId ? { membershipId } : {}),

  /**
   * Check somebody in from their scanned ID card.
   *
   * The whole scanned value is sent, not a parsed token: the card encodes a
   * url, and deciding what part of it matters is the server's job.
   */
  scan: (tenantId: string, code: string) =>
    api.post<
      ApiResponse<{
        attendance: AttendanceRecord;
        member: {
          id: string;
          memberId: number;
          name: string;
          avatarUrl: string | null;
          status: string;
        };
      }>
    >(`/tenants/${tenantId}/attendance/scan`, { code }),

  /** Admin/coach marks attendance for a specific member */
  markForMember: (tenantId: string, data: MarkAttendancePayload) =>
    api.post<ApiResponse<{ attendance: AttendanceRecord }>>(
      `/tenants/${tenantId}/attendance/mark`,
      data,
    ),

  /** Admin/coach marks attendance for multiple members */
  markAll: (tenantId: string, data: MarkAllAttendancePayload) =>
    api.post<ApiResponse<{ marked: number; total: number }>>(
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

  /** Calendar: daily counts for a month */
  calendarMonth: (tenantId: string, month: string) =>
    api.get<
      ApiResponse<{
        month: string;
        days: Record<
          string,
          { count: number; members: { id: string; memberId: number | null; name: string }[] }
        >;
      }>
    >(`/tenants/${tenantId}/attendance/calendar`, { params: { month } }),

  /** Calendar: attendance dates for a single member in a month */
  memberCalendar: (tenantId: string, membershipId: string, month: string) =>
    api.get<ApiResponse<{ month: string; dates: string[]; total: number }>>(
      `/tenants/${tenantId}/attendance/member/${membershipId}/calendar`,
      { params: { month } },
    ),
};
