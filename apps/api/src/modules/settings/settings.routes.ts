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
