/**
 * Documentation: The daily offers to install the app and turn notifications on.
 *
 * - Two prompts, one at a time, one appearance each per day. Installing comes first: a member who has the app on their home screen is the one most likely to accept notifications, and stacking both offers on one screen gets both ignored.
 * - On a gym subdomain both are that gym's, by name and by logo — the branding lookup is awaited rather than read from cache, because a first visit is exactly when the cache is cold and the offer matters most.
 * - Android and desktop Chrome hand over a real install prompt; iOS never does, so there it explains the Share → Add to Home Screen route instead. Without that half, every member on an iPhone would be offered nothing at all.
 * - Notifications are only offered to a signed-in member: the subscription is registered against their account, and `Notification.requestPermission` must be called from a tap, which is why the button asks rather than the effect.
 * - Primary exports: AppNudges.
 */
import * as React from "react";
import { Bell, Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  INSTALL_PROMPT_AVAILABLE,
  type BeforeInstallPromptEvent,
} from "@/lib/install-prompt-event";
import { useTenantInstallBranding } from "@/lib/install-branding";
import { isPushSubscribed, subscribeToPush } from "@/lib/push-notifications";
import {
  shouldNudgeToday,
  silenceNudge,
  snoozeNudgeForToday,
  type NudgeKey,
} from "@/lib/nudge-schedule";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/components/ui/toast";

/** Seconds of quiet before either offer appears, so it never lands mid-load. */
const APPEAR_AFTER_MS = 4000;

const pushSupported =
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

/** Already on a home screen, by either the standard signal or Safari's own. */
function isInstalled() {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

/**
 * iOS Safari, where installing is a manual gesture.
 *
 * iPadOS reports itself as a Mac, so touch points are what separate an iPad
 * from a desktop Safari that has nothing to install.
 */
function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  // Chrome and Firefox on iOS carry their own tokens and cannot install at all.
  return isIos && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}

type Nudge = "install" | "ios-install" | "notifications" | null;

export function AppNudges() {
  const toast = useToast();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const branding = useTenantInstallBranding();
  const appName = branding?.name ?? "FitConnect";

  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(
    () => getDeferredInstallPrompt(),
  );
  const [nudge, setNudge] = React.useState<Nudge>(null);
  const [busy, setBusy] = React.useState(false);
  // One offer per visit. Answering the install prompt makes the notification
  // prompt eligible, and following the first straight away with the second is
  // how a helpful offer turns into pestering.
  const spent = React.useRef(false);

  // The event fires once and does not replay, so a component mounting later
  // takes it from the holder `main.tsx` fills in before the first render.
  React.useEffect(() => {
    const handler = () => setDeferredPrompt(getDeferredInstallPrompt());
    window.addEventListener(INSTALL_PROMPT_AVAILABLE, handler);
    return () => window.removeEventListener(INSTALL_PROMPT_AVAILABLE, handler);
  }, []);

  React.useEffect(() => {
    if (nudge || spent.current) return;

    let cancelled = false;

    const decide = async (): Promise<Nudge> => {
      if (!isInstalled() && shouldNudgeToday("install")) {
        if (deferredPrompt) return "install";
        if (isIosSafari()) return "ios-install";
      }

      // Notifications are the member's own, so there has to be a member.
      if (!isAuthenticated || !pushSupported) return null;
      if (!shouldNudgeToday("notifications")) return null;
      // A browser-level block cannot be undone from here; asking daily would
      // only produce a button that does nothing.
      if (Notification.permission === "denied") return null;
      if (Notification.permission === "granted" && (await isPushSubscribed())) return null;

      return "notifications";
    };

    const timer = window.setTimeout(() => {
      void decide().then((next) => {
        if (cancelled || !next) return;
        spent.current = true;
        setNudge(next);
      });
    }, APPEAR_AFTER_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredPrompt, isAuthenticated, nudge]);

  const close = (key: NudgeKey, forGood = false) => {
    if (forGood) silenceNudge(key);
    else snoozeNudgeForToday(key);
    setNudge(null);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      // Either way the browser will not replay this event, so it is spent.
      clearDeferredInstallPrompt();
      setDeferredPrompt(null);
      // A refusal is an answer for today, not forever: the manifest stays
      // installable and tomorrow's visit may go differently.
      close("install", outcome === "accepted");
    } finally {
      setBusy(false);
    }
  };

  const handleEnableNotifications = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications are blocked for this site in your browser.");
        close("notifications", permission === "denied");
        return;
      }

      const ok = await subscribeToPush();
      if (ok) {
        toast.success(`You will hear from ${appName}.`);
        close("notifications", true);
      } else {
        toast.error("This device could not be registered for notifications.");
        close("notifications");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!nudge) return null;

  const logo = branding?.logoUrl ? (
    <img
      src={branding.logoUrl}
      alt=""
      className="h-9 w-9 shrink-0 rounded-md object-cover"
    />
  ) : null;

  const shell = (children: React.ReactNode, key: NudgeKey) => (
    <div className="fixed bottom-4 left-4 right-4 z-99 mx-auto max-w-md rounded-lg border bg-card p-4 shadow-lg">
      <button
        onClick={() => close(key)}
        aria-label="Not now"
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );

  if (nudge === "notifications") {
    return shell(
      <div className="flex items-center gap-3 pr-6">
        {logo ?? <Bell className="h-6 w-6 shrink-0 text-primary" />}
        <div className="flex-1">
          <p className="text-sm font-medium">Turn on notifications</p>
          <p className="text-xs text-muted-foreground">
            Renewal reminders and updates from {appName}, on this device.
          </p>
        </div>
        <Button size="sm" onClick={handleEnableNotifications} disabled={busy}>
          Allow
        </Button>
      </div>,
      "notifications",
    );
  }

  if (nudge === "ios-install") {
    return shell(
      <div className="space-y-2 pr-6">
        <div className="flex items-center gap-3">
          {logo ?? <Download className="h-6 w-6 shrink-0 text-primary" />}
          <div className="flex-1">
            <p className="text-sm font-medium">Add {appName} to your home screen</p>
            <p className="text-xs text-muted-foreground">
              Opens full screen, and keeps you signed in.
            </p>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Tap <Share className="inline h-3.5 w-3.5" /> in the toolbar, then
          <SquarePlus className="inline h-3.5 w-3.5" /> Add to Home Screen.
        </p>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => close("install", true)}>
            Don’t show again
          </Button>
        </div>
      </div>,
      "install",
    );
  }

  return shell(
    <div className="flex items-center gap-3 pr-6">
      {logo ?? <Download className="h-6 w-6 shrink-0 text-primary" />}
      <div className="flex-1">
        <p className="text-sm font-medium">Install {appName}</p>
        <p className="text-xs text-muted-foreground">
          Add to home screen for the best experience.
        </p>
      </div>
      <Button size="sm" onClick={handleInstall} disabled={busy}>
        Install
      </Button>
    </div>,
    "install",
  );
}
