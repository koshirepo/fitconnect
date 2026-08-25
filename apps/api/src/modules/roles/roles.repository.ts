/**
 * Documentation: Role permission repository.
 *
 * - Encapsulates Prisma access to `RolePermissionOverride`, including the ordered read used on every authorized request and the write path used by the role-management screens.
 * - Keep raw database concerns here so the service layer can reason about policy without duplicating query details.
 * - Primary exports: rolePermissionRepository.
 */
import { prisma } from "../../lib/prisma";
import type { PermissionScope, RolePermissionOverride } from "@fitconnect/shared/types/permissions";

type OverrideRow = {
  scope: string;
  role: string;
  permission: string;
  allowed: boolean;
  tenantId: string | null;
};

function toOverride(row: OverrideRow): RolePermissionOverride {
  return {
    scope: row.scope as PermissionScope,
    role: row.role,
    permission: row.permission,
    allowed: row.allowed,
  };
}

export const rolePermissionRepository = {
  /**
   * Override rows that apply to a request, ordered so gym-specific rows are
   * applied after the platform-wide defaults they refine.
   */
  async listApplicableOverrides(tenantId: string | null): Promise<RolePermissionOverride[]> {
    const rows = (await prisma.rolePermissionOverride.findMany({
      where: tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId: null },
      select: { scope: true, role: true, permission: true, allowed: true, tenantId: true },
      // Nulls sort first in SQLite, so platform-wide defaults come before the
      // gym-specific rows that override them.
      orderBy: [{ tenantId: "asc" }, { permission: "asc" }],
    })) as OverrideRow[];

    return rows.map(toOverride);
  },

  /** Every override stored for one scope container (a gym, or the platform). */
  async listForScope(tenantId: string | null): Promise<RolePermissionOverride[]> {
    const rows = (await prisma.rolePermissionOverride.findMany({
      where: { tenantId: tenantId ?? null },
      select: { scope: true, role: true, permission: true, allowed: true, tenantId: true },
    })) as OverrideRow[];

    return rows.map(toOverride);
  },

  /**
   * Replace the stored overrides for one role.
   * SQLite treats NULLs as distinct in unique indexes, so platform-wide rows
   * cannot use `upsert` — the whole role is rewritten instead, which also keeps
   * the table free of rows that match the baseline.
   */
  async replaceRoleOverrides(input: {
    tenantId: string | null;
    scope: PermissionScope;
    role: string;
    overrides: { permission: string; allowed: boolean }[];
    updatedBy?: string;
  }) {
    await prisma.rolePermissionOverride.deleteMany({
      where: { tenantId: input.tenantId ?? null, scope: input.scope, role: input.role },
    });

    if (input.overrides.length === 0) return;

    await prisma.rolePermissionOverride.createMany({
      data: input.overrides.map((override) => ({
        tenantId: input.tenantId ?? null,
        scope: input.scope,
        role: input.role,
        permission: override.permission,
        allowed: override.allowed,
        updatedBy: input.updatedBy ?? null,
        updatedAt: new Date(),
      })),
    });
  },

  /** Drop every override for a role, returning it to the catalog baseline. */
  async resetRole(input: { tenantId: string | null; scope: PermissionScope; role: string }) {
    await prisma.rolePermissionOverride.deleteMany({
      where: { tenantId: input.tenantId ?? null, scope: input.scope, role: input.role },
    });
  },
};
