import type { OrderStatus } from "../../shared/types/enums";
import { COMMERCE_DEFAULT_GST_RATE_PCT } from "../../shared/constants";
import { commerceRepository } from "./commerce.repository";
import type { CreateProductInput, PlaceOrderInput, UpdateProductInput } from "./commerce.schema";

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

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
  };
}

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
  async listPublicProducts(page: number, limit: number, category?: string, search?: string) {
    const { products, total } = await commerceRepository.listPublicProducts(
      page,
      limit,
      category,
      search,
    );
    return { data: { products: products.map(mapProduct) }, total };
  },

  async getPublicProductById(productId: string) {
    const product = await commerceRepository.findPublicProductById(productId);
    if (!product) return { error: "Product not found.", status: 404 as const };
    return { data: { product: mapProduct(product) } };
  },

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

  async placeOrder(input: PlaceOrderInput, userId?: string) {
    const quantitiesByProduct = new Map<string, number>();
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
      const parsed = parseOrderCreationError(message);
      if (parsed) return parsed;
      throw err;
    }
  },

  async getOrderById(orderId: string) {
    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return { error: "Order not found.", status: 404 as const };
    return { data: { order: mapOrder(order) } };
  },

  async listMyOrders(userId: string, page: number, limit: number) {
    const { orders, total } = await commerceRepository.listOrdersByUser(userId, page, limit);
    return { data: { orders: orders.map(mapOrder) }, total };
  },

  async listAllOrders(page: number, limit: number, status?: string) {
    const { orders, total } = await commerceRepository.listAllOrders(page, limit, status);
    return { data: { orders: orders.map(mapOrder) }, total };
  },

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const existing = await commerceRepository.findOrderById(orderId);
    if (!existing) return { error: "Order not found.", status: 404 as const };
    const order = await commerceRepository.updateOrderStatus(orderId, status);
    return { data: { order: mapOrder(order) }, previousStatus: existing.status };
  },
};
