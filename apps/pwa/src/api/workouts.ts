import { api } from "./client";
import type {
  WorkoutPlan,
  CreateWorkoutPlanPayload,
  UpdateWorkoutPlanPayload,
  PaginatedResponse,
  ApiResponse,
} from "@/types/api";

export const workoutsApi = {
  list: (tenantId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ plans: WorkoutPlan[] }>>(`/tenants/${tenantId}/workout-plans`, {
      params: { page, limit },
    }),

  getById: (tenantId: string, planId: string) =>
    api.get<ApiResponse<{ plan: WorkoutPlan }>>(`/tenants/${tenantId}/workout-plans/${planId}`),

  create: (tenantId: string, data: CreateWorkoutPlanPayload) =>
    api.post<ApiResponse<{ plan: WorkoutPlan }>>(`/tenants/${tenantId}/workout-plans`, data),

  update: (tenantId: string, planId: string, data: UpdateWorkoutPlanPayload) =>
    api.patch<ApiResponse<{ plan: WorkoutPlan }>>(
      `/tenants/${tenantId}/workout-plans/${planId}`,
      data,
    ),

  delete: (tenantId: string, planId: string) =>
    api.delete(`/tenants/${tenantId}/workout-plans/${planId}`),

  assign: (tenantId: string, planId: string, membershipId: string) =>
    api.post(`/tenants/${tenantId}/workout-plans/${planId}/assign`, {
      membershipId,
    }),
};
