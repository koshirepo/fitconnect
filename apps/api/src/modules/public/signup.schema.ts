/**
 * Documentation: Public self-signup schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types for the unauthenticated join-a-gym flow.
 * - Deliberately narrower than `addMemberSchema`: a stranger names themselves, a plan, and optional extras — never a role, a status, or an amount. Everything that decides money or access is read from the database instead.
 * - Primary exports: selfSignupSchema, verifySignupSchema, SelfSignupInput, VerifySignupInput.
 */
import { z } from "zod";

/** Base64 image payload, e.g. `data:image/jpeg;base64,/9j/4AAQ...`. */
const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

/** 5 MB of image, matching the authenticated upload endpoints. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** Base64 costs about a third more than the bytes it encodes. */
const MAX_AVATAR_CHARS = Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 128;

export const selfSignupSchema = z.object({
  name: z.string().min(2).max(120),
  /**
   * Required. A gym has to be able to recognise who walks in, and the person
   * signing themselves up is the only one who can supply the photo.
   *
   * It rides along in the body rather than going through `/uploads` first,
   * because that endpoint needs a session and this caller has none. Sending it
   * here means an image only ever lands in the bucket alongside a real
   * membership, instead of behind an open upload door.
   */
  avatarDataUrl: z
    .string()
    .min(1, "A photo is required.")
    .max(MAX_AVATAR_CHARS, "That photo is too large. Maximum size is 5 MB.")
    .regex(DATA_URL_PATTERN, "That photo format is not supported."),
  /** Optional, mirroring the admin form — a phone-only member is normal here. */
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(10).max(15),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  /**
   * Required, unlike the admin flow: a self-signup exists to be paid for, and a
   * membership with nothing to pay has no moment at which it becomes active.
   */
  subscriptionId: z.string().min(1),
  /**
   * Optional extras. Mandatory charges are added by the server regardless.
   *
   * Capped because these become bind parameters in one statement, and D1
   * allows about a hundred per query — a hand-made request with a thousand ids
   * would otherwise fail the whole signup at the database.
   */
  chargeIds: z.array(z.string()).max(50).optional(),
  shiftId: z.string().optional(),
});

export const verifySignupSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

export type SelfSignupInput = z.infer<typeof selfSignupSchema>;
export type VerifySignupInput = z.infer<typeof verifySignupSchema>;

/** What the service registers: the parsed body with the photo already stored. */
export type SelfSignupServiceInput = Omit<SelfSignupInput, "avatarDataUrl"> & {
  avatarUrl: string;
};
