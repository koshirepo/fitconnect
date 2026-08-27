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
import { requireTenantPermissions } from "../../middleware/authorize";
import { storeController, storeSaleController } from "./store.controller";
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
