/**
 * Documentation: The bad-word check, as something a Zod schema can hold.
 *
 * - Applied at validation rather than in each service, so the refusal is the same shape as every other rejected field and no controller has to remember to ask. A field that is not wrapped is simply not filtered, which is readable straight off the schema.
 * - Scoped to text one person writes and another reads: comments, reviews, and the copy a gym publishes about itself and its products. Staff-internal notes — finance, payouts, coin adjustments — are deliberately left alone. Nobody is abused by a note in a ledger, and policing them only adds false positives to somebody's bookkeeping.
 * - The message never repeats the matched word back. Quoting it reads as a taunt, and it tells whoever is probing exactly which token to work around.
 * - Primary exports: cleanText.
 */
import type { z } from "zod";
import { PROFANITY_REJECTION_MESSAGE, containsProfanity } from "@fitconnect/shared/profanity";

/** Wrap a string schema so it also refuses language another member would read. */
export function cleanText<T extends z.ZodType<string | null | undefined>>(schema: T) {
  return schema.refine((value) => !containsProfanity(value), {
    message: PROFANITY_REJECTION_MESSAGE,
  });
}
