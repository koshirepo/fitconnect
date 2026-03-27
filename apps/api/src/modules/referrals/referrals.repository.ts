import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

const membershipSelect = {
  id: true,
  memberId: true,
  role: true,
  status: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
    },
  },
} as const;

const referralSelect = {
  id: true,
  tenantId: true,
  referrerReward: true,
  referredReward: true,
  referrerRewardStatus: true,
  referredRewardStatus: true,
  referrerRewardedAt: true,
  referredRewardedAt: true,
  rewardNote: true,
  createdAt: true,
  updatedAt: true,
  referrer: { select: membershipSelect },
  referred: { select: membershipSelect },
} as const;

export const referralRepository = {
  getReferralSettings(tenantId: string) {
    return prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        referralsEnabled: true,
        referralReferrerReward: true,
        referralReferredReward: true,
      },
    });
  },

  findMembership(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: membershipSelect,
    });
  },

  list(tenantId: string, page: number, limit: number, search?: string) {
    const where: Prisma.ReferralWhereInput = { tenantId };
    const term = search?.trim();

    if (term) {
      where.OR = [
        { referrer: { user: { name: { contains: term } } } },
        { referrer: { user: { email: { contains: term } } } },
        { referred: { user: { name: { contains: term } } } },
        { referred: { user: { email: { contains: term } } } },
      ];
    }

    return Promise.all([
      prisma.referral.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: referralSelect,
      }),
      prisma.referral.count({ where }),
    ]).then(([referrals, total]) => ({ referrals, total }));
  },

  findById(referralId: string, tenantId: string) {
    return prisma.referral.findFirst({
      where: { id: referralId, tenantId },
      select: referralSelect,
    });
  },

  create(data: {
    tenantId: string;
    referrerMembershipId: string;
    referredMembershipId: string;
    referrerReward?: string | null;
    referredReward?: string | null;
    referrerRewardStatus: string;
    referredRewardStatus: string;
  }) {
    return prisma.referral.create({
      data,
      select: referralSelect,
    });
  },

  update(referralId: string, data: Record<string, unknown>) {
    return prisma.referral.update({
      where: { id: referralId },
      data,
      select: referralSelect,
    });
  },
};
