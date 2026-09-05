/**
 * Documentation: Commerce repository.
 *
 * - Encapsulates Prisma queries for product catalog management, ordering, and admin order operations, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: commerceRepository.
 */
import { prisma } from "../../lib/prisma";
import {
  catalogueRepository,
  PLATFORM_CATALOGUE,
} from "../catalogue/catalogue.repository";
import type { OrderStatus } from "@fitconnect/shared/types/enums";
import type { CreateProductInput, UpdateProductInput } from "./commerce.schema";

const orderSelect = {
  id: true,
  userId: true,
  buyerName: true,
  buyerEmail: true,
  buyerPhone: true,
  buyerAddress: true,
  buyerCity: true,
  buyerState: true,
  buyerPincode: true,
  status: true,
  subtotalAmount: true,
  gstRatePct: true,
  gstAmount: true,
  shippingAmount: true,
  shippingQuoteIssue: true,
  totalAmount: true,
  paymentStatus: true,
  paidAt: true,
  gatewayPaymentId: true,
  gatewayRefundId: true,
  refundAmount: true,
  refundedAt: true,
  confirmedAt: true,
  shippedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      variantId: true,
      variantName: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export const commerceRepository = {
  /**
   * Run the `list public products` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listPublicProducts(page: number, limit: number, category?: string, search?: string) {
    return catalogueRepository.listProducts(PLATFORM_CATALOGUE, {
      category,
      search,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    });
  },

  listAdminProducts(
    page: number,
    limit: number,
    includeInactive: boolean,
    category?: string,
    search?: string,
  ) {
    return catalogueRepository.listProducts(PLATFORM_CATALOGUE, {
      category,
      search,
      includeInactive,
      skip: (page - 1) * limit,
      take: limit,
    });
  },

  findProductById(productId: string) {
    return catalogueRepository.findProduct(PLATFORM_CATALOGUE, productId);
  },

  findPublicProductById(productId: string) {
    return catalogueRepository.findSellableProduct(PLATFORM_CATALOGUE, productId);
  },

  /**
   * Run the `create product` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createProduct(input: CreateProductInput) {
    // The shop's admin form still describes a product with one price and one
    // stock number. That is now a product with a single variant carrying both,
    // created in the same write — the model has no other place to put them, and
    // a product without a variant is one nobody can buy.
    return catalogueRepository.createProduct(PLATFORM_CATALOGUE, {
      name: input.name,
      description: input.description,
      markdown: input.markdown,
      photos: input.photos,
      category: input.category,
      minOrderQty: input.minOrderQty,
      maxOrderQty: input.maxOrderQty,
      isActive: input.isActive ?? true,
      variants: {
        create: [{ name: input.name, price: input.price, stock: input.stock }],
      },
    });
  },

  /**
   * Run the `update product` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  /**
   * Update a shop product, and its price or stock where the form sent either.
   *
   * Price and stock live on variants now. A product the shop admin created has
   * exactly one, so "the price" is unambiguous; a product that has grown several
   * is left alone here, because this form cannot say which one was meant.
   */
  async updateProduct(productId: string, input: UpdateProductInput) {
    const updated = await catalogueRepository.updateProduct(PLATFORM_CATALOGUE, productId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.markdown !== undefined ? { markdown: input.markdown } : {}),
      ...(input.photos !== undefined ? { photos: input.photos } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.minOrderQty !== undefined ? { minOrderQty: input.minOrderQty } : {}),
      ...(input.maxOrderQty !== undefined ? { maxOrderQty: input.maxOrderQty } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (!updated) return null;

    const movesMoney = input.price !== undefined || input.stock !== undefined;
    if (movesMoney && updated.variants.length === 1) {
      await catalogueRepository.updateVariant(PLATFORM_CATALOGUE, updated.variants[0]!.id, {
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
      });
      return catalogueRepository.findProduct(PLATFORM_CATALOGUE, productId);
    }

    return updated;
  },

  /**
   * Run the `count order items by product` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  countOrderItemsByProduct(productId: string) {
    return prisma.orderItem.count({
      where: { productId },
    });
  },

  /**
   * Run the `delete product` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  /**
   * Delete a shop product.
   *
   * Read first, then delete through the catalogue: `prisma.product.delete` takes
   * a unique id and so cannot carry the ownership filter, which after the
   * catalogues merged meant a gym's product was one guessed id away.
   */
  async deleteProduct(productId: string) {
    const product = await catalogueRepository.findProduct(PLATFORM_CATALOGUE, productId);
    if (!product) return null;

    const deleted = await catalogueRepository.deleteProduct(PLATFORM_CATALOGUE, productId);
    return deleted ? product : null;
  },

  /**
   * Run the `create order with items` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  /**
   * The return policy of everything in one order.
   *
   * Read through the order items rather than from the products directly,
   * because a product deleted or edited since does not change what was bought:
   * the policy that applies is the one on the row the buyer ordered from.
   */
  async findOrderReturnPolicy(orderId: string) {
    const items = await prisma.orderItem.findMany({
      where: { orderId },
      select: {
        productName: true,
        product: {
          select: {
            isReturnable: true,
            isReplaceable: true,
            returnWindowDays: true,
            returnPolicyNote: true,
          },
        },
      },
    });

    return items.map((item) => ({
      productName: item.productName,
      isReturnable: item.product?.isReturnable ?? true,
      isReplaceable: item.product?.isReplaceable ?? false,
      returnWindowDays: item.product?.returnWindowDays ?? null,
      returnPolicyNote: item.product?.returnPolicyNote ?? null,
    }));
  },

  async createOrderWithItems(data: {
    userId?: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    buyerAddress: string;
    buyerCity?: string;
    buyerState?: string;
    buyerPincode?: string;
    gstRatePct: number;
    /** Carriage, in rupees, already quoted by the courier for this basket. */
    shippingAmount?: number;
    /** Why that quote came out short, when it did. Null is the ordinary case. */
    shippingQuoteIssue?: string | null;
    items: Array<{ productId: string; variantId?: string; quantity: number }>;
  }) {
    // D1 doesn't support interactive transactions.
    // Validate products first, then decrement stock with optimistic checks,
    // then create the order.
    const productIds = [...new Set(data.items.map((item) => item.productId))];
    // `tenantId: null` is the platform catalogue. Product now holds every gym's
    // stock as well, so without this a shop order could name a gym's product and
    // sell it out from under them.
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, tenantId: null },
      select: {
        id: true,
        name: true,
        minOrderQty: true,
        maxOrderQty: true,
        variants: {
          where: { isActive: true },
          select: { id: true, name: true, price: true, stock: true },
        },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    const orderItems = data.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
      }

      // Which form of the product is being bought. Named explicitly where the
      // buyer chose one; inferred only where there is exactly one to infer, and
      // refused otherwise — guessing here would ship the wrong colour.
      const variant = item.variantId
        ? product.variants.find((candidate) => candidate.id === item.variantId)
        : product.variants.length === 1
          ? product.variants[0]
          : undefined;

      if (!variant) {
        throw new Error(
          item.variantId
            ? `VARIANT_NOT_FOUND:${item.variantId}`
            : `VARIANT_REQUIRED:${product.name}`,
        );
      }

      if (item.quantity < product.minOrderQty || item.quantity > product.maxOrderQty) {
        throw new Error(
          `QTY_RANGE:${product.name}:${product.minOrderQty}:${product.maxOrderQty}`,
        );
      }
      if (item.quantity > variant.stock) {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}:${variant.stock}`);
      }

      return {
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantName: variant.name,
        quantity: item.quantity,
        unitPrice: variant.price,
        lineTotal: variant.price * item.quantity,
      };
    });

    // Optimistic stock decrement — WHERE stock >= quantity guards against races
    const decrementedItems: Array<{ variantId: string; quantity: number }> = [];

    try {
      for (const item of orderItems) {
        // Through the catalogue, so the claim is scoped to the platform shop.
        // A variant id alone would reach a gym's stock — the same hole that
        // existed on the gym side until the owner became a required argument.
        const took = await catalogueRepository.claimStock(
          PLATFORM_CATALOGUE,
          item.variantId,
          item.quantity,
        );
        if (!took) {
          throw new Error(`INSUFFICIENT_STOCK:${item.productName}:0`);
        }
        decrementedItems.push({ variantId: item.variantId, quantity: item.quantity });
      }

      const subtotalAmount = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const gstAmount = Math.round((subtotalAmount * data.gstRatePct) / 100);
      // GST is charged on the goods, not on carriage, so shipping is added
      // after the tax rather than folded into the base it is computed from.
      const shippingAmount = data.shippingAmount ?? 0;
      const totalAmount = subtotalAmount + gstAmount + shippingAmount;

      return await prisma.order.create({
        data: {
          userId: data.userId,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          buyerPhone: data.buyerPhone,
          buyerAddress: data.buyerAddress,
          buyerCity: data.buyerCity,
          buyerState: data.buyerState,
          buyerPincode: data.buyerPincode,
          subtotalAmount,
          gstRatePct: data.gstRatePct,
          gstAmount,
          shippingAmount,
          shippingQuoteIssue: data.shippingQuoteIssue ?? null,
          totalAmount,
          items: { create: orderItems },
        },
        select: orderSelect,
      });
    } catch (error) {
      if (decrementedItems.length > 0) {
        await Promise.allSettled(
          decrementedItems.map((item) =>
            catalogueRepository.releaseStock(PLATFORM_CATALOGUE, item.variantId, item.quantity),
          ),
        );
      }
      throw error;
    }
  },

  /**
   * Run the `find order by id` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findOrderById(orderId: string) {
    return prisma.order.findUnique({
      where: { id: orderId },
      select: orderSelect,
    });
  },

  /**
   * Run the `attach gateway order` persistence operation for the commerce module.
   * Records which Razorpay order is collecting for this one, so the browser's
   * return and the webhook can both find their way back here.
   */
  attachGatewayOrder(orderId: string, gatewayOrderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: { gatewayOrderId },
      select: { id: true },
    });
  },

  /** Run the `find order by gateway order id` persistence operation. */
  findOrderByGatewayOrderId(gatewayOrderId: string) {
    return prisma.order.findFirst({
      where: { gatewayOrderId },
      select: orderSelect,
    });
  },

  /**
   * Run the `mark order paid` persistence operation for the commerce module.
   *
   * Conditional on the order still being unpaid, so a browser returning at the
   * same moment as a webhook cannot settle one order twice. The count tells the
   * caller which of the two got there first.
   */
  async markOrderPaid(orderId: string, gatewayPaymentId: string) {
    const result = await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: "PENDING" },
      data: {
        paymentStatus: "COMPLETED",
        gatewayPaymentId,
        paidAt: new Date(),
        // A paid order is a confirmed one. Fulfilment starts here, and this is
        // the state the warehouse picks from.
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });
    return result.count > 0;
  },

  /**
   * Move an order along its fulfilment path and stamp the moment it happened.
   *
   * One method rather than four because the timestamps are the only difference
   * between them, and four near-identical updates is how one of them ends up
   * forgetting to set its own.
   */
  advanceOrderStatus(
    orderId: string,
    status: "PACKED" | "SHIPPED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RETURNED",
  ) {
    const now = new Date();
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === "SHIPPED" ? { shippedAt: now } : {}),
        ...(status === "DELIVERED" ? { deliveredAt: now } : {}),
      },
      select: orderSelect,
    });
  },

  /**
   * Cancel an order, once.
   *
   * Conditional on it not already being cancelled so a buyer clicking twice —
   * or a buyer and an admin at the same moment — cannot restore stock twice.
   */
  async cancelOrder(orderId: string, reason: string) {
    const result = await prisma.order.updateMany({
      where: { id: orderId, status: { notIn: ["CANCELLED", "DELIVERED", "RETURNED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    return result.count > 0;
  },

  /**
   * Record money sent back.
   *
   * `paymentStatus` becomes REFUNDED whatever the amount: a partial refund is
   * still an order whose money has been touched, and the amount is recorded
   * beside it for anyone who needs the difference.
   */
  recordRefund(orderId: string, data: { refundId: string; amount: number }) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "REFUNDED",
        gatewayRefundId: data.refundId,
        refundAmount: data.amount,
        refundedAt: new Date(),
      },
      select: orderSelect,
    });
  },

  /**
   * Run the `list orders by user` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listOrdersByUser(userId: string, page: number, limit: number) {
    const where = { userId };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: orderSelect,
      }),
      prisma.order.count({ where }),
    ]);
    return { orders, total };
  },

  /**
   * Run the `list all orders` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listAllOrders(page: number, limit: number, status?: string, productId?: string) {
    const where: {
      status?: OrderStatus;
      items?: { some: { productId: string } };
    } = {};
    if (status && ["PENDING", "SHIPPED", "DELIVERED"].includes(status)) {
      where.status = status as OrderStatus;
    }
    if (productId) {
      where.items = { some: { productId } };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: orderSelect,
      }),
      prisma.order.count({ where }),
    ]);
    return { orders, total };
  },

  /**
   * Run the `update order status` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateOrderStatus(orderId: string, status: OrderStatus) {
    return prisma.order.update({
      where: { id: orderId },
      data: { status },
      select: orderSelect,
    });
  },

  /**
   * Run the `delete order` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  deleteOrder(orderId: string) {
    return prisma.order.delete({
      where: { id: orderId },
      select: orderSelect,
    });
  },

  /**
   * Run the `restore stock for order items` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async restoreStockForOrderItems(items: Array<{ variantId: string; quantity: number }>) {
    for (const item of items) {
      await catalogueRepository.releaseStock(PLATFORM_CATALOGUE, item.variantId, item.quantity);
    }
  },
};
