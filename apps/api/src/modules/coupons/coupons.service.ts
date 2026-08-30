/**
 * Documentation: Coupon validation, pricing, and redemption.
 *
 * - `quote` is the one place a price is decided. Every path that takes money — the front desk, self-signup, online checkout — asks it what something costs, so a discount can never differ depending on which screen was used. A caller sends a code and a member; it sends back the numbers.
 * - Nothing here trusts an amount from a client. The list price is read from the plan and the charges, exactly as the gateway already does, because a request that could name its own price could buy a year for a rupee.
 * - Redemption increments the use count with a conditional update rather than a read-then-write. D1 has no row locks, so two members racing for the last use of a coupon would otherwise both win; this is the same guard the commerce module uses for product stock.
 * - Coins are a ledger, never a counter. Earning, spending, and reversing are all rows, and a balance is their sum — which is what makes a refund reversible and a balance explainable.
 * - Primary exports: couponService.
 */
import { prisma } from "../../lib/prisma";

export type CouponType = "DISCOUNT" | "COINS" | "VALIDITY";

/** What a payment will cost once a coupon and any coins are applied. */
export type Quote = {
  /** Plan plus charges, before anything is taken off. */
  listAmount: number;
  discountAmount: number;
  coinsRedeemed: number;
  /** What the member actually pays. Never below zero. */
  netAmount: number;
  /** Extra days of validity granted on top of the plan's duration. */
  bonusDays: number;
  /** Coins the member earns by this purchase. */
  coinsGranted: number;
  coupon: {
    id: string;
    code: string;
    type: CouponType;
    description: string | null;
  } | null;
};

type QuoteInput = {
  tenantId: string;
  /**
   * The member, when there is one.
   *
   * Null while somebody is still being admitted or signing themselves up:
   * the row does not exist yet, and the price has to be shown before the
   * money is taken. A prospective member has no history to check and no
   * coins to spend, so the per-member rules are satisfied by definition
   * rather than skipped — see `checkEligibility`.
   */
  membershipId: string | null;
  /** The plan being bought, when there is one. */
  subscriptionId?: string | null;
  /** Charges billed alongside it. */
  chargeIds?: string[];
  /** Explicit price, for a payment that is not a plan purchase. */
  amount?: number;
  code?: string | null;
  /** Coins the member wants to spend. Clamped to their balance and the total. */
  coinsToSpend?: number;
};

type CouponRecord = Awaited<ReturnType<typeof findCoupon>>;

/**
 * Load a coupon by its code, with everything its conditions are checked against.
 *
 * Exported because the gym store checks the same coupons against the same
 * limits; duplicating the select there would let the two drift apart.
 */
export function findCoupon(tenantId: string, code: string) {
  return prisma.coupon.findFirst({
    where: { tenantId, code: code.trim().toUpperCase() },
    select: {
      id: true,
      code: true,
      type: true,
      description: true,
      percentOff: true,
      amountOff: true,
      maxDiscount: true,
      coinsGranted: true,
      bonusDays: true,
      firstTimeOnly: true,
      gender: true,
      minAmount: true,
      appliesTo: true,
      maxRedemptions: true,
      redemptionCount: true,
      maxPerMember: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
      badges: { select: { id: true } },
      subscriptions: { select: { id: true } },
    },
  });
}

/**
 * The member facts a coupon's conditions are checked against.
 *
 * Read in one go rather than per condition, because most coupons test more than
 * one and a per-condition lookup would multiply queries on the payment path.
 */
async function loadEligibility(tenantId: string, membershipId: string) {
  const [membership, completedSubscriptionPayments] = await Promise.all([
    prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: {
        id: true,
        user: { select: { gender: true } },
        badges: { select: { id: true } },
      },
    }),
    prisma.payment.count({
      where: {
        membershipId,
        tenantId,
        status: "COMPLETED",
        subscriptionId: { not: null },
      },
    }),
  ]);

  return { membership, completedSubscriptionPayments };
}

export const couponService = {
  /**
   * A member's coin balance: the sum of their ledger.
   *
   * Derived rather than stored, so it can never drift from the entries that
   * explain it.
   */
  async getCoinBalance(tenantId: string, membershipId: string) {
    const result = await prisma.coinLedgerEntry.aggregate({
      where: { tenantId, membershipId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  },

  async listCoinEntries(tenantId: string, membershipId: string) {
    return prisma.coinLedgerEntry.findMany({
      where: { tenantId, membershipId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        reason: true,
        note: true,
        createdAt: true,
      },
    });
  },

  /**
   * Why a coupon cannot be used, or null when it can.
   *
   * Every message names the actual reason. A generic "invalid code" is only
   * right when the code does not exist — for anything else the person at the
   * desk needs to know whether to try another code or stop asking.
   */
  async checkEligibility(
    tenantId: string,
    coupon: NonNullable<CouponRecord>,
    membershipId: string | null,
    listAmount: number,
    subscriptionId?: string | null,
  ): Promise<string | null> {
    const now = new Date();

    if (!coupon.isActive) return "This coupon is no longer active.";
    if (coupon.startsAt && coupon.startsAt > now) return "This coupon is not active yet.";
    if (coupon.endsAt && coupon.endsAt < now) return "This coupon has expired.";

    if (
      coupon.maxRedemptions !== null &&
      coupon.redemptionCount >= coupon.maxRedemptions
    ) {
      return "This coupon has been fully redeemed.";
    }

    if (coupon.minAmount !== null && listAmount < coupon.minAmount) {
      return `This coupon needs a minimum of ₹${coupon.minAmount}.`;
    }

    if (coupon.subscriptions.length > 0) {
      if (!subscriptionId) return "This coupon only applies to a subscription plan.";
      if (!coupon.subscriptions.some((plan) => plan.id === subscriptionId)) {
        return "This coupon does not apply to the selected plan.";
      }
    }

    // Nobody to check against yet. Every rule below is about a member's own
    // history or attributes, and somebody who has not joined has neither:
    // no completed subscription, no redemptions, no badges. A gender-scoped
    // coupon is the one exception — it is refused rather than guessed at,
    // because the person joining has not said yet.
    if (!membershipId) {
      if (coupon.gender) {
        return "This coupon can only be applied once the member has joined.";
      }
      if (coupon.badges.length > 0) {
        return "This coupon needs a badge only an existing member can hold.";
      }
      return null;
    }

    const { membership, completedSubscriptionPayments } = await loadEligibility(
      tenantId,
      membershipId,
    );
    if (!membership) return "Member not found in this gym.";

    if (coupon.gender && membership.user.gender !== coupon.gender) {
      return "This coupon is not available for this member.";
    }

    if (coupon.badges.length > 0) {
      const held = new Set(membership.badges.map((badge) => badge.id));
      if (!coupon.badges.some((badge) => held.has(badge.id))) {
        return "This member does not hold the badge this coupon requires.";
      }
    }

    // "First-time" means no completed subscription payment ever. An admission
    // charge does not burn it, and neither does a signup that never paid.
    if (coupon.firstTimeOnly && completedSubscriptionPayments > 0) {
      return "This coupon is only for a member's first subscription.";
    }

    const usedByMember = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, membershipId, reversedAt: null },
    });
    if (usedByMember >= coupon.maxPerMember) {
      return "This member has already used this coupon.";
    }

    return null;
  },

  /**
   * Price a purchase, with or without a coupon.
   *
   * Returns an error only when a code was given and cannot be used. No code at
   * all is a perfectly good quote — it is how every existing payment is priced.
   */
  async quote(input: QuoteInput): Promise<{ data: Quote } | { error: string; status: 400 | 404 }> {
    const { tenantId, membershipId } = input;

    // The list price always comes from the database.
    const [subscription, charges] = await Promise.all([
      input.subscriptionId
        ? prisma.subscription.findFirst({
            where: { id: input.subscriptionId, tenantId, isActive: true },
            select: { id: true, amount: true },
          })
        : null,
      input.chargeIds && input.chargeIds.length > 0
        ? prisma.tenantCharge.findMany({
            where: { id: { in: input.chargeIds.slice(0, 50) }, tenantId, isActive: true },
            select: { amount: true },
          })
        : [],
    ]);

    if (input.subscriptionId && !subscription) {
      return { error: "Subscription plan not found.", status: 404 };
    }

    const listAmount =
      input.amount ??
      (subscription?.amount ?? 0) +
        charges.reduce((sum, charge) => sum + charge.amount, 0);

    const empty: Quote = {
      listAmount,
      discountAmount: 0,
      coinsRedeemed: 0,
      netAmount: listAmount,
      bonusDays: 0,
      coinsGranted: 0,
      coupon: null,
    };

    let quote = empty;

    if (input.code?.trim()) {
      const coupon = await findCoupon(tenantId, input.code);
      if (!coupon) return { error: "That coupon code is not valid.", status: 404 };

      const problem = await couponService.checkEligibility(
        tenantId,
        coupon,
        membershipId,
        listAmount,
        input.subscriptionId,
      );
      if (problem) return { error: problem, status: 400 };

      const type = coupon.type as CouponType;

      // A discount can never exceed the price: a coupon must not produce a
      // negative amount, and Razorpay rejects an order below ₹1.
      let discountAmount = 0;
      if (type === "DISCOUNT") {
        const raw =
          coupon.percentOff !== null
            ? Math.floor((listAmount * coupon.percentOff) / 100)
            : (coupon.amountOff ?? 0);
        const capped =
          coupon.maxDiscount !== null ? Math.min(raw, coupon.maxDiscount) : raw;
        discountAmount = Math.max(0, Math.min(capped, listAmount));
      }

      quote = {
        ...empty,
        discountAmount,
        netAmount: listAmount - discountAmount,
        bonusDays: type === "VALIDITY" ? (coupon.bonusDays ?? 0) : 0,
        coinsGranted: type === "COINS" ? (coupon.coinsGranted ?? 0) : 0,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type,
          description: coupon.description,
        },
      };
    }

    // Coins come off what is left after the discount, so they can never
    // multiply a percentage off, and never take the total below zero.
    if (input.coinsToSpend && input.coinsToSpend > 0) {
      // A member being created has never earned a coin, so there is nothing
      // to look up and nothing to spend.
      const balance = membershipId
        ? await couponService.getCoinBalance(tenantId, membershipId)
        : 0;
      const spendable = Math.max(0, Math.min(input.coinsToSpend, balance, quote.netAmount));
      quote = {
        ...quote,
        coinsRedeemed: spendable,
        netAmount: quote.netAmount - spendable,
      };
    }

    return { data: quote };
  },

  /**
   * Record a redemption and grant whatever it gave.
   *
   * Called only after the payment it belongs to exists, so a redemption can
   * always be traced to the money it affected. The conditional increment is
   * what makes the last remaining use safe under concurrency.
   */
  async redeem(input: {
    tenantId: string;
    membershipId: string;
    quote: Quote;
    paymentId: string;
    appliedById?: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    const { tenantId, membershipId, quote, paymentId, appliedById } = input;

    if (quote.coupon) {
      // Claim a use before granting anything. `updateMany` with the count in
      // the filter fails rather than overselling when two requests race.
      const claimed = await prisma.coupon.updateMany({
        where: {
          id: quote.coupon.id,
          isActive: true,
          OR: [
            { maxRedemptions: null },
            { redemptionCount: { lt: prisma.coupon.fields.maxRedemptions } },
          ],
        },
        data: { redemptionCount: { increment: 1 } },
      });

      if (claimed.count === 0) {
        return { ok: false, reason: "This coupon was fully redeemed just now." };
      }

      const redemption = await prisma.couponRedemption.create({
        data: {
          couponId: quote.coupon.id,
          tenantId,
          membershipId,
          paymentId,
          discountAmount: quote.discountAmount,
          coinsGranted: quote.coinsGranted,
          bonusDays: quote.bonusDays,
          ...(appliedById ? { appliedById } : {}),
        },
        select: { id: true },
      });

      if (quote.coinsGranted > 0) {
        await prisma.coinLedgerEntry.create({
          data: {
            tenantId,
            membershipId,
            amount: quote.coinsGranted,
            reason: "COUPON",
            note: `Earned from ${quote.coupon.code}`,
            couponRedemptionId: redemption.id,
            paymentId,
            ...(appliedById ? { createdById: appliedById } : {}),
          },
        });
      }
    }

    if (quote.coinsRedeemed > 0) {
      await prisma.coinLedgerEntry.create({
        data: {
          tenantId,
          membershipId,
          // Negative: a spend.
          amount: -quote.coinsRedeemed,
          reason: "REDEEMED",
          note: "Spent on a subscription",
          paymentId,
          ...(appliedById ? { createdById: appliedById } : {}),
        },
      });
    }

    return { ok: true };
  },

  /**
   * Undo a redemption when the payment behind it is refunded or deleted.
   *
   * Frees the redemption slot and reverses coins in both directions: coins
   * granted are taken back, coins spent are returned. A balance can go negative
   * if the granted coins were already spent, which is a real debt and better
   * shown than hidden.
   */
  async reverseForPayment(tenantId: string, paymentId: string, actorId?: string) {
    const redemptions = await prisma.couponRedemption.findMany({
      where: { tenantId, paymentId, reversedAt: null },
      select: { id: true, couponId: true, membershipId: true, coinsGranted: true },
    });

    for (const redemption of redemptions) {
      await prisma.couponRedemption.update({
        where: { id: redemption.id },
        data: { reversedAt: new Date() },
      });

      await prisma.coupon.updateMany({
        where: { id: redemption.couponId, redemptionCount: { gt: 0 } },
        data: { redemptionCount: { decrement: 1 } },
      });

      if (redemption.coinsGranted > 0) {
        await prisma.coinLedgerEntry.create({
          data: {
            tenantId,
            membershipId: redemption.membershipId,
            amount: -redemption.coinsGranted,
            reason: "REVERSAL",
            note: "Coupon reversed with its payment",
            couponRedemptionId: redemption.id,
            paymentId,
            ...(actorId ? { createdById: actorId } : {}),
          },
        });
      }
    }

    // Coins spent on the payment come back to the member.
    const spent = await prisma.coinLedgerEntry.findFirst({
      where: { tenantId, paymentId, reason: "REDEEMED" },
      select: { membershipId: true, amount: true },
    });

    if (spent) {
      await prisma.coinLedgerEntry.create({
        data: {
          tenantId,
          membershipId: spent.membershipId,
          amount: Math.abs(spent.amount),
          reason: "REVERSAL",
          note: "Coins returned with a reversed payment",
          paymentId,
          ...(actorId ? { createdById: actorId } : {}),
        },
      });
    }
  },
};
