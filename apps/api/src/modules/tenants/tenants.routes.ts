/**
 * Documentation: Tenants routes.
 *
 * - Declares the Hono routes and middleware chain for tenant onboarding, tenant profile maintenance, and tenant administration. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /, GET /, GET /:tenantId, PATCH /:tenantId, PATCH /:tenantId/status, POST /:tenantId/platform-payments, GET /:tenantId/platform-payments.
 * - Primary exports: tenantRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requirePermissions, requireTenantPermissions } from "../../middleware/authorize";
import { tenantController } from "./tenants.controller";
import type { AppBindings } from "../../types/app-context";

export const tenantRoutes = new Hono<AppBindings>();

tenantRoutes.post(
  "/",
  authenticate,
  requirePermissions(Permission.PLATFORM_TENANTS_CREATE),
  tenantController.create,
);

tenantRoutes.get(
  "/",
  authenticate,
  requirePermissions(Permission.PLATFORM_TENANTS_READ),
  tenantController.list,
);

tenantRoutes.get(
  "/:tenantId",
  authenticate,
  requireTenantPermissions(Permission.TENANT_READ),
  tenantController.getById,
);

tenantRoutes.patch(
  "/:tenantId",
  authenticate,
  requireTenantPermissions(Permission.TENANT_UPDATE),
  tenantController.update,
);

tenantRoutes.patch(
  "/:tenantId/status",
  authenticate,
  requirePermissions(Permission.PLATFORM_TENANTS_STATUS_UPDATE),
  tenantController.updateStatus,
);

tenantRoutes.post(
  "/:tenantId/platform-payments",
  authenticate,
  requirePermissions(Permission.PLATFORM_PAYMENTS_CREATE),
  tenantController.recordPlatformPayment,
);

tenantRoutes.get(
  "/:tenantId/platform-payments",
  authenticate,
  requirePermissions(Permission.PLATFORM_PAYMENTS_READ),
  tenantController.listPlatformPayments,
);
