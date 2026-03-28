export function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  import("virtual:pwa-register").then(({ registerSW: register }) => {
    const updateSW = register({
      immediate: false,
      onRegisteredSW(swUrl: string, registration: ServiceWorkerRegistration | undefined) {
        if (registration) {
          setInterval(() => registration.update(), 15 * 60 * 1000);
        }
        console.log("[SW] Registered:", swUrl);
      },
      onOfflineReady() {
        console.log("[SW] App ready for offline use");
      },
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent("sw-update-available", { detail: { updateSW } }));
      },
      onRegisterError(error: Error) {
        console.error("[SW] Registration failed:", error);
      },
    });
  });
}
