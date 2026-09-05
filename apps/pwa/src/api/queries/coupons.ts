/**
 * Documentation: Coupon and coin query hooks.
 *
 * - Tenant-scoped reads and writes for coupons, plus the two things that hang off them: a live price quote and a member's coin balance.
 * - Every write invalidates the coupon prefix. A redemption also moves coins and payments, so those are invalidated where the redemption happens rather than here.
 * - `useCouponQuote` is a mutation rather than a query on purpose: it is an action a screen takes when someone types a code, not state to keep in sync, and running it on every keystroke would price a half-typed code.
 * - Primary exports: useCoupons, useCoupon, useCoinBalance, useCouponQuote, and the coupon mutations.
 */
import { couponsApi } from "@/api/coupons";
import { queryKeys } from "@/lib/query-keys";
import type { CouponPayload } from "@/types/api";
import { unwrap, useCurrentTenantId, useTenantMutation, useTenantQuery } from "./shared";

/** Every coupon key for one gym, for invalidating the lot after a write. */
function scope(tenantId: string | null) {
  return ["coupons", tenantId ?? "none"] as const;
}

export function useCoupons(includeInactive = false, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.list(tenantId, includeInactive),
    async (tenantId) =>
      unwrap(await couponsApi.list(tenantId, includeInactive)).coupons,
    options,
  );
}

export function useCoupon(couponId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.detail(tenantId, couponId ?? "none"),
    async (tenantId) => unwrap(await couponsApi.get(tenantId, couponId!)),
    { enabled: Boolean(couponId) },
  );
}

/** A member's coin balance and recent ledger entries. */
export function useCoinBalance(
  membershipId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.coins(tenantId, membershipId ?? "none"),
    async (tenantId) => unwrap(await couponsApi.coins(tenantId, membershipId!)),
    { enabled: Boolean(membershipId) && (options.enabled ?? true) },
  );
}

// ─── Gym-wide analytics ──────────────────────────────────────────────────────

/** Coins issued, spent, and still owed, for the whole gym. */
export function useCoinOverview() {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.coinOverview(tenantId),
    async (tenantId) => unwrap(await couponsApi.coinOverview(tenantId)),
  );
}

/** Who is holding coins, biggest balance first. */
export function useCoinHolders() {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.coinHolders(tenantId),
    async (tenantId) => unwrap(await couponsApi.coinHolders(tenantId)).holders,
  );
}

/** The most recent coin movements across the gym. */
export function useCoinActivity() {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.coinActivity(tenantId),
    async (tenantId) => unwrap(await couponsApi.coinActivity(tenantId)).entries,
  );
}

/** Every coupon with what it has actually cost. */
export function useCouponAnalytics() {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.analytics(tenantId),
    async (tenantId) => unwrap(await couponsApi.couponAnalytics(tenantId)),
  );
}

/** The most recent redemptions. */
export function useCouponActivity() {
  return useTenantQuery(
    (tenantId) => queryKeys.coupons.activity(tenantId),
    async (tenantId) => unwrap(await couponsApi.couponActivity(tenantId)).redemptions,
  );
}

/**
 * Give coins to a member, or take them back.
 *
 * Invalidates the whole coupon scope rather than the one balance: a gift moves
 * that member's balance, the gym's outstanding total, the holder list, and the
 * activity feed, and they are all on this screen or one tap away.
 */
export function useAdjustCoins(membershipId: string | undefined) {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: { amount: number; note: string }) =>
      unwrap(await couponsApi.adjustCoins(id, membershipId!, payload)),
    { invalidates: [scope(tenantId)] },
  );
}

export function useCreateCoupon() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tenantId, payload: CouponPayload) =>
      unwrap(await couponsApi.create(tenantId, payload)).coupon,
    { invalidates: [scope(tenantId)] },
  );
}

export function useUpdateCoupon() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tenantId, vars: { couponId: string; data: Partial<CouponPayload> }) =>
      unwrap(await couponsApi.update(tenantId, vars.couponId, vars.data)).coupon,
    { invalidates: [scope(tenantId)] },
  );
}

export function useDeleteCoupon() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tenantId, couponId: string) =>
      unwrap(await couponsApi.remove(tenantId, couponId)),
    { invalidates: [scope(tenantId)] },
  );
}

/**
 * Price a purchase against a code.
 *
 * A mutation because it is triggered deliberately — someone applying a code —
 * rather than kept in sync with the screen.
 */
export function useCouponQuote() {
  return useTenantMutation(
    async (
      tenantId,
      vars: {
        /**
         * Null while somebody is still being admitted or signing up: the row
         * does not exist yet, and the price has to be shown before the money is
         * asked for. The API prices a prospect the same way it prices the
         * admission itself, so the figure quoted is the figure charged.
         */
        membershipId: string | null;
        subscriptionId?: string | null;
        chargeIds?: string[];
        amount?: number;
        code?: string | null;
        coinsToSpend?: number;
      },
    ) => unwrap(await couponsApi.quote(tenantId, vars)).quote,
  );
}
