/**
 * Documentation: Payment gateway credential resolution and online checkout.
 *
 * - Answers the one question every online payment starts with: whose Razorpay account does this gym's money land in? A gym that has saved its own key id and secret collects into its own account; a gym that has not falls back to the platform account in the Worker environment.
 * - The fallback is deliberate and silent at the point of payment but visible in the settings screen, so an admin can tell at a glance whether they are collecting into their own account or the platform's.
 * - Secrets are sealed at rest (`lib/secret-box`) and only unsealed inside the request that calls Razorpay. Nothing here ever returns a secret to a caller.
 * - Primary exports: gatewayService.
 */
import { prisma } from "../../lib/prisma";
import { credentialsKeyConfigured, open, seal } from "../../lib/secret-box";
import {
  createOrder,
  fetchPayment,
  upsertWebhook,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  RazorpayError,
  type RazorpayCredentials,
} from "../../lib/razorpay";
import { paymentRepository } from "./payments.repository";
import { couponService } from "../coupons/coupons.service";
import { pushService } from "../push/push.service";
import { referralRewardService } from "../members/referral-rewards.service";
import type {
  UpdateGatewayInput,
  CheckoutInput,
  VerifyCheckoutInput,
} from "./payments.schema";

export type CredentialSource = "TENANT" | "PLATFORM";

type ResolvedCredentials = RazorpayCredentials & {
  source: CredentialSource;
  webhookSecret: string | null;
};

/** The platform-wide account, used by every gym that has not set up its own. */
function platformCredentials(): RazorpayCredentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/**
 * A gym's own credentials count only when the key id and a secret that actually
 * unseals are both present. A half-configured row falls back rather than
 * failing the payment, because a payment that cannot be taken is worse than one
 * taken into the platform account and settled later.
 */
async function tenantCredentials(tenantId: string) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      razorpayKeyId: true,
      razorpayKeySecret: true,
      razorpayWebhookSecret: true,
    },
  });

  if (!settings?.razorpayKeyId || !settings.razorpayKeySecret) return null;

  const keySecret = await open(settings.razorpayKeySecret);
  if (!keySecret) return null;

  return {
    keyId: settings.razorpayKeyId,
    keySecret,
    webhookSecret: await open(settings.razorpayWebhookSecret),
  };
}


/**
 * Write down what a delivery was and what became of it.
 *
 * Every exit from `handleWebhook` goes through here, including the refusals.
 * Without it a rejected or ignored delivery left no trace at all, so "why is
 * this payment still pending" could only be answered from Razorpay's own
 * dashboard — and a retry loop was invisible until somebody noticed the
 * duplicate charges that never came.
 *
 * Never throws: a log that can break the thing it is logging is worse than no
 * log. A failed write is dropped and the delivery is answered as normal.
 */
async function recordDelivery(input: {
  tenantId: string;
  event?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  outcome: string;
  detail?: string;
  status?: number;
}) {
  try {
    await prisma.webhookDelivery.create({
      data: {
        tenantId: input.tenantId,
        event: input.event ?? null,
        gatewayOrderId: input.gatewayOrderId ?? null,
        gatewayPaymentId: input.gatewayPaymentId ?? null,
        outcome: input.outcome,
        detail: input.detail ?? null,
        status: input.status ?? 200,
      },
    });
  } catch (error) {
    console.warn("Could not record a webhook delivery.", {
      tenantId: input.tenantId,
      outcome: input.outcome,
      reason: (error as Error)?.message,
    });
  }
}

export const gatewayService = {
  /**
   * The credentials this gym collects with, and which account they belong to.
   * Returns null when neither the gym nor the platform has a gateway set up.
   */
  async resolveCredentials(
    tenantId: string,
  ): Promise<ResolvedCredentials | null> {
    const own = await tenantCredentials(tenantId);
    if (own) return { ...own, source: "TENANT" };

    const platform = platformCredentials();
    if (!platform) return null;

    return {
      ...platform,
      source: "PLATFORM",
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? null,
    };
  },

  /**
   * The platform's own credentials, with no gym involved.
   *
   * The platform storefront sells the platform's goods, so there is no tenant
   * whose account the money could belong to. Null when the deployment has no
   * gateway configured, which the callers treat as "take the order, collect
   * later" rather than as a failure.
   */
  resolvePlatformCredentials(): ResolvedCredentials | null {
    const platform = platformCredentials();
    if (!platform) return null;

    return {
      ...platform,
      source: "PLATFORM",
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? null,
    };
  },

  // ─── Configuration ──────────────────────────────────────────────────────────

  /**
   * What the settings screen shows: which account is in use, the public key id,
   * and whether a secret is on file — never the secret itself.
   */
  async getConfig(tenantId: string) {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        razorpayKeyId: true,
        razorpayKeySecret: true,
        razorpayWebhookSecret: true,
      },
    });

    const resolved = await gatewayService.resolveCredentials(tenantId);
    const platform = platformCredentials();

    return {
      data: {
        gateway: {
          provider: "RAZORPAY" as const,
          /** Whether online payments can be taken at all right now. */
          enabled: Boolean(resolved),
          /** TENANT when this gym collects into its own account. */
          source: resolved?.source ?? null,
          /** This gym's own key id, if saved. Public — safe to show. */
          keyId: settings?.razorpayKeyId ?? null,
          hasKeySecret: Boolean(settings?.razorpayKeySecret),
          hasWebhookSecret: Boolean(settings?.razorpayWebhookSecret),
          /** The key id money falls back to. Public, and useful for support. */
          platformKeyId: platform?.keyId ?? null,
          platformConfigured: Boolean(platform),
          /** Without this the API cannot store gym-owned secrets at all. */
          canStoreOwnKeys: credentialsKeyConfigured(),
          /** Test keys are safe to try; live keys move real money. */
          mode: (resolved?.keyId ?? "").startsWith("rzp_live_")
            ? ("LIVE" as const)
            : resolved
              ? ("TEST" as const)
              : null,
        },
      },
    };
  },

  /**
   * Save or clear this gym's own credentials.
   *
   * Passing an empty key id clears the whole configuration and returns the gym
   * to the platform account. Omitting a secret leaves the stored one alone, so
   * an admin can correct a key id without re-entering the secret.
   */
  async updateConfig(tenantId: string, input: UpdateGatewayInput) {
    const clearing = input.keyId !== undefined && input.keyId === "";

    if (!clearing && !credentialsKeyConfigured()) {
      return {
        error:
          "This deployment cannot store gym-owned gateway secrets yet: CREDENTIALS_KEY is not set on the API. Set it and try again.",
        status: 503 as const,
      };
    }

    if (clearing) {
      await prisma.tenantSettings.upsert({
        where: { tenantId },
        update: {
          razorpayKeyId: null,
          razorpayKeySecret: null,
          razorpayWebhookSecret: null,
        },
        create: { tenantId, razorpayKeyId: null },
      });

      return gatewayService.getConfig(tenantId);
    }

    const existing = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { razorpayKeyId: true, razorpayKeySecret: true },
    });

    const keyId = input.keyId ?? existing?.razorpayKeyId ?? null;
    if (!keyId) {
      return { error: "A Razorpay key id is required.", status: 400 as const };
    }

    // A new key id with no secret and none on file would save a configuration
    // that can never take a payment.
    if (input.keySecret === undefined && !existing?.razorpayKeySecret) {
      return {
        error: "A Razorpay key secret is required.",
        status: 400 as const,
      };
    }

    const data: Record<string, unknown> = { razorpayKeyId: keyId };
    if (input.keySecret !== undefined) {
      data.razorpayKeySecret = await seal(input.keySecret);
    }
    if (input.webhookSecret !== undefined) {
      data.razorpayWebhookSecret = input.webhookSecret
        ? await seal(input.webhookSecret)
        : null;
    }

    await prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });

    // Saving credentials is the moment to register the webhook, because it
    // is the only moment anybody is thinking about this gym's gateway. Left
    // to be done by hand it does not get done, and a gym without one loses
    // every payment whose browser closed mid-checkout.
    const registration = await gatewayService.registerWebhook(tenantId);

    const config = await gatewayService.getConfig(tenantId);
    if ("error" in config) return config;

    return { data: { ...config.data, webhook: registration } };
  },

  /**
   * Point this gym's Razorpay account at this app.
   *
   * Idempotent through the saved `razorpayWebhookId`: with one the existing
   * webhook is updated, without one a new webhook is created and its id
   * kept. Registering twice without that memory would leave two webhooks
   * delivering every event.
   *
   * A signing secret is generated here when the gym has not supplied one —
   * it is a shared secret between two machines, and asking a person to
   * invent one only adds a step they can get wrong.
   *
   * Never throws. A gateway that refuses to register a webhook must not
   * stop the credentials being saved; the gym can still take payments, and
   * the settings screen says what happened.
   */
  async registerWebhook(tenantId: string) {
    const appUrl = process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? "";
    if (!appUrl) {
      return {
        ok: false,
        detail: "This deployment does not know its own public address.",
      };
    }

    const credentials = await gatewayService.resolveCredentials(tenantId);
    if (!credentials) {
      return { ok: false, detail: "This gym has no gateway credentials yet." };
    }

    // Only a gym collecting into its own account gets its own webhook. One
    // on the platform account already covers every gym that falls back to
    // it, and registering per gym there would duplicate every delivery.
    if (credentials.source !== "TENANT") {
      return {
        ok: true,
        detail: "Using the platform account, which already has a webhook.",
      };
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { razorpayWebhookId: true, razorpayWebhookSecret: true },
    });

    // A secret already in use has to be reused: changing it would silently
    // invalidate every delivery until the new one was saved everywhere.
    const secret = credentials.webhookSecret ?? crypto.randomUUID().replaceAll("-", "");

    try {
      const webhook = await upsertWebhook(credentials, {
        url: new URL(`/webhooks/razorpay/${tenantId}`, appUrl).toString(),
        secret,
        webhookId: settings?.razorpayWebhookId ?? null,
      });

      await prisma.tenantSettings.update({
        where: { tenantId },
        data: {
          razorpayWebhookId: webhook.id,
          // Stored only when this generated it; a gym-supplied secret is
          // already on file and sealed.
          ...(settings?.razorpayWebhookSecret
            ? {}
            : { razorpayWebhookSecret: await seal(secret) }),
        },
      });

      return { ok: true, detail: "Razorpay will now tell us about payments." };
    } catch (error) {
      const message =
        error instanceof RazorpayError
          ? error.message
          : "Razorpay could not be reached.";

      return {
        ok: false,
        detail: `Payments will work, but confirmations may be delayed: ${message}`,
      };
    }
  },

  /**
   * Confirm the saved credentials actually work, by asking Razorpay to create a
   * ₹1 order and then forgetting about it. An order that is never paid costs
   * nothing and expires on its own.
   */
  async testConnection(tenantId: string) {
    const credentials = await gatewayService.resolveCredentials(tenantId);
    if (!credentials) {
      return {
        error: "No payment gateway is configured.",
        status: 409 as const,
      };
    }

    try {
      await createOrder(credentials, {
        // One rupee. `createOrder` converts to paise.
        amount: 1,
        receipt: `test_${Date.now()}`,
        notes: { purpose: "credential check" },
      });
    } catch (error) {
      if (error instanceof RazorpayError) {
        return {
          error: `Razorpay rejected these credentials: ${error.message}`,
          status: 400 as const,
        };
      }
      throw error;
    }

    return {
      data: { ok: true, source: credentials.source, keyId: credentials.keyId },
    };
  },

  // ─── Checkout ───────────────────────────────────────────────────────────────

  /**
   * Open an online payment: create the Razorpay order, and record a PENDING
   * payment row against it.
   *
   * The row is written before the member sees the checkout widget so that a
   * payment can never exist at Razorpay without a local record — the webhook
   * has something to find even if the browser is closed mid-payment.
   */
  async createCheckout(tenantId: string, userId: string, input: CheckoutInput) {
    const credentials = await gatewayService.resolveCredentials(tenantId);
    if (!credentials) {
      return {
        error: "This gym has not set up online payments yet.",
        status: 409 as const,
      };
    }

    const [membership, subscription] = await Promise.all([
      paymentRepository.findCheckoutMembership(tenantId, userId),
      paymentRepository.findCheckoutSubscription(
        input.subscriptionId,
        tenantId,
      ),
    ]);

    if (!membership) {
      return {
        error: "You are not a member of this gym.",
        status: 403 as const,
      };
    }

    if (!subscription || !subscription.isActive) {
      return {
        error: "Subscription not found in this tenant.",
        status: 404 as const,
      };
    }

    if (
      subscription.badges.length &&
      !subscription.badges.some((badge) =>
        membership.badges.some((memberBadge) => memberBadge.id === badge.id),
      )
    ) {
      return {
        error: "You are not eligible for this plan.",
        status: 400 as const,
      };
    }

    // Arrears go into the same order as the plan. A member with an unpaid due
    // should settle it while they are already paying, and one order means one
    // settlement path rather than two that can half-succeed.
    const outstanding = await paymentRepository.findSettleablePending(
      tenantId,
      membership.id,
    );
    const outstandingAmount = outstanding.reduce((sum, row) => sum + row.amount, 0);

    /**
     * A coupon and any coins, priced here rather than by the caller.
     *
     * This path had neither, which made the renewal screen the one place a
     * member could not spend what the app had given them — while the
     * referral notification told them to spend it on exactly this. The
     * quote covers the plan alone: arrears are money already owed at a
     * price already agreed, and discounting them here would rewrite it.
     */
    const quote =
      input.couponCode || (input.coinsToSpend ?? 0) > 0
        ? await couponService.quote({
            tenantId,
            membershipId: membership.id,
            subscriptionId: subscription.id,
            ...(input.couponCode ? { code: input.couponCode } : {}),
            ...(input.coinsToSpend ? { coinsToSpend: input.coinsToSpend } : {}),
          })
        : null;

    if (quote && "error" in quote) {
      return { error: quote.error, status: quote.status };
    }

    // What the plan costs once the coupon and the coins have come off.
    const planAmount = quote ? quote.data.netAmount : subscription.amount;

    // The amount comes from the plan and the member's own unpaid rows, never
    // from the request body: a client that could name its own price could buy
    // a year for a rupee.
    const amount = planAmount + outstandingAmount;

    // Coins and a coupon can clear a plan outright. With no arrears there is
    // nothing left to charge, so the sale completes here rather than opening
    // a payment window for zero rupees, which Razorpay would refuse anyway.
    if (amount <= 0) {
      const validFrom = new Date();
      const validUntil = new Date(validFrom);
      validUntil.setDate(validUntil.getDate() + subscription.durationDays);

      const settled = await paymentRepository.createPayment({
        tenantId,
        membershipId: membership.id,
        subscriptionId: subscription.id,
        description: subscription.title,
        status: "COMPLETED",
        amount: 0,
        ...(quote
          ? {
              listAmount: quote.data.listAmount,
              discountAmount: quote.data.discountAmount,
              coinsRedeemed: quote.data.coinsRedeemed,
            }
          : {}),
        paidAt: validFrom,
        validFrom,
        validUntil,
      });

      if (quote) {
        await couponService.redeem({
          tenantId,
          membershipId: membership.id,
          quote: quote.data,
          paymentId: settled.id,
        });
      }

      await paymentRepository.refreshDueDate(membership.id);
      await paymentRepository.reactivateIfPaidUp(membership.id);

      return { data: { checkout: null, paymentId: settled.id, settled: true } };
    }

    let order;
    try {
      order = await createOrder(credentials, {
        amount,
        receipt: `sub_${subscription.id.slice(-12)}_${Date.now().toString(36)}`,
        notes: {
          tenantId,
          membershipId: membership.id,
          subscriptionId: subscription.id,
        },
      });
    } catch (error) {
      if (error instanceof RazorpayError) {
        return {
          error: `Could not start the payment: ${error.message}`,
          status: 502 as const,
        };
      }
      throw error;
    }

    // No validity window yet. It is written when the money actually arrives, so
    // an abandoned checkout leaves nothing for `refreshDueDate` to pick up.
    const payment = await paymentRepository.createPayment({
      tenantId,
      membershipId: membership.id,
      subscriptionId: subscription.id,
      description: subscription.title,
      status: "PENDING",
      // What the plan costs after any coupon and coins. The arrears keep
      // their own rows on the same order, so this one still says what the
      // plan cost — and what came off it sits beside it.
      amount: planAmount,
      ...(quote
        ? {
            listAmount: quote.data.listAmount,
            discountAmount: quote.data.discountAmount,
            coinsRedeemed: quote.data.coinsRedeemed,
          }
        : {}),
      gateway: "RAZORPAY",
      gatewayOrderId: order.id,
      gatewayAccount: credentials.source,
    });

    // Recorded against the payment it affected. The coins leave the balance
    // now rather than at settlement: an abandoned checkout releases them
    // through the same reversal an abandoned counter payment uses.
    if (quote) {
      const redeemed = await couponService.redeem({
        tenantId,
        membershipId: membership.id,
        quote: quote.data,
        paymentId: payment.id,
      });

      if (!redeemed.ok) {
        console.warn("Coupon redemption failed while opening a checkout.", {
          paymentId: payment.id,
          reason: redeemed.reason,
        });
      }
    }

    // Settlement walks every row of an order, so attaching the dues is all it
    // takes for them to complete with the plan.
    await paymentRepository.attachToGatewayOrder(
      outstanding.map((row) => row.id),
      order.id,
      credentials.source,
    );

    return {
      data: {
        checkout: {
          paymentId: payment.id,
          orderId: order.id,
          // The key id is public by design — the checkout widget needs it in
          // the browser. The secret never leaves the API.
          keyId: credentials.keyId,
          amount,
          currency: order.currency,
          planTitle: subscription.title,
          /** The split behind `amount`, for the screen that shows it. */
          planAmount: subscription.amount,
          outstandingAmount,
          outstanding: outstanding.map((row) => ({
            id: row.id,
            amount: row.amount,
            description: row.description,
          })),
        },
      },
    };
  },

  /**
   * Settle a payment from the signature the browser hands back.
   *
   * The signature is the proof: only a holder of the key secret can produce it
   * for a given order and payment id, so a browser cannot claim success on its
   * own. A payment already settled by the webhook is accepted as-is rather than
   * treated as an error, because both paths racing is the normal case.
   */
  async verifyCheckout(
    tenantId: string,
    userId: string,
    input: VerifyCheckoutInput,
  ) {
    const credentials = await gatewayService.resolveCredentials(tenantId);
    if (!credentials) {
      return {
        error: "This gym has not set up online payments yet.",
        status: 409 as const,
      };
    }

    const payments = await paymentRepository.findPaymentsByOrderId(
      input.orderId,
      tenantId,
    );
    const payment = payments[0];
    if (!payment) {
      return { error: "Payment not found.", status: 404 as const };
    }

    // Scope the settle to the member who opened the order, so one member cannot
    // settle (or fail) another's payment by guessing an order id.
    const membership = await paymentRepository.findMembershipByUser(
      tenantId,
      userId,
    );
    if (!membership || payment.membershipId !== membership.id) {
      return { error: "Payment not found.", status: 404 as const };
    }

    if (payments.every((row) => row.status === "COMPLETED")) {
      return { data: { payment, alreadySettled: true } };
    }

    const signatureValid = await verifyCheckoutSignature(
      credentials.keySecret,
      {
        orderId: input.orderId,
        paymentId: input.paymentId,
        signature: input.signature,
      },
    );

    if (!signatureValid) {
      await gatewayService.failOrder(payments, input.paymentId);
      return {
        error: "This payment could not be verified.",
        status: 400 as const,
      };
    }

    const settled = await gatewayService.settleOrder(payments, input.paymentId);
    return { data: { payment: settled[0] ?? payment, alreadySettled: false } };
  },

  /**
   * Mark every payment a gateway order covers complete, and bring the
   * membership with it.
   *
   * An order is usually one row, but a self-signup pays for a plan and its
   * mandatory charges together, so the whole order settles or none of it does.
   * The due date and the reactivation are computed once at the end rather than
   * per row: intermediate states here are not worth writing.
   *
   * Shared by the browser-verified path and the webhook so the two can race
   * without disagreeing about the outcome.
   */
  async settleOrder(
    payments: {
      id: string;
      status: string;
      amount: number;
      membershipId: string;
      tenantId?: string;
      member?: { memberId: number; user: { name: string } } | null;
    }[],
    gatewayPaymentId: string,
  ) {
    const settled = [];
    for (const row of payments) {
      // A row the webhook already settled is left exactly as it was, so the
      // paid date does not move when the browser arrives second.
      if (row.status === "COMPLETED") continue;
      settled.push(
        await paymentRepository.settleGatewayPayment(row.id, gatewayPaymentId),
      );
    }

    const membershipId = payments[0]?.membershipId;
    if (membershipId) {
      if (settled.some((row) => row.validUntil)) {
        await paymentRepository.refreshDueDate(membershipId);
      }
      await paymentRepository.reactivateIfPaidUp(membershipId);
    }

    // One notification for the order rather than one per line item: the member
    // paid a single amount and that is what an admin wants to read.
    const tenantId = payments[0]?.tenantId;
    if (tenantId && settled.length > 0) {
      const first = payments[0];
      await pushService.notifyPaymentReceived(tenantId, {
        amount: settled.reduce((sum, row) => sum + row.amount, 0),
        memberId: first?.member?.memberId,
        memberName: first?.member?.user.name,
        description: settled.length === 1 ? settled[0].description : null,
        // Only when the order settled one row: a tap on a multi-row order has
        // no single receipt to open, and the ledger is the honest destination.
        paymentId: settled.length === 1 ? settled[0].id : undefined,
        source: "ONLINE",
      });
    }

    return settled;
  },

  /** Mark every unsettled row of an order failed. */
  async failOrder(
    payments: { id: string; status: string }[],
    gatewayPaymentId: string,
  ) {
    for (const row of payments) {
      if (row.status === "COMPLETED") continue;
      await paymentRepository.markGatewayFailure(row.id, gatewayPaymentId);
    }
  },

  // ─── Webhooks ───────────────────────────────────────────────────────────────

  /**
   * Handle a Razorpay webhook for one gym.
   *
   * This is the path that saves a payment when the member's browser dies
   * between paying and returning. It trusts nothing but the signature, and it
   * looks the order up locally rather than believing the amounts in the body.
   */
  async handleWebhook(
    tenantId: string,
    rawBody: string,
    signature: string | null,
  ) {
    if (!signature) {
      await recordDelivery({
        tenantId,
        outcome: "BAD_SIGNATURE",
        detail: "The delivery carried no signature header.",
        status: 400,
      });
      return { error: "Missing webhook signature.", status: 400 as const };
    }

    const credentials = await gatewayService.resolveCredentials(tenantId);
    if (!credentials?.webhookSecret) {
      await recordDelivery({
        tenantId,
        outcome: "NO_SECRET",
        detail: "This gym has no webhook secret, so nothing can be verified.",
        status: 409,
      });
      return {
        error: "No webhook secret is configured for this gym.",
        status: 409 as const,
      };
    }

    const valid = await verifyWebhookSignature(
      credentials.webhookSecret,
      rawBody,
      signature,
    );
    if (!valid) {
      await recordDelivery({
        tenantId,
        outcome: "BAD_SIGNATURE",
        detail: "The signature did not match this gym's webhook secret.",
        status: 400,
      });
      return { error: "Invalid webhook signature.", status: 400 as const };
    }

    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment?: {
          entity?: { id?: string; order_id?: string; status?: string };
        };
      };
    };

    const entity = event.payload?.payment?.entity;
    if (!entity?.order_id || !entity.id) {
      // Events we do not act on (refunds, settlements, subscription lifecycle)
      // are acknowledged so Razorpay stops retrying them.
      await recordDelivery({
        tenantId,
        event: event.event,
        outcome: "IGNORED",
        detail: "Nothing in this event names a payment we track.",
      });
      return { data: { handled: false, event: event.event ?? null } };
    }

    const payments = await paymentRepository.findPaymentsByOrderId(
      entity.order_id,
      tenantId,
    );
    if (payments.length === 0) {
      // A guest store order has no payment row — a guest has no membership
      // for one to hang off — so its gateway trail lives on the order
      // itself. This is the branch that stops a paid guest basket sitting
      // pending forever when the browser dies before returning.
      const guestOrder = await prisma.storeOrder.findFirst({
        where: { tenantId, gatewayOrderId: entity.order_id, membershipId: null },
        select: { id: true, status: true },
      });

      if (guestOrder) {
        const settling =
          event.event === "payment.captured" || event.event === "order.paid";

        if (settling) {
          const { storeGuestService } = await import("../store/store-sale.service");
          await storeGuestService.settleByGatewayOrder(
            tenantId,
            entity.order_id,
            entity.id,
          );
        } else if (event.event === "payment.failed") {
          // Cancelled rather than left pending, and the held stock goes
          // back: nobody paid, so nobody is waiting to collect it.
          const { storeGuestService } = await import("../store/store-sale.service");
          await storeGuestService.cancelOnlineGuestOrder(tenantId, guestOrder.id);
        }

        await recordDelivery({
          tenantId,
          event: event.event,
          gatewayOrderId: entity.order_id,
          gatewayPaymentId: entity.id,
          outcome: settling ? "SETTLED" : "FAILED_ORDER",
          detail: `Guest store order ${guestOrder.id.slice(-6).toUpperCase()}.`,
        });

        return { data: { handled: true, event: event.event ?? null } };
      }

      await recordDelivery({
        tenantId,
        event: event.event,
        gatewayOrderId: entity.order_id,
        gatewayPaymentId: entity.id,
        outcome: "UNKNOWN_ORDER",
        detail: "Nothing of this gym is attached to that Razorpay order.",
      });
      return { data: { handled: false, event: event.event ?? null } };
    }

    const unsettled = payments.some((row) => row.status !== "COMPLETED");

    if (event.event === "payment.failed") {
      await gatewayService.failOrder(payments, entity.id);
      await recordDelivery({
        tenantId,
        event: event.event,
        gatewayOrderId: entity.order_id,
        gatewayPaymentId: entity.id,
        outcome: "FAILED_ORDER",
        detail: "Marked the order's rows failed.",
      });
      return { data: { handled: true, event: event.event } };
    }

    if (event.event === "payment.captured" || event.event === "order.paid") {
      if (unsettled) {
        // Confirm against Razorpay rather than the body alone: the signature
        // proves the message came from Razorpay, not that it says what we think.
        let remote;
        try {
          remote = await fetchPayment(credentials, entity.id);
        } catch (error) {
          // A 4xx means Razorpay does not recognise this payment, and retrying
          // will never change that — acknowledge and stop the retry loop.
          // Anything else (5xx, network) is transient, so let the delivery fail
          // and be retried.
          if (error instanceof RazorpayError && error.status < 500) {
            await recordDelivery({
              tenantId,
              event: event.event,
              gatewayOrderId: entity.order_id,
              gatewayPaymentId: entity.id,
              outcome: "ERROR",
              detail: `Razorpay does not recognise that payment: ${error.message}`,
            });
            return { data: { handled: false, event: event.event } };
          }
          throw error;
        }

        if (remote.status === "captured" || remote.status === "authorized") {
          await gatewayService.settleOrder(payments, entity.id);
        }

        await recordDelivery({
          tenantId,
          event: event.event,
          gatewayOrderId: entity.order_id,
          gatewayPaymentId: entity.id,
          outcome: remote.status === "captured" || remote.status === "authorized"
            ? "SETTLED"
            : "IGNORED",
          detail: `Razorpay reports this payment as ${remote.status}.`,
        });
      } else {
        await recordDelivery({
          tenantId,
          event: event.event,
          gatewayOrderId: entity.order_id,
          gatewayPaymentId: entity.id,
          outcome: "IGNORED",
          detail: "Already settled before this delivery arrived.",
        });
      }
      return { data: { handled: true, event: event.event } };
    }

    await recordDelivery({
      tenantId,
      event: event.event,
      gatewayOrderId: entity.order_id,
      gatewayPaymentId: entity.id,
      outcome: "IGNORED",
      detail: "This app does not act on that event.",
    });
    return { data: { handled: false, event: event.event ?? null } };
  },
};
