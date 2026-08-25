/**
 * Documentation: Shifts routes.
 *
 * - Declares the Hono routes and middleware chain for tenant shift management. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/shifts, POST /:tenantId/shifts, GET /:tenantId/shifts/:shiftId, PATCH /:tenantId/shifts/:shiftId, DELETE /:tenantId/shifts/:shiftId.
 * - Primary exports: shiftRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantPermissions } from "../../middleware/authorize";
import { shiftController } from "./shifts.controller";
import type { AppBindings } from "../../types/app-context";

export const shiftRoutes = new Hono<AppBindings>();

// Anonymous visitors read shift times from the public tenant profile
// (`GET /public/gyms/:slug`), so this listing stays behind authentication.
shiftRoutes.get(
  "/:tenantId/shifts",
  authenticate,
  requireTenantPermissions(Permission.SHIFTS_READ),
  shiftController.list,
);

shiftRoutes.post(
  "/:tenantId/shifts",
  authenticate,
  requireTenantPermissions(Permission.SHIFTS_CREATE),
  shiftController.create,
);

shiftRoutes.get(
  "/:tenantId/shifts/:shiftId",
  authenticate,
  requireTenantPermissions(Permission.SHIFTS_READ),
  shiftController.getById,
);

shiftRoutes.patch(
  "/:tenantId/shifts/:shiftId",
  authenticate,
  requireTenantPermissions(Permission.SHIFTS_UPDATE),
  shiftController.update,
);

shiftRoutes.delete(
  "/:tenantId/shifts/:shiftId",
  authenticate,
  requireTenantPermissions(Permission.SHIFTS_DELETE),
  shiftController.delete,
);
