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
commerceRoutes.patch(
  "/admin/products/:productId",
  authenticate,
  requirePlatformRoles([PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT]),
  commerceController.updateProduct,
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
