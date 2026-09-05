/**
 * Documentation: How a gym's coupons are actually being used.
 *
 * - A coupon list says what exists; this says what happened. The two questions a gym asks are "which code is people actually using" and "what has this cost me", and neither is answerable from the coupon table alone.
 * - Cost is reported in the three currencies a coupon can spend: rupees discounted, coins granted, and days given away. They are deliberately not added together — a day of membership and a rupee are not interchangeable, and a single "total value" number would invent an exchange rate nobody agreed.
 * - Unused coupons are listed as plainly as used ones. A code redeemed zero times in three months is the most useful thing on this page, and a leaderboard sorted by redemptions hides exactly that.
 * - Primary exports: couponAnalyticsService.
 */
import { prisma } from "../../lib/prisma";

export const couponAnalyticsService = {
  /**
   * Every coupon a gym has, with what each one has cost.
   *
   * Two queries rather than a join per coupon: the redemptions are grouped once
   * and stitched onto the codes in memory, which is one table scan instead of
   * one per row.
   */
  async overview(tenantId: string) {
    const [coupons, grouped] = await Promise.all([
      prisma.coupon.findMany({
        where: { tenantId },
        select: {
          id: true,
          code: true,
          description: true,
          type: true,
          appliesTo: true,
          isActive: true,
          percentOff: true,
          amountOff: true,
          coinsGranted: true,
          bonusDays: true,
          startsAt: true,
          endsAt: true,
          maxRedemptions: true,
          maxPerMember: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.couponRedemption.groupBy({
        by: ["couponId"],
        where: { tenantId },
        _count: { _all: true },
        _sum: { discountAmount: true, coinsGranted: true, bonusDays: true },
      }),
    ]);

    const usage = new Map(
      grouped.map((row) => [
        row.couponId,
        {
          redemptions: row._count._all,
          // Named apart from the coupon's own fields on purpose. A coupon has a
          // `coinsGranted` — what one redemption gives — and a total of coins
          // granted across every redemption. Spreading both onto one row let the
          // total quietly overwrite the setting.
          redeemedDiscount: row._sum.discountAmount ?? 0,
          redeemedCoins: row._sum.coinsGranted ?? 0,
          redeemedDays: row._sum.bonusDays ?? 0,
        },
      ]),
    );

    const rows = coupons.map((coupon) => ({
      ...coupon,
      ...(usage.get(coupon.id) ?? {
        redemptions: 0,
        redeemedDiscount: 0,
        redeemedCoins: 0,
        redeemedDays: 0,
      }),
      /** A code that has run out cannot be used again, however active it looks. */
      exhausted:
        coupon.maxRedemptions != null &&
        (usage.get(coupon.id)?.redemptions ?? 0) >= coupon.maxRedemptions,
    }));

    const totals = rows.reduce(
      (sum, row) => ({
        redemptions: sum.redemptions + row.redemptions,
        // Three currencies, kept apart. A day and a rupee do not add up, and a
        // combined figure would be inventing a rate nobody agreed to.
        discountAmount: sum.discountAmount + row.redeemedDiscount,
        coinsGranted: sum.coinsGranted + row.redeemedCoins,
        bonusDays: sum.bonusDays + row.redeemedDays,
      }),
      { redemptions: 0, discountAmount: 0, coinsGranted: 0, bonusDays: 0 },
    );

    return {
      data: {
        totals: {
          ...totals,
          couponCount: rows.length,
          activeCount: rows.filter((row) => row.isActive && !row.exhausted).length,
          /** Codes nobody has used. The most useful number on the page. */
          unusedCount: rows.filter((row) => row.redemptions === 0).length,
        },
        coupons: rows,
      },
    };
  },

  /** The most recent redemptions, with who used what. */
  async recent(tenantId: string, limit = 50) {
    const redemptions = await prisma.couponRedemption.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        discountAmount: true,
        coinsGranted: true,
        bonusDays: true,
        createdAt: true,
        coupon: { select: { id: true, code: true, type: true } },
        membership: {
          select: { id: true, memberId: true, user: { select: { name: true } } },
        },
      },
    });

    return {
      data: {
        redemptions: redemptions.map((row) => ({
          id: row.id,
          code: row.coupon.code,
          type: row.coupon.type,
          discountAmount: row.discountAmount,
          coinsGranted: row.coinsGranted,
          bonusDays: row.bonusDays,
          createdAt: row.createdAt,
          membershipId: row.membership.id,
          memberId: row.membership.memberId,
          memberName: row.membership.user.name,
        })),
      },
    };
  },
};
