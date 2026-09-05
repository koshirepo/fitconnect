/**
 * Documentation: Gym store API client.
 *
 * - Wraps the tenant store endpoints: the catalogue a member browses, the catalogue an admin manages, the counter sale, and the online checkout.
 * - Baskets carry variant ids and quantities only. Every price, discount, and coin figure in the response was computed by the API from the database — the browser shows those numbers, it never decides them.
 * - Primary exports: storeApi.
 */
import { api } from "./client";
import type { ApiResponse } from "@/types/api";
import type {
  StoreBasketLine,
  StoreProduct,
  StoreSaleResult,
  StoreVariant,
} from "@fitconnect/shared/types/models";

export type StoreProductPayload = {
  name: string;
  description?: string;
  /** Display text, e.g. "Supplements". Free-form: a gym names its own. */
  category: string;
  // Null clears the stored value, undefined leaves it alone — the update
  // endpoint tells the two apart, so the payload type has to as well.
  markdown?: string | null;
  videoUrl?: string | null;
  photos?: string[];
  coinsGranted?: number;
  isActive?: boolean;
  variants: StoreVariantPayload[];
};

export type StoreVariantPayload = {
  name: string;
  attributes?: Record<string, string>;
  sku?: string;
  price: number;
  stock?: number;
  isActive?: boolean;
};

/** One row in the desk's order queue. */
export type StoreOrderRow = {
  id: string;
  status: string;
  channel: string;
  subtotalAmount: number;
  discountAmount: number;
  coinsRedeemed: number;
  totalAmount: number;
  coinsEarned: number;
  buyerName: string | null;
  buyerPhone: string | null;
  note: string | null;
  createdAt: string;
  paymentId: string | null;
  member: {
    id: string;
    memberId: number;
    user: { name: string; phone: string | null };
  } | null;
  soldBy: { user: { name: string } } | null;
  items: {
    productName: string;
    variantName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};

export const storeApi = {
  listProducts: (tenantId: string, params?: { category?: string; includeInactive?: boolean }) =>
    api.get<ApiResponse<{ products: StoreProduct[] }>>(
      `/tenants/${tenantId}/store/products`,
      { params },
    ),

  getProduct: (tenantId: string, productId: string) =>
    api.get<ApiResponse<{ product: StoreProduct }>>(
      `/tenants/${tenantId}/store/products/${productId}`,
    ),

  createProduct: (tenantId: string, payload: StoreProductPayload) =>
    api.post<ApiResponse<{ product: StoreProduct }>>(
      `/tenants/${tenantId}/store/products`,
      payload,
    ),

  updateProduct: (
    tenantId: string,
    productId: string,
    payload: Partial<Omit<StoreProductPayload, "variants">>,
  ) =>
    api.patch<ApiResponse<{ product: StoreProduct }>>(
      `/tenants/${tenantId}/store/products/${productId}`,
      payload,
    ),

  deleteProduct: (tenantId: string, productId: string) =>
    api.delete<ApiResponse<{ deleted: boolean; retained: boolean }>>(
      `/tenants/${tenantId}/store/products/${productId}`,
    ),

  addVariant: (tenantId: string, productId: string, payload: StoreVariantPayload) =>
    api.post<ApiResponse<{ variant: StoreVariant }>>(
      `/tenants/${tenantId}/store/products/${productId}/variants`,
      payload,
    ),

  updateVariant: (tenantId: string, variantId: string, payload: Partial<StoreVariantPayload>) =>
    api.patch<ApiResponse<{ variant: StoreVariant }>>(
      `/tenants/${tenantId}/store/variants/${variantId}`,
      payload,
    ),

  deleteVariant: (tenantId: string, variantId: string) =>
    api.delete<ApiResponse<{ deleted: boolean; retained: boolean }>>(
      `/tenants/${tenantId}/store/variants/${variantId}`,
    ),

  /** A delivery arriving, or a miscount corrected. Never a sale. */
  adjustStock: (tenantId: string, variantId: string, delta: number, note?: string) =>
    api.post<ApiResponse<{ variantId: string; delta: number }>>(
      `/tenants/${tenantId}/store/variants/${variantId}/stock`,
      { delta, ...(note ? { note } : {}) },
    ),

  /** Staff ringing up a sale for a member. */
  sellAtCounter: (
    tenantId: string,
    payload: {
      membershipId: string;
      items: StoreBasketLine[];
      couponCode?: string;
      coinsToSpend?: number;
      note?: string;
    },
  ) => api.post<ApiResponse<StoreSaleResult>>(`/tenants/${tenantId}/store/sales`, payload),

  /** A member buying for themselves. The buyer comes from the session. */
  startCheckout: (
    tenantId: string,
    payload: { items: StoreBasketLine[]; couponCode?: string; coinsToSpend?: number },
  ) => api.post<ApiResponse<StoreSaleResult>>(`/tenants/${tenantId}/store/checkout`, payload),

  /**
   * A member reserving to pay at the counter.
   *
   * No coupon and no coins: nothing is charged yet, so there is nothing for
   * them to come off. The desk applies them when it rings the order through.
   */
  reserve: (tenantId: string, payload: { items: StoreBasketLine[]; note?: string }) =>
    api.post<
      ApiResponse<{
        orderId: string;
        reference: string;
        total: number;
        subtotal: number;
        placedAt: string;
      }>
    >(`/tenants/${tenantId}/store/reserve`, payload),

  verifyCheckout: (
    tenantId: string,
    payload: { orderId: string; paymentId: string; signature: string },
  ) =>
    api.post<ApiResponse<{ orderId: string; alreadySettled: boolean }>>(
      `/tenants/${tenantId}/store/checkout/verify`,
      payload,
    ),

  /** Selling to a walk-in at the counter: their details, no coupon or coins. */
  sellToGuest: (
    tenantId: string,
    payload: {
      items: StoreBasketLine[];
      buyerName: string;
      buyerPhone: string;
      buyerEmail?: string;
      note?: string;
    },
  ) =>
    api.post<
      ApiResponse<{
        orderId: string;
        reference: string;
        subtotal: number;
        total: number;
      }>
    >(`/tenants/${tenantId}/store/sales/guest`, payload),

  /** The desk's queue of reservations, newest first. */
  listOrders: (tenantId: string, params: { status?: string; channel?: string } = {}) =>
    api.get<ApiResponse<{ orders: StoreOrderRow[] }>>(
      `/tenants/${tenantId}/store/orders`,
      { params },
    ),

  /** Hand a reservation over: take the money, move the stock. */
  completeOrder: (tenantId: string, orderId: string) =>
    api.post<ApiResponse<{ orderId: string; completed: boolean }>>(
      `/tenants/${tenantId}/store/orders/${orderId}/complete`,
      {},
    ),

  /** Drop a reservation nobody came for. */
  rejectOrder: (tenantId: string, orderId: string) =>
    api.post<ApiResponse<{ orderId: string; cancelled: boolean }>>(
      `/tenants/${tenantId}/store/orders/${orderId}/reject`,
      {},
    ),

  /** Releases the stock a closed payment window was holding. */
  cancelOrder: (tenantId: string, orderId: string) =>
    api.post<ApiResponse<{ orderId: string; cancelled: boolean }>>(
      `/tenants/${tenantId}/store/orders/${orderId}/cancel`,
      {},
    ),
};
