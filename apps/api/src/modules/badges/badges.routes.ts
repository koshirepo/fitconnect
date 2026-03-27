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
