/**
 * Documentation: Offers, and the coins they mint.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { Gender } from "./auth";

// ─── Coupons & coins ──────────────────────────────────────────────────────────

/** What a coupon gives. Only the fields for its own type are ever read. */
export type CouponType = "DISCOUNT" | "COINS" | "VALIDITY";

export interface Coupon {
  id: string;
  code: string;
  description?: string | null;
  type: CouponType;

  percentOff?: number | null;
  amountOff?: number | null;
  maxDiscount?: number | null;
  coinsGranted?: number | null;
  bonusDays?: number | null;

  firstTimeOnly: boolean;
  gender?: Gender | null;
  minAmount?: number | null;
  badges: { id: string; name: string; color: string; icon?: string | null }[];
  subscriptions: { id: string; title: string }[];

  maxRedemptions?: number | null;
  redemptionCount: number;
  maxPerMember: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { redemptions: number };
}

export interface CouponPayload {
  code: string;
  description?: string;
  type: CouponType;
  percentOff?: number | null;
  amountOff?: number | null;
  maxDiscount?: number | null;
  coinsGranted?: number | null;
  bonusDays?: number | null;
  firstTimeOnly?: boolean;
  gender?: Gender | null;
  minAmount?: number | null;
  badgeIds?: string[];
  subscriptionIds?: string[];
  maxRedemptions?: number | null;
  maxPerMember?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

export interface CouponRedemption {
  id: string;
  discountAmount: number;
  coinsGranted: number;
  bonusDays: number;
  reversedAt?: string | null;
  createdAt: string;
  membership: { id: string; memberId: number; user: { name: string } };
}

/** What a purchase costs once a coupon and any coins are applied. */
export interface CouponQuote {
  listAmount: number;
  discountAmount: number;
  coinsRedeemed: number;
  netAmount: number;
  bonusDays: number;
  coinsGranted: number;
  coupon: {
    id: string;
    code: string;
    type: CouponType;
    description?: string | null;
  } | null;
}

export interface CoinEntry {
  id: string;
  amount: number;
  reason: string;
  note?: string | null;
  createdAt: string;
}
