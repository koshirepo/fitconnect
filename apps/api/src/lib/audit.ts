import type { AuditAction } from "../shared/types/enums";
import type { InputJsonValue } from "../generated/prisma/internal/prismaNamespace";
import { prisma } from "./prisma";

type AuditInput = {
  action: AuditAction;
  entity: string;
  entityId?: string;
  actorId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
};


/**
 * Write an entry to the audit log.
 *
 * Fire-and-forget by default — errors are logged but never thrown so
 * they don't break the request that triggered the audit event.
 */
export const auditLog = async (input: AuditInput): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        actorId: input.actorId,
        tenantId: input.tenantId,
        metadata: input.metadata as InputJsonValue ?? undefined,
        ipAddress: input.ip,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
};
