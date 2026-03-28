/**
 * Documentation: Push service.
 *
 * - Implements the business rules for browser push subscription lifecycle and notification delivery by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: pushService.
 */
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
    throw new Error("VAPID keys not configured â€“ push notifications are disabled.");
  }
  // VAPID settings are process-wide configuration for the `web-push` client,
  // so they are applied before each send flow begins.
  webPush.setVapidDetails(config.vapidEmail, config.vapidPublicKey, config.vapidPrivateKey);
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
  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    ensureVapid();
    const subs = await pushRepository.findByUserId(userId);
    const body = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webPush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          )
          .catch(async (err: { statusCode?: number }) => {
            // Browsers return 404/410 when an endpoint is gone; removing the
            // stored subscription here prevents repeated future failures.
            if (err.statusCode === 410 || err.statusCode === 404) {
              await pushRepository.remove(sub.endpoint);
            }
            throw err;
          }),
      ),
    );

    // `Promise.allSettled` ensures one dead browser subscription does not
    // block delivery to the remaining endpoints for the same user.
    const sent = results.filter((r) => r.status === "fulfilled").length;
    return { data: { sent, total: subs.length } };
  },
};
