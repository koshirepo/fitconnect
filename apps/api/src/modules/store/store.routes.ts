/**
 * Documentation: Gym store catalogue routes.
 *
 * - Declares the routing and authorization for a gym's own catalogue. Mounted under `/tenants` in the application entrypoint.
 * - Reading needs `STORE_READ`, which every member holds — the storefront is the point. Every write needs `STORE_MANAGE`, which only admins hold, so a member cannot reprice what they are about to buy.
 * - Relative endpoints declared in this file: GET /:tenantId/store/products, GET /:tenantId/store/products/:productId, POST /:tenantId/store/products, PATCH /:tenantId/store/products/:productId, DELETE /:tenantId/store/products/:productId, POST /:tenantId/store/products/:productId/variants, PATCH /:tenantId/store/variants/:variantId, DELETE /:tenantId/store/variants/:variantId, POST /:tenantId/store/variants/:variantId/stock.
 * - Primary exports: storeRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { idempotency } from "../../middleware/idempotency";
import { requireAnyTenantPermission, requireTenantPermissions } from "../../middleware/authorize";
import {
  storeCheckoutController,
  storeController,
  storeSaleController,
} from "./store.controller";
import type { AppBindings } from "../../types/app-context";

export const storeRoutes = new Hono<AppBindings>();

// ─── Catalogue reads ─────────────────────────────────────────────────────────

storeRoutes.get(
  "/:tenantId/store/products",
  authenticate,
  requireTenantPermissions(Permission.STORE_READ),
  storeController.listProducts,
);

storeRoutes.get(
  "/:tenantId/store/products/:productId",
  authenticate,
  requireTenantPermissions(Permission.STORE_READ),
  storeController.getProduct,
);

// ─── Catalogue management ────────────────────────────────────────────────────

storeRoutes.post(
  "/:tenantId/store/products",
  authenticate,
  requireTenantPermissions(Permission.STORE_MANAGE),
  storeController.createProduct,
);

storeRoutes.patch(
  "/:tenantId/store/products/:productId",
  authenticate,
  requireTenantPermissions(Permission.STORE_MANAGE),
  storeController.updateProduct,
);

storeRoutes.delete(
  "/:tenantId/store/products/:productId",
  authenticate,
  requireTenantPermissions(Permission.STORE_MANAGE),
  storeController.deleteProduct,
);

storeRoutes.post(
  "/:tenantId/store/products/:productId/variants",
  authenticate,
  requireTenantPermissions(Permission.STORE_MANAGE),
  storeController.addVariant,
);

storeRoutes.patch(
  "/:tenantId/store/variants/:variantId",
  authenticate,
  requireTenantPermissions(Permission.STORE_MANAGE),
  storeController.updateVariant,
);

storeRoutes.delete(
  "/:tenantId/store/variants/:variantId",
  authenticate,
  requireTenantPermissions(Permission.STORE_MANAGE),
  storeController.deleteVariant,
);

/**
 * Stock movements — a delivery arriving, or a miscount corrected.
 *
 * A sale never comes through here: it decrements conditionally as part of
 * taking the money, so the two cannot drift apart.
 */
storeRoutes.post(
  "/:tenantId/store/variants/:variantId/stock",
  authenticate,
  requireTenantPermissions(Permission.STORE_MANAGE),
  storeController.adjustStock,
);

/**
 * Sell to a member at the counter.
 *
 * `STORE_SELL`, which coaches and admins hold — a member cannot ring up a sale
 * for themselves at counter prices with no money changing hands.
 */
storeRoutes.post(
  "/:tenantId/store/sales",
  authenticate,
  requireTenantPermissions(Permission.STORE_SELL),
  storeSaleController.sellAtCounter,
);

/**
 * Buying online, for oneself.
 *
 * `STORE_BUY_SELF`, which every member holds. The buyer is taken from the
 * session rather than the body, so these need no further scoping.
 */
storeRoutes.post(
  "/:tenantId/store/checkout",
  authenticate,
  requireTenantPermissions(Permission.STORE_BUY_SELF),
  storeCheckoutController.start,
);

/** Reserve now, pay at the counter. Same grant as buying online. */
storeRoutes.post(
  "/:tenantId/store/reserve",
  authenticate,
  requireTenantPermissions(Permission.STORE_BUY_SELF),
  storeCheckoutController.reserve,
);

storeRoutes.post(
  "/:tenantId/store/checkout/verify",
  authenticate,
  requireTenantPermissions(Permission.STORE_BUY_SELF),
  storeCheckoutController.verify,
);

/** The same till, for a buyer who has not joined the gym. */
storeRoutes.post(
  "/:tenantId/store/sales/guest",
  authenticate,
  idempotency,
  requireTenantPermissions(Permission.STORE_SELL),
  storeCheckoutController.sellToGuest,
);

/**
 * The counter's side of a reservation.
 *
 * `STORE_SELL`, the same grant that rings up a counter sale: handing goods over
 * and taking money for them is the same act whether the basket was chosen at
 * the desk or on a phone an hour earlier.
 */
storeRoutes.get(
  "/:tenantId/store/orders",
  authenticate,
  requireAnyTenantPermission(Permission.STORE_SELL, Permission.STORE_MANAGE),
  storeCheckoutController.listOrders,
);

storeRoutes.post(
  "/:tenantId/store/orders/:orderId/complete",
  authenticate,
  // Replaying a lost response must not sell the same basket twice.
  idempotency,
  requireTenantPermissions(Permission.STORE_SELL),
  storeCheckoutController.completeOrder,
);

storeRoutes.post(
  "/:tenantId/store/orders/:orderId/reject",
  authenticate,
  requireTenantPermissions(Permission.STORE_SELL),
  storeCheckoutController.cancelReservation,
);

/** Releases the stock a closed payment window was holding. */
storeRoutes.post(
  "/:tenantId/store/orders/:orderId/cancel",
  authenticate,
  requireTenantPermissions(Permission.STORE_BUY_SELF),
  storeCheckoutController.cancel,
);
