import { Hono } from "hono";
import { PlatformRole, TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requirePlatformRoles, requireTenantRoles } from "../../middleware/authorize";
import { auditController } from "./audit.controller";
import type { AppBindings } from "../../types/app-context";

export const auditRoutes = new Hono<AppBindings>();

auditRoutes.get(
  "/",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  auditController.listPlatformLogs,
);

auditRoutes.get(
  "/tenant/:tenantId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  auditController.listTenantLogs,
);
