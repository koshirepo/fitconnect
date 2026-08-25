/**
 * Documentation: Push notification opt-in.
 *
 * - The one control that turns browser notifications on for this device. Without it the API can send all it likes and nothing arrives: a push subscription only exists once the browser has been asked, and asking is only allowed from a user gesture.
 * - Per device, not per account — the same admin on a phone and a laptop subscribes twice, and turning it off here leaves the other device alone. That is how the Push API works, and the copy says so rather than pretending otherwise.
 * - A browser that blocked notifications is a dead end until the person changes it in site settings, so that state is named instead of offering a button that cannot work.
 * - Primary exports: PushToggle.
 */
import * as React from "react";
import {
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-notifications";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";

const supported =
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

export function PushToggle({ description }: { description: string }) {
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!supported) {
      setChecking(false);
      return;
    }

    let active = true;
    isPushSubscribed()
      .then((subscribed) => {
        if (active) setEnabled(subscribed);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        This browser does not support notifications.
      </p>
    );
  }

  const blocked = Notification.permission === "denied";

  const handleToggle = async () => {
    setError("");
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setEnabled(false);
        return;
      }

      // Asking first keeps the failure legible: `pushManager.subscribe` would
      // prompt on its own, but rejects with a generic error when refused.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications are blocked for this site in your browser.");
        return;
      }

      const ok = await subscribeToPush();
      setEnabled(ok);
      if (!ok) setError("This device could not be registered for notifications.");
    } catch {
      setError("Something went wrong turning notifications on.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{description}</p>

      {blocked && !enabled ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Notifications are blocked for this site. Allow them in your browser's
          site settings, then come back.
        </p>
      ) : (
        <Button
          variant={enabled ? "outline" : "default"}
          onClick={handleToggle}
          disabled={busy || checking}
        >
          {enabled ? (
            <>
              <BellOff className="mr-2 h-4 w-4" />
              {busy ? "Turning off…" : "Turn off on this device"}
            </>
          ) : (
            <>
              <Bell className="mr-2 h-4 w-4" />
              {busy ? "Turning on…" : "Turn on for this device"}
            </>
          )}
        </Button>
      )}

      {enabled && !busy && (
        <p className="text-xs text-muted-foreground">
          On for this device. Each phone or computer opts in separately.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
