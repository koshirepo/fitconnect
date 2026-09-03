/**
 * Documentation: Commerce repository.
 *
 * - Encapsulates Prisma queries for product catalog management, ordering, and admin order operations, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: commerceRepository.
 */
import { prisma } from "../../lib/prisma";
import type { OrderStatus } from "@fitconnect/shared/types/enums";
import type { CreateProductInput, UpdateProductInput } from "./commerce.schema";

const productSelect = {
  id: true,
  name: true,
  description: true,
  markdown: true,
  photos: true,
  category: true,
  price: true,
  stock: true,
  minOrderQty: true,
  maxOrderQty: true,
  isReturnable: true,
  isReplaceable: true,
  returnWindowDays: true,
  returnPolicyNote: true,
  weightGrams: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  warehouseId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
  async listPublicProducts(page: number, limit: number, category?: string, search?: string) {
    const where = {
      isActive: true,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ category: "asc" }, { createdAt: "desc" }],
        select: productSelect,
      }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  },

  /**
   * Run the `list admin products` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listAdminProducts(
    page: number,
    limit: number,
    includeInactive: boolean,
    category?: string,
    search?: string,
  ) {
    const where = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        select: productSelect,
      }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  },

  /**
   * Run the `find product by id` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findProductById(productId: string) {
    return prisma.product.findUnique({
      where: { id: productId },
      select: productSelect,
    });
  },

  /**
   * Run the `find public product by id` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findPublicProductById(productId: string) {
    return prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: productSelect,
    });
  },

  /**
   * Run the `create product` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createProduct(input: CreateProductInput) {
    return prisma.product.create({
      data: {
        name: input.name,
        description: input.description,
        markdown: input.markdown,
        photos: input.photos,
        category: input.category,
        price: input.price,
        stock: input.stock,
        minOrderQty: input.minOrderQty,
        maxOrderQty: input.maxOrderQty,
        isActive: input.isActive ?? true,
      },
      select: productSelect,
    });
  },

  /**
   * Run the `update product` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateProduct(productId: string, input: UpdateProductInput) {
    return prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.markdown !== undefined ? { markdown: input.markdown } : {}),
        ...(input.photos !== undefined ? { photos: input.photos } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
        ...(input.minOrderQty !== undefined ? { minOrderQty: input.minOrderQty } : {}),
        ...(input.maxOrderQty !== undefined ? { maxOrderQty: input.maxOrderQty } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: productSelect,
    });
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
  deleteProduct(productId: string) {
    return prisma.product.delete({
      where: { id: productId },
      select: productSelect,
    });
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
    items: Array<{ productId: string; quantity: number }>;
  }) {
    // D1 doesn't support interactive transactions.
    // Validate products first, then decrement stock with optimistic checks,
    // then create the order.
    const productIds = [...new Set(data.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        minOrderQty: true,
        maxOrderQty: true,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    const orderItems = data.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
      }
      if (item.quantity < product.minOrderQty || item.quantity > product.maxOrderQty) {
        throw new Error(
          `QTY_RANGE:${product.name}:${product.minOrderQty}:${product.maxOrderQty}`,
        );
      }
      if (item.quantity > product.stock) {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}:${product.stock}`);
      }
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.price,
        lineTotal: product.price * item.quantity,
      };
    });

    // Optimistic stock decrement — WHERE stock >= quantity guards against races
    const decrementedItems: Array<{ productId: string; quantity: number }> = [];

    try {
      for (const item of orderItems) {
        const updated = await prisma.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          throw new Error(`INSUFFICIENT_STOCK:${item.productName}:0`);
        }
        decrementedItems.push({ productId: item.productId, quantity: item.quantity });
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
            prisma.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
              select: { id: true },
            }),
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
  async restoreStockForOrderItems(items: Array<{ productId: string; quantity: number }>) {
    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
        select: { id: true },
      });
    }
  },
};
