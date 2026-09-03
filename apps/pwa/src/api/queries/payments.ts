/**
 * Documentation: Payment and subscription query hooks.
 *
 * - Wraps `paymentsApi` so payment screens declare their data instead of managing fetch/loading/refetch by hand.
 * - A payment write invalidates members too: recording a payment moves the member's due date and can reactivate them, so a stale member list would contradict the receipt that was just saved.
 * - Primary exports: usePayments, useMyPayments, usePayment, usePaymentAnalytics, useSubscriptions, and the payment/subscription mutations.
 */
import type { PaymentStatus } from "@/types/api";
import { keepPreviousData } from "@tanstack/react-query";
import { paymentsApi } from "@/api/payments";
import { queryKeys } from "@/lib/query-keys";
import { getNetworkQuality } from "@/lib/network-status";
import type {
  CreatePaymentPayload,
  CreateSubscriptionPayload,
  UpdateSubscriptionPayload,
  UpdatePaymentPayload,
  UpdateGatewayPayload,
  VerifyCheckoutPayload,
} from "@/types/api";
import {
  unwrap,
  unwrapPaginated,
  useCurrentTenantId,
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

/**
 * Every payment in the gym, paged through in the background.
 *
 * The payments screen filters and searches client-side, the same way the member
 * list does, so it needs the whole ledger rather than a page of it. One cached
 * result then serves every tab, which is why switching tabs is instant and why
 * a status change refreshes all of them at once.
 */
export function useAllPayments(options: { enabled?: boolean; pageSize?: number } = {}) {
  const { pageSize = 500 } = options;

  return useTenantQuery(
    (tenantId) => [...queryKeys.payments.list(tenantId), "all", pageSize],
    async (tenantId) => {
      const first = unwrapPaginated(await paymentsApi.list(tenantId, 1, pageSize));
      const totalPages = first.meta.totalPages;
      if (totalPages <= 1) return first.data.payments;

      // The ledger only grows, so it is the reading that hurts most on a bad
      // link. One page beats a spinner that lasts half a minute.
      if (getNetworkQuality().isSlow) return first.data.payments;

      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          paymentsApi.list(tenantId, index + 2, pageSize),
        ),
      );

      return [
        ...first.data.payments,
        ...rest.flatMap((response) => unwrapPaginated(response).data.payments),
      ];
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

// ─── Payment gateway ──────────────────────────────────────────────────────────

/** The gym's Razorpay setup: which account collects, and what is on file. */
export function usePaymentGateway(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.payments.gateway(tenantId),
    async (tenantId) => unwrap(await paymentsApi.getGateway(tenantId)).gateway,
    options,
  );
}

export function useUpdatePaymentGateway() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: UpdateGatewayPayload) =>
      unwrap(await paymentsApi.updateGateway(id, payload)).gateway,
    { invalidates: [["payments", tenantId ?? "none"]] },
  );
}

/** Ask Razorpay to accept the saved credentials, without moving any money. */
export function useTestPaymentGateway() {
  return useTenantMutation(async (id) => unwrap(await paymentsApi.testGateway(id)));
}

export function useCreateCheckout() {
  return useTenantMutation(
    async (
      id,
      input: {
        subscriptionId: string;
        couponCode?: string;
        coinsToSpend?: number;
        mode?: "ONLINE" | "COUNTER";
      },
    ) => unwrap(await paymentsApi.createCheckout(id, input)),
  );
}

/**
 * Settle a payment against the checkout signature.
 *
 * Invalidates the whole payment scope because a settled payment moves the
 * member's due date and can flip them back to ACTIVE.
 */
export function useVerifyCheckout() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: VerifyCheckoutPayload) =>
      unwrap(await paymentsApi.verifyCheckout(id, payload)),
    { invalidates: paymentWriteScope(tenantId) },
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
    async (id, vars: { paymentId: string; status: PaymentStatus }) =>
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


/**
 * Collect against dues a member already owes.
 *
 * Invalidates the whole payment scope: settling arrears closes rows, may write
 * a new balance, and can carry the member back over their due date — the list,
 * the member record and the dashboard all move at once.
 */
export function useSettleDues() {
  return useTenantMutation(
    async (
      id,
      vars: { membershipId: string; dueIds: string[]; amount: number; note?: string },
    ) =>
      unwrap(
        await paymentsApi.settleDues(id, vars.membershipId, {
          dueIds: vars.dueIds,
          amount: vars.amount,
          ...(vars.note ? { note: vars.note } : {}),
        }),
      ),
    { invalidates: [["payments"], ["members"]] },
  );
}
