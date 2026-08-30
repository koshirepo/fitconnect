/**
 * Documentation: Coupon schema definitions.
 *
 * - Validates the shape of a coupon before it reaches the service, including the rule that each type carries only the fields that type uses — a DISCOUNT with `bonusDays` set is a mistake worth rejecting rather than silently ignoring.
 * - The code is normalised to uppercase here so lookups never have to care about how it was typed.
 * - Primary exports: createCouponSchema, updateCouponSchema, quoteSchema, CreateCouponInput, UpdateCouponInput, QuoteInput.
 */
import { z } from "zod";

const couponType = z.enum(["DISCOUNT", "COINS", "VALIDITY"]);

const baseCoupon = {
  code: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores.")
    .transform((value) => value.trim().toUpperCase()),
  description: z.string().max(200).optional(),
  type: couponType,

  percentOff: z.number().int().min(1).max(100).nullable().optional(),
  amountOff: z.number().int().min(1).nullable().optional(),
  maxDiscount: z.number().int().min(1).nullable().optional(),
  coinsGranted: z.number().int().min(1).nullable().optional(),
  bonusDays: z.number().int().min(1).max(365).nullable().optional(),

  firstTimeOnly: z.boolean().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
  minAmount: z.number().int().min(0).nullable().optional(),
  badgeIds: z.array(z.string()).max(20).optional(),
  subscriptionIds: z.array(z.string()).max(20).optional(),

  maxRedemptions: z.number().int().min(1).nullable().optional(),
  maxPerMember: z.number().int().min(1).max(50).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
};

/** Each type must carry the value that makes it mean anything. */
function checkTypeShape(
  data: { type?: string; percentOff?: number | null; amountOff?: number | null; coinsGranted?: number | null; bonusDays?: number | null; startsAt?: Date | null; endsAt?: Date | null },
  ctx: z.RefinementCtx,
) {
  if (data.type === "DISCOUNT") {
    const hasPercent = data.percentOff !== null && data.percentOff !== undefined;
    const hasAmount = data.amountOff !== null && data.amountOff !== undefined;
    if (hasPercent === hasAmount) {
      ctx.addIssue({
        code: "custom",
        message: "A discount needs either a percentage or a flat amount, not both.",
        path: ["percentOff"],
      });
    }
  }

  if (data.type === "COINS" && !data.coinsGranted) {
    ctx.addIssue({
      code: "custom",
      message: "A coins coupon must grant at least one coin.",
      path: ["coinsGranted"],
    });
  }

  if (data.type === "VALIDITY" && !data.bonusDays) {
    ctx.addIssue({
      code: "custom",
      message: "A validity coupon must add at least one day.",
      path: ["bonusDays"],
    });
  }

  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    ctx.addIssue({
      code: "custom",
      message: "The end date must be after the start date.",
      path: ["endsAt"],
    });
  }
}

export const createCouponSchema = z.object(baseCoupon).superRefine(checkTypeShape);

export const updateCouponSchema = z
  .object({ ...baseCoupon, code: baseCoupon.code.optional(), type: couponType.optional() })
  .superRefine((data, ctx) => {
    // Only re-check the shape when the type is part of this update.
    if (data.type) checkTypeShape(data, ctx);
  });

/** What a screen asks for when previewing a price before saving a payment. */
export const quoteSchema = z.object({
  /**
   * Null while somebody is still being admitted: the membership does not exist
   * yet, and the desk has to see the price before taking the money. A prospect
   * has no history to check and no coins, so the per-member rules are satisfied
   * by definition rather than skipped.
   */
  membershipId: z.string().min(1).nullable(),
  subscriptionId: z.string().nullable().optional(),
  chargeIds: z.array(z.string()).max(50).optional(),
  amount: z.number().int().min(1).optional(),
  code: z.string().max(32).nullable().optional(),
  coinsToSpend: z.number().int().min(0).optional(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
