/**
 * Documentation: Occupation list endpoints.
 *
 * - The platform-wide list of what members do for a living: read by every member form, written only by platform staff.
 * - Not tenant-scoped, so these paths carry no gym id.
 * - Primary exports: occupationsApi.
 */
import { api } from "./client";
import type {
  ApiResponse,
  CreateOccupationPayload,
  MessageResponse,
  Occupation,
  UpdateOccupationPayload,
} from "@/types/api";

export const occupationsApi = {
  /**
   * `includeInactive` is for the manage screen; every picker wants the default,
   * which is what is still being offered.
   * `withCounts` adds how many accounts hold each row.
   */
  list: (options: { includeInactive?: boolean; withCounts?: boolean } = {}) =>
    api.get<ApiResponse<{ occupations: Occupation[] }>>("/occupations", {
      params: {
        ...(options.includeInactive ? { includeInactive: true } : {}),
        ...(options.withCounts ? { withCounts: true } : {}),
      },
    }),

  create: (data: CreateOccupationPayload) =>
    api.post<ApiResponse<{ occupation: Occupation }>>("/occupations", data),

  update: (occupationId: string, data: UpdateOccupationPayload) =>
    api.patch<ApiResponse<{ occupation: Occupation }>>(`/occupations/${occupationId}`, data),

  remove: (occupationId: string) => api.delete<MessageResponse>(`/occupations/${occupationId}`),
};
