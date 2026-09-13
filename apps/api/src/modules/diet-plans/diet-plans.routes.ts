/**
 * Documentation: Diet plan routes.
 *
 * - Declares the routing and authorization for a gym's diet plans. Mounted from `/tenants` in the application entrypoint, beside workout plans, and guarded the same way.
 * - Two grants reach the writes, and the difference is whose plan it is: staff hold `diet-plans:create` and write plans for the gym; a member holds `diet-plans:create:self` and writes their own, which the service assigns to them and holds them to.
 * - Relative endpoints declared in this file: GET /:tenantId/diet-plans, GET /:tenantId/diet-plans/:planId, POST /:tenantId/diet-plans, PATCH /:tenantId/diet-plans/:planId, DELETE /:tenantId/diet-plans/:planId, POST /:tenantId/diet-plans/:planId/assign, DELETE /:tenantId/diet-plans/:planId/assignments/:membershipId.
 * - Primary exports: dietPlanRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyTenantPermission, requireTenantPermissions } from "../../middleware/authorize";
import { dietPlanController } from "./diet-plans.controller";
import type { AppBindings } from "../../types/app-context";

export const dietPlanRoutes = new Hono<AppBindings>();

dietPlanRoutes.get(
  "/:tenantId/diet-plans",
  authenticate,
  requireTenantPermissions(Permission.DIET_PLANS_READ),
  dietPlanController.listPlans,
);

dietPlanRoutes.get(
  "/:tenantId/diet-plans/:planId",
  authenticate,
  requireTenantPermissions(Permission.DIET_PLANS_READ),
  dietPlanController.getPlan,
);

dietPlanRoutes.post(
  "/:tenantId/diet-plans",
  authenticate,
  requireAnyTenantPermission(Permission.DIET_PLANS_CREATE, Permission.DIET_PLANS_CREATE_SELF),
  dietPlanController.createPlan,
);

dietPlanRoutes.patch(
  "/:tenantId/diet-plans/:planId",
  authenticate,
  requireAnyTenantPermission(Permission.DIET_PLANS_UPDATE, Permission.DIET_PLANS_CREATE_SELF),
  dietPlanController.updatePlan,
);

dietPlanRoutes.delete(
  "/:tenantId/diet-plans/:planId",
  authenticate,
  requireAnyTenantPermission(Permission.DIET_PLANS_DELETE, Permission.DIET_PLANS_CREATE_SELF),
  dietPlanController.deletePlan,
);

dietPlanRoutes.post(
  "/:tenantId/diet-plans/:planId/assign",
  authenticate,
  requireTenantPermissions(Permission.DIET_PLANS_ASSIGN),
  dietPlanController.assignPlan,
);

dietPlanRoutes.delete(
  "/:tenantId/diet-plans/:planId/assignments/:membershipId",
  authenticate,
  requireTenantPermissions(Permission.DIET_PLANS_ASSIGN),
  dietPlanController.unassignPlan,
);
