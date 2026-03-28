/**
 * Documentation: Badges routes.
 *
 * - Declares the Hono routes and middleware chain for badge definitions and member badge assignment. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/badges, POST /:tenantId/badges, GET /:tenantId/badges/:badgeId, PATCH /:tenantId/badges/:badgeId, DELETE /:tenantId/badges/:badgeId, GET /:tenantId/badges/:badgeId/assignments, POST /:tenantId/badges/:badgeId/assign, DELETE /:tenantId/badges/:badgeId/assign/:membershipId, GET /:tenantId/members/:membershipId/badges.
 * - Primary exports: badgeRoutes.
 */
import { Hono } from "hono";
import { TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { badgeController } from "./badges.controller";
import type { AppBindings } from "../../types/app-context";

export const badgeRoutes = new Hono<AppBindings>();

// ─── Badge CRUD ───────────────────────────────────────────────────────────────

badgeRoutes.get(
  "/:tenantId/badges",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  badgeController.list,
);

badgeRoutes.post(
  "/:tenantId/badges",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  badgeController.create,
);

badgeRoutes.get(
  "/:tenantId/badges/:badgeId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  badgeController.getById,
);

badgeRoutes.patch(
  "/:tenantId/badges/:badgeId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  badgeController.update,
);

badgeRoutes.delete(
  "/:tenantId/badges/:badgeId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  badgeController.delete,
);

// ─── Badge Assignments ────────────────────────────────────────────────────────

badgeRoutes.get(
  "/:tenantId/badges/:badgeId/assignments",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  badgeController.listAssignments,
);

badgeRoutes.post(
  "/:tenantId/badges/:badgeId/assign",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  badgeController.assign,
);

badgeRoutes.delete(
  "/:tenantId/badges/:badgeId/assign/:membershipId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  badgeController.unassign,
);

// ─── Member Badges ────────────────────────────────────────────────────────────

badgeRoutes.get(
  "/:tenantId/members/:membershipId/badges",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  badgeController.memberBadges,
);
