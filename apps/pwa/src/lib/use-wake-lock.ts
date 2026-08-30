/**
 * Documentation: Keep the screen awake while a screen is doing its job unattended.
 *
 * - Two screens in this app are propped up and looked at rather than held and tapped: the QR poster members scan on the way in, and a workout plan read between sets. Both dim and lock in the middle of being useful, and both are exactly what the Screen Wake Lock API exists for.
 * - A lock is released by the browser whenever the page is hidden — a tab switch, the app going to the background — and is *not* restored on return. That reacquisition on `visibilitychange` is most of what this hook is for; without it the lock silently stops working the first time anybody switches away.
 * - Unsupported browsers (Safari before 16.4, Firefox) and a refused request are both no-ops. Nothing calls this expecting a guarantee; the worst case is the screen behaving exactly as it did before.
 * - Primary exports: useWakeLock.
 */
import * as React from "react";

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

/**
 * Hold a screen wake lock while `enabled` is true.
 *
 * Returns whether a lock is actually held, which a screen can use to say so —
 * a kiosk that claims to stay awake and does not is worse than one that says
 * nothing.
 */
export function useWakeLock(enabled = true) {
  const [active, setActive] = React.useState(false);
  const sentinelRef = React.useRef<WakeLockSentinel | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      // Requesting while hidden always rejects, so do not bother trying.
      if (document.visibilityState !== "visible") return;
      if (sentinelRef.current && !sentinelRef.current.released) return;

      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        // The browser releases the lock on its own terms — going to the
        // background, low battery — and does not say so any other way.
        sentinel.addEventListener("release", () => setActive(false));
      } catch {
        // Refused, unsupported in this context, or the document was not
        // visible after all. The screen simply behaves as it did before.
        setActive(false);
      }
    };

    // Hiding the page drops the lock, and returning does not bring it back.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setActive(false);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [enabled]);

  return active;
}
