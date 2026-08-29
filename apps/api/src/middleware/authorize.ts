/**
 * Documentation: Permission-authorization middleware.
 *
 * - Builds middleware that resolves an actor's effective permission set (platform-role grants unioned with tenant-role grants, plus any stored overrides) and gates routes on named capabilities instead of role strings.
 * - Keep authorization wiring here so route files stay declarative and authorization errors remain consistent.
 * - Primary exports: requirePermissions, requireAnyPermission, requireTenantPermissions, requireAnyTenantPermission, resolveTenantPermissions, requirePlatformRoles, requireTenantRoles.
 */
import { PlatformRole, type TenantRole } from "@fitconnect/shared/types/enums";
import {
  type Permission,
  isPlatformStaffRole,
  resolveEffectivePermissions,
} from "@fitconnect/shared/types/permissions";
import { badRequest, forbidden } from "../lib/response";
import { createMiddleware } from "hono/factory";
import { prisma } from "../lib/prisma";
import { rolePermissionRepository } from "../modules/roles/roles.repository";
import { cached } from "../lib/request-cache";
import type { AppBindings } from "../types/app-context";

type PermissionMode = "all" | "any";

type AuthorizeOptions = {
  /** "all" (default) requires every listed permission; "any" requires at least one. */
  mode?: PermissionMode;
  /**
   * Tenant-scoped routes resolve the caller's membership role, verify tenant
   * platform access, and publish `tenantAccess`. Account/platform routes skip that.
   */
  scope?: "tenant" | "global";
};

function isTenantPlatformExpired(platformExpiresAt?: Date | null) {
  return Boolean(platformExpiresAt) && platformExpiresAt!.getTime() < Date.now();
}

function describeMissing(permissions: readonly Permission[], mode: PermissionMode) {
  return mode === "any"
    ? `Requires one of: ${permissions.join(", ")}.`
    : `Requires: ${permissions.join(", ")}.`;
}

/**
 * Core authorization step shared by every permission middleware in this file.
 * Resolves the effective permission set once per request and stores it on the
 * context so controllers can make finer-grained decisions without re-deriving it.
 */
function authorize(required: readonly Permission[], options: AuthorizeOptions = {}) {
  const mode: PermissionMode = options.mode ?? "all";
  const scope = options.scope ?? "global";

  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("authUser");
    let tenantRole: TenantRole | null = null;
    let tenantId: string | null = null;

    if (scope === "tenant") {
      tenantId = c.req.param("tenantId") || c.req.header("x-tenant-id") || null;

      if (!tenantId) {
        return badRequest(c, "Missing tenant context.");
      }

      const membershipRole = user.tenants?.[tenantId] as TenantRole | undefined;
      const platformStaff = isPlatformStaffRole(user.platformRole);

      if (!membershipRole && !platformStaff) {
        return forbidden(c, "You are not a member of this tenant.");
      }

      tenantRole = membershipRole ?? null;

      c.set("tenantAccess", membershipRole ? { tenantId, role: membershipRole } : null);
    }

    // Two reads that used to run one after the other on every single
    // tenant-scoped request. They are independent, so they go together, and
    // both are cached briefly — neither the gym's expiry date nor its role
    // overrides change between two requests a second apart.
    const [tenantExpiry, overrides] = await Promise.all([
      scope === "tenant" && tenantRole
        ? cached(`tenant-expiry:${tenantId}`, async () => {
            const tenant = await prisma.tenant.findUnique({
              where: { id: tenantId! },
              select: { platformExpiresAt: true },
            });
            return tenant?.platformExpiresAt ?? null;
          })
        : Promise.resolve(null),
      cached(`role-overrides:${tenantId ?? "platform"}`, () =>
        rolePermissionRepository.listApplicableOverrides(tenantId),
      ),
    ]);

    // Tenant members lose access when the gym's platform subscription lapses.
    // Platform staff keep access so they can service an expired tenant.
    if (isTenantPlatformExpired(tenantExpiry)) {
      return forbidden(
        c,
        "Platform access is expired. Renew access to continue using the platform.",
      );
    }

    const granted = resolveEffectivePermissions({
      platformRole: user.platformRole,
      tenantRole,
      overrides,
    });

    c.set("permissions", granted);

    const satisfied =
      mode === "any"
        ? required.some((permission) => granted.has(permission))
        : required.every((permission) => granted.has(permission));

    if (!satisfied) {
      return forbidden(c, `Insufficient permissions. ${describeMissing(required, mode)}`);
    }

    await next();
  });
}

// ─── Public middleware factories ──────────────────────────────────────────────

/** Require every listed permission, without resolving a tenant context. */
export const requirePermissions = (...permissions: Permission[]) =>
  authorize(permissions, { mode: "all", scope: "global" });

/** Require at least one of the listed permissions, without a tenant context. */
export const requireAnyPermission = (...permissions: Permission[]) =>
  authorize(permissions, { mode: "any", scope: "global" });

/** Resolve the tenant membership, then require every listed permission. */
export const requireTenantPermissions = (...permissions: Permission[]) =>
  authorize(permissions, { mode: "all", scope: "tenant" });

/** Resolve the tenant membership, then require at least one listed permission. */
export const requireAnyTenantPermission = (...permissions: Permission[]) =>
  authorize(permissions, { mode: "any", scope: "tenant" });

/**
 * Resolve a tenant's permissions without demanding any.
 *
 * For routes a signed-in non-member is meant to reach — a gym's public wall,
 * where somebody deciding whether to join can ask a question. `requireTenantPermissions`
 * would turn exactly that person away, but the route still needs to know
 * whether the caller happens to be staff, so a gym can moderate its own page.
 *
 * Never rejects: the worst case is a caller with only their platform-role
 * permissions, which is the truth about them.
 */
export const resolveTenantPermissions = createMiddleware<AppBindings>(async (c, next) => {
  const user = c.get("authUser");
  const tenantId = c.req.param("tenantId") || c.req.header("x-tenant-id") || null;
  const tenantRole = (tenantId ? user.tenants?.[tenantId] : undefined) as TenantRole | undefined;

  const overrides = await cached(`role-overrides:${tenantId ?? "platform"}`, () =>
    rolePermissionRepository.listApplicableOverrides(tenantId),
  );

  if (tenantId && tenantRole) c.set("tenantAccess", { tenantId, role: tenantRole });

  c.set(
    "permissions",
    resolveEffectivePermissions({
      platformRole: user.platformRole,
      tenantRole: tenantRole ?? null,
      overrides,
    }),
  );

  await next();
});

// ─── Role middleware (kept for coarse platform gates) ─────────────────────────

/**
 * Platform-role check for the few routes that gate on identity rather than a
 * capability (for example, "super admins only" bootstrap-style endpoints).
 */
export const requirePlatformRoles = (allowedRoles: PlatformRole[]) => {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("authUser");

    if (!allowedRoles.includes(user.platformRole)) {
      return forbidden(c, "Insufficient platform permissions.");
    }

    const overrides = await rolePermissionRepository.listApplicableOverrides(null);
    c.set(
      "permissions",
      resolveEffectivePermissions({ platformRole: user.platformRole, overrides }),
    );
    await next();
  });
};

/**
 * Tenant-role check retained for routes that genuinely gate on membership role
 * rather than a capability. Prefer `requireTenantPermissions` for new routes —
 * this still resolves and publishes the effective permission set.
 */
export const requireTenantRoles = (allowedRoles: TenantRole[]) => {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("authUser");
    const tenantId = c.req.param("tenantId") || c.req.header("x-tenant-id");

    if (!tenantId) {
      return badRequest(c, "Missing tenant context.");
    }

    const membershipRole = user.tenants?.[tenantId] as TenantRole | undefined;
    const platformStaff = isPlatformStaffRole(user.platformRole);

    if (!membershipRole && !platformStaff) {
      return forbidden(c, "You are not a member of this tenant.");
    }

    if (membershipRole && !platformStaff) {
      if (!allowedRoles.includes(membershipRole)) {
        return forbidden(c, "Insufficient tenant permissions.");
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { platformExpiresAt: true },
      });

      if (isTenantPlatformExpired(tenant?.platformExpiresAt)) {
        return forbidden(
          c,
          "Platform access is expired. Renew access to continue using the platform.",
        );
      }
    }

    const overrides = await rolePermissionRepository.listApplicableOverrides(tenantId);

    c.set("tenantAccess", membershipRole ? { tenantId, role: membershipRole } : null);
    c.set(
      "permissions",
      resolveEffectivePermissions({
        platformRole: user.platformRole,
        tenantRole: membershipRole ?? null,
        overrides,
      }),
    );
    await next();
  });
};
