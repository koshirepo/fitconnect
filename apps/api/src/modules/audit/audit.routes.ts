/**
 * Documentation: Audit routes.
 *
 * - Declares the Hono routes and middleware chain for audit log querying for privileged users. This route set is mounted from `/audit` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /, GET /tenant/:tenantId.
 * - Primary exports: auditRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requirePermissions, requireTenantPermissions } from "../../middleware/authorize";
import { auditController } from "./audit.controller";
import type { AppBindings } from "../../types/app-context";

export const auditRoutes = new Hono<AppBindings>();

auditRoutes.get(
  "/",
  authenticate,
  requirePermissions(Permission.AUDIT_PLATFORM_READ),
  auditController.listPlatformLogs,
);

auditRoutes.get(
  "/tenant/:tenantId",
  authenticate,
  requireTenantPermissions(Permission.AUDIT_TENANT_READ),
  auditController.listTenantLogs,
);
