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
import { requireAnyTenantPermission, requireTenantPermissions } from "../../middleware/authorize";
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

/**
 * Writing a plan.
 *
 * Two grants reach these, and the difference is whose plan it is. A coach holds
 * `workouts:create` and writes plans for the gym; a member holds
 * `workouts:create:self` and writes their own, which the service assigns to them
 * and to nobody else. The same pair guards editing and deleting, where the
 * service holds a member to their own plans.
 */
workoutRoutes.post(
  "/:tenantId/workout-plans",
  authenticate,
  requireAnyTenantPermission(Permission.WORKOUTS_CREATE, Permission.WORKOUTS_CREATE_SELF),
  workoutController.createPlan,
);

workoutRoutes.patch(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireAnyTenantPermission(Permission.WORKOUTS_UPDATE, Permission.WORKOUTS_CREATE_SELF),
  workoutController.updatePlan,
);

workoutRoutes.delete(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireAnyTenantPermission(Permission.WORKOUTS_DELETE, Permission.WORKOUTS_CREATE_SELF),
  workoutController.deletePlan,
);

workoutRoutes.post(
  "/:tenantId/workout-plans/:planId/assign",
  authenticate,
  requireTenantPermissions(Permission.WORKOUTS_ASSIGN),
  workoutController.assignPlan,
);
