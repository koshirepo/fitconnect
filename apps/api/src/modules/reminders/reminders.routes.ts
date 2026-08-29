/**
 * Documentation: Reminder log routes.
 *
 * - Mounted under `/tenants`. Reading the history needs `payments:read` — it is part of the money story of a member, not of their profile — and writing a row needs the same grant that lets someone chase a member in the first place.
 * - Writing is gated on `PAYMENTS_SETTLE` or `PAYMENTS_UPDATE`, which is what a coach at the desk already holds: whoever may take the money may record having asked for it.
 * - Relative endpoints declared in this file: GET /:tenantId/members/:membershipId/reminders, POST /:tenantId/members/:membershipId/reminders, GET /:tenantId/payments/:paymentId/reminders.
 * - Primary exports: reminderRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import {
  requireAnyTenantPermission,
  requireTenantPermissions,
} from "../../middleware/authorize";
import { Permission } from "@fitconnect/shared/types/permissions";
import { reminderController } from "./reminders.controller";
import type { AppBindings } from "../../types/app-context";

export const reminderRoutes = new Hono<AppBindings>();

reminderRoutes.get(
  "/:tenantId/members/:membershipId/reminders",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_READ),
  reminderController.listForMember,
);

// Recording a message is not moving money: anyone the gym trusts to see a
// member's payment state — a coach at the desk, an admin, a custom role built
// for the front counter — may also record having chased them for it.
reminderRoutes.post(
  "/:tenantId/members/:membershipId/reminders",
  authenticate,
  requireAnyTenantPermission(
    Permission.PAYMENTS_READ,
    Permission.PAYMENTS_SETTLE,
    Permission.PAYMENTS_UPDATE,
  ),
  reminderController.log,
);

reminderRoutes.get(
  "/:tenantId/payments/:paymentId/reminders",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_READ),
  reminderController.listForPayment,
);
