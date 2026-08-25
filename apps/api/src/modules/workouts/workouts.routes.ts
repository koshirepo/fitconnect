/**
 * Documentation: Workouts routes.
 *
 * - Declares the Hono routes and middleware chain for workout plan creation, assignment, and member program visibility. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/workout-plans, GET /:tenantId/workout-plans/:planId, POST /:tenantId/workout-plans, PATCH /:tenantId/workout-plans/:planId, DELETE /:tenantId/workout-plans/:planId, POST /:tenantId/workout-plans/:planId/assign.
 * - Primary exports: workoutRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantPermissions } from "../../middleware/authorize";
import { workoutController } from "./workouts.controller";
import type { AppBindings } from "../../types/app-context";

export const workoutRoutes = new Hono<AppBindings>();

workoutRoutes.get(
  "/:tenantId/workout-plans",
  authenticate,
  requireTenantPermissions(Permission.WORKOUTS_READ),
  workoutController.listPlans,
);

workoutRoutes.get(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireTenantPermissions(Permission.WORKOUTS_READ),
  workoutController.getPlan,
);

workoutRoutes.post(
  "/:tenantId/workout-plans",
  authenticate,
  requireTenantPermissions(Permission.WORKOUTS_CREATE),
  workoutController.createPlan,
);

workoutRoutes.patch(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireTenantPermissions(Permission.WORKOUTS_UPDATE),
  workoutController.updatePlan,
);

workoutRoutes.delete(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireTenantPermissions(Permission.WORKOUTS_DELETE),
  workoutController.deletePlan,
);

workoutRoutes.post(
  "/:tenantId/workout-plans/:planId/assign",
  authenticate,
  requireTenantPermissions(Permission.WORKOUTS_ASSIGN),
  workoutController.assignPlan,
);
