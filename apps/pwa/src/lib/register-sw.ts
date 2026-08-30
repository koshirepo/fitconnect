/**
 * Documentation: Keeping the installed app up to date without interrupting anybody.
 *
 * - Updates apply on their own; nobody is asked. What is deliberate is *when*: the new version takes over while the app is not being looked at, so somebody halfway through recording a payment never has the page swap under them.
 * - Three moments count as safe, in the order they usually arrive: the tab being hidden, the app going a while without a click, and the next cold start. A pending update that misses all three is applied on the next launch anyway, because the waiting worker is still there.
 * - The banner is a fallback, not the mechanism. It appears only if an update has been waiting a long time on a page nobody has left — a kiosk screen, a dashboard on a wall — where none of the safe moments will ever arrive on their own.
 * - Primary exports: registerSW.
 */

/** How often to ask the server whether a new version exists. */
const UPDATE_CHECK_MS = 15 * 60 * 1000;

/** No clicks for this long means nobody is mid-task. */
const IDLE_MS = 60 * 1000;

/** After this, stop waiting for a safe moment and offer the banner instead. */
const NAG_AFTER_MS = 10 * 60 * 1000;

export function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  import("virtual:pwa-register").then(({ registerSW: register }) => {
    /** Set once an update is downloaded and waiting to be let in. */
    let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
    let applied = false;
    let idleTimer: number | undefined;
    let nagTimer: number | undefined;

    /**
     * Let the waiting worker take over and reload.
     *
     * Guarded, because the safe moments overlap: hiding the tab while the idle
     * timer is also running would otherwise reload twice.
     */
    const apply = () => {
      if (applied || !applyUpdate) return;
      applied = true;
      void applyUpdate(true);
    };

    const resetIdle = () => {
      window.clearTimeout(idleTimer);
      if (!applyUpdate) return;
      idleTimer = window.setTimeout(apply, IDLE_MS);
    };

    const onHidden = () => {
      // The best moment there is: nothing is on screen to interrupt, and the
      // new version is what they come back to.
      if (document.visibilityState === "hidden") apply();
    };

    const updateSW = register({
      immediate: false,

      onRegisteredSW(swUrl: string, registration: ServiceWorkerRegistration | undefined) {
        // Long-lived installs never reload on their own, so the app has to go
        // looking for new versions rather than wait to be told about one.
        if (registration) {
          setInterval(() => void registration.update(), UPDATE_CHECK_MS);
        }
        console.info("[SW] Registered:", swUrl);
      },

      onOfflineReady() {
        console.info("[SW] Ready for offline use");
      },

      /**
       * A new version is downloaded and waiting.
       *
       * Nothing happens to the page yet. The listeners below decide when.
       */
      onNeedRefresh() {
        applyUpdate = updateSW;

        document.addEventListener("visibilitychange", onHidden);
        window.addEventListener("pointerdown", resetIdle, { passive: true });
        window.addEventListener("keydown", resetIdle, { passive: true });
        resetIdle();

        // A screen nobody ever leaves — a kiosk, a wall dashboard — reaches
        // none of the safe moments. After long enough, offer the banner.
        nagTimer = window.setTimeout(() => {
          if (applied) return;
          window.dispatchEvent(
            new CustomEvent("sw-update-available", { detail: { updateSW } }),
          );
        }, NAG_AFTER_MS);

        console.info("[SW] Update ready; waiting for a safe moment.");
      },

      onRegisterError(error: Error) {
        console.error("[SW] Registration failed:", error);
      },
    });

    // Nothing here outlives the page, but leaving timers armed across a
    // navigation would fire an update into a document being torn down.
    window.addEventListener("pagehide", () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(nagTimer);
    });
  });
}
