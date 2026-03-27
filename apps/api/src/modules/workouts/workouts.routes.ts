import { Hono } from "hono";
import { TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { workoutController } from "./workouts.controller";
import type { AppBindings } from "../../types/app-context";

export const workoutRoutes = new Hono<AppBindings>();

workoutRoutes.get(
  "/:tenantId/workout-plans",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  workoutController.listPlans,
);

workoutRoutes.get(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  workoutController.getPlan,
);

workoutRoutes.post(
  "/:tenantId/workout-plans",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  workoutController.createPlan,
);

workoutRoutes.patch(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  workoutController.updatePlan,
);

workoutRoutes.delete(
  "/:tenantId/workout-plans/:planId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  workoutController.deletePlan,
);

workoutRoutes.post(
  "/:tenantId/workout-plans/:planId/assign",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  workoutController.assignPlan,
);
