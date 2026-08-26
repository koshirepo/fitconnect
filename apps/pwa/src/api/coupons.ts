import { api } from "./client";
import type {
  ApiResponse,
  CoinEntry,
  Coupon,
  CouponPayload,
  CouponQuote,
  CouponRedemption,
} from "@/types/api";

export const couponsApi = {
  list: (tenantId: string, includeInactive = false) =>
    api.get<ApiResponse<{ coupons: Coupon[] }>>(`/tenants/${tenantId}/coupons`, {
      params: includeInactive ? { includeInactive: true } : undefined,
    }),

  get: (tenantId: string, couponId: string) =>
    api.get<ApiResponse<{ coupon: Coupon; redemptions: CouponRedemption[] }>>(
      `/tenants/${tenantId}/coupons/${couponId}`,
    ),

  create: (tenantId: string, payload: CouponPayload) =>
    api.post<ApiResponse<{ coupon: Coupon }>>(`/tenants/${tenantId}/coupons`, payload),

  update: (tenantId: string, couponId: string, payload: Partial<CouponPayload>) =>
    api.patch<ApiResponse<{ coupon: Coupon }>>(
      `/tenants/${tenantId}/coupons/${couponId}`,
      payload,
    ),

  remove: (tenantId: string, couponId: string) =>
    api.delete<ApiResponse<{ couponId: string }>>(
      `/tenants/${tenantId}/coupons/${couponId}`,
    ),

  /**
   * Price a purchase before saving it.
   *
   * The same call the payment endpoint makes internally, so a preview and the
   * saved payment can never disagree about what something costs.
   */
  quote: (
    tenantId: string,
    payload: {
      membershipId: string;
      subscriptionId?: string | null;
      chargeIds?: string[];
      amount?: number;
      code?: string | null;
      coinsToSpend?: number;
    },
  ) =>
    api.post<ApiResponse<{ quote: CouponQuote }>>(
      `/tenants/${tenantId}/coupons/quote`,
      payload,
    ),

  coins: (tenantId: string, membershipId: string) =>
    api.get<ApiResponse<{ balance: number; entries: CoinEntry[] }>>(
      `/tenants/${tenantId}/coupons/coins/${membershipId}`,
    ),
};
