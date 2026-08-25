/**
 * Documentation: Payments routes.
 *
 * - Declares the Hono routes and middleware chain for subscription management, payment collection, and membership validity tracking. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/payments, GET /:tenantId/my-payments, POST /:tenantId/payments, GET /:tenantId/payments/analytics, GET /:tenantId/payments/:paymentId, PATCH /:tenantId/payments/:paymentId, PUT /:tenantId/payments/:paymentId, DELETE /:tenantId/payments/:paymentId, GET /:tenantId/subscriptions, POST /:tenantId/subscriptions, PATCH /:tenantId/subscriptions/:subscriptionId, DELETE /:tenantId/subscriptions/:subscriptionId.
 * - Primary exports: paymentRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyTenantPermission, requireTenantPermissions } from "../../middleware/authorize";
import { paymentController } from "./payments.controller";
import type { AppBindings } from "../../types/app-context";

export const paymentRoutes = new Hono<AppBindings>();

paymentRoutes.get(
  "/:tenantId/payments",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_READ),
  paymentController.listPayments,
);

paymentRoutes.get(
  "/:tenantId/my-payments",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_READ_SELF),
  paymentController.getMyPayments,
);

paymentRoutes.post(
  "/:tenantId/payments",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_CREATE),
  paymentController.createPayment,
);

paymentRoutes.get(
  "/:tenantId/payments/analytics",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_ANALYTICS_READ),
  paymentController.getAnalytics,
);

// Members may open a receipt they own; the controller scopes the lookup when
// the caller lacks the gym-wide read capability.
paymentRoutes.get(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireAnyTenantPermission(Permission.PAYMENTS_READ, Permission.PAYMENTS_READ_SELF),
  paymentController.getPaymentById,
);

paymentRoutes.patch(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_UPDATE),
  paymentController.updatePaymentStatus,
);

paymentRoutes.put(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_UPDATE),
  paymentController.updatePayment,
);

paymentRoutes.delete(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_DELETE),
  paymentController.deletePayment,
);

paymentRoutes.get(
  "/:tenantId/subscriptions",
  authenticate,
  requireTenantPermissions(Permission.SUBSCRIPTIONS_READ),
  paymentController.listSubscriptions,
);

paymentRoutes.post(
  "/:tenantId/subscriptions",
  authenticate,
  requireTenantPermissions(Permission.SUBSCRIPTIONS_CREATE),
  paymentController.createSubscription,
);

paymentRoutes.patch(
  "/:tenantId/subscriptions/:subscriptionId",
  authenticate,
  requireTenantPermissions(Permission.SUBSCRIPTIONS_UPDATE),
  paymentController.updateSubscription,
);

paymentRoutes.delete(
  "/:tenantId/subscriptions/:subscriptionId",
  authenticate,
  requireTenantPermissions(Permission.SUBSCRIPTIONS_DELETE),
  paymentController.deleteSubscription,
);
