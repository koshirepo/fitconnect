/**
 * Documentation: Diet plan API client.
 *
 * - A gym's diet plans, on the same paths and shapes as workout plans: list, read, write, assign, and — which workouts lack — take an assignment back.
 * - Primary exports: dietPlansApi.
 */
import { api } from "./client";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import type {
  CreateDietPlanPayload,
  DietPlan,
  UpdateDietPlanPayload,
} from "@fitconnect/shared/types/models";

export const dietPlansApi = {
  list: (tenantId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ plans: DietPlan[] }>>(`/tenants/${tenantId}/diet-plans`, {
      params: { page, limit },
    }),

  getById: (tenantId: string, planId: string) =>
    api.get<ApiResponse<{ plan: DietPlan }>>(`/tenants/${tenantId}/diet-plans/${planId}`),

  create: (tenantId: string, data: CreateDietPlanPayload) =>
    api.post<ApiResponse<{ plan: DietPlan }>>(`/tenants/${tenantId}/diet-plans`, data),

  update: (tenantId: string, planId: string, data: UpdateDietPlanPayload) =>
    api.patch<ApiResponse<{ plan: DietPlan }>>(`/tenants/${tenantId}/diet-plans/${planId}`, data),

  delete: (tenantId: string, planId: string) =>
    api.delete(`/tenants/${tenantId}/diet-plans/${planId}`),

  assign: (tenantId: string, planId: string, membershipId: string) =>
    api.post(`/tenants/${tenantId}/diet-plans/${planId}/assign`, { membershipId }),

  unassign: (tenantId: string, planId: string, membershipId: string) =>
    api.delete(`/tenants/${tenantId}/diet-plans/${planId}/assignments/${membershipId}`),
};
