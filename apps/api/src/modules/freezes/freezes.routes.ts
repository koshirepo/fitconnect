/**
 * Documentation: Freezes routes.
 *
 * - Mounts freezing under `/tenants`. Two capabilities reach these routes: `members:freeze` for staff acting on anyone, and `members:freeze:self` for a member arranging their own break. The `:self` grant opens the door but scopes nothing, so the controller checks the membership belongs to the caller.
 * - Relative endpoints declared in this file: GET /:tenantId/members/:membershipId/freeze, POST /:tenantId/members/:membershipId/freeze, POST /:tenantId/freezes/:freezeId/end.
 * - Primary exports: freezeRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyTenantPermission } from "../../middleware/authorize";
import { Permission } from "@fitconnect/shared/types/permissions";
import { freezeController } from "./freezes.controller";
import type { AppBindings } from "../../types/app-context";

export const freezeRoutes = new Hono<AppBindings>();

const mayFreeze = requireAnyTenantPermission(
  Permission.MEMBERS_FREEZE,
  Permission.MEMBERS_FREEZE_SELF,
);

freezeRoutes.get(
  "/:tenantId/members/:membershipId/freeze",
  authenticate,
  mayFreeze,
  freezeController.getStatus,
);

freezeRoutes.post(
  "/:tenantId/members/:membershipId/freeze",
  authenticate,
  mayFreeze,
  freezeController.create,
);

freezeRoutes.post(
  "/:tenantId/freezes/:freezeId/end",
  authenticate,
  mayFreeze,
  freezeController.end,
);
