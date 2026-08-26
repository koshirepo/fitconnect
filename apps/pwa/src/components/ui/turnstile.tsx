/**
 * Documentation: Cloudflare Turnstile widget.
 *
 * - Guards public self-signup, which creates an account and can open a payment order with no session in front of it. The token this produces is verified server-side; the widget alone proves nothing.
 * - Renders nothing when `VITE_TURNSTILE_SITE_KEY` is unset, and the API skips verification when its own secret is unset. The two switch on independently, so a deployment is never half-protected in a way that blocks real members: no key means the guard is simply off, exactly as before it existed.
 * - The script is loaded on demand rather than in `index.html`, so pages that never show the widget do not pay for it.
 *
 * Primary exports: TURNSTILE_SITE_KEY, TurnstileWidget.
 */
import * as React from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Load the Turnstile script once, shared by every widget on the page. */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
    document.head.appendChild(script);
  });
}

/**
 * The challenge itself.
 *
 * `onToken` receives the solved token, and null whenever it expires or errors —
 * so a form can disable submission until a fresh one arrives.
 */
export function TurnstileWidget({
  onToken,
  className,
}: {
  onToken: (token: string | null) => void;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // The widget is rendered once and lives outside React, so its callbacks read
  // the latest `onToken` through a ref rather than being rebound on every render.
  const onTokenRef = React.useRef(onToken);
  React.useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  React.useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;

    let widgetId: string | undefined;
    let cancelled = false;
    const container = containerRef.current;

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
          theme: "auto",
        });
      })
      .catch(() => {
        // Cloudflare unreachable. The API treats a missing token as a failed
        // check only when it is configured to, so this degrades rather than
        // trapping someone on the form.
        onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;

  return <div ref={containerRef} className={className} />;
}
