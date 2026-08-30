/**
 * Documentation: Public self-signup service.
 *
 * - Implements the join-a-gym flow for a visitor with no account: it creates the user, the membership, and the money owed, then hands the browser what it needs to pay.
 * - The membership is born inactive (`SUSPENDED`, which the app shows as "Inactive") with every payment PENDING. Nothing here activates anybody — that happens in the shared gateway settle path once Razorpay confirms the money, whether the browser comes back or only the webhook does.
 * - Prices are read from the database, never from the request: a body that could name its own amount could buy a year for a rupee.
 * - A gym with no gateway configured still accepts signups; the member simply stays inactive with a pending bill for the front desk to settle.
 * - Primary exports: signupService.
 */
import { PlatformRole, type TenantRole } from "@fitconnect/shared/types/enums";
import { hashPassword } from "../../auth/password";
import {
  createOrder,
  verifyCheckoutSignature,
  RazorpayError,
} from "../../lib/razorpay";
import { normalizeTenantHost } from "../../lib/tenant-host";
import {
  generateRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
} from "../../auth/jwt";
import { authRepository } from "../auth/auth.repository";
import { memberRepository } from "../members/members.repository";
import { gatewayService } from "../payments/gateway.service";
import { couponService } from "../coupons/coupons.service";
import { paymentRepository } from "../payments/payments.repository";
import { pushService } from "../push/push.service";
import { signupRepository } from "./signup.repository";
import type {
  SelfSignupServiceInput,
  SignupQuoteInput,
  VerifySignupInput,
} from "./signup.schema";

type ServiceError = { error: string; status: 400 | 403 | 404 | 409 | 502 };

/** Resolve the gym from the host the browser is on, e.g. `rudra-gym.example.com`. */
async function resolveTenant(host: string) {
  const slug = normalizeTenantHost(host);
  if (!slug) return null;
  return signupRepository.findActiveTenantBySlug(slug);
}

export const signupService = {
  /**
   * Everything the public signup form needs to render: who the gym is, which
   * plans and shifts it offers, and what it charges on top of the plan.
   */
  async getOptions(host: string) {
    const tenant = await resolveTenant(host);
    if (!tenant) return { error: "Gym not found.", status: 404 as const };

    const [plans, charges, shifts, credentials] = await Promise.all([
      signupRepository.listSelectablePlans(tenant.id),
      signupRepository.listActiveCharges(tenant.id),
      signupRepository.listActiveShifts(tenant.id),
      gatewayService.resolveCredentials(tenant.id),
    ]);

    return {
      data: {
        tenant,
        plans,
        charges,
        shifts,
        /**
         * False means the form still accepts a signup — it just ends at the
         * front desk rather than at a card screen.
         */
        onlinePaymentsEnabled: Boolean(credentials),
      },
    };
  },

  /**
   * Register a visitor and open their payment.
   *
   * The membership and its PENDING rows are written before the browser sees the
   * checkout widget, so a payment can never exist at Razorpay without a local
   * record for the webhook to find.
   */
  /**
   * What a joining offer is worth, for the form that is about to use it.
   *
   * Quoted as a prospect, which is exactly what the signup itself does, so
   * the figure shown here is the figure charged. Prices come from the
   * database; the request only names the plan and the code.
   */
  async quoteByHost(host: string, input: SignupQuoteInput) {
    const tenant = await resolveTenant(host);
    if (!tenant) return { error: "Gym not found.", status: 404 as const };

    const plan = await signupRepository.findSelectablePlan(
      tenant.id,
      input.subscriptionId,
    );
    if (!plan) return { error: "That plan is not available.", status: 404 as const };

    const quote = await couponService.quote({
      tenantId: tenant.id,
      membershipId: null,
      subscriptionId: plan.id,
      ...(input.chargeIds?.length ? { chargeIds: input.chargeIds } : {}),
      code: input.couponCode,
    });

    if ("error" in quote) return quote;

    return { data: { quote: quote.data } };
  },

  async register(
    host: string,
    input: SelfSignupServiceInput,
    scheduleBackgroundTask?: (promise: Promise<unknown>) => void,
  ): Promise<
    | {
        data: {
          membership: { id: string; memberId: number; status: string };
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
        };
      }
    | ServiceError
  > {
    const tenant = await resolveTenant(host);
    if (!tenant) return { error: "Gym not found.", status: 404 as const };

    const email = input.email?.trim() ? input.email.trim() : "";

    // Same guard the admin form gets: one phone or email belongs to one member.
    const clash = await memberRepository.findMembershipByContact(tenant.id, {
      email: email || null,
      phone: input.phone,
    });
    if (clash) {
      const emailTaken = Boolean(email) && clash.user.email === email;
      return {
        error: emailTaken
          ? "That email address is already registered at this gym. Please log in instead."
          : "That phone number is already registered at this gym. Please log in instead.",
        status: 409 as const,
      };
    }

    const [plan, shift] = await Promise.all([
      signupRepository.findSelectablePlan(tenant.id, input.subscriptionId),
      input.shiftId
        ? signupRepository.findActiveShift(tenant.id, input.shiftId)
        : null,
    ]);

    if (!plan) return { error: "Plan not found.", status: 404 as const };
    if (plan.badges.length) {
      // Not offered by `getOptions`, so reaching this means a hand-made request.
      return {
        error: "This plan is only available to members with a specific badge.",
        status: 400 as const,
      };
    }
    if (input.shiftId && !shift) {
      return { error: "Shift not found.", status: 404 as const };
    }

    const charges = await signupRepository.findChargesForSignup(
      tenant.id,
      input.chargeIds ?? [],
    );

    // A member without an email still needs something to log in with, so the
    // admin flow's synthetic address is reused rather than invented twice.
    const loginEmail =
      email || `${input.phone}@${input.name.replaceAll(" ", "")}.com`;

    // An account may already exist from another gym or an earlier visit; only a
    // membership somewhere makes this person unable to join.
    let user = email ? await memberRepository.findUserByEmail(email) : null;
    if (user) {
      const existingMembership = await memberRepository.findMembershipForUser(
        user.id,
      );
      if (existingMembership) {
        return {
          error:
            existingMembership.tenantId === tenant.id
              ? "You are already a member of this gym. Please log in instead."
              : `This email is already linked to ${existingMembership.tenant.name}. Use a different email address.`,
          status: 409 as const,
        };
      }

      // An account with no membership is a dormant one; the photo just taken is
      // newer than whatever it carried, and this gym requires one on file.
      await memberRepository.updateUser(user.id, {
        avatarUrl: input.avatarUrl,
        gender: input.gender,
      });
    } else {
      user = await memberRepository.createUser({
        name: input.name,
        phone: input.phone,
        email: loginEmail,
        // Matches the admin flow — the phone number is the first password.
        passwordHash: await hashPassword(input.phone),
        platformRole: PlatformRole.USER,
        avatarUrl: input.avatarUrl,
        gender: input.gender,
      });
    }

    const membership = await memberRepository.createMembership(
      tenant.id,
      user.id,
      "MEMBER",
      input.shiftId,
      undefined,
      // Inactive until the money lands. `reactivateIfPaidUp` flips this the
      // moment a settled payment carries the due date to today or beyond.
      "SUSPENDED",
    );

    /**
     * A joining offer, priced against the whole bill.
     *
     * Quoted without a membership id: the row exists by this point, but the
     * person has no history to check and no coins, and quoting as a
     * prospect keeps this identical to what the signup form was shown
     * before they committed. A code that does not apply fails the signup
     * rather than being silently dropped — quietly charging full price is
     * the one outcome nobody wants to discover after paying.
     */
    const quote = input.couponCode
      ? await couponService.quote({
          tenantId: tenant.id,
          membershipId: null,
          subscriptionId: plan.id,
          ...(input.chargeIds?.length ? { chargeIds: input.chargeIds } : {}),
          code: input.couponCode,
        })
      : null;

    if (quote && "error" in quote) {
      return { error: quote.error, status: quote.status };
    }

    const discount = quote?.data.discountAmount ?? 0;

    const listTotal =
      plan.amount + charges.reduce((sum, charge) => sum + charge.amount, 0);
    // What the member is actually asked for. The discount comes off the plan
    // row below, so the two agree.
    const total = Math.max(0, listTotal - discount);

    // One order for the whole bill: the member sees a single amount, and every
    // row it covers settles together.
    const credentials = await gatewayService.resolveCredentials(tenant.id);
    let order: { id: string; currency: string } | null = null;
    if (credentials) {
      try {
        order = await createOrder(credentials, {
          amount: total,
          receipt: `join_${membership.id.slice(-12)}_${Date.now().toString(36)}`,
          notes: {
            tenantId: tenant.id,
            membershipId: membership.id,
            subscriptionId: plan.id,
            purpose: "self signup",
          },
        });
      } catch (caught) {
        // A gateway that will not open an order must not lose the signup: the
        // member exists, owes the same money, and pays at the front desk.
        if (!(caught instanceof RazorpayError)) throw caught;
        order = null;
      }
    }

    const payments = await signupRepository.createPendingPayments({
      tenantId: tenant.id,
      membershipId: membership.id,
      subscription: {
        id: plan.id,
        title: plan.title,
        amount: Math.max(0, plan.amount - discount),
        ...(discount > 0
          ? { listAmount: plan.amount, discountAmount: discount }
          : {}),
      },
      charges,
      gateway:
        order && credentials
          ? { orderId: order.id, account: credentials.source }
          : null,
    });

    // The gym hears about the signup right away, even though the money has
    // not arrived yet — an admin wants to know someone is mid-join, and the
    // payment produces its own notification when it settles.
    const notifyAdmins = pushService.notifyNewMember(tenant.id, {
      membershipId: membership.id,
      memberId: membership.memberId,
      name: input.name,
      pendingPayment: true,
    });

    if (scheduleBackgroundTask) {
      scheduleBackgroundTask(notifyAdmins);
    } else {
      await notifyAdmins;
    }

    // A session for the account just created, so joining ends inside the app
    // rather than at a login form asking for a password nobody chose. The
    // caller proved ownership by creating it a moment ago; abuse is held off by
    // the rate limit and Turnstile in front of this route, not by making the
    // new member log in again.
    const accessToken = await signAccessToken({
      userId: user.id,
      // Self-signup only ever produces a member; a dormant account it reuses is
      // one too, since anything with a membership was rejected above.
      platformRole: PlatformRole.USER,
      tenants: { [tenant.id]: "MEMBER" as TenantRole },
    });
    const refreshToken = generateRefreshToken();
    await authRepository.createRefreshToken(user.id, refreshToken, refreshTokenExpiresAt());

    return {
      data: {
        membership: {
          id: membership.id,
          memberId: membership.memberId,
          status: membership.status,
        },
        auth: { accessToken, refreshToken },
        loginEmail,
        total,
        lineItems: payments.map((payment) => ({
          description: payment.description,
          amount: payment.amount,
        })),
        checkout:
          order && credentials
            ? {
                orderId: order.id,
                // Public by design — the checkout widget needs it in the
                // browser. The secret never leaves the API.
                keyId: credentials.keyId,
                amount: total,
                currency: order.currency,
              }
            : null,
      },
    };
  },

  /**
   * Settle a signup from the signature the checkout widget handed back.
   *
   * There is no session to check here, and none is needed: only a holder of the
   * gym's key secret can sign a given order and payment id, so a browser cannot
   * claim success on its own. The order id is looked up against this gym, so a
   * signature for one gym cannot activate a membership in another.
   */
  async verify(host: string, input: VerifySignupInput) {
    const tenant = await resolveTenant(host);
    if (!tenant) return { error: "Gym not found.", status: 404 as const };

    const credentials = await gatewayService.resolveCredentials(tenant.id);
    if (!credentials) {
      return {
        error: "This gym has not set up online payments yet.",
        status: 409 as const,
      };
    }

    const payments = await paymentRepository.findPaymentsByOrderId(
      input.orderId,
      tenant.id,
    );
    const first = payments[0];
    if (!first) return { error: "Payment not found.", status: 404 as const };

    if (payments.every((row) => row.status === "COMPLETED")) {
      const membership = await signupRepository.findMembershipStatus(
        first.membershipId,
      );
      return { data: { membership, alreadySettled: true } };
    }

    const signatureValid = await verifyCheckoutSignature(credentials.keySecret, {
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    });

    if (!signatureValid) {
      await gatewayService.failOrder(payments, input.paymentId);
      return {
        error: "This payment could not be verified.",
        status: 400 as const,
      };
    }

    await gatewayService.settleOrder(payments, input.paymentId);

    const membership = await signupRepository.findMembershipStatus(
      first.membershipId,
    );
    return { data: { membership, alreadySettled: false } };
  },
};
