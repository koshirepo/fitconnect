/**
 * Documentation: Coupons routes.
 *
 * - Mounts coupon management and pricing under `/tenants`. Managing coupons and applying one are separate capabilities on purpose: a gym can let the front desk use a code without letting it mint one.
 * - Relative endpoints declared in this file: GET /:tenantId/coupons, POST /:tenantId/coupons, POST /:tenantId/coupons/quote, GET /:tenantId/coupons/coins/:membershipId, GET /:tenantId/coupons/:couponId, PATCH /:tenantId/coupons/:couponId, DELETE /:tenantId/coupons/:couponId.
 * - Primary exports: couponRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantPermissions } from "../../middleware/authorize";
import { Permission } from "@fitconnect/shared/types/permissions";
import { couponController } from "./coupons.controller";
import type { AppBindings } from "../../types/app-context";

export const couponRoutes = new Hono<AppBindings>();

couponRoutes.get(
  "/:tenantId/coupons",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.list,
);

couponRoutes.post(
  "/:tenantId/coupons",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_CREATE),
  couponController.create,
);

/**
 * Pricing, declared before `/:couponId` so "quote" is never read as an id.
 * Gated on applying rather than managing: this is what the front desk calls.
 */
couponRoutes.post(
  "/:tenantId/coupons/quote",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_APPLY),
  couponController.quote,
);

// Coupon usage. Ahead of `/:couponId` so "analytics" is not read as an id.
couponRoutes.get(
  "/:tenantId/coupons/analytics",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.couponOverview,
);

couponRoutes.get(
  "/:tenantId/coupons/activity",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.couponActivity,
);

// The gym's coins in aggregate. Declared before the `:membershipId` route so
// "overview" is not read as somebody's membership id.
couponRoutes.get(
  "/:tenantId/coins/overview",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.coinOverview,
);

couponRoutes.get(
  "/:tenantId/coins/holders",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.coinHolders,
);

couponRoutes.get(
  "/:tenantId/coins/activity",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.coinActivity,
);

couponRoutes.get(
  "/:tenantId/coupons/coins/:membershipId",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.coins,
);

/**
 * Granting or clawing back coins by hand.
 *
 * `COUPONS_CREATE`, the grant that already decides who may invent a
 * discount: writing coins into somebody's balance is the same act by
 * another route, and it should not be a lesser permission.
 */
couponRoutes.post(
  "/:tenantId/coupons/coins/:membershipId/adjust",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_CREATE),
  couponController.adjustCoins,
);

couponRoutes.get(
  "/:tenantId/coupons/:couponId",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_READ),
  couponController.get,
);

couponRoutes.patch(
  "/:tenantId/coupons/:couponId",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_UPDATE),
  couponController.update,
);

couponRoutes.delete(
  "/:tenantId/coupons/:couponId",
  authenticate,
  requireTenantPermissions(Permission.COUPONS_DELETE),
  couponController.remove,
);
