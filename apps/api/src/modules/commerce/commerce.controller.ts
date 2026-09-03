/**
 * Documentation: Commerce controller.
 *
 * - Owns the HTTP boundary for product catalog management, ordering, and admin order operations, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: commerceController.
 */
import type { Context } from "hono";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { auditLog } from "../../lib/audit";
import { ok, okPaginated, badRequest, notFound, conflict, failWith } from "../../lib/response";
import { commerceService } from "./commerce.service";
import {
  cancelOrderSchema,
  createProductSchema,
  createReturnSchema,
  decideReturnSchema,
  placeOrderSchema,
  refundOrderSchema,
  serviceabilityQuerySchema,
  shippingQuoteSchema,
  verifyOrderPaymentSchema,
  updateOrderStatusSchema,
  updateProductSchema,
} from "./commerce.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const commerceController = {
  /**
   * Handle the `list public products` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listPublicProducts(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const category = c.req.query("category");
    const search = c.req.query("search");
    const { data, total } = await commerceService.listPublicProducts(page, limit, category, search);
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `get public product by id` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getPublicProductById(c: AppContext) {
    const productId = c.req.param("id")!;
    const result = await commerceService.getPublicProductById(productId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  /**
   * Handle the `place order` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async placeOrder(c: AppContext) {
    const parsed = await parseBody(c, placeOrderSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("optionalAuthUser")?.id;
    const result = await commerceService.placeOrder(parsed.data, userId);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data, 201);
  },

  /**
   * Handle the `start checkout` HTTP action for the commerce module.
   * Places the order and opens the Razorpay payment for it.
   */
  async startCheckout(c: AppContext) {
    const parsed = await parseBody(c, placeOrderSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("optionalAuthUser")?.id;
    const result = await commerceService.startCheckout(parsed.data, userId);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data, 201);
  },

  /**
   * Handle the `verify order payment` HTTP action for the commerce module.
   * Settles the order against the signature the checkout widget returned.
   */
  async verifyOrderPayment(c: AppContext) {
    const parsed = await parseBody(c, verifyOrderPaymentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.verifyPayment(parsed.data);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /**
   * Handle the `get order by id` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getOrderById(c: AppContext) {
    const orderId = c.req.param("id")!;
    const result = await commerceService.getOrderById(orderId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  /**
   * Handle the `list my orders` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listMyOrders(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const userId = c.get("authUser").id;
    const { data, total } = await commerceService.listMyOrders(userId, page, limit);
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `list admin products` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listAdminProducts(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const includeInactive = c.req.query("includeInactive") !== "false";
    const category = c.req.query("category");
    const search = c.req.query("search");
    const { data, total } = await commerceService.listAdminProducts(
      page,
      limit,
      includeInactive,
      category,
      search,
    );
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `get admin product by id` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getAdminProductById(c: AppContext) {
    const productId = c.req.param("productId")!;
    const result = await commerceService.getAdminProductById(productId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  /**
   * Handle the `create product` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async createProduct(c: AppContext) {
    const parsed = await parseBody(c, createProductSchema);
    if (!parsed.ok) return parsed.response;
    const result = await commerceService.createProduct(parsed.data);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "CREATE",
      entity: "Product",
      entityId: result.data.product.id,
      actorId: c.get("authUser").id,
      metadata: { category: parsed.data.category, price: parsed.data.price },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `update product` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updateProduct(c: AppContext) {
    const productId = c.req.param("productId")!;
    const parsed = await parseBody(c, updateProductSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.updateProduct(productId, parsed.data);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "Product",
      entityId: productId,
      actorId: c.get("authUser").id,
      metadata: { fields: Object.keys(parsed.data) },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `delete product` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async deleteProduct(c: AppContext) {
    const productId = c.req.param("productId")!;
    const result = await commerceService.deleteProduct(productId);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      if (result.status === 409) return conflict(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "DELETE",
      entity: "Product",
      entityId: productId,
      actorId: c.get("authUser").id,
      metadata: {
        name: result.data.product.name,
        category: result.data.product.category,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `list admin orders` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listAdminOrders(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const status = c.req.query("status");
    const productId = c.req.query("productId");
    const { data, total } = await commerceService.listAllOrders(page, limit, status, productId);
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `get admin order by id` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getAdminOrderById(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const result = await commerceService.getOrderById(orderId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  /**
   * Handle the `update order status` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updateOrderStatus(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const parsed = await parseBody(c, updateOrderStatusSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.updateOrderStatus(orderId, parsed.data.status);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "Order",
      entityId: orderId,
      actorId: c.get("authUser").id,
      metadata: { from: result.previousStatus, to: parsed.data.status },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `delete order` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async deleteOrder(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const result = await commerceService.deleteOrder(orderId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "Order",
      entityId: orderId,
      actorId: c.get("authUser").id,
      metadata: {
        status: result.previousStatus,
        totalAmount: result.data.order.totalAmount,
        itemCount: result.data.order.items.length,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `check pincode serviceability` HTTP action.
   * Public: the checkout asks this before the buyer has committed to anything.
   */
  async checkServiceability(c: AppContext) {
    const parsed = serviceabilityQuerySchema.safeParse({ pincode: c.req.query("pincode") ?? "" });
    if (!parsed.success) return badRequest(c, "Enter a valid 6-digit pincode.");

    const result = await commerceService.checkServiceability(parsed.data.pincode);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /**
   * Handle the `quote shipping` HTTP action.
   * The basket goes in the body because a cart can be longer than a URL.
   */
  async quoteShipping(c: AppContext) {
    const parsed = await parseBody(c, shippingQuoteSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.quoteShipping(parsed.data.items, parsed.data.pincode);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /**
   * Handle the `get order tracking` HTTP action.
   * Unauthenticated like the order lookup beside it: the order id is the secret.
   */
  async getOrderTracking(c: AppContext) {
    const orderId = c.req.param("id")!;
    const result = await commerceService.getOrderTracking(orderId);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /** Handle the `cancel order` HTTP action for a buyer holding the order id. */
  async cancelOrder(c: AppContext) {
    const orderId = c.req.param("id")!;
    const parsed = await parseBody(c, cancelOrderSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.cancelOrder(orderId, parsed.data, "BUYER");
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /** Handle the `request return` HTTP action for a buyer holding the order id. */
  async requestReturn(c: AppContext) {
    const orderId = c.req.param("id")!;
    const parsed = await parseBody(c, createReturnSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.requestReturn(orderId, parsed.data);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data, 201);
  },

  /** Handle the `ship order` HTTP action — book the courier by hand. */
  async shipOrder(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const result = await commerceService.shipOrder(orderId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "Order",
      entityId: orderId,
      actorId: c.get("authUser").id,
      metadata: { shipped: true, waybill: result.data.shipment.waybill },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** Handle the `admin cancel order` HTTP action, which may cancel a shipped one. */
  async adminCancelOrder(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const parsed = await parseBody(c, cancelOrderSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.cancelOrder(orderId, parsed.data, "ADMIN");
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "Order",
      entityId: orderId,
      actorId: c.get("authUser").id,
      metadata: { cancelled: true, refunded: result.data.refunded, reason: parsed.data.reason },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** Handle the `refund order` HTTP action, in full or in part. */
  async refundOrder(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const parsed = await parseBody(c, refundOrderSchema);
    if (!parsed.ok) return parsed.response;

    // The key names the order and the admin's intent, so a double-submitted
    // form is one refund while a genuine second refund is still possible.
    const result = await commerceService.refundOrder(
      orderId,
      parsed.data,
      `manual-${orderId}-${parsed.data.amount ?? "full"}`,
    );
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "Order",
      entityId: orderId,
      actorId: c.get("authUser").id,
      metadata: { refunded: result.data.refunded, amount: parsed.data.amount ?? "full" },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** Handle the `get shipment label` HTTP action — a link to the courier's PDF. */
  async getShipmentLabel(c: AppContext) {
    const shipmentId = c.req.param("shipmentId")!;
    const result = await commerceService.getShipmentLabel(shipmentId);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /** Handle the `list returns` HTTP action for the returns queue. */
  async listReturns(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const status = c.req.query("status");
    const { data, total } = await commerceService.listReturns(page, limit, status);
    return okPaginated(c, data, { page, limit, total });
  },

  /** Handle the `decide return` HTTP action — approve and book, or reject. */
  async decideReturn(c: AppContext) {
    const returnId = c.req.param("returnId")!;
    const parsed = await parseBody(c, decideReturnSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.decideReturn(
      returnId,
      parsed.data,
      c.get("authUser").id,
    );
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "ReturnRequest",
      entityId: returnId,
      actorId: c.get("authUser").id,
      metadata: { decision: parsed.data.decision },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** Handle the `receive return` HTTP action, which is also what pays the buyer back. */
  async receiveReturn(c: AppContext) {
    const returnId = c.req.param("returnId")!;
    const result = await commerceService.markReturnReceived(returnId, c.get("authUser").id);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "ReturnRequest",
      entityId: returnId,
      actorId: c.get("authUser").id,
      metadata: { received: true, refunded: result.data.refunded },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
