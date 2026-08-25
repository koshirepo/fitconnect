/**
 * Documentation: Commerce routes.
 *
 * - Declares the Hono routes and middleware chain for product catalog management, ordering, and admin order operations. This route set is mounted from `/` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /products, GET /products/:id, POST /orders, GET /orders/me, GET /orders/:id, GET /admin/products, GET /admin/products/:productId, POST /admin/products, PATCH /admin/products/:productId, DELETE /admin/products/:productId, GET /admin/orders, GET /admin/orders/:orderId, PATCH /admin/orders/:orderId/status, DELETE /admin/orders/:orderId.
 * - Primary exports: commerceRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePermissions } from "../../middleware/authorize";
import { commerceController } from "./commerce.controller";
import type { AppBindings } from "../../types/app-context";

export const commerceRoutes = new Hono<AppBindings>();

// Public catalog + ordering
commerceRoutes.get("/products", commerceController.listPublicProducts);
commerceRoutes.get("/products/:id", commerceController.getPublicProductById);
commerceRoutes.post("/orders", optionalAuthenticate, commerceController.placeOrder);

// Logged-in users
commerceRoutes.get(
  "/orders/me",
  authenticate,
  requirePermissions(Permission.ORDERS_READ_SELF),
  commerceController.listMyOrders,
);
// Guest order-status lookup: the order id itself is the bearer secret.
commerceRoutes.get("/orders/:id", commerceController.getOrderById);

// Platform product management
commerceRoutes.get(
  "/admin/products",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_READ),
  commerceController.listAdminProducts,
);
commerceRoutes.post(
  "/admin/products",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_CREATE),
  commerceController.createProduct,
);
commerceRoutes.get(
  "/admin/products/:productId",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_READ),
  commerceController.getAdminProductById,
);
commerceRoutes.patch(
  "/admin/products/:productId",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_UPDATE),
  commerceController.updateProduct,
);
commerceRoutes.delete(
  "/admin/products/:productId",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_DELETE),
  commerceController.deleteProduct,
);

// Platform order management
commerceRoutes.get(
  "/admin/orders",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_READ),
  commerceController.listAdminOrders,
);
commerceRoutes.get(
  "/admin/orders/:orderId",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_READ),
  commerceController.getAdminOrderById,
);
commerceRoutes.patch(
  "/admin/orders/:orderId/status",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  commerceController.updateOrderStatus,
);
commerceRoutes.delete(
  "/admin/orders/:orderId",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_DELETE),
  commerceController.deleteOrder,
);
