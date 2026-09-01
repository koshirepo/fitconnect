/**
 * Documentation: Commerce service.
 *
 * - Implements the business rules for product catalog management, ordering, and admin order operations by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: commerceService.
 */
import type { OrderStatus } from "@fitconnect/shared/types/enums";
import { COMMERCE_DEFAULT_GST_RATE_PCT } from "@fitconnect/shared/constants";
import { createOrder, verifyCheckoutSignature, RazorpayError } from "../../lib/razorpay";
import { gatewayService } from "../payments/gateway.service";
import { commerceRepository } from "./commerce.repository";
import type {
  CreateProductInput,
  PlaceOrderInput,
  UpdateProductInput,
  VerifyOrderPaymentInput,
} from "./commerce.schema";

/**
 * Execute the `to string list` workflow for the commerce module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Execute the `map product` workflow for the commerce module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function mapProduct(product: {
  id: string;
  name: string;
  description: string | null;
  markdown: string | null;
  photos: unknown;
  category: string;
  price: number;
  stock: number;
  minOrderQty: number;
  maxOrderQty: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...product,
    photos: toStringList(product.photos),
    videos: [],
  };
}

/**
 * Execute the `map order` workflow for the commerce module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function mapOrder<T extends { items: Array<any> }>(order: T) {
  return {
    ...order,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  };
}

/**
 * Execute the `parse order creation error` workflow for the commerce module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function parseOrderCreationError(message: string) {
  if (message.startsWith("PRODUCT_NOT_FOUND:")) {
    return { error: "One or more selected products are unavailable.", status: 400 as const };
  }
  if (message.startsWith("QTY_RANGE:")) {
    const [, productName, min, max] = message.split(":");
    return {
      error: `Quantity for ${productName} must be between ${min} and ${max}.`,
      status: 400 as const,
    };
  }
  if (message.startsWith("INSUFFICIENT_STOCK:")) {
    const [, productName, available] = message.split(":");
    return {
      error: `Insufficient stock for ${productName}. Available: ${available}.`,
      status: 400 as const,
    };
  }
  return null;
}

export const commerceService = {
  /**
   * Execute the `list public products` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listPublicProducts(page: number, limit: number, category?: string, search?: string) {
    const { products, total } = await commerceRepository.listPublicProducts(
      page,
      limit,
      category,
      search,
    );
    return { data: { products: products.map(mapProduct) }, total };
  },

  /**
   * Execute the `get public product by id` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getPublicProductById(productId: string) {
    const product = await commerceRepository.findPublicProductById(productId);
    if (!product) return { error: "Product not found.", status: 404 as const };
    return { data: { product: mapProduct(product) } };
  },

  /**
   * Execute the `list admin products` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listAdminProducts(
    page: number,
    limit: number,
    includeInactive: boolean,
    category?: string,
    search?: string,
  ) {
    const { products, total } = await commerceRepository.listAdminProducts(
      page,
      limit,
      includeInactive,
      category,
      search,
    );
    return { data: { products: products.map(mapProduct) }, total };
  },

  /**
   * Execute the `get admin product by id` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getAdminProductById(productId: string) {
    const product = await commerceRepository.findProductById(productId);
    if (!product) return { error: "Product not found.", status: 404 as const };
    return { data: { product: mapProduct(product) } };
  },

  /**
   * Execute the `create product` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async createProduct(input: CreateProductInput) {
    if (input.maxOrderQty < input.minOrderQty) {
      return {
        error: "maxOrderQty must be greater than or equal to minOrderQty.",
        status: 400 as const,
      };
    }
    const product = await commerceRepository.createProduct(input);
    return { data: { product: mapProduct(product) } };
  },

  /**
   * Execute the `update product` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateProduct(productId: string, input: UpdateProductInput) {
    const existing = await commerceRepository.findProductById(productId);
    if (!existing) return { error: "Product not found.", status: 404 as const };

    const minOrderQty = input.minOrderQty ?? existing.minOrderQty;
    const maxOrderQty = input.maxOrderQty ?? existing.maxOrderQty;
    if (maxOrderQty < minOrderQty) {
      return {
        error: "maxOrderQty must be greater than or equal to minOrderQty.",
        status: 400 as const,
      };
    }

    const product = await commerceRepository.updateProduct(productId, input);
    return { data: { product: mapProduct(product) } };
  },

  /**
   * Execute the `delete product` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async deleteProduct(productId: string) {
    const existing = await commerceRepository.findProductById(productId);
    if (!existing) return { error: "Product not found.", status: 404 as const };

    const orderItemCount = await commerceRepository.countOrderItemsByProduct(productId);
    if (orderItemCount > 0) {
      return {
        error: "This product already has orders and cannot be deleted. Mark it inactive instead.",
        status: 409 as const,
      };
    }

    const product = await commerceRepository.deleteProduct(productId);
    return { data: { product: mapProduct(product) } };
  },

  /**
   * Execute the `place order` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async placeOrder(input: PlaceOrderInput, userId?: string) {
    const quantitiesByProduct = new Map<string, number>();
    // Merge duplicate product rows from the request into one quantity per
    // product so stock validation and order item creation stay deterministic.
    for (const item of input.items) {
      quantitiesByProduct.set(
        item.productId,
        (quantitiesByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const mergedItems = [...quantitiesByProduct.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
    }));

    try {
      const order = await commerceRepository.createOrderWithItems({
        userId,
        buyerName: input.buyerName,
        buyerEmail: input.buyerEmail,
        buyerPhone: input.buyerPhone,
        buyerAddress: input.buyerAddress,
        gstRatePct: COMMERCE_DEFAULT_GST_RATE_PCT,
        items: mergedItems,
      });
      return { data: { order: mapOrder(order) } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "ORDER_CREATION_FAILED";
      // The repository throws compact machine-oriented error codes so the
      // service can translate them into stable API messages here.
      const parsed = parseOrderCreationError(message);
      if (parsed) return parsed;
      throw err;
    }
  },

  /**
   * Place an order and open a payment for it.
   *
   * The order is created first and exactly as `placeOrder` creates it — same
   * stock claim, same server-side pricing — so the two paths can never disagree
   * about what was bought or what it costs. The amount handed to Razorpay is
   * the total the database computed, never a number from the request: a body
   * that could name its own amount could buy a ₹5,000 order for a rupee.
   *
   * A deployment with no gateway configured still takes the order and returns
   * `checkout: null`, which is exactly what this endpoint did before payment
   * existed — an unpaid order for someone to settle by hand.
   */
  async startCheckout(input: PlaceOrderInput, userId?: string) {
    const placed = await this.placeOrder(input, userId);
    if ("error" in placed) return placed;

    const order = placed.data.order;

    const credentials = gatewayService.resolvePlatformCredentials();
    if (!credentials) {
      return { data: { order, checkout: null } };
    }

    try {
      const gatewayOrder = await createOrder(credentials, {
        amount: order.totalAmount,
        receipt: order.id,
        notes: { kind: "platform shop" },
      });

      await commerceRepository.attachGatewayOrder(order.id, gatewayOrder.id);

      return {
        data: {
          order,
          checkout: {
            orderId: gatewayOrder.id,
            // Public by design — the checkout widget needs it in the browser.
            // The secret never leaves the API.
            keyId: credentials.keyId,
            amount: order.totalAmount,
            currency: "INR",
          },
        },
      };
    } catch (err) {
      /**
       * The order stands, unpaid.
       *
       * Rolling it back would put the stock right but throw away a real
       * purchase because Razorpay had a bad minute. Leaving it PENDING is the
       * same state the shop produced for every order before it took cards, and
       * the buyer is told to use the order id.
       */
      if (err instanceof RazorpayError) {
        return {
          error:
            "Your order was placed, but the payment window could not be opened. Use your order id to pay later.",
          status: 502 as const,
        };
      }
      throw err;
    }
  },

  /**
   * Settle an order against what Razorpay signed.
   *
   * The signature is what proves the browser is not simply claiming success:
   * only someone holding the key secret can produce it. Idempotent through a
   * conditional update, so a second arrival finds nothing left to do rather
   * than marking the same order paid twice.
   */
  async verifyPayment(input: VerifyOrderPaymentInput) {
    const credentials = gatewayService.resolvePlatformCredentials();
    if (!credentials) {
      return { error: "This shop is not taking card payments.", status: 409 as const };
    }

    const valid = await verifyCheckoutSignature(credentials.keySecret, input);
    if (!valid) {
      return { error: "That payment could not be verified.", status: 400 as const };
    }

    const order = await commerceRepository.findOrderByGatewayOrderId(input.orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    const settled = await commerceRepository.markOrderPaid(order.id, input.paymentId);

    return {
      data: {
        order: mapOrder(order),
        orderId: order.id,
        // False when somebody else settled it first, which is a success for the
        // caller — the money is in either way.
        alreadySettled: !settled,
      },
    };
  },

  /**
   * Execute the `get order by id` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getOrderById(orderId: string) {
    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };
    return { data: { order: mapOrder(order) } };
  },

  /**
   * Execute the `list my orders` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listMyOrders(userId: string, page: number, limit: number) {
    const { orders, total } = await commerceRepository.listOrdersByUser(userId, page, limit);
    return { data: { orders: orders.map(mapOrder) }, total };
  },

  /**
   * Execute the `list all orders` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listAllOrders(page: number, limit: number, status?: string, productId?: string) {
    const { orders, total } = await commerceRepository.listAllOrders(
      page,
      limit,
      status,
      productId,
    );
    return { data: { orders: orders.map(mapOrder) }, total };
  },

  /**
   * Execute the `update order status` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const existing = await commerceRepository.findOrderById(orderId);
    if (!existing) return { error: "Order not found.", status: 404 as const };
    // Return the previous status alongside the updated row so callers can
    // audit the transition without issuing a second lookup.
    const order = await commerceRepository.updateOrderStatus(orderId, status);
    return { data: { order: mapOrder(order) }, previousStatus: existing.status };
  },

  /**
   * Execute the `delete order` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async deleteOrder(orderId: string) {
    const existing = await commerceRepository.findOrderById(orderId);
    if (!existing) return { error: "Order not found.", status: 404 as const };

    // Delete the order first so retries cannot accidentally restore stock twice.
    const deletedOrder = await commerceRepository.deleteOrder(orderId);
    await commerceRepository.restoreStockForOrderItems(
      deletedOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    );

    return {
      data: { order: mapOrder(deletedOrder) },
      previousStatus: existing.status,
    };
  },
};
