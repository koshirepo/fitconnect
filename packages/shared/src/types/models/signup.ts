/**
 * Documentation: Joining a gym from its public page, without an account.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { PaymentStatus } from "../enums";
import type { Gender } from "./auth";
import type { Shift } from "./members";
import type { OccupationSummary } from "./tenant";

// ─── Public self-signup ───────────────────────────────────────────────────────

/** What the public join form renders from: the gym and everything it offers. */
export interface SignupOptions {
  tenant: { id: string; name: string; slug: string; logoUrl?: string | null };
  plans: {
    id: string;
    title: string;
    description?: string | null;
    amount: number;
    durationDays: number;
  }[];
  charges: { id: string; name: string; amount: number; isMandatory: boolean }[];
  shifts: Shift[];
  /**
   * The platform's occupation list, sent from here because a visitor has no
   * session to read `/occupations` with.
   */
  occupations: OccupationSummary[];
  /** False when the gym takes no cards yet — the signup then ends at the desk. */
  onlinePaymentsEnabled: boolean;
  /**
   * The terms this gym asks a joining member to accept, already resolved to
   * the gym's own wording or the platform default. Always present: accepting
   * them is required to join.
   */
  consentText: string;
}

export interface SelfSignupPayload {
  name: string;
  email?: string;
  phone: string;
  gender: Gender;
  /** Required, as at the desk: an ISO date, "1998-04-23". */
  dateOfBirth: string;
  /** A row id from the occupation list `SignupOptions` carried. */
  occupationId?: string;
  /** Required. Base64 data URL — there is no session to upload a file with. */
  avatarDataUrl: string;
  subscriptionId: string;
  chargeIds?: string[];
  /**
   * A joining offer. The code only — the server decides what it is worth, so
   * a browser can never name its own discount.
   */
  couponCode?: string;
  shiftId?: string;
  /**
   * How the joining fee is settled. Omitted means online, which is what every
   * client did before the choice existed. COUNTER creates the membership owing
   * the same money, with nothing sent to the gateway.
   */
  paymentMode?: "ONLINE" | "COUNTER";
  /**
   * Solved Turnstile token, verified server-side before the account is created.
   * Named as Cloudflare's widget posts it. Absent when the gym's deployment has
   * no Turnstile secret configured, in which case the API does not check it.
   */
  "cf-turnstile-response"?: string;
  /**
   * That the joining member accepted the gym's terms. Required, and required
   * to be true — the API refuses anything else.
   *
   * Only the fact is sent. The wording recorded against the membership is read
   * from the gym's settings server-side, so it is always what the gym actually
   * published rather than whatever a request claimed.
   */
  consentAccepted: true;
}

/**
 * The result of joining: an inactive membership, the bill, and — when the gym
 * takes cards — the order to pay it with. A null `checkout` means the member
 * was created and owes the money at the front desk.
 */
export interface SelfSignupResult {
  membership: { id: string; memberId: number; status: string };
  /**
   * A session for the account just created, so the app can sign the new member
   * in rather than sending them to a login form.
   */
  auth: { accessToken: string; refreshToken: string };
  loginEmail: string;
  total: number;
  lineItems: { description: string | null; amount: number }[];
  checkout: {
    orderId: string;
    keyId: string;
    amount: number;
    currency: string;
  } | null;
}

/**
 * A gym registering itself, instead of a platform admin creating it.
 *
 * Carries no status and no role: the server decides both. What the owner is
 * choosing here is the gym's identity, its public address, and their own login.
 */
export interface TenantSignupPayload {
  name: string;
  /** The gym's permanent public address, e.g. `rudra-gym` in `rudra-gym.fitconnect.co.in`. */
  slug: string;
  /** Required. Base64 data URL — there is no session to upload a file with. */
  logoDataUrl: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  owner: {
    name: string;
    email: string;
    phone?: string;
    /** Required, for the same reason the gym's logo is. */
    avatarDataUrl: string;
    password: string;
  };
  /** Solved Turnstile token; absent when the deployment has none configured. */
  "cf-turnstile-response"?: string;
}

/**
 * The result of registering a gym: the gym itself, awaiting approval, and a
 * session for the owner so they land in their dashboard rather than at a
 * login form.
 */
export interface TenantSignupResult {
  tenant: { id: string; name: string; slug: string; status: string };
  auth: { accessToken: string; refreshToken: string };
  loginEmail: string;
}

/** Whether a gym address is free, and why not when it isn't. */
export interface TenantSlugCheck {
  slug: string;
  available: boolean;
  reason?: string;
}

export interface SignupVerifyResult {
  membership: {
    id: string;
    memberId: number;
    status: string;
    dueDate?: string | null;
  } | null;
  alreadySettled: boolean;
}

export interface PaymentSummary {
  id: string;
  amount: number;
  status: PaymentStatus;
  paidAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  subscription?: { id: string; title: string };
}

export interface CreatePaymentPayload {
  membershipId: string;
  subscriptionId?: string;
  chargeId?: string;
  description?: string;
  note?: string;
  status?: "PENDING" | "COMPLETED";
  amount: number;
  /** Handed over now, when it is less than `amount`; the rest becomes a due. */
  paidAmount?: number;
  /** The code itself — the server prices it, never the client. */
  couponCode?: string;
  coinsToSpend?: number;
  /** Existing dues this collection settles alongside the plan. */
  settlePendingIds?: string[];
  validFrom?: string;
  validUntil?: string;
}

export interface UpdatePaymentPayload {
  amount?: number;
  description?: string;
  note?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}
