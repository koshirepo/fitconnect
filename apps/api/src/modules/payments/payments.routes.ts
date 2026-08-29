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
import { idempotency } from "../../middleware/idempotency";
import { requireAnyTenantPermission, requireTenantPermissions } from "../../middleware/authorize";
import { paymentController } from "./payments.controller";
import { gatewayController } from "./gateway.controller";
import type { AppBindings } from "../../types/app-context";

export const paymentRoutes = new Hono<AppBindings>();

// ─── Payment gateway ──────────────────────────────────────────────────────────
//
// Declared before `/:tenantId/payments/:paymentId` so "gateway" and "checkout"
// are matched as literal segments rather than swallowed as a payment id.

paymentRoutes.get(
  "/:tenantId/payments/gateway",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_GATEWAY_READ),
  gatewayController.getConfig,
);

paymentRoutes.put(
  "/:tenantId/payments/gateway",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_GATEWAY_UPDATE),
  gatewayController.updateConfig,
);

paymentRoutes.post(
  "/:tenantId/payments/gateway/test",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_GATEWAY_UPDATE),
  gatewayController.testConnection,
);

paymentRoutes.post(
  "/:tenantId/payments/checkout",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_CHECKOUT_SELF),
  gatewayController.createCheckout,
);

paymentRoutes.post(
  "/:tenantId/payments/checkout/verify",
  authenticate,
  requireTenantPermissions(Permission.PAYMENTS_CHECKOUT_SELF),
  gatewayController.verifyCheckout,
);

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
  // A payment replayed after a lost response must not be collected twice.
  idempotency,
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

// Settling is the desk's job, so a coach reaches this too. What they may
// settle it to is narrower than what an editor may, and the service decides
// that from the caller's capabilities rather than the door being open at all.
paymentRoutes.patch(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireAnyTenantPermission(Permission.PAYMENTS_UPDATE, Permission.PAYMENTS_SETTLE),
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

/**
 * Gateway webhooks, mounted separately because they carry no session.
 *
 * Razorpay authenticates itself with an HMAC over the request body, which the
 * service verifies against the gym's webhook secret. There is deliberately no
 * `authenticate` here — adding it would reject every real delivery.
 */
export const gatewayWebhookRoutes = new Hono<AppBindings>();

gatewayWebhookRoutes.post("/razorpay/:tenantId", gatewayController.webhook);
