import { prisma } from "../../lib/prisma";
import type { AuditAction } from "../../shared/types/enums";

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
