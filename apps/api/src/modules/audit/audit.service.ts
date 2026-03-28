/**
 * Documentation: Audit service.
 *
 * - Implements the business rules for audit log querying for privileged users by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: auditService.
 */
import type { AuditAction } from "../../shared/types/enums";
import { auditRepository } from "./audit.repository";

export const auditService = {
  /**
   * Execute the `list platform logs` workflow for the audit module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
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

  /**
   * Execute the `list tenant logs` workflow for the audit module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listTenantLogs(tenantId: string, page: number, limit: number) {
    const { logs, total } = await auditRepository.listTenantLogs(tenantId, page, limit);
    return { data: { logs }, total };
  },
};
