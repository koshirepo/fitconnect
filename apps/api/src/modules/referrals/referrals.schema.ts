import { z } from "zod";

const referralRewardStatusSchema = z.enum([
  "NOT_APPLICABLE",
  "PENDING",
  "AWARDED",
]);

export const updateReferralSchema = z
  .object({
    referrerRewardStatus: referralRewardStatusSchema.optional(),
    referredRewardStatus: referralRewardStatusSchema.optional(),
    rewardNote: z.string().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateReferralInput = z.infer<typeof updateReferralSchema>;
