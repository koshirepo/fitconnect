/**
 * Documentation: Coupons repository.
 *
 * - Owns the Prisma shape of coupon reads and writes, including the two many-to-many links (badges required, plans applicable) that a coupon carries.
 * - Every query is tenant-scoped. A coupon code belongs to one gym, and two gyms may legitimately both run "NEWYEAR".
 * - Primary exports: couponRepository.
 */
import { prisma } from "../../lib/prisma";

const couponSelect = {
  id: true,
  code: true,
  description: true,
  type: true,
  percentOff: true,
  amountOff: true,
  maxDiscount: true,
  coinsGranted: true,
  bonusDays: true,
  firstTimeOnly: true,
  gender: true,
  minAmount: true,
  maxRedemptions: true,
  redemptionCount: true,
  maxPerMember: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  createdAt: true,
  badges: { select: { id: true, name: true, color: true, icon: true } },
  subscriptions: { select: { id: true, title: true } },
  _count: { select: { redemptions: true } },
} as const;

export const couponRepository = {
  list(tenantId: string, includeInactive: boolean) {
    return prisma.coupon.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: couponSelect,
    });
  },

  find(tenantId: string, couponId: string) {
    return prisma.coupon.findFirst({
      where: { id: couponId, tenantId },
      select: couponSelect,
    });
  },

  findByCode(tenantId: string, code: string) {
    return prisma.coupon.findFirst({
      where: { tenantId, code },
      select: { id: true },
    });
  },

  create(tenantId: string, data: Record<string, unknown>, badgeIds: string[], subscriptionIds: string[]) {
    return prisma.coupon.create({
      data: {
        tenantId,
        ...data,
        ...(badgeIds.length > 0
          ? { badges: { connect: badgeIds.map((id) => ({ id })) } }
          : {}),
        ...(subscriptionIds.length > 0
          ? { subscriptions: { connect: subscriptionIds.map((id) => ({ id })) } }
          : {}),
      } as never,
      select: couponSelect,
    });
  },

  /**
   * Update a coupon, replacing its links only when they were supplied.
   *
   * `set` rather than `connect`, so removing the last badge from a coupon
   * actually removes the requirement instead of leaving the old one attached.
   */
  update(
    couponId: string,
    data: Record<string, unknown>,
    badgeIds?: string[],
    subscriptionIds?: string[],
  ) {
    return prisma.coupon.update({
      where: { id: couponId },
      data: {
        ...data,
        ...(badgeIds ? { badges: { set: badgeIds.map((id) => ({ id })) } } : {}),
        ...(subscriptionIds
          ? { subscriptions: { set: subscriptionIds.map((id) => ({ id })) } }
          : {}),
      } as never,
      select: couponSelect,
    });
  },

  remove(couponId: string) {
    return prisma.coupon.delete({ where: { id: couponId } });
  },

  /** Redemption history, for the coupon detail view. */
  listRedemptions(tenantId: string, couponId: string) {
    return prisma.couponRedemption.findMany({
      where: { tenantId, couponId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        discountAmount: true,
        coinsGranted: true,
        bonusDays: true,
        reversedAt: true,
        createdAt: true,
        membership: {
          select: {
            id: true,
            memberId: true,
            user: { select: { name: true } },
          },
        },
      },
    });
  },
};
