/**
 * Documentation: Payments routes.
 *
 * - Declares the Hono routes and middleware chain for subscription management, payment collection, and membership validity tracking. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/payments, GET /:tenantId/my-payments, POST /:tenantId/payments, GET /:tenantId/payments/analytics, GET /:tenantId/payments/:paymentId, PATCH /:tenantId/payments/:paymentId, PUT /:tenantId/payments/:paymentId, GET /:tenantId/subscriptions, POST /:tenantId/subscriptions.
 * - Primary exports: paymentRoutes.
 */
import { Hono } from "hono";
import { TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { paymentController } from "./payments.controller";
import type { AppBindings } from "../../types/app-context";

export const paymentRoutes = new Hono<AppBindings>();

paymentRoutes.get(
  "/:tenantId/payments",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  paymentController.listPayments,
);

paymentRoutes.get(
  "/:tenantId/my-payments",
  authenticate,
  requireTenantRoles([TenantRole.MEMBER, TenantRole.COACH, TenantRole.ADMIN]),
  paymentController.getMyPayments,
);

paymentRoutes.post(
  "/:tenantId/payments",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  paymentController.createPayment,
);

paymentRoutes.get(
  "/:tenantId/payments/analytics",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  paymentController.getAnalytics,
);

paymentRoutes.get(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  paymentController.getPaymentById,
);

paymentRoutes.patch(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  paymentController.updatePaymentStatus,
);

paymentRoutes.put(
  "/:tenantId/payments/:paymentId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  paymentController.updatePayment,
);

paymentRoutes.get(
  "/:tenantId/subscriptions",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  paymentController.listSubscriptions,
);

paymentRoutes.post(
  "/:tenantId/subscriptions",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  paymentController.createSubscription,
);
