import { api } from "./client";
import type {
  ApiResponse,
  PaginatedResponse,
  Product,
  Order,
  PlaceOrderPayload,
  CreateProductPayload,
  CreateReturnPayload,
  UpdateProductPayload,
  OrderStatus,
  OrderCheckoutSession,
  OrderTracking,
  PincodeServiceability,
  ReturnRequest,
  Shipment,
  ShippingQuote,
  Warehouse,
  CreateWarehousePayload,
  UpdateWarehousePayload,
  PickupRequest,
  SchedulePickupPayload,
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

  /** Can we deliver here, and can a return be collected from here? */
  checkPincode: (pincode: string) =>
    api.get<ApiResponse<PincodeServiceability>>("/shipping/serviceability", {
      params: { pincode },
    }),

  /**
   * What carriage costs for this basket.
   *
   * The basket is sent rather than a weight: weight is read from the products
   * on the server, so a browser cannot quote itself cheap shipping.
   */
  quoteShipping: (pincode: string, items: Array<{ productId: string; quantity: number }>) =>
    api.post<ApiResponse<ShippingQuote>>("/shipping/quote", { pincode, items }),

  /** The order's whole journey: parcels, returns, and what the buyer may do. */
  getOrderTracking: (orderId: string) =>
    api.get<ApiResponse<OrderTracking>>(`/orders/${orderId}/tracking`),

  /** Throw away a checkout nobody paid for, putting its stock back. */
  discardUnpaidOrder: (orderId: string) =>
    api.post<ApiResponse<{ discarded: boolean }>>(`/orders/${orderId}/discard`, {}),

  cancelOrder: (orderId: string, reason: string) =>
    api.post<ApiResponse<{ order: Order; refunded: boolean; refundError: string | null }>>(
      `/orders/${orderId}/cancel`,
      { reason },
    ),

  requestReturn: (orderId: string, data: CreateReturnPayload) =>
    api.post<ApiResponse<{ returnRequest: ReturnRequest }>>(`/orders/${orderId}/returns`, data),

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

  /** Book the courier by hand — for an order whose automatic booking failed. */
  shipOrder: (orderId: string) =>
    api.post<ApiResponse<{ order: Order; shipment: Shipment; alreadyBooked: boolean }>>(
      `/admin/orders/${orderId}/ship`,
      {},
    ),

  adminCancelOrder: (orderId: string, reason: string) =>
    api.post<ApiResponse<{ order: Order; refunded: boolean; refundError: string | null }>>(
      `/admin/orders/${orderId}/cancel`,
      { reason },
    ),

  /** Refund in full, or in part by naming an amount in rupees. */
  refundOrder: (orderId: string, data: { amount?: number; reason?: string } = {}) =>
    api.post<ApiResponse<{ order: Order; refunded: boolean; refundId?: string }>>(
      `/admin/orders/${orderId}/refund`,
      data,
    ),

  listReturns: (page = 1, limit = 20, status?: string) =>
    api.get<PaginatedResponse<{ returns: ReturnRequest[] }>>("/admin/returns", {
      params: { page, limit, ...(status ? { status } : {}) },
    }),

  /** Approving books the reverse pickup; rejecting closes the request. */
  decideReturn: (returnId: string, decision: "APPROVE" | "REJECT", note?: string) =>
    api.post<ApiResponse<{ returnRequest: ReturnRequest; shipment?: Shipment }>>(
      `/admin/returns/${returnId}/decision`,
      { decision, ...(note ? { note } : {}) },
    ),

  /** The parcel is back with us: marks it received and pays the buyer back. */
  receiveReturn: (returnId: string) =>
    api.post<
      ApiResponse<{ returnRequest: ReturnRequest; refunded: boolean; refundError: string | null }>
    >(`/admin/returns/${returnId}/received`, {}),

  /** A link to the courier's label PDF. Fetched fresh — Delhivery's expire. */
  getShipmentLabel: (shipmentId: string) =>
    api.get<ApiResponse<{ waybill: string; pdfUrl: string }>>(
      `/admin/shipments/${shipmentId}/label`,
    ),

  // ── Warehouses ────────────────────────────────────────────────────────────

  listWarehouses: (includeInactive = true) =>
    api.get<ApiResponse<{ warehouses: Warehouse[] }>>("/admin/warehouses", {
      params: { includeInactive },
    }),

  getWarehouse: (warehouseId: string) =>
    api.get<
      ApiResponse<{ warehouse: Warehouse; pickups: PickupRequest[]; pendingShipments: number }>
    >(`/admin/warehouses/${warehouseId}`),

  /**
   * Creates it here and registers it with Delhivery in one action.
   *
   * `registerError` comes back non-null when the courier refused: the warehouse
   * still exists, and the screen shows what to fix.
   */
  createWarehouse: (data: CreateWarehousePayload) =>
    api.post<ApiResponse<{ warehouse: Warehouse; registerError: string | null }>>(
      "/admin/warehouses",
      data,
    ),

  updateWarehouse: (warehouseId: string, data: UpdateWarehousePayload) =>
    api.patch<ApiResponse<{ warehouse: Warehouse; registerError: string | null }>>(
      `/admin/warehouses/${warehouseId}`,
      data,
    ),

  /** Retry a registration the courier refused. */
  registerWarehouse: (warehouseId: string) =>
    api.post<ApiResponse<{ warehouse: Warehouse }>>(
      `/admin/warehouses/${warehouseId}/register`,
      {},
    ),

  deleteWarehouse: (warehouseId: string) =>
    api.delete<ApiResponse<{ warehouse: Warehouse }>>(`/admin/warehouses/${warehouseId}`),

  /** Ask Delhivery to collect what is waiting at this warehouse. */
  schedulePickup: (warehouseId: string, data: SchedulePickupPayload) =>
    api.post<ApiResponse<{ pickup: PickupRequest }>>(
      `/admin/warehouses/${warehouseId}/pickups`,
      data,
    ),
};
