import { api } from "./client";
import type {
  Shift,
  CreateShiftPayload,
  UpdateShiftPayload,
  ApiResponse,
  PaginatedResponse,
  MessageResponse,
} from "@/types/api";

export const shiftsApi = {
  list: (
    tenantId: string,
    page = 1,
    limit = 100,
    includeInactive = false,
  ) =>
    api.get<PaginatedResponse<{ shifts: Shift[] }>>(`/tenants/${tenantId}/shifts`, {
      params: {
        page,
        limit,
        ...(includeInactive ? { includeInactive: true } : {}),
      },
    }),

  create: (tenantId: string, data: CreateShiftPayload) =>
    api.post<ApiResponse<{ shift: Shift }>>(`/tenants/${tenantId}/shifts`, data),

  update: (tenantId: string, shiftId: string, data: UpdateShiftPayload) =>
    api.patch<ApiResponse<{ shift: Shift }>>(`/tenants/${tenantId}/shifts/${shiftId}`, data),

  remove: (tenantId: string, shiftId: string) =>
    api.delete<MessageResponse>(`/tenants/${tenantId}/shifts/${shiftId}`),
};
