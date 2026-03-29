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

export const updateSubscriptionSchema = z
  .object({
    title: z.string().min(2).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    amount: z.number().int().min(0).optional(),
    durationDays: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required.",
  });

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
