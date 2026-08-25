/**
 * Documentation: Push notification handling for the service worker.
 *
 * - Imported into the Workbox-generated service worker (see `workbox.importScripts` in `vite.config.ts`), because a generated worker has no push handling of its own — without this, subscriptions exist and the API sends, but nothing is ever shown.
 * - Handles two events: `push` displays the notification the API sent, and `notificationclick` focuses an already-open tab rather than piling up new ones.
 * - Plain JS on purpose: this file is copied verbatim from `public/` and is never compiled.
 */

/* global self, clients */

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

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      // Groups repeat notifications of the same kind instead of stacking them.
      tag: payload.tag || title,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Reuse a tab already on this origin — an admin tapping three
      // notifications should not end up with three copies of the app.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }

      await clients.openWindow(target);
    })(),
  );
});
