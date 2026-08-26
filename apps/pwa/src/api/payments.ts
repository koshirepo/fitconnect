import { api } from "./client";
import type {
  Payment,
  CreatePaymentPayload,
  UpdatePaymentPayload,
  Subscription,
  CreateSubscriptionPayload,
  UpdateSubscriptionPayload,
  PaginatedResponse,
  ApiResponse,
  PaymentGatewayConfig,
  UpdateGatewayPayload,
  CheckoutSession,
  VerifyCheckoutPayload,
} from "@/types/api";

export const paymentsApi = {
  // ─── Payments ───────────────────────────────────────────────────────────────

  list: (
    tenantId: string,
    page = 1,
    limit = 20,
    status?: string,
    search?: string,
    membershipId?: string,
  ) =>
    api.get<PaginatedResponse<{ payments: Payment[] }>>(`/tenants/${tenantId}/payments`, {
      params: {
        page,
        limit,
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
        ...(membershipId ? { membershipId } : {}),
      },
    }),

  myPayments: (tenantId: string) =>
    api.get<ApiResponse<{ payments: Payment[] }>>(`/tenants/${tenantId}/my-payments`),

  getById: (tenantId: string, paymentId: string) =>
    api.get<ApiResponse<{ payment: Payment }>>(`/tenants/${tenantId}/payments/${paymentId}`),

  create: (tenantId: string, data: CreatePaymentPayload) =>
    api.post<ApiResponse<{ payment: Payment }>>(`/tenants/${tenantId}/payments`, data),

  updateStatus: (
    tenantId: string,
    paymentId: string,
    status: "COMPLETED" | "FAILED" | "REFUNDED",
  ) =>
    api.patch<ApiResponse<{ payment: Payment }>>(`/tenants/${tenantId}/payments/${paymentId}`, {
      status,
    }),

  update: (tenantId: string, paymentId: string, data: UpdatePaymentPayload) =>
    api.put<ApiResponse<{ payment: Payment }>>(`/tenants/${tenantId}/payments/${paymentId}`, data),

  delete: (tenantId: string, paymentId: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/tenants/${tenantId}/payments/${paymentId}`),

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  listSubscriptions: (tenantId: string, includeInactive = false) =>
    api.get<ApiResponse<{ subscriptions: Subscription[] }>>(`/tenants/${tenantId}/subscriptions`, {
      params: includeInactive ? { includeInactive: true } : undefined,
    }),

  createSubscription: (tenantId: string, data: CreateSubscriptionPayload) =>
    api.post<ApiResponse<{ subscription: Subscription }>>(
      `/tenants/${tenantId}/subscriptions`,
      data,
    ),

  updateSubscription: (
    tenantId: string,
    subscriptionId: string,
    data: UpdateSubscriptionPayload,
  ) =>
    api.patch<ApiResponse<{ subscription: Subscription }>>(
      `/tenants/${tenantId}/subscriptions/${subscriptionId}`,
      data,
    ),

  deleteSubscription: (tenantId: string, subscriptionId: string) =>
    api.delete<ApiResponse<{ message: string }>>(
      `/tenants/${tenantId}/subscriptions/${subscriptionId}`,
    ),

  // ─── Payment gateway ────────────────────────────────────────────────────────

  getGateway: (tenantId: string) =>
    api.get<ApiResponse<{ gateway: PaymentGatewayConfig }>>(
      `/tenants/${tenantId}/payments/gateway`,
    ),

  updateGateway: (tenantId: string, data: UpdateGatewayPayload) =>
    api.put<ApiResponse<{ gateway: PaymentGatewayConfig }>>(
      `/tenants/${tenantId}/payments/gateway`,
      data,
    ),

  testGateway: (tenantId: string) =>
    api.post<ApiResponse<{ ok: boolean; source: string; keyId: string }>>(
      `/tenants/${tenantId}/payments/gateway/test`,
    ),

  /** Open a Razorpay order for the signed-in member. */
  createCheckout: (tenantId: string, subscriptionId: string) =>
    api.post<ApiResponse<{ checkout: CheckoutSession }>>(
      `/tenants/${tenantId}/payments/checkout`,
      { subscriptionId },
    ),

  /** Settle a payment with the signature the checkout widget returned. */
  verifyCheckout: (tenantId: string, data: VerifyCheckoutPayload) =>
    api.post<ApiResponse<{ payment: Payment; alreadySettled: boolean }>>(
      `/tenants/${tenantId}/payments/checkout/verify`,
      data,
    ),

  analytics: (tenantId: string) =>
    api.get<
      ApiResponse<{
        analytics: {
          today: {
            totalRevenue: number;
            totalCount: number;
            completed: number;
            pending: number;
            failed: number;
          };
          week: {
            totalRevenue: number;
            totalCount: number;
            completed: number;
            pending: number;
            failed: number;
          };
          month: {
            totalRevenue: number;
            totalCount: number;
            completed: number;
            pending: number;
            failed: number;
          };
          allTime: {
            totalRevenue: number;
            totalCount: number;
            completed: number;
            pending: number;
            failed: number;
          };
          dailyBreakdown: { day: string; revenue: number; count: number }[];
          members: {
            joined: { today: number; week: number; month: number; allTime: number };
            deactivated: { today: number; week: number; month: number; allTime: number };
          };
          /** List price, what coupons and coins took off it, and what was banked. */
          discounts: {
            month: { gross: number; discount: number; coins: number; net: number };
            allTime: { gross: number; discount: number; coins: number; net: number };
          };
          /** This month's split between gateway payments and manual entries. */
          collection: {
            online: { revenue: number; count: number };
            manual: { revenue: number; count: number };
          };
          /** Coins earned but not yet spent, across every member. */
          coinsOutstanding: number;
          /** Terms paused right now. */
          activeFreezes: number;
          /** This month's revenue by what was being paid for. */
          revenueMix: {
            subscriptions: { revenue: number; count: number };
            charges: { revenue: number; count: number };
            other: { revenue: number; count: number };
          };
        };
      }>
    >(`/tenants/${tenantId}/payments/analytics`),
};
