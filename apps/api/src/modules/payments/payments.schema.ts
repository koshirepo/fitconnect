import { z } from "zod";

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
    amount: z.number().int().min(1),
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

export const updatePaymentStatusSchema = z.object({
  status: z.enum(["COMPLETED", "FAILED", "REFUNDED"]),
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
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
