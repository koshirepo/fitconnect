/**
 * Documentation: What a payout request may say.
 *
 * - Bank details are validated to the shape a transfer actually needs. A wrong IFSC is not a typo somebody notices later; it is a failed or misdirected transfer, and the person who finds out is the gym that did not get paid.
 * - The account number is a string, never a number. Leading zeros are real, and 000123456789 read as an integer is a different account.
 * - Primary exports: saveBankAccountSchema, rejectPayoutSchema, markPaidSchema, and their inferred inputs.
 */
import { z } from "zod";

/** Four letters, a zero, then six alphanumerics. Every Indian bank code. */
const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "That does not look like an IFSC code.");

export const saveBankAccountSchema = z.object({
  accountHolder: z.string().trim().min(2).max(120),
  /**
   * Digits only, 6 to 18 — the range Indian banks issue within. Kept as text so
   * leading zeros survive, and spaces are allowed on the way in because that is
   * how account numbers are printed on a cheque.
   */
  accountNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => /^[0-9]{6,18}$/.test(value), "Enter the account number, digits only."),
  ifsc,
  bankName: z.string().trim().max(120).optional(),
});

export const rejectPayoutSchema = z.object({
  /** Required: a refusal the gym cannot read is a refusal it will ask about. */
  note: z.string().trim().min(3).max(500),
});

export const markPaidSchema = z.object({
  /**
   * The bank's reference for the transfer — a UTR, usually.
   *
   * Required, because a payout marked paid with nothing to trace it by is a row
   * claiming money moved that cannot show that it did.
   */
  reference: z.string().trim().min(3).max(80),
});

export type SaveBankAccountInput = z.infer<typeof saveBankAccountSchema>;
export type RejectPayoutInput = z.infer<typeof rejectPayoutSchema>;
export type MarkPaidInput = z.infer<typeof markPaidSchema>;
