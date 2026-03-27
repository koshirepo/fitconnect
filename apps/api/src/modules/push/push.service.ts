import webPush from "web-push";
import { config } from "../../config";
import { pushRepository } from "./push.repository";
import type { PushSubscribeInput } from "./push.schema";

function isConfigured(): boolean {
  return !!(config.vapidPublicKey && config.vapidPrivateKey);
}

function ensureVapid() {
  if (!isConfigured()) {
    throw new Error("VAPID keys not configured – push notifications are disabled.");
  }
  webPush.setVapidDetails(config.vapidEmail, config.vapidPublicKey, config.vapidPrivateKey);
}

export const pushService = {
  async subscribe(userId: string, input: PushSubscribeInput) {
    const sub = await pushRepository.upsert(
      userId,
      input.endpoint,
      input.keys.p256dh,
      input.keys.auth,
    );
    return { data: { subscription: sub } };
  },

  async unsubscribe(endpoint: string) {
    await pushRepository.remove(endpoint);
    return { data: null };
  },

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
          .catch(async (err) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await pushRepository.remove(sub.endpoint);
            }
            throw err;
          }),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return { data: { sent, total: subs.length } };
  },
};
