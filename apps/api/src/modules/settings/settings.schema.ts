/**
 * Documentation: Settings schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for tenant settings and extra charge configuration.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: updateSettingsSchema, createChargeSchema, updateChargeSchema, UpdateSettingsInput, CreateChargeInput, UpdateChargeInput.
 */
import { z } from "zod";
import { whatsappTemplateKeys } from "@fitconnect/shared/whatsapp-templates";

/** Whether the runtime recognises a zone name, which is the only real test. */
function isKnownTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const whatsappTemplateShape = Object.fromEntries(
  whatsappTemplateKeys.map((key) => [key, z.string().trim().min(1).max(4000).optional()]),
) as Record<string, z.ZodOptional<z.ZodString>>;

export const updateSettingsSchema = z.object({
  overdueDays: z.number().int().min(1).max(365).optional(),
  /** Coins the referrer earns on their referee's first subscription. 0 is off. */
  referralRewardCoins: z.number().int().min(0).max(100000).optional(),
  /**
   * Days a coin lives before it is swept away. 0 turns expiry off.
   *
   * Capped at five years: a longer window is indistinguishable from never,
   * and saying "never" plainly is better than a number nobody will outlive.
   */
  coinExpiryDays: z.number().int().min(0).max(1825).optional(),
  /** Coins the referred member earns at the same moment. 0 is none. */
  referralRefereeCoins: z.number().int().min(0).max(100000).optional(),
  /**
   * The gym's IANA zone, checked against the runtime's own zone table rather
   * than a pattern. "Asia/Kolkata" and "Asia/Kolkatta" are both plausible
   * strings; only one of them is a zone, and a typo here silently moves every
   * report by hours rather than failing where somebody would notice.
   */
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isKnownTimeZone, "Not a recognised time zone")
    .optional(),
  whatsappTemplates: z.object(whatsappTemplateShape).optional(),
});

export const createChargeSchema = z.object({
  name: z.string().min(2).max(120),
  amount: z.number().int().min(0),
  isMandatory: z.boolean().default(true),
});

export const updateChargeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  amount: z.number().int().min(0).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type UpdateChargeInput = z.infer<typeof updateChargeSchema>;
