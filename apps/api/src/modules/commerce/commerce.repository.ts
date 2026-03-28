/**
 * Documentation: Commerce repository.
 *
 * - Encapsulates Prisma queries for product catalog management, ordering, and admin order operations, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: commerceRepository.
 */
import { prisma } from "../../lib/prisma";
import type { OrderStatus } from "../../shared/types/enums";
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
  status: true,
  subtotalAmount: true,
  gstRatePct: true,
  gstAmount: true,
  totalAmount: true,
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
   * Run the `create order with items` persistence operation for the commerce module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async createOrderWithItems(data: {
    userId?: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    buyerAddress: string;
    gstRatePct: number;
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
    for (const item of orderItems) {
      const updated = await prisma.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (updated.count === 0) {
        throw new Error(`INSUFFICIENT_STOCK:${item.productName}:0`);
      }
    }

    const subtotalAmount = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const gstAmount = Math.round((subtotalAmount * data.gstRatePct) / 100);
    const totalAmount = subtotalAmount + gstAmount;

    return prisma.order.create({
      data: {
        userId: data.userId,
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        buyerPhone: data.buyerPhone,
        buyerAddress: data.buyerAddress,
        subtotalAmount,
        gstRatePct: data.gstRatePct,
        gstAmount,
        totalAmount,
        items: { create: orderItems },
      },
      select: orderSelect,
    });
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
  async listAllOrders(page: number, limit: number, status?: string) {
    const where: { status?: OrderStatus } = {};
    if (status && ["PENDING", "SHIPPED", "DELIVERED"].includes(status)) {
      where.status = status as OrderStatus;
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
};
