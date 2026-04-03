/**
 * Documentation: Commerce routes.
 *
 * - Declares the Hono routes and middleware chain for product catalog management, ordering, and admin order operations. This route set is mounted from `/` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /products, GET /products/:id, POST /orders, GET /orders/me, GET /orders/:id, GET /admin/products, GET /admin/products/:productId, POST /admin/products, PATCH /admin/products/:productId, DELETE /admin/products/:productId, GET /admin/orders, GET /admin/orders/:orderId, PATCH /admin/orders/:orderId/status.
 * - Primary exports: commerceRoutes.
 */
import { Hono } from "hono";
import { PlatformRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePlatformRoles } from "../../middleware/authorize";
import { commerceController } from "./commerce.controller";
import type { AppBindings } from "../../types/app-context";

export const commerceRoutes = new Hono<AppBindings>();

// Public catalog + ordering
commerceRoutes.get("/products", commerceController.listPublicProducts);
commerceRoutes.get("/products/:id", commerceController.getPublicProductById);
commerceRoutes.post("/orders", optionalAuthenticate, commerceController.placeOrder);

// Logged-in users
commerceRoutes.get("/orders/me", authenticate, commerceController.listMyOrders);
commerceRoutes.get("/orders/:id", commerceController.getOrderById);

// Platform product management (super-admin / support)
commerceRoutes.get(
  "/admin/products",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  commerceController.listAdminProducts,
);
commerceRoutes.post(
  "/admin/products",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  commerceController.createProduct,
);
commerceRoutes.get(
  "/admin/products/:productId",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  commerceController.getAdminProductById,
);
commerceRoutes.patch(
  "/admin/products/:productId",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  commerceController.updateProduct,
);
commerceRoutes.delete(
  "/admin/products/:productId",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  commerceController.deleteProduct,
);

// Platform order management (super-admin only)
commerceRoutes.get(
  "/admin/orders",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN]),
  commerceController.listAdminOrders,
);
commerceRoutes.get(
  "/admin/orders/:orderId",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN]),
  commerceController.getAdminOrderById,
);
commerceRoutes.patch(
  "/admin/orders/:orderId/status",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN]),
  commerceController.updateOrderStatus,
);
