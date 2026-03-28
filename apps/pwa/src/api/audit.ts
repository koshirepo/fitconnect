import { api } from "./client";
import type { AuditLog, PaginatedResponse } from "@/types/api";

export const auditApi = {
  platformLogs: (page = 1, limit = 50, entity?: string, action?: string) =>
    api.get<PaginatedResponse<{ logs: AuditLog[] }>>("/audit", {
      params: {
        page,
        limit,
        ...(entity ? { entity } : {}),
        ...(action ? { action } : {}),
      },
    }),

  tenantLogs: (tenantId: string, page = 1, limit = 50) =>
    api.get<PaginatedResponse<{ logs: AuditLog[] }>>(
      `/audit/tenant/${tenantId}`,
      { params: { page, limit } },
    ),
};
