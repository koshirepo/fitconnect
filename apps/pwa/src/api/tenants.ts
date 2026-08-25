import { api } from "./client";
import type {
  Tenant,
  CreateTenantPayload,
  UpdateTenantPayload,
  TenantMember,
  AddMemberPayload,
  TenantProfile,
  UpdateProfilePayload,
  UpdateMemberPayload,
  MemberDetail,
  MemberReferralLeader,
  PlatformPayment,
  RecordPlatformPaymentPayload,
  PaginatedResponse,
  ApiResponse,
} from "@/types/api";

export const tenantsApi = {
  // ─── Tenant CRUD ────────────────────────────────────────────────────────────

  list: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ tenants: Tenant[] }>>("/tenants", {
      params: { page, limit },
    }),

  get: (tenantId: string) => api.get<ApiResponse<{ tenant: Tenant }>>(`/tenants/${tenantId}`),

  create: (data: CreateTenantPayload) =>
    api.post<ApiResponse<{ tenant: Tenant; generatedPassword?: string }>>("/tenants", data),

  update: (tenantId: string, data: UpdateTenantPayload) =>
    api.patch<ApiResponse<{ tenant: Tenant }>>(`/tenants/${tenantId}`, data),

  updateStatus: (tenantId: string, status: "ACTIVE" | "SUSPENDED") =>
    api.patch<ApiResponse<{ tenant: Tenant }>>(`/tenants/${tenantId}/status`, {
      status,
    }),

  // ─── Members ────────────────────────────────────────────────────────────────

  listMembers: (
    tenantId: string,
    page = 1,
    limit = 20,
    role?: string,
    search?: string,
    status?: string,
    badge?: string,
  ) =>
    api.get<PaginatedResponse<{ members: TenantMember[] }>>(`/tenants/${tenantId}/members`, {
      params: {
        page,
        limit,
        ...(role ? { role } : {}),
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(badge ? { badge } : {}),
      },
    }),

  listReferrals: (
    tenantId: string,
    page = 1,
    limit = 20,
    search?: string,
    order: "asc" | "desc" = "desc",
  ) =>
    api.get<PaginatedResponse<{ referrals: MemberReferralLeader[] }>>(
      `/tenants/${tenantId}/members/referrals`,
      {
        params: {
          page,
          limit,
          ...(search ? { search } : {}),
          order,
        },
      },
    ),

  addMember: (tenantId: string, data: AddMemberPayload) =>
    api.post<
      ApiResponse<{
        membership: TenantMember;
        payments?: unknown[];
        generatedPassword?: string;
        emailSent?: boolean;
        whatsappText?: string;
      }>
    >(`/tenants/${tenantId}/members`, data),

  updateMemberRole: (tenantId: string, membershipId: string, role: string) =>
    api.patch<ApiResponse<{ membership: TenantMember }>>(
      `/tenants/${tenantId}/members/${membershipId}/role`,
      { role },
    ),

  removeMember: (tenantId: string, membershipId: string) =>
    api.delete(`/tenants/${tenantId}/members/${membershipId}`),

  getMemberDetail: (tenantId: string, membershipId: string) =>
    api.get<ApiResponse<{ member: MemberDetail }>>(`/tenants/${tenantId}/members/${membershipId}`),

  updateMember: (tenantId: string, membershipId: string, data: UpdateMemberPayload) =>
    api.patch<ApiResponse<{ member: MemberDetail }>>(
      `/tenants/${tenantId}/members/${membershipId}`,
      data,
    ),

  updateMemberStatus: (tenantId: string, membershipId: string, status: "ACTIVE" | "SUSPENDED") =>
    api.patch<ApiResponse<{ membership: { id: string; status: string } }>>(
      `/tenants/${tenantId}/members/${membershipId}/status`,
      { status },
    ),

  resetMemberPassword: (tenantId: string, membershipId: string) =>
    api.post<ApiResponse<{ generatedPassword: string }>>(
      `/tenants/${tenantId}/members/${membershipId}/reset-password`,
    ),

  // ─── Profile ────────────────────────────────────────────────────────────────

  generateReport: (tenantId: string) =>
    api.post<
      ApiResponse<{
        members: {
          total: number;
          active: number;
          suspended: number;
          joinedToday: number;
          joinedWeek: number;
          joinedMonth: number;
        };
        finances: {
          revenueMonth: number;
          revenueToday: number;
          completedMonth: number;
          completedToday: number;
          pendingMonth: number;
          pendingToday: number;
        };
        overdue: {
          allowedDays: number;
          found: number;
          suspended: { id: string; memberId: number; name: string }[];
        };
      }>
    >(`/tenants/${tenantId}/members/report`),

  getMyProfile: (tenantId: string) =>
    api.get<ApiResponse<{ profile: TenantProfile }>>(`/tenants/${tenantId}/me`),

  updateMyProfile: (tenantId: string, data: UpdateProfilePayload) =>
    api.patch(`/tenants/${tenantId}/me`, data),

  // ─── Platform Payments ──────────────────────────────────────────────────────

  recordPlatformPayment: (tenantId: string, data: RecordPlatformPaymentPayload) =>
    api.post<ApiResponse<{ payment: PlatformPayment }>>(
      `/tenants/${tenantId}/platform-payments`,
      data,
    ),

  listPlatformPayments: (tenantId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ payments: PlatformPayment[] }>>(
      `/tenants/${tenantId}/platform-payments`,
      {
        params: { page, limit },
      },
    ),
};
