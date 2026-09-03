/**
 * Documentation: Commerce service.
 *
 * - Implements the business rules for product catalog management, ordering, and admin order operations by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: commerceService.
 */
import type { OrderStatus } from "@fitconnect/shared/types/enums";
import { COMMERCE_DEFAULT_GST_RATE_PCT } from "@fitconnect/shared/constants";
import { config } from "../../config";
import {
  createOrder,
  createRefund,
  verifyCheckoutSignature,
  RazorpayError,
} from "../../lib/razorpay";
import { gatewayService } from "../payments/gateway.service";
import { commerceRepository } from "./commerce.repository";
import { shippingRepository } from "./shipping.repository";
import { shippingService } from "./shipping.service";
import type {
  CancelOrderInput,
  CreateProductInput,
  CreateReturnInput,
  DecideReturnInput,
  PlaceOrderInput,
  RefundOrderInput,
  UpdateProductInput,
  VerifyOrderPaymentInput,
} from "./commerce.schema";

/** Fulfilment states a buyer may still call an order off from. */
const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED", "PACKED"]);

/**
 * How a courier's view of a parcel translates into the order's own status.
 *
 * The order is the thing the buyer reads, so it follows the forward parcel:
 * once Delhivery says delivered, the order is delivered.
 */
const ORDER_STATUS_BY_SHIPMENT: Record<string, string> = {
  MANIFESTED: "SHIPPED",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
};

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
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  warehouseId?: string | null;
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
    // Carriage is priced here, from the courier, against the basket the server
    // resolved — never from the request. A browser that could name its own
    // shipping could ship a 20kg parcel for a rupee.
    const quote = await shippingService.quote(input.items, input.buyerPincode);
    if ("error" in quote) return { error: quote.error!, status: quote.status! };

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
        buyerCity: input.buyerCity,
        buyerState: input.buyerState,
        buyerPincode: input.buyerPincode,
        gstRatePct: COMMERCE_DEFAULT_GST_RATE_PCT,
        shippingAmount: quote.data.shippingAmount,
        // Recorded, not acted on. A quote that came out short still lets the
        // sale through — that is deliberate — but the shop should not have to
        // find out from an invoice weeks later.
        shippingQuoteIssue: quote.data.quoteIssue ?? null,
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

    /**
     * Book the courier on the way through, but never at the payment's expense.
     *
     * The money is in and the order is confirmed by this point; a courier that
     * refuses the manifest — no warehouse configured, an address it will not
     * route to — must not turn a successful payment into an error the buyer
     * sees. It stays CONFIRMED for an admin to dispatch by hand.
     */
    if (settled) {
      // No pre-flight check: booking refuses on its own and names the one thing
      // that is missing. A second gate beside it is how the two end up
      // disagreeing — one reading config, the other reading warehouses.
      const booked = await shippingService.bookForwardShipment(order);
      if (!("error" in booked) && !booked.data.alreadyBooked) {
        await commerceRepository.advanceOrderStatus(order.id, "SHIPPED");
      }
    }

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

  /** Is this pincode deliverable, and can a return be collected from it? */
  async checkServiceability(pincode: string) {
    return shippingService.checkServiceability(pincode);
  },

  /** What carriage costs for this basket, before the buyer commits to it. */
  async quoteShipping(items: Array<{ productId: string; quantity: number }>, pincode: string) {
    return shippingService.quote(items, pincode);
  },

  /**
   * An order with everything that has happened to it: parcels and returns.
   *
   * Tracking is refreshed on the way past — at most once every few minutes per
   * parcel — and the order's own status follows the forward consignment, so a
   * buyer who opens this page is the reason the order says "out for delivery".
   */
  async getOrderTracking(orderId: string) {
    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    const shipments = await shippingRepository.listShipmentsByOrder(orderId);

    const synced = await Promise.all(
      shipments.map(async (shipment) => (await shippingService.syncShipment(shipment)) ?? shipment),
    );

    const forward = synced.find((shipment) => shipment.kind === "FORWARD");
    let current = order;

    if (forward) {
      const mapped = ORDER_STATUS_BY_SHIPMENT[forward.status];
      // CANCELLED and RETURNED are decisions the shop made, and a courier scan
      // arriving afterwards must not walk the order back out of them.
      const settled = order.status === "CANCELLED" || order.status === "RETURNED";

      if (mapped && !settled && mapped !== order.status) {
        current = await commerceRepository.advanceOrderStatus(
          orderId,
          mapped as "SHIPPED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED",
        );
      }
    }

    const returns = await shippingRepository.listReturnsByOrder(orderId);

    return {
      data: {
        order: mapOrder(current),
        shipments: synced,
        returns,
        /** What the buyer may still do, decided here rather than in the browser. */
        canCancel: this.canCancel(current),
        canRequestReturn: await this.canRequestReturn(current),
        /** The policy behind that answer, so the page can explain a refusal. */
        returnPolicy: await this.returnPolicyForOrder(orderId),
      },
    };
  },

  /** Cancelling is allowed until the parcel is with the courier. */
  canCancel(order: { status: string }) {
    return CANCELLABLE_STATUSES.has(order.status);
  },

  /**
   * Returns are open for a fixed window after delivery, once per order.
   *
   * The window is counted from delivery rather than from the order date: a
   * parcel that took ten days to arrive would otherwise land outside it.
   */
  async canRequestReturn(order: { id: string; status: string; deliveredAt: Date | null }) {
    if (order.status !== "DELIVERED" || !order.deliveredAt) return false;

    const policy = await this.returnPolicyForOrder(order.id);
    if (!policy.returnable) return false;

    const deadline = order.deliveredAt.getTime() + policy.windowDays * 24 * 60 * 60 * 1000;
    if (Date.now() > deadline) return false;

    const open = await shippingRepository.findOpenReturnByOrder(order.id);
    return !open;
  },

  /**
   * What an order as a whole may do, from the policies of the things in it.
   *
   * A return is booked against the order, not the line — one reverse
   * consignment carries the parcel back — so a basket is only returnable when
   * everything in it is. Allowing it on a mixed order would send the
   * non-returnable item back with the rest, which is precisely what the flag
   * exists to prevent.
   *
   * The window is the shortest any item allows, for the same reason: the parcel
   * travels as one, so it cannot go back later than its tightest item permits.
   */
  async returnPolicyForOrder(orderId: string) {
    const items = await commerceRepository.findOrderReturnPolicy(orderId);

    const blocked = items.filter((item) => !item.isReturnable);
    const windows = items
      .map((item) => item.returnWindowDays ?? config.returnWindowDays)
      .filter((days) => days > 0);

    return {
      returnable: items.length > 0 && blocked.length === 0,
      /** Named, so the buyer is told which item closed the door. */
      blockedBy: blocked.map((item) => item.productName),
      replaceable: items.length > 0 && items.every((item) => item.isReplaceable),
      windowDays: windows.length > 0 ? Math.min(...windows) : config.returnWindowDays,
      notes: items
        .filter((item) => item.returnPolicyNote)
        .map((item) => item.productName + ": " + item.returnPolicyNote),
    };
  },

  /**
   * Call an order off and put the money back.
   *
   * Order of operations matters: the consignment is cancelled first, because a
   * refunded order whose parcel is still travelling is the one outcome nobody
   * can undo. Stock returns last, after the order is safely marked cancelled.
   */
  async cancelOrder(orderId: string, input: CancelOrderInput, actor: "BUYER" | "ADMIN") {
    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    if (actor === "BUYER" && !this.canCancel(order)) {
      return {
        error:
          order.status === "CANCELLED"
            ? "This order is already cancelled."
            : "This order has already left the warehouse and can no longer be cancelled. Refuse the delivery to send it back.",
        status: 409 as const,
      };
    }

    const shipmentCancelled = await shippingService.cancelForwardShipment(orderId);
    if ("error" in shipmentCancelled && actor === "BUYER") {
      return { error: shipmentCancelled.error!, status: shipmentCancelled.status! };
    }

    const cancelled = await commerceRepository.cancelOrder(orderId, input.reason);
    if (!cancelled) return { error: "This order is already cancelled.", status: 409 as const };

    await commerceRepository.restoreStockForOrderItems(
      order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    );

    const refund = await this.refundOrder(orderId, {}, `cancel-${orderId}`);

    const current = await commerceRepository.findOrderById(orderId);

    // Surfaced rather than thrown: the order is cancelled either way, and an
    // admin needs to know when the money is still sitting with the gateway.
    const refundFailed = "error" in refund;

    return {
      data: {
        order: mapOrder(current ?? order),
        refunded: refundFailed ? false : refund.data.refunded,
        refundError: refundFailed ? refund.error! : null,
      },
    };
  },

  /**
   * Send money back for an order.
   *
   * Idempotent through Razorpay's own key, which is why the caller passes one
   * naming the reason: a cancellation and a return on the same order are two
   * different refunds, while two clicks on either are one.
   */
  async refundOrder(orderId: string, input: RefundOrderInput, idempotencyKey: string) {
    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    if (order.paymentStatus !== "COMPLETED" || !order.gatewayPaymentId) {
      // Nothing was ever taken, so there is nothing to give back. Not an error:
      // an unpaid order being cancelled is the ordinary case.
      return { data: { order: mapOrder(order), refunded: false, reason: "NOT_PAID" as const } };
    }

    const credentials = gatewayService.resolvePlatformCredentials();
    if (!credentials) {
      return { error: "No payment gateway is configured to refund from.", status: 409 as const };
    }

    const amount = input.amount ?? order.totalAmount;
    if (amount > order.totalAmount) {
      return { error: "A refund cannot exceed what was paid.", status: 400 as const };
    }

    try {
      const refund = await createRefund(credentials, {
        paymentId: order.gatewayPaymentId,
        amount,
        idempotencyKey,
        notes: { orderId, reason: input.reason ?? "Shop refund" },
      });

      const updated = await commerceRepository.recordRefund(orderId, {
        refundId: refund.id,
        amount,
      });

      return { data: { order: mapOrder(updated), refunded: true, refundId: refund.id } };
    } catch (err) {
      if (err instanceof RazorpayError) {
        return {
          error: `The refund could not be issued: ${err.message}`,
          status: 502 as const,
        };
      }
      throw err;
    }
  },

  /**
   * A buyer asking for an order back.
   *
   * Nothing is booked and no money moves here — this is a request, and a human
   * decides on it. That is the whole point of the window check being separate
   * from the approval.
   */
  async requestReturn(orderId: string, input: CreateReturnInput) {
    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    if (order.status !== "DELIVERED") {
      return {
        error: "Only a delivered order can be returned.",
        status: 409 as const,
      };
    }

    const open = await shippingRepository.findOpenReturnByOrder(orderId);
    if (open) {
      return { error: "A return is already open for this order.", status: 409 as const };
    }

    // Said apart from the window, because they are different refusals and only
    // one of them is something the buyer could have acted on in time.
    const policy = await this.returnPolicyForOrder(orderId);
    if (!policy.returnable) {
      return {
        error:
          policy.blockedBy.length > 0
            ? policy.blockedBy.join(", ") +
              " cannot be returned, so this order cannot be sent back."
            : "This order cannot be returned.",
        status: 409 as const,
      };
    }

    if (!(await this.canRequestReturn(order))) {
      return {
        error: `The ${policy.windowDays}-day return window for this order has closed.`,
        status: 409 as const,
      };
    }

    const returnRequest = await shippingRepository.createReturnRequest({
      orderId,
      reason: input.reason,
      comment: input.comment,
    });

    return { data: { returnRequest } };
  },

  /**
   * Approve or reject a return.
   *
   * Approval books the reverse pickup immediately: an approved return with no
   * consignment behind it is a promise to a buyer that nothing is keeping.
   * A courier that refuses leaves the request as it was, for a retry.
   */
  async decideReturn(returnRequestId: string, input: DecideReturnInput, decidedById: string) {
    const returnRequest = await shippingRepository.findReturnRequestById(returnRequestId);
    if (!returnRequest) return { error: "Return request not found.", status: 404 as const };

    if (returnRequest.status !== "REQUESTED") {
      return { error: "This return has already been decided.", status: 409 as const };
    }

    if (input.decision === "REJECT") {
      const rejected = await shippingRepository.updateReturnStatus(returnRequestId, {
        status: "REJECTED",
        decidedById,
        decisionNote: input.note,
      });
      return { data: { returnRequest: rejected } };
    }

    const order = await commerceRepository.findOrderById(returnRequest.orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    const booked = await shippingService.bookReverseShipment(order, returnRequestId);
    if ("error" in booked) return booked;

    const approved = await shippingRepository.updateReturnStatus(returnRequestId, {
      status: "APPROVED",
      decidedById,
      decisionNote: input.note,
    });

    return { data: { returnRequest: approved, shipment: booked.data.shipment } };
  },

  /**
   * The returned parcel is back with us — settle it.
   *
   * This is the point the buyer's money goes back, because it is the first
   * moment the shop knows what it has received. The order is marked RETURNED
   * whether or not the gateway plays along; the refund error is reported so it
   * can be chased rather than silently swallowed.
   */
  async markReturnReceived(returnRequestId: string, decidedById: string) {
    const returnRequest = await shippingRepository.findReturnRequestById(returnRequestId);
    if (!returnRequest) return { error: "Return request not found.", status: 404 as const };

    if (!["APPROVED", "PICKED_UP"].includes(returnRequest.status)) {
      return {
        error: "Only an approved return that is on its way back can be received.",
        status: 409 as const,
      };
    }

    const received = await shippingRepository.updateReturnStatus(returnRequestId, {
      status: "RECEIVED",
      decidedById,
    });

    const order = await commerceRepository.findOrderById(returnRequest.orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    await commerceRepository.advanceOrderStatus(order.id, "RETURNED");
    await commerceRepository.restoreStockForOrderItems(
      order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    );

    const refund = await this.refundOrder(order.id, {}, `return-${returnRequestId}`);

    if (!("error" in refund) && refund.data.refunded) {
      const settled = await shippingRepository.updateReturnStatus(returnRequestId, {
        status: "REFUNDED",
        refundAmount: order.totalAmount,
        refundedAt: new Date(),
      });
      return { data: { returnRequest: settled, refunded: true, refundError: null } };
    }

    return {
      data: {
        returnRequest: received,
        refunded: false,
        refundError: "error" in refund ? refund.error! : null,
      },
    };
  },

  /**
   * The courier's label for one parcel.
   *
   * Fetched on demand rather than stored: Delhivery's link is short-lived, and
   * a saved one would be a printer error three days later.
   */
  async getShipmentLabel(shipmentId: string) {
    return shippingService.fetchLabel(shipmentId);
  },

  /** Every return awaiting a decision, or all of them for a given status. */
  async listReturns(page: number, limit: number, status?: string) {
    const { returns, total } = await shippingRepository.listReturns(page, limit, status);
    return { data: { returns }, total };
  },

  /**
   * Dispatch an order by hand.
   *
   * The path payment normally takes on its own, exposed for the order whose
   * automatic booking failed and for anything paid outside the shop.
   */
  async shipOrder(orderId: string) {
    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };

    if (order.status === "CANCELLED") {
      return { error: "A cancelled order cannot be shipped.", status: 409 as const };
    }

    const booked = await shippingService.bookForwardShipment(order);
    if ("error" in booked) return booked;

    const updated = await commerceRepository.advanceOrderStatus(orderId, "SHIPPED");

    return {
      data: {
        order: mapOrder(updated),
        shipment: booked.data.shipment,
        alreadyBooked: booked.data.alreadyBooked,
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
