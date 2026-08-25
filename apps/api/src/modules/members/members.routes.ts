/**
 * Documentation: Members routes.
 *
 * - Declares the Hono routes and middleware chain for tenant membership lifecycle, profile updates, reporting, and status management. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /:tenantId/members, GET /:tenantId/members, GET /:tenantId/members/referrals, GET /:tenantId/members/:membershipId, GET /:tenantId/me, PATCH /:tenantId/me, PATCH /:tenantId/members/:membershipId, PATCH /:tenantId/members/:membershipId/role, POST /:tenantId/members/report, PATCH /:tenantId/members/:membershipId/status, DELETE /:tenantId/members/:membershipId, POST /:tenantId/members/:membershipId/reset-password.
 * - Primary exports: memberRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { idempotency } from "../../middleware/idempotency";
import { requireTenantPermissions } from "../../middleware/authorize";
import { memberController } from "./members.controller";
import type { AppBindings } from "../../types/app-context";

export const memberRoutes = new Hono<AppBindings>();

memberRoutes.post(
  "/:tenantId/members",
  authenticate,
  // A member added offline is replayed when the connection returns; without
  // this a lost response produces the same person twice.
  idempotency,
  requireTenantPermissions(Permission.MEMBERS_CREATE),
  memberController.addMember,
);

memberRoutes.get(
  "/:tenantId/members",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_READ),
  memberController.listMembers,
);

memberRoutes.get(
  "/:tenantId/members/referrals",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_REFERRALS_READ),
  memberController.listReferrals,
);

memberRoutes.get(
  "/:tenantId/members/:membershipId",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_READ_DETAIL),
  memberController.getMemberDetail,
);

memberRoutes.get(
  "/:tenantId/me",
  authenticate,
  requireTenantPermissions(Permission.PROFILE_READ_SELF),
  memberController.getMyProfile,
);

memberRoutes.patch(
  "/:tenantId/me",
  authenticate,
  requireTenantPermissions(Permission.PROFILE_UPDATE_SELF),
  memberController.updateMyProfile,
);

memberRoutes.patch(
  "/:tenantId/members/:membershipId",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_UPDATE),
  memberController.updateMember,
);

memberRoutes.patch(
  "/:tenantId/members/:membershipId/role",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_ROLE_UPDATE),
  memberController.updateMemberRole,
);

memberRoutes.post(
  "/:tenantId/members/report",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_REPORT_GENERATE),
  memberController.generateReport,
);

memberRoutes.patch(
  "/:tenantId/members/:membershipId/status",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_STATUS_UPDATE),
  memberController.updateMemberStatus,
);

memberRoutes.delete(
  "/:tenantId/members/:membershipId",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_DELETE),
  memberController.removeMember,
);

memberRoutes.post(
  "/:tenantId/members/:membershipId/reset-password",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_PASSWORD_RESET),
  memberController.resetMemberPassword,
);
