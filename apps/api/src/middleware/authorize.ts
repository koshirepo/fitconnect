/**
 * Documentation: Role-authorization middleware.
 *
 * - Builds middleware for platform-role and tenant-role checks after authentication has populated the request context.
 * - Keep role gating here so route files stay declarative and authorization errors remain consistent.
 * - Primary exports: requirePlatformRoles, requireTenantRoles.
 */
import { PlatformRole, type TenantRole } from "../shared/types/enums";
import { badRequest, forbidden } from "../lib/response";
import { createMiddleware } from "hono/factory";
import { prisma } from "../lib/prisma";
import type { AppBindings } from "../types/app-context";

function isTenantPlatformExpired(platformExpiresAt?: Date | null) {
  return Boolean(platformExpiresAt) && platformExpiresAt!.getTime() < Date.now();
}

/**
 * Build or execute the `require platform roles` middleware step for the middleware layer.
 * Keep cross-cutting authentication and authorization checks centralized here so routes stay declarative.
 */
export const requirePlatformRoles = (allowedRoles: PlatformRole[]) => {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("authUser");

    if (!allowedRoles.includes(user.platformRole)) {
      return forbidden(c, "Insufficient platform permissions.");
    }

    await next();
  });
};

/**
 * Tenant role check — reads membership from JWT claims (no DB query).
 */
export const requireTenantRoles = (allowedRoles: TenantRole[]) => {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("authUser");
    const tenantId = c.req.param("tenantId") || c.req.header("x-tenant-id");

    if (!tenantId) {
      return badRequest(c, "Missing tenant context.");
    }

    if (
      user.platformRole === PlatformRole.SUPER_ADMIN ||
      user.platformRole === PlatformRole.SUPPORT
    ) {
      c.set("tenantAccess", null);
      await next();
      return;
    }

    const role = user.tenants?.[tenantId] as TenantRole | undefined;

    if (!role) {
      return forbidden(c, "You are not a member of this tenant.");
    }

    if (!allowedRoles.includes(role)) {
      return forbidden(c, "Insufficient tenant permissions.");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { platformExpiresAt: true },
    });

    if (isTenantPlatformExpired(tenant?.platformExpiresAt)) {
      return forbidden(c, "Platform access is expired. Renew access to continue using the platform.");
    }

    c.set("tenantAccess", { tenantId, role });
    await next();
  });
};
