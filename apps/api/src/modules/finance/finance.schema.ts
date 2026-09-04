/**
 * Documentation: Finance and salary schema definitions.
 *
 * - Zod schemas for the gym's books: one-off and recurring expenses, staff pay agreements, the parts of a month's pay, and the payments made against it.
 * - Money is validated as a whole number of rupees, matching how every other amount in this app is stored. Fractions of a rupee are not a thing the desk deals in, and allowing them here would put them in the ledger.
 * - Components carry a positive amount and a `kind` that decides the sign, so a deduction cannot arrive as a negative bonus.
 * - Primary exports: the schemas and their inferred input types.
 */
import { z } from "zod";

/** "YYYY-MM". Every finance view is a calendar month. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/u, "Month must look like 2026-09.");

/**
 * Whole rupees, and at least one of them.
 *
 * The cap is high enough for any real gym cost and low enough that a typo with
 * an extra six digits is rejected rather than quietly booked.
 */
const money = z.number().int().min(1).max(100_000_000);

export const EXPENSE_CATEGORIES = [
  "RENT",
  "SALARY",
  "UTILITIES",
  "EQUIPMENT",
  "MAINTENANCE",
  "MARKETING",
  "SUPPLIES",
  "TAX",
  "OTHER",
] as const;

export const SALARY_COMPONENT_KINDS = ["BONUS", "INCENTIVE", "BENEFIT", "DEDUCTION"] as const;

export const SALARY_PAYMENT_METHODS = ["CASH", "BANK", "UPI", "OTHER"] as const;

const categorySchema = z.enum(EXPENSE_CATEGORIES);

export const createExpenseSchema = z.object({
  label: z.string().trim().min(2).max(160),
  amount: money,
  category: categorySchema.default("OTHER"),
  /** Defaults to today at the service layer when omitted. */
  incurredOn: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional(),
});

export const updateExpenseSchema = z.object({
  label: z.string().trim().min(2).max(160).optional(),
  amount: money.optional(),
  category: categorySchema.optional(),
  incurredOn: z.string().datetime().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const createRecurringExpenseSchema = z.object({
  label: z.string().trim().min(2).max(160),
  amount: money,
  category: categorySchema.default("OTHER"),
  dayOfMonth: z.number().int().min(1).max(31).default(1),
  note: z.string().trim().max(500).optional(),
});

export const updateRecurringExpenseSchema = z.object({
  label: z.string().trim().min(2).max(160).optional(),
  amount: money.optional(),
  category: categorySchema.optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Posting a template into a month, optionally for an amount other than the standing one. */
export const postRecurringExpenseSchema = z.object({
  month: monthSchema,
  amount: money.optional(),
  note: z.string().trim().max(500).optional(),
});

export const setCompensationSchema = z.object({
  monthlyAmount: money,
  effectiveFrom: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const addSalaryComponentSchema = z.object({
  kind: z.enum(SALARY_COMPONENT_KINDS),
  label: z.string().trim().min(2).max(120),
  amount: money,
});

export const recordSalaryPaymentSchema = z.object({
  amount: money,
  method: z.enum(SALARY_PAYMENT_METHODS).default("CASH"),
  paidAt: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>;
export type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>;
export type PostRecurringExpenseInput = z.infer<typeof postRecurringExpenseSchema>;
export type SetCompensationInput = z.infer<typeof setCompensationSchema>;
export type AddSalaryComponentInput = z.infer<typeof addSalaryComponentSchema>;
export type RecordSalaryPaymentInput = z.infer<typeof recordSalaryPaymentSchema>;
