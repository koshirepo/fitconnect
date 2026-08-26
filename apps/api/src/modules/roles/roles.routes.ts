/**
 * Documentation: Role permission routes.
 *
 * - Declares the Hono routes and middleware chain for the tenant-level and platform-level role/permission management screens. Tenant routes are mounted from `/tenants`; platform routes are mounted from `/platform`.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/roles, PUT /:tenantId/roles/:role, DELETE /:tenantId/roles/:role, GET /roles, PUT /roles/:scope/:role, DELETE /roles/:scope/:role.
 * - Primary exports: tenantRoleRoutes, platformRoleRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requirePermissions, requireTenantPermissions } from "../../middleware/authorize";
import { roleController } from "./roles.controller";
import type { AppBindings } from "../../types/app-context";

// ─── Tenant scope (mounted at /tenants) ───────────────────────────────────────

export const tenantRoleRoutes = new Hono<AppBindings>();

tenantRoleRoutes.get(
  "/:tenantId/roles",
  authenticate,
  requireTenantPermissions(Permission.ROLES_READ),
  roleController.getTenantMatrix,
);

tenantRoleRoutes.post(
  "/:tenantId/roles",
  authenticate,
  requireTenantPermissions(Permission.ROLES_UPDATE),
  roleController.createTenantRole,
);

tenantRoleRoutes.put(
  "/:tenantId/roles/:role",
  authenticate,
  requireTenantPermissions(Permission.ROLES_UPDATE),
  roleController.updateTenantRolePermissions,
);

tenantRoleRoutes.patch(
  "/:tenantId/roles/:role",
  authenticate,
  requireTenantPermissions(Permission.ROLES_UPDATE),
  roleController.updateTenantRole,
);

tenantRoleRoutes.delete(
  "/:tenantId/roles/:role",
  authenticate,
  requireTenantPermissions(Permission.ROLES_UPDATE),
  roleController.resetTenantRole,
);

tenantRoleRoutes.delete(
  "/:tenantId/roles/:role/definition",
  authenticate,
  requireTenantPermissions(Permission.ROLES_UPDATE),
  roleController.deleteTenantRole,
);

// ─── Platform scope (mounted at /platform) ────────────────────────────────────

export const platformRoleRoutes = new Hono<AppBindings>();

platformRoleRoutes.get(
  "/roles",
  authenticate,
  requirePermissions(Permission.PLATFORM_ROLES_READ),
  roleController.getPlatformMatrix,
);

platformRoleRoutes.post(
  "/roles",
  authenticate,
  requirePermissions(Permission.PLATFORM_ROLES_UPDATE),
  roleController.createPlatformRole,
);

platformRoleRoutes.put(
  "/roles/:scope/:role",
  authenticate,
  requirePermissions(Permission.PLATFORM_ROLES_UPDATE),
  roleController.updatePlatformRolePermissions,
);

platformRoleRoutes.patch(
  "/roles/:scope/:role",
  authenticate,
  requirePermissions(Permission.PLATFORM_ROLES_UPDATE),
  roleController.updatePlatformRole,
);

platformRoleRoutes.delete(
  "/roles/:scope/:role",
  authenticate,
  requirePermissions(Permission.PLATFORM_ROLES_UPDATE),
  roleController.resetPlatformRole,
);

platformRoleRoutes.delete(
  "/roles/:scope/:role/definition",
  authenticate,
  requirePermissions(Permission.PLATFORM_ROLES_UPDATE),
  roleController.deletePlatformRole,
);
