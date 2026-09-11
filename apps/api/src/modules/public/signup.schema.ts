/**
 * Documentation: Public self-signup schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types for the unauthenticated join-a-gym flow.
 * - Deliberately narrower than `addMemberSchema`: a stranger names themselves, a plan, and optional extras — never a role, a status, or an amount. Everything that decides money or access is read from the database instead.
 * - Primary exports: selfSignupSchema, verifySignupSchema, SelfSignupInput, VerifySignupInput.
 */
import { z } from "zod";
import { dataUrlField } from "../../lib/data-url-image";

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
  avatarDataUrl: dataUrlField({
    required: "A photo is required.",
    tooLarge: "That photo is too large. Maximum size is 5 MB.",
    unsupported: "That photo format is not supported.",
  }),
  /** Optional, mirroring the admin form — a phone-only member is normal here. */
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(10).max(15),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  /**
   * Required, the same as on the admin form: a membership without a date of
   * birth is a record the gym has to chase the person for later.
   */
  dateOfBirth: z.coerce
    .date()
    .refine((value) => value.getTime() <= Date.now(), {
      message: "Date of birth cannot be in the future.",
    })
    .refine((value) => value.getUTCFullYear() >= 1900, {
      message: "That date of birth looks wrong.",
    }),
  /** A row id from the platform-wide occupation list. Optional, as at the desk. */
  occupationId: z.string().min(1).optional(),
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
  /**
   * A joining offer.
   *
   * The code only; what it is worth is decided here, the same as every
   * other price on this path. No coins — somebody joining has never earned
   * any.
   */
  couponCode: z.string().trim().min(1).max(40).optional(),
  shiftId: z.string().optional(),
  /**
   * How the joining fee is being settled.
   *
   * The visitor chooses, the same way a store basket does. COUNTER skips the
   * gateway entirely: the membership is created owing exactly the same money,
   * and the front desk records it. Defaulted rather than required so an older
   * client keeps the behaviour it has always had.
   */
  paymentMode: z.enum(["ONLINE", "COUNTER"]).default("ONLINE"),
  /**
   * That the joining member accepted the gym's terms.
   *
   * `literal(true)` rather than a boolean: there is no such thing as a signup
   * that declined, so `false` and "absent" are the same refusal and both have
   * to fail here rather than write a membership with an empty consent record.
   *
   * Only the fact travels. The wording is read from the gym's settings on the
   * server, so a crafted request cannot file a membership against terms the
   * gym never published.
   */
  consentAccepted: z.literal(true, {
    message: "The gym's terms have to be accepted to join.",
  }),
});

/**
 * Pricing a joining offer before anybody has joined.
 *
 * The same shape the signup takes, minus the person: what a code is worth
 * has to be visible before the money is asked for, and on this path there is
 * no account to attribute the question to.
 */
export const signupQuoteSchema = z.object({
  subscriptionId: z.string().min(1),
  chargeIds: z.array(z.string()).max(50).optional(),
  couponCode: z.string().trim().min(1).max(40),
});

export const verifySignupSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

export type SelfSignupInput = z.infer<typeof selfSignupSchema>;
export type SignupQuoteInput = z.infer<typeof signupQuoteSchema>;
export type VerifySignupInput = z.infer<typeof verifySignupSchema>;

/** What the service registers: the parsed body with the photo already stored. */
export type SelfSignupServiceInput = Omit<SelfSignupInput, "avatarDataUrl"> & {
  avatarUrl: string;
};
