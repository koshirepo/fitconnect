import { api } from "./client";
import type {
  ApiResponse,
  PaginatedResponse,
  Product,
  Order,
  PlaceOrderPayload,
  CreateProductPayload,
  UpdateProductPayload,
  OrderStatus,
  OrderCheckoutSession,
} from "@/types/api";

export const commerceApi = {
  // Public
  listProducts: (page = 1, limit = 20, category?: string, search?: string) =>
    api.get<PaginatedResponse<{ products: Product[] }>>("/products", {
      params: {
        page,
        limit,
        ...(category ? { category } : {}),
        ...(search ? { search } : {}),
      },
    }),

  getProductById: (productId: string) =>
    api.get<ApiResponse<{ product: Product }>>(`/products/${productId}`),

  placeOrder: (data: PlaceOrderPayload) => api.post<ApiResponse<{ order: Order }>>("/orders", data),

  /**
   * Place the order and open a payment for it.
   *
   * `checkout` comes back null when the shop has no gateway configured, which
   * leaves the order placed and unpaid — the behaviour this endpoint had before
   * it took cards.
   */
  startCheckout: (data: PlaceOrderPayload) =>
    api.post<ApiResponse<{ order: Order; checkout: OrderCheckoutSession | null }>>(
      "/orders/checkout",
      data,
    ),

  /** Settle the order with what the checkout widget handed back. */
  verifyOrderPayment: (data: { orderId: string; paymentId: string; signature: string }) =>
    api.post<ApiResponse<{ orderId: string; alreadySettled: boolean }>>(
      "/orders/checkout/verify",
      data,
    ),

  getOrderById: (orderId: string) => api.get<ApiResponse<{ order: Order }>>(`/orders/${orderId}`),

  // Logged-in users
  listMyOrders: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ orders: Order[] }>>("/orders/me", {
      params: { page, limit },
    }),

  // Platform admin/support
  listAdminProducts: (
    page = 1,
    limit = 20,
    includeInactive = true,
    category?: string,
    search?: string,
  ) =>
    api.get<PaginatedResponse<{ products: Product[] }>>("/admin/products", {
      params: {
        page,
        limit,
        includeInactive,
        ...(category ? { category } : {}),
        ...(search ? { search } : {}),
      },
    }),

  getAdminProductById: (productId: string) =>
    api.get<ApiResponse<{ product: Product }>>(`/admin/products/${productId}`),

  createProduct: (data: CreateProductPayload) =>
    api.post<ApiResponse<{ product: Product }>>("/admin/products", data),

  updateProduct: (productId: string, data: UpdateProductPayload) =>
    api.patch<ApiResponse<{ product: Product }>>(`/admin/products/${productId}`, data),

  deleteProduct: (productId: string) =>
    api.delete<ApiResponse<{ product: Product }>>(`/admin/products/${productId}`),

  listAdminOrders: (page = 1, limit = 20, status?: OrderStatus, productId?: string) =>
    api.get<PaginatedResponse<{ orders: Order[] }>>("/admin/orders", {
      params: { page, limit, ...(status ? { status } : {}), ...(productId ? { productId } : {}) },
    }),

  getAdminOrderById: (orderId: string) =>
    api.get<ApiResponse<{ order: Order }>>(`/admin/orders/${orderId}`),

  updateOrderStatus: (orderId: string, status: OrderStatus) =>
    api.patch<ApiResponse<{ order: Order }>>(`/admin/orders/${orderId}/status`, { status }),

  deleteAdminOrder: (orderId: string) =>
    api.delete<ApiResponse<{ order: Order }>>(`/admin/orders/${orderId}`),
};
