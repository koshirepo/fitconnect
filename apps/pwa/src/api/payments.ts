import { api } from "./client";
import type {
  Payment,
  CreatePaymentPayload,
  UpdatePaymentPayload,
  Subscription,
  CreateSubscriptionPayload,
  PaginatedResponse,
  ApiResponse,
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

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  listSubscriptions: (tenantId: string) =>
    api.get<ApiResponse<{ subscriptions: Subscription[] }>>(`/tenants/${tenantId}/subscriptions`),

  createSubscription: (tenantId: string, data: CreateSubscriptionPayload) =>
    api.post<ApiResponse<{ subscription: Subscription }>>(
      `/tenants/${tenantId}/subscriptions`,
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
        };
      }>
    >(`/tenants/${tenantId}/payments/analytics`),
};
