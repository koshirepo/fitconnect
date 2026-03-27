import { PlatformRole, type TenantRole } from "../shared/types/enums";
import { badRequest, forbidden } from "../lib/response";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types/app-context";

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

    c.set("tenantAccess", { tenantId, role });
    await next();
  });
};
