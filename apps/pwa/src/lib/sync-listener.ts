import { flushPendingMutations } from "./sync-engine";

let initialised = false;

/**
 * Bootstrap offline-sync listeners. Call once at app startup.
 *
 * Triggers:
 * 1. `online` event — browser regained connectivity.
 * 2. Service Worker `SYNC_PENDING_MUTATIONS` message — Background Sync fired.
 * 3. Startup — drain anything queued before the app was last closed.
 *
 * Also requests persistent storage so the browser won't evict IndexedDB
 * under storage pressure.
 */
export function initSyncListener() {
  if (initialised) return;
  initialised = true;

  // 1. Flush when coming back online
  window.addEventListener("online", () => {
    flushPendingMutations().catch(() => {});
  });

  // 2. Flush when the service worker triggers Background Sync
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "SYNC_PENDING_MUTATIONS") {
      flushPendingMutations().catch(() => {});
    }
  });

  // 3. Flush on startup (handles mutations queued before tab was closed)
  if (navigator.onLine) {
    flushPendingMutations().catch(() => {});
  }

  // 4. Request persistent storage (prevents browser from evicting IDB)
  requestPersistentStorage();
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        await navigator.storage.persist();
      }
    }
  } catch {
    // Non-critical — ignore
  }
}
