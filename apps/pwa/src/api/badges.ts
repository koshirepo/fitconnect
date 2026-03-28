import { api } from "./client";
import type {
  Badge,
  CreateBadgePayload,
  UpdateBadgePayload,
  AssignBadgePayload,
  PaginatedResponse,
  ApiResponse,
} from "@/types/api";

export const badgesApi = {
  // ─── Badge CRUD ─────────────────────────────────────────────────────────────

  list: (tenantId: string, page = 1, limit = 20, includeInactive = false) =>
    api.get<PaginatedResponse<Badge[]>>(`/tenants/${tenantId}/badges`, {
      params: { page, limit, includeInactive },
    }),

  getById: (tenantId: string, badgeId: string) =>
    api.get<ApiResponse<{ badge: Badge }>>(`/tenants/${tenantId}/badges/${badgeId}`),

  create: (tenantId: string, data: CreateBadgePayload) =>
    api.post<ApiResponse<{ badge: Badge }>>(`/tenants/${tenantId}/badges`, data),

  update: (tenantId: string, badgeId: string, data: UpdateBadgePayload) =>
    api.patch<ApiResponse<{ badge: Badge }>>(`/tenants/${tenantId}/badges/${badgeId}`, data),

  delete: (tenantId: string, badgeId: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/tenants/${tenantId}/badges/${badgeId}`),

  // ─── Assignments ────────────────────────────────────────────────────────────

  listAssignments: (tenantId: string, badgeId: string) =>
    api.get<
      ApiResponse<{
        assignments: {
          id: string;
          membership?: { id: string; name: string; email: string };
        }[];
      }>
    >(`/tenants/${tenantId}/badges/${badgeId}/assignments`),

  assign: (tenantId: string, badgeId: string, data: AssignBadgePayload) =>
    api.post<ApiResponse<{ badge: Badge; membership: any }>>(
      `/tenants/${tenantId}/badges/${badgeId}/assign`,
      data,
    ),

  unassign: (tenantId: string, badgeId: string, membershipId: string) =>
    api.delete<ApiResponse<{ message: string }>>(
      `/tenants/${tenantId}/badges/${badgeId}/assign/${membershipId}`,
    ),

  // ─── Member Badges ──────────────────────────────────────────────────────────

  memberBadges: (tenantId: string, membershipId: string) =>
    api.get<ApiResponse<{ badges: Badge[] }>>(
      `/tenants/${tenantId}/members/${membershipId}/badges`,
    ),
};
