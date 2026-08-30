/**
 * Documentation: Push notification handling for the service worker.
 *
 * - Imported into the Workbox-generated service worker (see `workbox.importScripts` in `vite.config.ts`), because a generated worker has no push handling of its own — without this, subscriptions exist and the API sends, but nothing is ever shown.
 * - Handles two events: `push` displays the notification the API sent, and `notificationclick` opens the record it is about, reusing a tab that is already open rather than piling up new ones.
 * - Every payload carries the `url` of the thing it is about — a member, a receipt, a plan list — and that url is also what groups notifications, so two admissions stay two notifications instead of collapsing into one that can only reach the later member.
 * - Plain JS on purpose: this file is copied verbatim from `public/` and is never compiled.
 */

/* global self, clients */

const DEFAULT_URL = "/dashboard";

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A body that is not the JSON this app sends is still worth showing rather
    // than dropping in silence.
    payload = { title: "FitConnect", body: event.data.text() };
  }

  const title = payload.title || "FitConnect";
  const url = payload.url || DEFAULT_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      // Grouped by destination, not by title. Two members joining produce the
      // same title, and tagging by title collapsed them into one notification
      // that could only open the second member — the first became unreachable.
      // Keying on the url keeps distinct records distinct and still replaces a
      // repeat about the same one.
      tag: payload.tag || url,
      renotify: true,
      // The same two-pulse pattern the app uses in the hand when a payment is
      // taken, so an admin whose phone buzzes in a pocket knows what happened
      // before reading anything. Android only; iOS ignores it, and a browser
      // that does not support it drops the key.
      vibrate: [35, 60, 35],
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || DEFAULT_URL, self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const sameOrigin = windows.filter(
        (client) => new URL(client.url).origin === target.origin,
      );

      // Already looking at it: focus, and leave the page alone. Navigating a tab
      // to the address it is on reloads it and throws away unsaved input.
      const onTarget = sameOrigin.find(
        (client) => new URL(client.url).pathname === target.pathname,
      );
      if (onTarget) {
        await onTarget.focus();
        return;
      }

      // Reuse a tab already on this origin — an admin tapping three
      // notifications should not end up with three copies of the app.
      for (const client of sameOrigin) {
        try {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(target.href);
            return;
          }
        } catch {
          // `navigate` rejects for a client this worker does not control, which
          // `includeUncontrolled` deliberately lets through. Opening a window is
          // worse than reusing the tab but far better than going nowhere.
        }
      }

      await clients.openWindow(target.href);
    })(),
  );
});
