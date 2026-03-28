/**
 * Documentation: Shifts routes.
 *
 * - Declares the Hono routes and middleware chain for tenant shift management. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/shifts, POST /:tenantId/shifts, GET /:tenantId/shifts/:shiftId, PATCH /:tenantId/shifts/:shiftId, DELETE /:tenantId/shifts/:shiftId.
 * - Primary exports: shiftRoutes.
 */
import { Hono } from "hono";
import { TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { shiftController } from "./shifts.controller";
import type { AppBindings } from "../../types/app-context";

export const shiftRoutes = new Hono<AppBindings>();

shiftRoutes.get(
  "/:tenantId/shifts",
  shiftController.list,
);

shiftRoutes.post(
  "/:tenantId/shifts",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  shiftController.create,
);

shiftRoutes.get(
  "/:tenantId/shifts/:shiftId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  shiftController.getById,
);

shiftRoutes.patch(
  "/:tenantId/shifts/:shiftId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  shiftController.update,
);

shiftRoutes.delete(
  "/:tenantId/shifts/:shiftId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  shiftController.delete,
);