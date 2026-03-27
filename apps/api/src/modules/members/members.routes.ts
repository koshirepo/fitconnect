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
