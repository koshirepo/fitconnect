import { flattenNestedMember } from "../../lib/flatten";
import { referralRepository } from "./referrals.repository";
import type { UpdateReferralInput } from "./referrals.schema";

type ReferralRecord = Awaited<ReturnType<typeof referralRepository.create>>;

export interface PreparedReferralEnrollment {
  referrerMembershipId: string;
  referrerReward?: string | null;
  referredReward?: string | null;
  referrerRewardStatus: "NOT_APPLICABLE" | "PENDING" | "AWARDED";
  referredRewardStatus: "NOT_APPLICABLE" | "PENDING" | "AWARDED";
}

function rewardStatusFromValue(reward?: string | null) {
  return reward?.trim() ? "PENDING" : "NOT_APPLICABLE";
}

function serializeReferral(referral: ReferralRecord | null) {
  if (!referral) return referral;

  return {
    id: referral.id,
    tenantId: referral.tenantId,
    referrerReward: referral.referrerReward,
    referredReward: referral.referredReward,
    referrerRewardStatus: referral.referrerRewardStatus,
    referredRewardStatus: referral.referredRewardStatus,
    referrerRewardedAt: referral.referrerRewardedAt,
    referredRewardedAt: referral.referredRewardedAt,
    rewardNote: referral.rewardNote,
    createdAt: referral.createdAt,
    updatedAt: referral.updatedAt,
    referrer: flattenNestedMember(referral.referrer),
    referred: flattenNestedMember(referral.referred),
  };
}

export const referralService = {
  async prepareEnrollment(tenantId: string, referrerMembershipId: string) {
    const [settings, referrer] = await Promise.all([
      referralRepository.getReferralSettings(tenantId),
      referralRepository.findMembership(tenantId, referrerMembershipId),
    ]);

    if (!settings?.referralsEnabled) {
      return {
        error: "Referral tracking is not enabled for this gym.",
        status: 400 as const,
      };
    }

    if (!referrer) {
      return {
        error: "Referring member was not found in this gym.",
        status: 404 as const,
      };
    }

    if (referrer.status !== "ACTIVE") {
      return {
        error: "Only active members can be selected as referrers.",
        status: 400 as const,
      };
    }

    return {
      data: {
        referrerMembershipId: referrer.id,
        referrerReward: settings.referralReferrerReward,
        referredReward: settings.referralReferredReward,
        referrerRewardStatus: rewardStatusFromValue(
          settings.referralReferrerReward,
        ),
        referredRewardStatus: rewardStatusFromValue(
          settings.referralReferredReward,
        ),
      } satisfies PreparedReferralEnrollment,
    };
  },

  async createFromPreparedEnrollment(
    tenantId: string,
    referredMembershipId: string,
    prepared: PreparedReferralEnrollment,
  ) {
    const referral = await referralRepository.create({
      tenantId,
      referrerMembershipId: prepared.referrerMembershipId,
      referredMembershipId,
      referrerReward: prepared.referrerReward ?? null,
      referredReward: prepared.referredReward ?? null,
      referrerRewardStatus: prepared.referrerRewardStatus,
      referredRewardStatus: prepared.referredRewardStatus,
    });

    return { data: { referral: serializeReferral(referral)! } };
  },

  async list(tenantId: string, page: number, limit: number, search?: string) {
    const { referrals, total } = await referralRepository.list(
      tenantId,
      page,
      limit,
      search,
    );
    return {
      data: {
        referrals: referrals.map((referral) => serializeReferral(referral)!),
      },
      total,
    };
  },

  async update(
    tenantId: string,
    referralId: string,
    input: UpdateReferralInput,
  ) {
    const referral = await referralRepository.findById(referralId, tenantId);
    if (!referral) {
      return { error: "Referral not found.", status: 404 as const };
    }

    if (
      !referral.referrerReward &&
      input.referrerRewardStatus &&
      input.referrerRewardStatus !== "NOT_APPLICABLE"
    ) {
      return {
        error: "This referral has no configured reward for the referrer.",
        status: 400 as const,
      };
    }

    if (
      !referral.referredReward &&
      input.referredRewardStatus &&
      input.referredRewardStatus !== "NOT_APPLICABLE"
    ) {
      return {
        error:
          "This referral has no configured reward for the referred member.",
        status: 400 as const,
      };
    }

    const now = new Date();
    const data: Record<string, unknown> = {};

    if (input.referrerRewardStatus !== undefined) {
      data.referrerRewardStatus = input.referrerRewardStatus;
      data.referrerRewardedAt =
        input.referrerRewardStatus === "AWARDED"
          ? (referral.referrerRewardedAt ?? now)
          : null;
    }

    if (input.referredRewardStatus !== undefined) {
      data.referredRewardStatus = input.referredRewardStatus;
      data.referredRewardedAt =
        input.referredRewardStatus === "AWARDED"
          ? (referral.referredRewardedAt ?? now)
          : null;
    }

    if (input.rewardNote !== undefined) {
      data.rewardNote = input.rewardNote;
    }

    const updated = await referralRepository.update(referralId, data);
    return { data: { referral: serializeReferral(updated)! } };
  },
};
