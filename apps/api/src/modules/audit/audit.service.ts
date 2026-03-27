import type { AuditAction } from "../../shared/types/enums";
import { auditRepository } from "./audit.repository";

export const auditService = {
  async listPlatformLogs(
    page: number,
    limit: number,
    filters: { entity?: string; action?: string },
  ) {
    const { logs, total } = await auditRepository.listPlatformLogs(page, limit, {
      entity: filters.entity,
      action: filters.action as AuditAction | undefined,
    });
    return { data: { logs }, total };
  },

  async listTenantLogs(tenantId: string, page: number, limit: number) {
    const { logs, total } = await auditRepository.listTenantLogs(tenantId, page, limit);
    return { data: { logs }, total };
  },
};
