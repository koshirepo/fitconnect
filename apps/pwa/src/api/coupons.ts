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
      membershipId: string | null;
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

  /**
   * Give coins, or take them back.
   *
   * A positive amount is a gift, a negative one a correction. The note is not
   * optional at the API either: a balance that moved for no stated reason is a
   * balance nobody can defend when the member asks.
   */
  adjustCoins: (
    tenantId: string,
    membershipId: string,
    payload: { amount: number; note: string },
  ) =>
    api.post<ApiResponse<{ balance: number }>>(
      `/tenants/${tenantId}/coupons/coins/${membershipId}/adjust`,
      payload,
    ),

  // ─── Gym-wide analytics ────────────────────────────────────────────────────

  coinOverview: (tenantId: string) =>
    api.get<ApiResponse<CoinOverview>>(`/tenants/${tenantId}/coins/overview`),

  coinHolders: (tenantId: string) =>
    api.get<ApiResponse<{ holders: CoinHolder[] }>>(`/tenants/${tenantId}/coins/holders`),

  coinActivity: (tenantId: string) =>
    api.get<ApiResponse<{ entries: CoinActivityEntry[] }>>(
      `/tenants/${tenantId}/coins/activity`,
    ),

  couponAnalytics: (tenantId: string) =>
    api.get<ApiResponse<CouponAnalytics>>(`/tenants/${tenantId}/coupons/analytics`),

  couponActivity: (tenantId: string) =>
    api.get<ApiResponse<{ redemptions: CouponRedemptionRow[] }>>(
      `/tenants/${tenantId}/coupons/activity`,
    ),
};

export type CoinOverview = {
  issued: number;
  spent: number;
  outstanding: number;
  entryCount: number;
  holderCount: number;
  largestBalance: number;
  /** Zero means coins never expire. */
  expiryDays: number;
  byReason: { reason: string; issued: number; spent: number; entries: number }[];
};

export type CoinHolder = {
  membershipId: string;
  memberId: number | null;
  name: string;
  avatarUrl: string | null;
  balance: number;
};

export type CoinActivityEntry = {
  id: string;
  amount: number;
  reason: string;
  note: string | null;
  createdAt: string;
  membershipId: string;
  memberId: number | null;
  memberName: string;
  /** Who made the adjustment. Null for coins the rules granted. */
  actedById: string | null;
  actedByName: string | null;
  actedByAvatarUrl: string | null;
  /** Their membership here, so the name can link. Null for platform staff. */
  actedByMembershipId: string | null;
};

export type CouponAnalyticsRow = {
  id: string;
  code: string;
  description: string | null;
  type: string;
  appliesTo: string;
  isActive: boolean;
  percentOff: number | null;
  amountOff: number | null;
  coinsGranted: number | null;
  bonusDays: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerMember: number | null;
  createdAt: string;
  /** How many times it has been used. */
  redemptions: number;
  /** Totals across those redemptions, named apart from the coupon's own
   *  settings above: `coinsGranted` is what one redemption gives,
   *  `redeemedCoins` is what every redemption has given between them. */
  redeemedDiscount: number;
  redeemedCoins: number;
  redeemedDays: number;
  /** Out of redemptions, however active it looks. */
  exhausted: boolean;
};

export type CouponAnalytics = {
  totals: {
    redemptions: number;
    discountAmount: number;
    coinsGranted: number;
    bonusDays: number;
    couponCount: number;
    activeCount: number;
    unusedCount: number;
  };
  coupons: CouponAnalyticsRow[];
};

export type CouponRedemptionRow = {
  id: string;
  code: string;
  type: string;
  discountAmount: number;
  coinsGranted: number;
  bonusDays: number;
  createdAt: string;
  membershipId: string;
  memberId: number | null;
  memberName: string;
};
