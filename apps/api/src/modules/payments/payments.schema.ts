/**
 * Documentation: Payments schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for subscription management, payment collection, and membership validity tracking.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createPaymentSchema, updatePaymentStatusSchema, updatePaymentSchema, createSubscriptionSchema, updateSubscriptionSchema, CreatePaymentInput, UpdatePaymentInput, CreateSubscriptionInput, UpdateSubscriptionInput.
 */
import { z } from "zod";

/**
 * Define or support the `to utc date only` validation contract for the payments module.
 * Schema helpers keep input parsing rules colocated with the module that consumes them.
 */
const toUtcDateOnly = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

export const createPaymentSchema = z
  .object({
    membershipId: z.string(),
    subscriptionId: z.string().optional(),
    chargeId: z.string().optional(),
    description: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
    status: z.enum(["PENDING", "COMPLETED"]).default("COMPLETED"),
    /** The full price of what is being paid for. */
    amount: z.number().int().min(1),
    /**
     * What the member actually handed over, when that is less than the price.
     * The difference is written as a second, PENDING row — the balance they
     * still owe. Omit it for a payment made in full.
     */
    paidAmount: z.number().int().min(1).optional(),
    /**
     * A coupon code, never a discounted amount. The server prices it — a
     * request that could name its own discount could buy a year for a rupee.
     */
    couponCode: z.string().max(32).optional(),
    /** Coins to spend. Clamped to the balance and to what is owed. */
    coinsToSpend: z.number().int().min(0).optional(),
    /**
     * Dues this collection also settles, so the desk takes the plan and the
     * arrears in one go.
     *
     * Ids rather than a flag: the form shows exactly which rows it is about to
     * close, and a due raised between loading the form and submitting it is not
     * silently swept into the total. The server re-reads every id and ignores
     * any that is no longer pending.
     */
    settlePendingIds: z.array(z.string()).max(20).optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.subscriptionId && !data.chargeId) {
      ctx.addIssue({
        code: "custom",
        message: "Either subscriptionId or chargeId is required.",
        path: ["subscriptionId"],
      });
    }

    if (data.paidAmount !== undefined) {
      if (data.paidAmount > data.amount) {
        ctx.addIssue({
          code: "custom",
          message: "The amount received cannot be more than the total.",
          path: ["paidAmount"],
        });
      }

      // A part payment is money taken now; a payment recorded as pending has
      // taken nothing yet, so there is no part of it to split.
      if (data.status !== "COMPLETED" && data.paidAmount < data.amount) {
        ctx.addIssue({
          code: "custom",
          message: "Only a completed payment can be a part payment.",
          path: ["paidAmount"],
        });
      }
    }

    if (data.validUntil) {
      const today = toUtcDateOnly(new Date());
      const validUntil = toUtcDateOnly(data.validUntil);

      if (validUntil < today) {
        ctx.addIssue({
          code: "custom",
          message: "validUntil must be today or later.",
          path: ["validUntil"],
        });
      }

      if (data.validFrom && validUntil < toUtcDateOnly(data.validFrom)) {
        ctx.addIssue({
          code: "custom",
          message: "validUntil must be on or after validFrom.",
          path: ["validUntil"],
        });
      }
    }
  });

/**
 * Every status a payment can be moved to, PENDING included.
 *
 * An admin correcting the record needs the whole set, not a one-way path: a
 * payment marked failed against the wrong member, or completed by a
 * mis-click, has to be able to go back to owing. Who may make which move is
 * decided in the service against the caller's permissions — somebody holding
 * only `payments:settle` still cannot touch a settled row — so widening the
 * shape here grants nothing on its own.
 */
export const updatePaymentStatusSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]),
});

export const updatePaymentSchema = z
  .object({
    amount: z.number().int().min(1).optional(),
    description: z.string().max(200).optional(),
    note: z.string().max(500).optional().nullable(),
    validFrom: z.coerce.date().optional().nullable(),
    validUntil: z.coerce.date().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.validUntil && data.validFrom && data.validUntil < data.validFrom) {
      ctx.addIssue({
        code: "custom",
        message: "validUntil must be on or after validFrom.",
        path: ["validUntil"],
      });
    }
  });

export const createSubscriptionSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  amount: z.number().int().min(0),
  durationDays: z.number().int().min(1).default(30),
  /** Days a term on this plan may be frozen for. 0 means it cannot be frozen. */
  freezeDays: z.number().int().min(0).max(365).optional(),
  /** How many separate freezes that budget may be split across. */
  freezeCount: z.number().int().min(0).max(12).optional(),
  badgeIds: z.array(z.string()).max(100).optional().default([]),
});

export const updateSubscriptionSchema = z
  .object({
    title: z.string().min(2).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    amount: z.number().int().min(0).optional(),
    durationDays: z.number().int().min(1).optional(),
    freezeDays: z.number().int().min(0).max(365).optional(),
    freezeCount: z.number().int().min(0).max(12).optional(),
    isActive: z.boolean().optional(),
    badgeIds: z.array(z.string()).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required.",
  });

// ─── Payment gateway ──────────────────────────────────────────────────────────

/**
 * Saving a gym's own Razorpay credentials.
 *
 * Every field is optional so an admin can correct one without re-entering the
 * others. An empty `keyId` is the documented way to clear the configuration and
 * fall back to the platform account, which is why it is not `min(1)`.
 */
export const updateGatewaySchema = z
  .object({
    keyId: z
      .string()
      .trim()
      .max(120)
      .refine((value) => value === "" || /^rzp_(test|live)_[A-Za-z0-9]+$/.test(value), {
        message: "Enter a Razorpay key id, which looks like rzp_test_xxxxxxxx.",
      })
      .optional(),
    keySecret: z.string().trim().min(8).max(200).optional(),
    // Nullable: an empty webhook secret clears it without touching the keys.
    webhookSecret: z.string().trim().max(200).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required.",
  });

/**
 * Opening a checkout names only the plan. The price comes from the plan record,
 * never from the request, so a tampered body cannot change what is charged.
 */
export const checkoutSchema = z
  .object({
    subscriptionId: z.string().min(1),
    /** A code the member typed. Priced by the server, never by the browser. */
    couponCode: z.string().trim().min(1).max(40).optional(),
    /** Coins to put against the bill. Clamped to the balance and the total. */
    coinsToSpend: z.number().int().min(0).optional(),
    /**
     * Online, or settled at the front desk. Defaulted so an older client keeps
     * the only behaviour it knows.
     */
    mode: z.enum(["ONLINE", "COUNTER"]).default("ONLINE"),
  })
  /**
   * Coins and a coupon belong to the online path only.
   *
   * Nothing is charged at the desk until staff ring it through, and a coin
   * spent against a renewal the member never turns up to pay for would have to
   * be clawed back. Staff apply the code when they take the money instead.
   */
  .refine(
    (value) =>
      value.mode !== "COUNTER" ||
      (!value.couponCode && !(value.coinsToSpend ?? 0)),
    {
      message: "Coupons and coins apply when paying online.",
      path: ["mode"],
    },
  );

/** The three values Razorpay's checkout widget hands back to the browser. */
export const verifyCheckoutSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1).max(200),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type UpdateGatewayInput = z.infer<typeof updateGatewaySchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type VerifyCheckoutInput = z.infer<typeof verifyCheckoutSchema>;
