import { Hono } from "hono";
import { PlatformRole, TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requirePlatformRoles, requireTenantRoles } from "../../middleware/authorize";
import { tenantController } from "./tenants.controller";
import type { AppBindings } from "../../types/app-context";

export const tenantRoutes = new Hono<AppBindings>();

tenantRoutes.post(
  "/",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN]),
  tenantController.create,
);

tenantRoutes.get(
  "/",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  tenantController.list,
);

tenantRoutes.get(
  "/:tenantId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  tenantController.getById,
);

tenantRoutes.patch(
  "/:tenantId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  tenantController.update,
);

tenantRoutes.patch(
  "/:tenantId/status",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN]),
  tenantController.updateStatus,
);

tenantRoutes.post(
  "/:tenantId/platform-payments",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN]),
  tenantController.recordPlatformPayment,
);

tenantRoutes.get(
  "/:tenantId/platform-payments",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  tenantController.listPlatformPayments,
);
