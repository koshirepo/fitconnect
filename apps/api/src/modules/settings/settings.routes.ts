/**
 * Documentation: Settings routes.
 *
 * - Declares the Hono routes and middleware chain for tenant settings and extra charge configuration. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/settings, PUT /:tenantId/settings, GET /:tenantId/charges, POST /:tenantId/charges, PATCH /:tenantId/charges/:chargeId, DELETE /:tenantId/charges/:chargeId, GET|PUT /:tenantId/settings/email, POST /:tenantId/settings/email/test.
 * - Primary exports: settingsRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantPermissions } from "../../middleware/authorize";
import { settingsController } from "./settings.controller";
import { tenantEmailController } from "./email.controller";
import type { AppBindings } from "../../types/app-context";

export const settingsRoutes = new Hono<AppBindings>();

// ─── Settings ─────────────────────────────────────────────────────────────────

settingsRoutes.get(
  "/:tenantId/settings",
  authenticate,
  requireTenantPermissions(Permission.SETTINGS_READ),
  settingsController.getSettings,
);

settingsRoutes.put(
  "/:tenantId/settings",
  authenticate,
  requireTenantPermissions(Permission.SETTINGS_UPDATE),
  settingsController.updateSettings,
);

// ─── Charges ──────────────────────────────────────────────────────────────────

settingsRoutes.get(
  "/:tenantId/charges",
  authenticate,
  requireTenantPermissions(Permission.CHARGES_READ),
  settingsController.listCharges,
);

settingsRoutes.post(
  "/:tenantId/charges",
  authenticate,
  requireTenantPermissions(Permission.CHARGES_CREATE),
  settingsController.createCharge,
);

settingsRoutes.patch(
  "/:tenantId/charges/:chargeId",
  authenticate,
  requireTenantPermissions(Permission.CHARGES_UPDATE),
  settingsController.updateCharge,
);

settingsRoutes.delete(
  "/:tenantId/charges/:chargeId",
  authenticate,
  requireTenantPermissions(Permission.CHARGES_DELETE),
  settingsController.deleteCharge,
);

// ─── The gym's own outgoing mailbox ──────────────────────────────────────────
//
// Its own pair of capabilities rather than plain settings editing, the same way
// the payment gateway has its own: an SMTP password is a credential, and the
// person who may rename a shift is not automatically the person who may point
// the gym's outgoing mail somewhere else.

settingsRoutes.get(
  "/:tenantId/settings/email",
  authenticate,
  requireTenantPermissions(Permission.SETTINGS_EMAIL_READ),
  tenantEmailController.getConfig,
);

settingsRoutes.put(
  "/:tenantId/settings/email",
  authenticate,
  requireTenantPermissions(Permission.SETTINGS_EMAIL_UPDATE),
  tenantEmailController.updateConfig,
);

// Reading rather than updating: this sends nothing and changes nothing, it
// only proves the mailbox already in use answers.
settingsRoutes.post(
  "/:tenantId/settings/email/test",
  authenticate,
  requireTenantPermissions(Permission.SETTINGS_EMAIL_READ),
  tenantEmailController.testConnection,
);
