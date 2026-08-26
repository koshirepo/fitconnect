/**
 * Documentation: Capture of the browser's install prompt.
 *
 * - Chrome fires `beforeinstallprompt` exactly once, as soon as it decides the app is installable, and does not replay it for latecomers. React mounts after that decision often enough that a component-level listener misses the event entirely and the install banner silently never appears.
 * - So the listener is attached at import time from `main.tsx`, before the first render, and the event is held here. Any component can then ask for it on mount rather than racing it.
 * - Primary exports: captureInstallPrompt, getDeferredInstallPrompt, clearDeferredInstallPrompt, INSTALL_PROMPT_AVAILABLE.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Fired once the deferred prompt is available, for components already mounted. */
export const INSTALL_PROMPT_AVAILABLE = "fitconnect:install-prompt-available";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listening = false;

/** Start holding the install prompt. Safe to call more than once. */
export function captureInstallPrompt() {
  if (listening || typeof window === "undefined") return;
  listening = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome shows its own mini-infobar unless the event is cancelled; the app
    // presents the offer itself, at a moment that suits the page.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent(INSTALL_PROMPT_AVAILABLE));
  });

  // Once installed there is nothing left to offer, and the same event is never
  // fired again for this origin.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
  });
}

export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

/** Drop the held prompt after it has been used or declined. */
export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
}
