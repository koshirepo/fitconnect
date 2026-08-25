/**
 * Documentation: Audit repository.
 *
 * - Encapsulates Prisma queries for audit log querying for privileged users, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: auditRepository.
 */
import { prisma } from "../../lib/prisma";
import type { AuditAction } from "@fitconnect/shared/types/enums";

const auditLogSelect = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  actorId: true,
  tenantId: true,
  metadata: true,
  ipAddress: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true } },
} as const;

const tenantAuditLogSelect = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  actorId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true } },
} as const;

export const auditRepository = {
  /**
   * Run the `list platform logs` persistence operation for the audit module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listPlatformLogs(
    page: number,
    limit: number,
    filters: { entity?: string; action?: AuditAction },
  ) {
    const where: Record<string, unknown> = {};
    if (filters.entity) where.entity = filters.entity;
    if (filters.action) where.action = filters.action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: auditLogSelect,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  },

  /**
   * Run the `list tenant logs` persistence operation for the audit module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listTenantLogs(tenantId: string, page: number, limit: number) {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: tenantAuditLogSelect,
      }),
      prisma.auditLog.count({ where: { tenantId } }),
    ]);

    return { logs, total };
  },
};
