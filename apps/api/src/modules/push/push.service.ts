/**
 * Documentation: Push service.
 *
 * - Implements the business rules for browser push subscription lifecycle and notification delivery by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Also owns the wording of the notifications the app sends on its own: a gym's admins hear about every admission and every payment, from `notifyNewMember` and `notifyPaymentReceived`, so the message a payment produces is the same whether it came from the front desk, a member's own checkout, or a self-signup.
 * - Those two are deliberately unable to throw. A gym with no VAPID keys, an admin with a dead browser subscription, or a push provider having a bad day must never be the reason an admission or a payment fails.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: pushService.
 */
import { formatCurrency } from "@fitconnect/shared/utils";
import webPush from "web-push";
import { config } from "../../config";
import { pushRepository } from "./push.repository";
import type { PushSubscribeInput } from "./push.schema";

/**
 * Execute the `is configured` workflow for the push module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function isConfigured(): boolean {
  return !!(config.vapidPublicKey && config.vapidPrivateKey);
}

/**
 * Execute the `ensure vapid` workflow for the push module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function ensureVapid() {
  if (!isConfigured()) {
    throw new Error("VAPID keys not configured - push notifications are disabled.");
  }
  // VAPID settings are process-wide configuration for the `web-push` client,
  // so they are applied before each send flow begins.
  webPush.setVapidDetails(config.vapidEmail, config.vapidPublicKey, config.vapidPrivateKey);
}

type PushPayload = { title: string; body: string; url?: string };

type StoredSubscription = { endpoint: string; p256dh: string; auth: string };

/**
 * Push one payload to a set of endpoints.
 *
 * Failures are per-endpoint: one dead browser must not stop delivery to the
 * others, and an endpoint the browser has forgotten (404/410) is deleted rather
 * than retried forever.
 */
async function deliver(subs: StoredSubscription[], payload: PushPayload) {
  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webPush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        )
        .catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pushRepository.remove(sub.endpoint);
          }
          throw err;
        }),
    ),
  );

  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    total: subs.length,
  };
}

export const pushService = {
  /**
   * Execute the `subscribe` workflow for the push module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async subscribe(userId: string, input: PushSubscribeInput) {
    const sub = await pushRepository.upsert(
      userId,
      input.endpoint,
      input.keys.p256dh,
      input.keys.auth,
    );
    return { data: { subscription: sub } };
  },

  /**
   * Execute the `unsubscribe` workflow for the push module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async unsubscribe(endpoint: string) {
    await pushRepository.remove(endpoint);
    return { data: null };
  },

  /**
   * Execute the `send to user` workflow for the push module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async sendToUser(userId: string, payload: PushPayload) {
    ensureVapid();
    const subs = await pushRepository.findByUserId(userId);
    return { data: await deliver(subs, payload) };
  },

  /**
   * Tell this gym's admins something happened.
   *
   * Swallows every failure by design: this is called from the middle of member
   * and payment flows, where a notification that cannot be delivered is a
   * footnote and a thrown error would be a broken admission.
   */
  async sendToTenantAdmins(
    tenantId: string,
    payload: PushPayload,
    options: { excludeUserId?: string } = {},
  ) {
    try {
      if (!isConfigured()) return { sent: 0, total: 0 };
      ensureVapid();

      const subs = await pushRepository.findTenantAdminSubscriptions(
        tenantId,
        options.excludeUserId,
      );
      if (subs.length === 0) return { sent: 0, total: 0 };

      return await deliver(subs, payload);
    } catch (error) {
      console.error("Admin push notification failed.", { tenantId, error });
      return { sent: 0, total: 0 };
    }
  },

  /** A new member joined — from the front desk or from the public signup page. */
  notifyNewMember(
    tenantId: string,
    member: {
      membershipId: string;
      memberId: number;
      name: string;
      /** Set when the membership is still waiting on its first payment. */
      pendingPayment?: boolean;
      /** The admin or coach who added them, so they are not told twice. */
      actorUserId?: string;
    },
  ) {
    return pushService.sendToTenantAdmins(
      tenantId,
      {
        title: member.pendingPayment ? "New signup — payment pending" : "New member added",
        body: member.pendingPayment
          ? `#${member.memberId} ${member.name} signed up and is inactive until their payment is confirmed.`
          : `#${member.memberId} ${member.name} has joined the gym.`,
        url: `/dashboard/members/${member.membershipId}`,
      },
      { excludeUserId: member.actorUserId },
    );
  },

  /** Money arrived, by whatever route. */
  notifyPaymentReceived(
    tenantId: string,
    payment: {
      amount: number;
      memberId?: number;
      memberName?: string;
      description?: string | null;
      /** The row this notification is about, so a tap opens the receipt. */
      paymentId?: string;
      /** How it was taken, for the one-line summary. */
      source: "DESK" | "ONLINE";
      /** The staff member who recorded it, when a person did. */
      actorUserId?: string;
    },
  ) {
    const who =
      payment.memberId !== undefined && payment.memberName
        ? `#${payment.memberId} ${payment.memberName}`
        : "A member";
    const what = payment.description ? ` for ${payment.description}` : "";

    return pushService.sendToTenantAdmins(
      tenantId,
      {
        title: `Payment received: ${formatCurrency(payment.amount)}`,
        body:
          payment.source === "ONLINE"
            ? `${who} paid ${formatCurrency(payment.amount)} online${what}.`
            : `${formatCurrency(payment.amount)} collected from ${who}${what}.`,
        // The receipt itself when the row is known; the ledger otherwise, which
        // is a settlement covering several rows at once.
        url: payment.paymentId
          ? `/dashboard/payments/${payment.paymentId}`
          : "/dashboard/payments",
      },
      { excludeUserId: payment.actorUserId },
    );
  },
};
