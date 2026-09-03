/**
 * Documentation: Commerce routes.
 *
 * - Declares the Hono routes and middleware chain for product catalog management, ordering, and admin order operations. This route set is mounted from `/` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /admin/warehouses, POST /admin/warehouses, GET /admin/warehouses/:warehouseId, PATCH /admin/warehouses/:warehouseId, POST /admin/warehouses/:warehouseId/register, DELETE /admin/warehouses/:warehouseId, POST /admin/warehouses/:warehouseId/pickups, GET /admin/shipments/:shipmentId/label, GET /products, GET /products/:id, POST /orders, POST /orders/checkout, POST /orders/checkout/verify, GET /shipping/serviceability, POST /shipping/quote, GET /orders/me, GET /orders/:id, GET /orders/:id/tracking, POST /orders/:id/cancel, POST /orders/:id/returns, GET /admin/products, GET /admin/products/:productId, POST /admin/products, PATCH /admin/products/:productId, DELETE /admin/products/:productId, GET /admin/orders, GET /admin/orders/:orderId, PATCH /admin/orders/:orderId/status, DELETE /admin/orders/:orderId, POST /admin/orders/:orderId/ship, POST /admin/orders/:orderId/cancel, POST /admin/orders/:orderId/refund, GET /admin/returns, POST /admin/returns/:returnId/decision, POST /admin/returns/:returnId/received.
 * - Primary exports: commerceRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePermissions } from "../../middleware/authorize";
import { commerceController } from "./commerce.controller";
import { warehouseController } from "./warehouse.controller";
import { trackingWebhookController } from "./tracking-webhook.controller";
import type { AppBindings } from "../../types/app-context";

export const commerceRoutes = new Hono<AppBindings>();

// Public catalog + ordering
commerceRoutes.get("/products", commerceController.listPublicProducts);
commerceRoutes.get("/products/:id", commerceController.getPublicProductById);
commerceRoutes.post("/orders", optionalAuthenticate, commerceController.placeOrder);
/**
 * Paying for a shop order.
 *
 * Unauthenticated by design — the platform storefront sells to visitors, the
 * same as the gym storefront beside it. What protects it is that the price is
 * recomputed from the database rather than read from the request, and that an
 * order only becomes paid against a signature produced with our key secret.
 * A deployment with no gateway configured still takes the order, unpaid.
 */
commerceRoutes.post("/orders/checkout", optionalAuthenticate, commerceController.startCheckout);
commerceRoutes.post("/orders/checkout/verify", commerceController.verifyOrderPayment);

/**
 * Shipping questions the checkout asks before an order exists.
 *
 * Both are public because both are asked by someone who has not bought
 * anything yet, and neither reveals more than a courier's own website does.
 */
commerceRoutes.get("/shipping/serviceability", commerceController.checkServiceability);
commerceRoutes.post("/shipping/quote", commerceController.quoteShipping);

// Logged-in users
commerceRoutes.get(
  "/orders/me",
  authenticate,
  requirePermissions(Permission.ORDERS_READ_SELF),
  commerceController.listMyOrders,
);
// Guest order-status lookup: the order id itself is the bearer secret.
commerceRoutes.get("/orders/:id", commerceController.getOrderById);
/**
 * The order's whole journey, and what the buyer may still do about it.
 *
 * Unauthenticated on the same terms as the lookup above: whoever holds the
 * order id placed the order or was given it. Cancelling and returning sit on
 * the same footing — they act on that one order and nothing else.
 */
commerceRoutes.get("/orders/:id/tracking", commerceController.getOrderTracking);
commerceRoutes.post("/orders/:id/cancel", commerceController.cancelOrder);
commerceRoutes.post("/orders/:id/returns", commerceController.requestReturn);

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

// Fulfilment, returns and refunds. All of it sits behind ORDERS_UPDATE: booking
// a courier, cancelling a parcel and sending money back are the same authority
// over one order, and splitting them would only invent permissions nobody grants
// separately.
commerceRoutes.post(
  "/admin/orders/:orderId/ship",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  commerceController.shipOrder,
);
commerceRoutes.post(
  "/admin/orders/:orderId/cancel",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  commerceController.adminCancelOrder,
);
commerceRoutes.post(
  "/admin/orders/:orderId/refund",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  commerceController.refundOrder,
);
commerceRoutes.get(
  "/admin/returns",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_READ),
  commerceController.listReturns,
);
commerceRoutes.post(
  "/admin/returns/:returnId/decision",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  commerceController.decideReturn,
);
commerceRoutes.post(
  "/admin/returns/:returnId/received",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  commerceController.receiveReturn,
);

// The label a parcel ships under, fetched from the courier on demand.
commerceRoutes.get(
  "/admin/shipments/:shipmentId/label",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_READ),
  commerceController.getShipmentLabel,
);

/**
 * Warehouses — the places parcels leave from.
 *
 * Behind the catalog permissions rather than the order ones: deciding where a
 * product ships from is the same authority as deciding what the product is, and
 * whoever manages stock manages the shelves it sits on. Scheduling a pickup is
 * the exception that proves it — that is fulfilment, so it takes ORDERS_UPDATE.
 */
commerceRoutes.get(
  "/admin/warehouses",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_READ),
  warehouseController.listWarehouses,
);
commerceRoutes.post(
  "/admin/warehouses",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_CREATE),
  warehouseController.createWarehouse,
);
commerceRoutes.get(
  "/admin/warehouses/:warehouseId",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_READ),
  warehouseController.getWarehouse,
);
commerceRoutes.patch(
  "/admin/warehouses/:warehouseId",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_UPDATE),
  warehouseController.updateWarehouse,
);
commerceRoutes.post(
  "/admin/warehouses/:warehouseId/register",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_UPDATE),
  warehouseController.registerWarehouse,
);
commerceRoutes.delete(
  "/admin/warehouses/:warehouseId",
  authenticate,
  requirePermissions(Permission.PLATFORM_PRODUCTS_DELETE),
  warehouseController.deleteWarehouse,
);
commerceRoutes.post(
  "/admin/warehouses/:warehouseId/pickups",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  warehouseController.schedulePickup,
);


// Waybills reserved ahead of a packing run. Fulfilment stationery, so it sits
// with the other dispatch actions rather than with the catalog.
commerceRoutes.get(
  "/admin/shipments/waybills",
  authenticate,
  requirePermissions(Permission.PLATFORM_ORDERS_UPDATE),
  warehouseController.reserveWaybills,
);

/**
 * Courier callbacks, mounted separately because they carry no session.
 *
 * Delhivery provides no signature of any kind, so the shared secret in
 * `DELHIVERY_WEBHOOK_TOKEN` is the whole of the authentication — the endpoint
 * refuses everything until it is set. Deliberately outside `commerceRoutes`:
 * nothing here should ever pick up the authenticate middleware by accident.
 */
export const courierWebhookRoutes = new Hono<AppBindings>();

courierWebhookRoutes.post("/delhivery/tracking", trackingWebhookController.push);
