/**
 * Documentation: Payment and subscription query hooks.
 *
 * - Wraps `paymentsApi` so payment screens declare their data instead of managing fetch/loading/refetch by hand.
 * - A payment write invalidates members too: recording a payment moves the member's due date and can reactivate them, so a stale member list would contradict the receipt that was just saved.
 * - Primary exports: usePayments, useMyPayments, usePayment, usePaymentAnalytics, useSubscriptions, and the payment/subscription mutations.
 */
import { keepPreviousData } from "@tanstack/react-query";
import { paymentsApi } from "@/api/payments";
import { queryKeys } from "@/lib/query-keys";
import type {
  CreatePaymentPayload,
  CreateSubscriptionPayload,
  UpdateSubscriptionPayload,
  UpdatePaymentPayload,
} from "@/types/api";
import {
  unwrap,
  unwrapPaginated,
  useCurrentTenantId,
  useTenantInfiniteQuery,
  useTenantMutation,
  useTenantQuery,
} from "./shared";

export type PaymentListFilters = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  membershipId?: string;
};

/** Everything a payment write can invalidate. */
function paymentWriteScope(tenantId: string | null) {
  const id = tenantId ?? "none";
  return [
    ["payments", id],
    // A payment changes dueDate and can flip a member back to ACTIVE.
    ["members", id],
  ];
}

export function usePayments(filters: PaymentListFilters = {}, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.payments.list(tenantId, filters),
    async (tenantId) =>
      unwrapPaginated(
        await paymentsApi.list(
          tenantId,
          filters.page ?? 1,
          filters.limit ?? 20,
          filters.status,
          filters.search,
          filters.membershipId,
        ),
      ),
    { placeholderData: keepPreviousData, ...options },
  );
}

/** Gym-wide payments paged for the infinite-scroll list. */
export function usePaymentsInfinite(
  filters: { status?: string; search?: string } = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 20 } = options;
  return useTenantInfiniteQuery(
    (tenantId) => [...queryKeys.payments.list(tenantId, filters), "infinite", limit],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(
        await paymentsApi.list(tenantId, page, limit, filters.status, filters.search),
      );
      return { data: data.payments, meta };
    },
    options,
  );
}

export function useMyPayments(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.payments.mine(tenantId),
    async (tenantId) => unwrap(await paymentsApi.myPayments(tenantId)).payments,
    options,
  );
}

export function usePayment(paymentId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.payments.detail(tenantId, paymentId ?? "none"),
    async (tenantId) => unwrap(await paymentsApi.getById(tenantId, paymentId!)).payment,
    { enabled: Boolean(paymentId) },
  );
}

export function usePaymentAnalytics(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.payments.analytics(tenantId),
    async (tenantId) => unwrap(await paymentsApi.analytics(tenantId)),
    options,
  );
}

export function useSubscriptions(includeInactive = false, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.subscriptions.list(tenantId, includeInactive),
    async (tenantId) =>
      unwrap(await paymentsApi.listSubscriptions(tenantId, includeInactive)).subscriptions,
    options,
  );
}

// ─── Payment mutations ────────────────────────────────────────────────────────

export function useCreatePayment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreatePaymentPayload) => unwrap(await paymentsApi.create(id, payload)),
    { invalidates: paymentWriteScope(tenantId) },
  );
}

export function useUpdatePayment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { paymentId: string; data: UpdatePaymentPayload }) =>
      unwrap(await paymentsApi.update(id, vars.paymentId, vars.data)),
    { invalidates: paymentWriteScope(tenantId) },
  );
}

export function useUpdatePaymentStatus() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { paymentId: string; status: "COMPLETED" | "FAILED" | "REFUNDED" }) =>
      unwrap(await paymentsApi.updateStatus(id, vars.paymentId, vars.status)),
    { invalidates: paymentWriteScope(tenantId) },
  );
}

export function useDeletePayment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, paymentId: string) => {
      await paymentsApi.delete(id, paymentId);
    },
    { invalidates: paymentWriteScope(tenantId) },
  );
}

// ─── Subscription mutations ───────────────────────────────────────────────────

export function useCreateSubscription() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateSubscriptionPayload) =>
      unwrap(await paymentsApi.createSubscription(id, payload)),
    { invalidates: [["subscriptions", tenantId ?? "none"]] },
  );
}

export function useUpdateSubscription() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { subscriptionId: string; data: UpdateSubscriptionPayload }) =>
      unwrap(await paymentsApi.updateSubscription(id, vars.subscriptionId, vars.data)),
    { invalidates: [["subscriptions", tenantId ?? "none"]] },
  );
}

export function useDeleteSubscription() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, subscriptionId: string) => {
      await paymentsApi.deleteSubscription(id, subscriptionId);
    },
    { invalidates: [["subscriptions", tenantId ?? "none"]] },
  );
}
