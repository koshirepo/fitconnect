/**
 * Documentation: Settings routes.
 *
 * - Declares the Hono routes and middleware chain for tenant settings and extra charge configuration. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/settings, PUT /:tenantId/settings, GET /:tenantId/charges, POST /:tenantId/charges, PATCH /:tenantId/charges/:chargeId, DELETE /:tenantId/charges/:chargeId.
 * - Primary exports: settingsRoutes.
 */
import { Hono } from "hono";
import { TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { settingsController } from "./settings.controller";
import type { AppBindings } from "../../types/app-context";

export const settingsRoutes = new Hono<AppBindings>();

// ─── Settings ─────────────────────────────────────────────────────────────────

settingsRoutes.get(
  "/:tenantId/settings",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  settingsController.getSettings,
);

settingsRoutes.put(
  "/:tenantId/settings",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  settingsController.updateSettings,
);

// ─── Charges ──────────────────────────────────────────────────────────────────

settingsRoutes.get(
  "/:tenantId/charges",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  settingsController.listCharges,
);

settingsRoutes.post(
  "/:tenantId/charges",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  settingsController.createCharge,
);

settingsRoutes.patch(
  "/:tenantId/charges/:chargeId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  settingsController.updateCharge,
);

settingsRoutes.delete(
  "/:tenantId/charges/:chargeId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  settingsController.deleteCharge,
);
