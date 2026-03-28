/**
 * Documentation: Members routes.
 *
 * - Declares the Hono routes and middleware chain for tenant membership lifecycle, profile updates, reporting, and status management. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /:tenantId/members, GET /:tenantId/members, GET /:tenantId/members/:membershipId, GET /:tenantId/me, PATCH /:tenantId/me, PATCH /:tenantId/members/:membershipId, PATCH /:tenantId/members/:membershipId/role, POST /:tenantId/members/report, PATCH /:tenantId/members/:membershipId/status, DELETE /:tenantId/members/:membershipId, POST /:tenantId/members/:membershipId/reset-password.
 * - Primary exports: memberRoutes.
 */
import { Hono } from "hono";
import { TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { memberController } from "./members.controller";
import type { AppBindings } from "../../types/app-context";

export const memberRoutes = new Hono<AppBindings>();

memberRoutes.post(
  "/:tenantId/members",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  memberController.addMember,
);

memberRoutes.get(
  "/:tenantId/members",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  memberController.listMembers,
);

memberRoutes.get(
  "/:tenantId/members/:membershipId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  memberController.getMemberDetail,
);

memberRoutes.get(
  "/:tenantId/me",
  authenticate,
  requireTenantRoles([TenantRole.MEMBER, TenantRole.COACH, TenantRole.ADMIN]),
  memberController.getMyProfile,
);

memberRoutes.patch(
  "/:tenantId/me",
  authenticate,
  requireTenantRoles([TenantRole.MEMBER, TenantRole.COACH, TenantRole.ADMIN]),
  memberController.updateMyProfile,
);

memberRoutes.patch(
  "/:tenantId/members/:membershipId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  memberController.updateMember,
);

memberRoutes.patch(
  "/:tenantId/members/:membershipId/role",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  memberController.updateMemberRole,
);

memberRoutes.post(
  "/:tenantId/members/report",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  memberController.generateReport,
);

memberRoutes.patch(
  "/:tenantId/members/:membershipId/status",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  memberController.updateMemberStatus,
);

memberRoutes.delete(
  "/:tenantId/members/:membershipId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  memberController.removeMember,
);

memberRoutes.post(
  "/:tenantId/members/:membershipId/reset-password",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  memberController.resetMemberPassword,
);
